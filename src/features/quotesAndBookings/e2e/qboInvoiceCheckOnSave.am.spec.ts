import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote } from "./helpers/quoteTestData";

/**
 * The invoice check after a Save, as an account manager (docs/specs/qbo-invoice-06a-check-on-save.md
 * §6, S2): an account manager saves quotes too, so their Save sends the check, and they see nothing
 * of it.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The check
 * route is replaced by a fake that records its calls. The quote is made through the UI, so the
 * account manager owns it and may edit it; the service role then gives it an invoice, which the UI
 * cannot.
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test("S2: an account manager's Save of a quote that has an invoice sends one check and shows nothing", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("**/api/quickbooks/invoice/check", async (route) => {
    calls.push(route.request().postDataJSON().eventId);
    await route.fulfill({ json: { status: "checked" } });
  });

  // A quote of their own, saved once: that first Save creates it, and a created quote has no invoice.
  await page.goto("/quotes-bookings/new");
  await page.getByRole("button", { name: /Add Line Item/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Custom Service" }).click();
  await dialog.getByRole("tabpanel").getByRole("button").first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes-bookings\/[\da-f-]+$/, { timeout: 60_000 });
  const eventId = page.url().split("/").pop()!;
  expect(calls).toHaveLength(0);

  try {
    const { error } = await serviceRole()
      .from("Events")
      .update({ qbo_invoice_id: "e2e-fake-invoice" })
      .eq("id", eventId);
    if (error) throw new Error(error.message);

    await page.goto(`/quotes-bookings/${eventId}/edit`);
    const price = page
      .locator("table")
      .filter({ has: page.getByRole("spinbutton") })
      .getByRole("spinbutton")
      .last();
    await expect(price).toBeVisible({ timeout: 60_000 });
    await price.fill("1234");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/quotes-bookings\/[\da-f-]+$/, { timeout: 60_000 });

    await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);
    expect(calls[0]).toBe(eventId);
    await expect(page.getByText(/could not be checked|invoice read failed/i)).toHaveCount(0);
  } finally {
    await cleanupQuote(eventId);
  }
});
