import { test, expect } from "@playwright/test";
import {
  addButton,
  deleteVendorsByPrefix,
  openVendorsPage,
  rowWith,
  saveButton,
  searchBox,
  seedVendor,
  showDeletedSwitch,
  vendorWindow,
} from "./helpers/vendorsFlow";

/**
 * The Vendors page as a viewer: no Add button, a click on a row opens the window locked with no
 * QuickBooks block and only Close, and the Show Deleted switch is there. Written, not run (project
 * rule). Spec: docs/specs/vendors-page.md §6.3 (S8).
 */
const PREFIX = "E2E Vendors VWR";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test("S8: a viewer reads vendors in a window that cannot be changed", async ({ page }) => {
  const name = `${PREFIX} Read Co`;
  const gone = `${PREFIX} Deleted Co`;
  await seedVendor({ name, type: "repairs", status: "verified", contactName: "Pat Reader" });
  await seedVendor({ name: gone, isActive: false });

  await openVendorsPage(page);
  await expect(addButton(page)).toHaveCount(0);
  await expect(showDeletedSwitch(page)).toBeVisible();

  await searchBox(page).fill(name);
  await rowWith(page, name).click();
  await expect(vendorWindow(page)).toBeVisible();
  await expect(page.locator("#displayName")).toBeDisabled();
  await expect(page.locator("#displayName")).toHaveValue(name);
  await expect(vendorWindow(page).getByText("QuickBooks")).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(vendorWindow(page).getByRole("button", { name: "Delete", exact: true })).toHaveCount(
    0,
  );
  await expect(
    vendorWindow(page).getByRole("button", { name: "Restore", exact: true }),
  ).toHaveCount(0);
  await vendorWindow(page).getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(vendorWindow(page)).toHaveCount(0);

  // A deleted vendor opens locked, without Restore.
  await searchBox(page).fill(gone);
  await showDeletedSwitch(page).check();
  await rowWith(page, gone).click();
  await expect(
    vendorWindow(page).getByRole("button", { name: "Restore", exact: true }),
  ).toHaveCount(0);
});
