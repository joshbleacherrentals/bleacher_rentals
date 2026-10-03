import { test, expect } from "@playwright/test";

/**
 * The Accountant role (docs/specs/accountant-work-trackers.md, S1 and S7, and
 * accountant-quotes-02-accountant-page.md, S1): it lands on the Accountant page, its sidebar
 * offers Accountant, Work Trackers and Documentation, and it is kept out of every other
 * operational page.
 *
 * This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts), so
 * the file is inert until the Clerk user — with a seeded Users + Accountants row — is created.
 */
test.describe("Role access (accountant)", () => {
  test("lands on the Accountant page, not on a 'no roles assigned' wall", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/accountant/, { timeout: 60_000 });
    await expect(page.getByText("No roles assigned")).toHaveCount(0);
  });

  test("the Role Permissions page has an Accountant column", async ({ page }) => {
    await page.goto("/permissions");

    await expect(page.getByRole("columnheader", { name: "Accountant" })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("the sidebar offers Accountant, Work Trackers and Documentation, and nothing operational else", async ({
    page,
  }) => {
    await page.goto("/permissions");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Accountant", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(sidebar.getByText("Work Trackers", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(sidebar.getByText("Role Permissions")).toBeVisible();
    await expect(sidebar.getByText("What's New")).toBeVisible();

    for (const label of ["Dashboard", "Quotes & Bookings", "Team", "Assets"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toHaveCount(0);
    }
  });

  test("is kept out of the pages it was not given", async ({ page }) => {
    for (const path of [
      "/dashboard",
      "/quotes-bookings",
      "/team",
      "/assets",
      "/all-work-trackers",
      "/work-tracker-types",
    ]) {
      // A client-side redirect aborts the navigation. That is a refusal, not an error.
      await page.goto(path).catch(() => {});

      await expect(page, `accountant reached ${path}`).toHaveURL(/\/accountant/, {
        timeout: 30_000,
      });
    }
  });
});
