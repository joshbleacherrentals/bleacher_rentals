import { test, expect } from "@playwright/test";

const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;

/**
 * S1 — an account manager reads the payment history and is offered nothing to press.
 *
 * Since docs/specs/accountant-quotes-06-am-read-only-payments.md an account manager cannot record
 * a payment: the RLS insert policy names only admin, so the button is not drawn for any account
 * manager, lead or junior. (The seeded E2E account manager is a lead — `AccountManagerZones.is_lead`
 * is true on the row added for driver-zones.am.spec.ts — which makes this the harder case: the
 * role that used to be enabled everywhere.) The refusal at the database is asserted in
 * supabase/tests/manual_payment_entry.test.sql, not here.
 *
 * This file used to hold the lead account manager's S13 (offered the button and recorded a payment
 * attributed to them) from docs/specs/manual-payment-entry.md; spec 06 supersedes it. S8, the
 * junior's disabled button, had no e2e home and is gone with the disabled state.
 */

test.describe("Record Payment (account manager)", () => {
  test("S1: the history is readable and there is no + Record Payment button", async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();

    // The seeded Stripe payment is fully visible…
    await expect(page.getByText("$2,700.00").first()).toBeVisible();
    await expect(page.getByText("Stripe").first()).toBeVisible();

    // …and there is nothing to press.
    await expect(page.getByRole("button", { name: "+ Record Payment" })).toHaveCount(0);
  });

  test("S1: a payment still opens in full", async ({ page }) => {
    await page.goto(BILLING);

    await page.locator('[aria-label^="Payment details for"]').first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
