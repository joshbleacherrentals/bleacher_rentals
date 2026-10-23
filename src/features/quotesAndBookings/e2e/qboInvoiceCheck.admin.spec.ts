import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice/check, as an admin (docs/specs/qbo-invoice-06-totals-check.md §7:
 * S1, S2, S3, S4 and S5).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * route reads the invoice from QuickBooks, which a browser test cannot replace from outside the
 * server, so:
 *  - S4 calls the real route on a quote that has no invoice, which it refuses before it reaches
 *    QuickBooks, so no QuickBooks call is made;
 *  - S1, S2, S3 and S5 replace the route with a fake that writes to Events what the real one writes,
 *    then check what the quote holds afterwards. The comparison itself, the flag it stores and the
 *    QuickBooks read are asserted in checkInvoiceTotals.test.ts.
 */

const CHECK_ROUTE = "/api/quickbooks/invoice/check";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function updateEvent(eventId: string, fields: Record<string, unknown>) {
  const { error } = await serviceRole().from("Events").update(fields).eq("id", eventId);
  if (error) throw new Error(`updateEvent failed: ${error.message}`);
}

async function readMismatch(eventId: string) {
  const { data, error } = await serviceRole()
    .from("Events")
    .select("qbo_invoice_mismatch")
    .eq("id", eventId)
    .single();
  if (error || !data) throw new Error(`readMismatch failed: ${error?.message}`);
  return data.qbo_invoice_mismatch;
}

/** What the browser sends to the route, answered by whatever the test routed it to. */
const post = (page: Page, body: Record<string, unknown>) =>
  page.evaluate(async (data) => {
    const res = await fetch("/api/quickbooks/invoice/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: res.status, body: await res.json() };
  }, body);

test.describe("Check invoice totals route (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // status "quoted", with an invoice number, no invoice
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: an invoice whose totals equal the quote's: matches, and the flag is false", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });

    // The fake does what the real route does when the totals are equal.
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_mismatch: false });
      await route.fulfill({ json: { status: "checked", matches: true, differences: [] } });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { status, body } = await post(page, { eventId: quote.eventId });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "checked", matches: true, differences: [] });
    expect(await readMismatch(quote.eventId)).toBe(false);
  });

  test("S2: QuickBooks' tax is one cent off: one tax difference, and the flag is true", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    const differences = [{ field: "tax", quoteCents: 52500, qboCents: 52501 }];

    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_mismatch: true });
      await route.fulfill({ json: { status: "checked", matches: false, differences } });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, { eventId: quote.eventId });

    expect(body.matches).toBe(false);
    expect(body.differences).toEqual(differences);
    expect(await readMismatch(quote.eventId)).toBe(true);
  });

  test("S3: Check again after QuickBooks returns equal totals: the flag becomes false", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
    });

    // The invoice was corrected by hand between the two presses.
    let corrected = false;
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_mismatch: !corrected });
      await route.fulfill({
        json: corrected
          ? { status: "checked", matches: true, differences: [] }
          : {
              status: "checked",
              matches: false,
              differences: [{ field: "total", quoteCents: 802500, qboCents: 802501 }],
            },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const first = await post(page, { eventId: quote.eventId });
    expect(first.body.matches).toBe(false);
    expect(await readMismatch(quote.eventId)).toBe(true);

    corrected = true;
    const second = await post(page, { eventId: quote.eventId });
    expect(second.body.matches).toBe(true);
    expect(await readMismatch(quote.eventId)).toBe(false);
  });

  test("S4: an event with no invoice is refused with 409, and nothing is stored", async ({
    page,
  }) => {
    const res = await page.request.post(CHECK_ROUTE, { data: { eventId: quote.eventId } });

    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("This quote has no QuickBooks invoice yet.");
    expect(await readMismatch(quote.eventId)).toBe(false);
  });

  test("S5: QuickBooks no longer has the invoice: invoice_missing, and the flag is unchanged", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-gone-invoice",
      qbo_invoice_mismatch: true,
    });

    // The real route stores nothing for a missing invoice, so the fake does not either.
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      await route.fulfill({ json: { status: "invoice_missing" } });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, { eventId: quote.eventId });

    expect(body).toEqual({ status: "invoice_missing" });
    expect(await readMismatch(quote.eventId)).toBe(true);
  });
});
