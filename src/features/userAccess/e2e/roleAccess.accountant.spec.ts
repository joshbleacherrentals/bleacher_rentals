import { test, expect } from "@playwright/test";

/**
 * The Accountant role in Stage 1 (docs/specs/accountant-role.md, S4): it can sign in and read the
 * two pages every role may read, and nothing else.
 *
 * This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts), so
 * the file is inert until the Clerk user — with a seeded Users + Accountants row — is created.
 */
test.describe("Role access (accountant)", () => {
  test("lands on Role Permissions, not on a 'no roles assigned' wall", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/permissions/, { timeout: 60_000 });
    await expect(page.getByText("No roles assigned")).toHaveCount(0);
    // The matrix has an Accountant column, and it grants nothing.
    await expect(page.getByRole("columnheader", { name: "Accountant" })).toBeVisible();
  });

  test("the sidebar offers only Documentation", async ({ page }) => {
    await page.goto("/permissions");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Role Permissions")).toBeVisible({ timeout: 60_000 });
    await expect(sidebar.getByText("What's New")).toBeVisible();

    for (const label of ["Dashboard", "Quotes & Bookings", "Team", "Assets", "Work Trackers"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toHaveCount(0);
    }
  });

  test("is kept out of operational pages", async ({ page }) => {
    for (const path of ["/dashboard", "/quotes-bookings", "/team", "/assets"]) {
      // A client-side redirect aborts the navigation. That is a refusal, not an error.
      await page.goto(path).catch(() => {});

      await expect(page, `accountant reached ${path}`).toHaveURL(/\/permissions/, {
        timeout: 30_000,
      });
    }
  });
});
