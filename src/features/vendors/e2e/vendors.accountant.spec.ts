import { test, expect } from "@playwright/test";
import {
  addButton,
  deleteVendorInWindow,
  deleteVendorsByPrefix,
  fillVendorWindow,
  openVendorsPage,
  readVendor,
  rowWith,
  saveVendorWindow,
  searchBox,
  seedVendor,
  showDeletedSwitch,
  vendorWindow,
} from "./helpers/vendorsFlow";

/**
 * The Vendors page as an accountant: adds, edits, deletes and restores a vendor (D5). The driver
 * page's own window, with Driver preselected, is covered by S7 of team.accountant.spec.ts.
 * Written, not run (project rule). Spec: docs/specs/vendors-page.md §6.3 (S7).
 */
const PREFIX = "E2E Vendors ACC";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test("S7: an accountant adds, edits, deletes and restores a vendor", async ({ page }) => {
  await openVendorsPage(page);
  await expect(addButton(page)).toBeVisible();

  const name = `${PREFIX} Books Co`;
  await addButton(page).click();
  await fillVendorWindow(page, { name, type: "driver" });
  await saveVendorWindow(page);

  await searchBox(page).fill(name);
  await expect(rowWith(page, name)).toBeVisible({ timeout: 60_000 });

  await rowWith(page, name).click();
  await fillVendorWindow(page, { status: "caution" });
  await saveVendorWindow(page);
  await expect(rowWith(page, name)).toContainText("Caution", { timeout: 30_000 });

  await rowWith(page, name).click();
  await deleteVendorInWindow(page);
  await expect(rowWith(page, name)).toHaveCount(0, { timeout: 30_000 });

  await showDeletedSwitch(page).check();
  await rowWith(page, name).click();
  await vendorWindow(page).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText(/restored$/)).toBeVisible({ timeout: 30_000 });
  await showDeletedSwitch(page).uncheck();
  await expect(rowWith(page, name)).toBeVisible({ timeout: 30_000 });
});

test("S7: a seeded vendor that was deleted is restored from Show Deleted", async ({ page }) => {
  const name = `${PREFIX} Gone Co`;
  const seeded = await seedVendor({ name, isActive: false });

  await openVendorsPage(page);
  await searchBox(page).fill(name);
  await showDeletedSwitch(page).check();
  await rowWith(page, name).click();
  await vendorWindow(page).getByRole("button", { name: "Restore", exact: true }).click();
  await expect
    .poll(async () => (await readVendor(seeded.id)).is_active, { timeout: 30_000 })
    .toBe(true);
});
