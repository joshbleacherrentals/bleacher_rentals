import { test, expect } from "@playwright/test";
import {
  mockRates,
  openAnalytics,
  expectWholePage,
  periodButton,
  periodOption,
} from "./helpers/analyticsPage";

/**
 * The Dashboard & Analytics page as a viewer sees it: the same page as an administrator, read only,
 * with the period dropdown as its only control. The Frankfurter calls are answered by `page.route`.
 * Written, not run (project rule).
 * Spec: docs/specs/dashboard-analytics-05-page.md §6 (S11).
 */
test.describe("Dashboard & Analytics (viewer)", () => {
  test("S11: sees the whole page, and the period dropdown is its only control", async ({
    page,
  }) => {
    await mockRates(page);
    await openAnalytics(page);
    await expectWholePage(page);

    // The one control opens a list of years and All time, and nothing else is a control.
    await periodButton(page).click();
    await expect(periodOption(page, "All time")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
