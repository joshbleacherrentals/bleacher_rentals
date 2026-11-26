import { test, expect } from "@playwright/test";
import {
  mockRates,
  openAnalytics,
  expectWholePage,
  periodButton,
  periodOption,
} from "./helpers/analyticsPage";

/**
 * The Dashboard & Analytics page as a maintainer sees it: the same page as for a viewer (S11), with
 * every figure and the period dropdown as its only control. The maintainer suite joins the run once
 * E2E_MAINTAINER_EMAIL exists (playwright.config.ts). The Frankfurter calls are answered by
 * `page.route`. Written, not run (project rule).
 * Spec: docs/specs/dashboard-analytics-05-page.md §6 (S13).
 */
test.describe("Dashboard & Analytics (maintainer)", () => {
  test("S13: sees the whole page, and the period dropdown is its only control", async ({
    page,
  }) => {
    await mockRates(page);
    await openAnalytics(page);
    await expectWholePage(page);

    await periodButton(page).click();
    await expect(periodOption(page, "All time")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
