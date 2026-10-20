import { test, expect } from "@playwright/test";

/**
 * The Maintainer role on Assets: saving a bleacher, and the Documents tab.
 *
 * Only runs once E2E_MAINTAINER_EMAIL is configured (see playwright.config.ts). The tab filling
 * with rows proves the BlueBook sync rule reaches a maintainer; the SQL test
 * supabase/tests/maintainer_asset_documents.test.sql proves RLS accepts the writes.
 *
 * Spec: docs/specs/maintainer-asset-documents.md
 */
test.describe("Assets: documents and bleachers (maintainer)", () => {
  test("sees the Add Document button and Edit, but no Delete", async ({ page }) => {
    await page.goto("/assets/documents");
    await expect(page.getByRole("button", { name: /add document/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("saves a bleacher without a refused-write error", async ({ page }) => {
    await page.goto("/assets/bleachers");
    await page.getByText(/^\d+$/).first().click();
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("A change could not be saved")).toHaveCount(0);
  });
});
