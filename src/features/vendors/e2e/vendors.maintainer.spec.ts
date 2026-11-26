import { test, expect } from "@playwright/test";
import {
  addButton,
  deleteVendorsByPrefix,
  fillVendorWindow,
  findVendorsByPrefix,
  openVendorsPage,
  readAddress,
  readVendor,
  rowWith,
  saveVendorWindow,
  searchBox,
  seedVendor,
  vendorWindow,
} from "./helpers/vendorsFlow";

/**
 * The Vendors page as a maintainer: adds a vendor, and opens one that has an address, which a
 * maintainer may now change (D3). The Google address field is not scripted (it needs the Google
 * API), so the change of the address itself is proved by supabase/tests/vendors_type.test.sql
 * (T4 to T6); here a maintainer clears it, which writes the vendor and leaves the row (D13).
 * Written, not run (project rule). Spec: docs/specs/vendors-page.md §6.3 (S6).
 */
const PREFIX = "E2E Vendors MNT";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test.describe("Vendors page (maintainer)", () => {
  test("S6: adds a vendor, and clears the address of one that has an address", async ({ page }) => {
    const withAddress = `${PREFIX} Has Address Co`;
    const seeded = await seedVendor({
      name: withAddress,
      type: "repairs",
      address: { street: "5 Maintainer Way", city: "Simcoe", stateProvince: "ON", country: "CA" },
    });

    await openVendorsPage(page);
    await expect(addButton(page)).toBeVisible();

    const added = `${PREFIX} Added Co`;
    await addButton(page).click();
    await fillVendorWindow(page, { name: added, type: "repairs", phone: "214-555-0182" });
    await saveVendorWindow(page);
    await expect
      .poll(async () => (await findVendorsByPrefix(added)).length, { timeout: 30_000 })
      .toBe(1);

    await searchBox(page).fill(withAddress);
    const row = rowWith(page, withAddress);
    await expect(row).toContainText("Simcoe, ON, CA", { timeout: 60_000 });
    await row.click();
    await expect(vendorWindow(page).locator('input[placeholder="Enter address..."]')).toHaveValue(
      /5 Maintainer Way/,
      { timeout: 30_000 },
    );
    await vendorWindow(page).getByRole("button", { name: "Clear address" }).click();
    await saveVendorWindow(page);

    await expect
      .poll(async () => (await readVendor(seeded.id)).address_uuid, { timeout: 30_000 })
      .toBeNull();
    // The address row stays in the table (D13).
    expect(await readAddress(seeded.addressId!)).not.toBeNull();
  });
});
