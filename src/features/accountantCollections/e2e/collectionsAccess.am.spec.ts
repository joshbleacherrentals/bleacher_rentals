import { test, expect } from "@playwright/test";

/**
 * The Collections tab and the invoice page are for administrators and accountants
 * (docs/specs/accountant-collections-09-design.md §5, S11). Written, not run locally (project rule).
 */
test.describe("Collections access (account manager)", () => {
  for (const path of [
    "/accountant",
    "/accountant/invoice?id=00000000-0000-0000-0000-000000000000",
  ]) {
    test(`S11: ${path} is not reachable`, async ({ page }) => {
      // A client-side redirect aborts the navigation. That is a refusal, not an error.
      await page.goto(path).catch(() => {});

      await expect(page, `reached ${path}`).not.toHaveURL(/\/accountant/, { timeout: 30_000 });
      await expect(page.getByText("Invoice not found")).toHaveCount(0);
    });
  }
});
