import { test, expect } from "@playwright/test";

/**
 * The invoice buttons as an account manager (docs/specs/qbo-invoice-07-card-buttons.md §6, S4):
 * none is drawn, and the QuickBooks Invoice flag is as before.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */

// Seeded in supabase/seed.sql: a booked quote, so Create would be offered to a role that may.
const BILLING = "/quotes-bookings/85b35a1c-8992-41c5-b051-409f33ee7fc5?tab=billing";

test("S4: no Create or Update button on a booked quote, and the flag is enabled", async ({
  page,
}) => {
  await page.goto(BILLING);

  const flag = page.getByRole("checkbox", { name: "QuickBooks Invoice" });
  await expect(flag).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Create invoice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update invoice" })).toHaveCount(0);
});
