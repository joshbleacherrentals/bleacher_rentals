import { test, expect } from "@playwright/test";

// docs/specs/qbo-invoice-03c-no-tax-code.md §5, S4 (unchanged): /quickbooks is an admin-only path,
// so the row that lives on it is out of reach. Written, not run locally.

test("S4: a viewer cannot open /quickbooks", async ({ page }) => {
  await page.goto("/quickbooks");

  await expect(page).not.toHaveURL(/\/quickbooks/);
  await expect(page.getByText("No-tax code (Canada)")).toHaveCount(0);
});
