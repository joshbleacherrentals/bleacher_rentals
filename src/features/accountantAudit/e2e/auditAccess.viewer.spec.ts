import { test, expect } from "@playwright/test";

/**
 * The Audit tab is for administrators and accountants
 * (docs/specs/accountant-audit-01-tab.md §4, S5). The path gate comes first: whatever `?tab` says,
 * a viewer never reaches /accountant. Written, not run locally (project rule).
 */
test.describe("Audit access (viewer)", () => {
  test("S5: /accountant?tab=audit is not reachable", async ({ page }) => {
    // A client-side redirect aborts the navigation. That is a refusal, not an error.
    await page.goto("/accountant?tab=audit").catch(() => {});

    await expect(page, "reached /accountant?tab=audit").not.toHaveURL(/\/accountant/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("audit-tab")).toHaveCount(0);
  });
});
