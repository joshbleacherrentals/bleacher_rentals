import { test, expect, type Page } from "@playwright/test";

/**
 * The Dashboard & Analytics page as a viewer sees it: the page opens and shows its title, the item
 * is the first one in the Quality Assurance dropdown, and the Dashboard button is not lit on it.
 * Written, not run (project rule).
 * What the page shows is tested in dashboardAnalytics.viewer.spec.ts (spec 05).
 * Spec: docs/specs/dashboard-analytics-02-access-shell.md §5 (S2).
 */

const TITLE = "Dashboard & Analytics";

const sidebar = (page: Page) => page.getByTestId("sidebar");
/** The links inside the Quality Assurance dropdown (it is open while one of its pages is). */
const qualityAssuranceLinks = (page: Page) =>
  sidebar(page)
    .getByRole("button", { name: "Quality Assurance" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("link");
const dashboardButton = (page: Page) =>
  sidebar(page).getByRole("link", { name: "Dashboard", exact: true });

test.describe("Dashboard & Analytics access (viewer)", () => {
  test("S2: opens the page, sees the title, and the item is first in Quality Assurance", async ({
    page,
  }) => {
    await page.goto("/dashboard-analytics");

    const heading = page.getByRole("heading", { name: TITLE });
    await expect(heading).toBeVisible({ timeout: 60_000 });

    // The dropdown is open on its own page, with the new item first and lit.
    await expect(qualityAssuranceLinks(page).first()).toHaveText(TITLE);
    await expect(qualityAssuranceLinks(page).first()).toHaveClass(/font-medium/);
    // The Dashboard button is not lit on /dashboard-analytics.
    await expect(dashboardButton(page)).not.toHaveClass(/font-medium/);
  });
});
