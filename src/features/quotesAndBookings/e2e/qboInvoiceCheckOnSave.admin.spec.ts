import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The invoice check after a Save, as an admin (docs/specs/qbo-invoice-06a-check-on-save.md §6:
 * S1, S3, S5 and S6).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * check route reaches QuickBooks, which a browser test cannot replace from outside the server, so
 * the route is replaced by a fake that records its calls and, when it is called, what the database
 * holds: that shows the check was sent after the upload had finished.
 *
 * The seeded quote has one line item, "Bleacher Rental", 2 x $500.00.
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

async function linePriceCents(eventId: string) {
  const { data, error } = await serviceRole()
    .from("EventLineItems")
    .select("value_cents")
    .eq("event_uuid", eventId)
    .eq("deleted", false)
    .single();
  if (error || !data) throw new Error(`linePriceCents failed: ${error?.message}`);
  return data.value_cents as number;
}

type Call = { eventId: string; priceInDatabase: number };

/** Replaces the check route with a fake, and records each call with what the database held. */
async function fakeCheckRoute(page: Page, answer: { status: number; body: unknown }) {
  const calls: Call[] = [];
  await page.route(`**${CHECK_ROUTE}`, async (route) => {
    const { eventId } = route.request().postDataJSON();
    calls.push({ eventId, priceInDatabase: await linePriceCents(eventId) });
    await route.fulfill({ status: answer.status, json: answer.body });
  });
  return calls;
}

/** Changes the unit price of the quote's line to $600.00 on the edit page and saves. */
async function savePrice600(page: Page, eventId: string) {
  await page.goto(`/quotes-bookings/${eventId}/edit`);
  const row = page.locator("tr", { has: page.locator('input[value="Bleacher Rental"]') });
  const unitPrice = row.getByRole("spinbutton").nth(1);
  await expect(unitPrice).toHaveValue("500", { timeout: 60_000 });
  await unitPrice.fill("600");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Quote updated.")).toBeVisible({ timeout: 60_000 });
}

test.describe("The invoice check after a Save (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote();
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: saving an edit on a quote that has an invoice sends one check, after the upload", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    const calls = await fakeCheckRoute(page, {
      status: 200,
      body: { status: "checked", matches: true, reasons: [], differences: [] },
    });

    await savePrice600(page, quote.eventId);

    await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);
    expect(calls[0].eventId).toBe(quote.eventId);
    // 2 x $600.00 was already in the database when the check was asked for.
    expect(calls[0].priceInDatabase).toBe(60_000);
  });

  test("S3: a quote with no invoice sends no check", async ({ page }) => {
    const calls = await fakeCheckRoute(page, { status: 409, body: { error: "no invoice" } });

    await savePrice600(page, quote.eventId);
    await page.waitForTimeout(5_000);

    expect(calls).toHaveLength(0);
  });

  test("S5: a check that the server fails shows nothing", async ({ page }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    const calls = await fakeCheckRoute(page, {
      status: 502,
      body: { error: "QuickBooks invoice read failed: fetch failed" },
    });

    await savePrice600(page, quote.eventId);

    await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);
    await expect(page.getByText("QuickBooks invoice read failed")).toHaveCount(0);
    await expect(page.getByText(/could not be checked/i)).toHaveCount(0);
  });

  test("S6: opening a quote that has an invoice sends no check", async ({ page }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    const calls = await fakeCheckRoute(page, {
      status: 200,
      body: { status: "checked", matches: true, reasons: [], differences: [] },
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
    await expect(page.getByText("Bleacher Rental").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(5_000);

    expect(calls).toHaveLength(0);
  });
});
