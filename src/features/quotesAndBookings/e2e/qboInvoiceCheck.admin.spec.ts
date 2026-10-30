import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice/check, as an admin (docs/specs/qbo-invoice-06-totals-check.md §8:
 * S1, S2, S3, S5, S6, S7 and S8).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * route reads the invoice from QuickBooks, which a browser test cannot replace from outside the
 * server, so:
 *  - S6 calls the real route on a quote that has no invoice, which it refuses before it reaches
 *    QuickBooks, so no QuickBooks call is made;
 *  - the others replace the route with a fake that writes to Events what the real one writes, then
 *    check what the quote holds afterwards. The comparison itself (compareInvoice.test.ts), what the
 *    check stores and the QuickBooks read (checkInvoice.test.ts) are asserted by unit tests.
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

async function readCheck(eventId: string) {
  const { data, error } = await serviceRole()
    .from("Events")
    .select(
      "qbo_invoice_mismatch, qbo_invoice_mismatch_reasons, qbo_invoice_checked_at, qbo_invoice_check_failed_at",
    )
    .eq("id", eventId)
    .single();
  if (error || !data) throw new Error(`readCheck failed: ${error?.message}`);
  return data;
}

async function readMismatch(eventId: string) {
  return (await readCheck(eventId)).qbo_invoice_mismatch;
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

test.describe("Check invoice route (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // status "quoted", with an invoice number, no invoice
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: an invoice equal to the quote: matches, the flag is false and the time is stored", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });

    // The fake does what the real route does when the invoice is equal.
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, {
        qbo_invoice_mismatch: false,
        qbo_invoice_mismatch_reasons: null,
        qbo_invoice_checked_at: new Date().toISOString(),
        qbo_invoice_check_failed_at: null,
      });
      await route.fulfill({
        json: { status: "checked", matches: true, reasons: [], differences: [] },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { status, body } = await post(page, { eventId: quote.eventId });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "checked", matches: true, reasons: [], differences: [] });
    const stored = await readCheck(quote.eventId);
    expect(stored.qbo_invoice_mismatch).toBe(false);
    expect(stored.qbo_invoice_checked_at).not.toBeNull();
  });

  test("S2: the due date differs: reason dates, the flag is true and the reasons are stored", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    const differences = [
      { reason: "dates", field: "Due date", quote: "2026-10-15", qbo: "2026-10-20" },
    ];

    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, {
        qbo_invoice_mismatch: true,
        qbo_invoice_mismatch_reasons: '["dates"]',
        qbo_invoice_checked_at: new Date().toISOString(),
      });
      await route.fulfill({
        json: { status: "checked", matches: false, reasons: ["dates"], differences },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, { eventId: quote.eventId });

    expect(body.matches).toBe(false);
    expect(body.reasons).toEqual(["dates"]);
    expect(body.differences).toEqual(differences);
    const stored = await readCheck(quote.eventId);
    expect(stored.qbo_invoice_mismatch).toBe(true);
    expect(stored.qbo_invoice_mismatch_reasons).toBe('["dates"]');
  });

  test("S5: Check again after the invoice was corrected: the flag becomes false and the reasons go", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["totals"]',
    });

    // The invoice was corrected by hand between the two presses.
    let corrected = false;
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, {
        qbo_invoice_mismatch: !corrected,
        qbo_invoice_mismatch_reasons: corrected ? null : '["totals"]',
      });
      await route.fulfill({
        json: corrected
          ? { status: "checked", matches: true, reasons: [], differences: [] }
          : {
              status: "checked",
              matches: false,
              reasons: ["totals"],
              differences: [
                { reason: "totals", field: "Total", quote: "$8,025.00", qbo: "$8,025.01" },
              ],
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
    const stored = await readCheck(quote.eventId);
    expect(stored.qbo_invoice_mismatch).toBe(false);
    expect(stored.qbo_invoice_mismatch_reasons).toBeNull();
  });

  test("S6: an event with no invoice is refused with 409, and nothing is stored", async ({
    page,
  }) => {
    const res = await page.request.post(CHECK_ROUTE, { data: { eventId: quote.eventId } });

    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("This quote has no QuickBooks invoice yet.");
    expect(await readMismatch(quote.eventId)).toBe(false);
  });

  test("S7: QuickBooks no longer has the invoice: invoice_missing, and only the failure time is stored", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-gone-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["memo"]',
    });

    // The real route stores only the failure time for a missing invoice, so the fake does too.
    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_check_failed_at: new Date().toISOString() });
      await route.fulfill({ json: { status: "invoice_missing" } });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, { eventId: quote.eventId });

    expect(body).toEqual({ status: "invoice_missing" });
    const stored = await readCheck(quote.eventId);
    expect(stored.qbo_invoice_mismatch).toBe(true);
    expect(stored.qbo_invoice_mismatch_reasons).toBe('["memo"]');
    expect(stored.qbo_invoice_check_failed_at).not.toBeNull();
  });

  test("S8: a quote that cannot be compared right now: skipped, flag and reasons unchanged", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      deleted: true,
    });

    await page.route(`**${CHECK_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_check_failed_at: new Date().toISOString() });
      await route.fulfill({
        json: {
          status: "skipped",
          message: "This quote is deleted. Restore it before creating an invoice.",
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, { eventId: quote.eventId });

    expect(body.status).toBe("skipped");
    expect(body.message).toContain("deleted");
    expect(await readMismatch(quote.eventId)).toBe(false);
  });
});
