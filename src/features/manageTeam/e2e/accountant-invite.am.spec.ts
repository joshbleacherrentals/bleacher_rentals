import { test, expect } from "@playwright/test";

/**
 * Only an admin grants the Accountant role (docs/specs/accountant-role.md, D2 and S3).
 *
 * The Accountants table is admin-only under RLS, so offering the role to an account manager would
 * end in a refused insert after the Users row already existed. The option is hidden instead.
 */
test.describe("Accountant role — invited from /team (account manager)", () => {
  test("an account manager is not offered the Accountant role", async ({ page }) => {
    await page.goto("/team/new/basic-user-info");

    await page.getByRole("button", { name: "+ Add Role" }).click();

    // Roles an account manager can grant are still there...
    await expect(page.getByRole("menuitem", { name: "Viewer" })).toBeVisible();
    // ...and neither of the admin-only ones is.
    await expect(page.getByRole("menuitem", { name: "Accountant" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Administrator" })).toHaveCount(0);
  });
});
