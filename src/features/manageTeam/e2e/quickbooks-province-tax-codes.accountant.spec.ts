import { test, expect } from "@playwright/test";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §5, S4 (unchanged): /quickbooks is an admin-only
// path, so the section that lives on it is out of reach. Written, not run locally.

test("S4: an accountant cannot open /quickbooks", async ({ page }) => {
  await page.goto("/quickbooks");

  await expect(page).not.toHaveURL(/\/quickbooks/);
  await expect(page.getByText("Tax code per Canadian province")).toHaveCount(0);
});
