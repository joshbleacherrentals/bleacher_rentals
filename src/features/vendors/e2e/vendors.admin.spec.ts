import { test, expect } from "@playwright/test";
import {
  addButton,
  cellOf,
  deleteVendorInWindow,
  deleteVendorsByPrefix,
  fillVendorWindow,
  findVendorsByPrefix,
  openVendorsPage,
  readVendor,
  rowNames,
  rowWith,
  saveButton,
  saveVendorWindow,
  searchBox,
  seedVendor,
  serviceRoleClient,
  showDeletedSwitch,
  toggleStatus,
  typeFilter,
  vendorRows,
  vendorWindow,
} from "./helpers/vendorsFlow";

/**
 * The Vendors page as an administrator uses it: the list, the search and the filters, adding a
 * vendor, changing its type, and deleting and restoring it. Written, not run (project rule).
 * The Google address field is not scripted here (it needs the Google API); the maintainer's right
 * to change a vendor's address is proved by supabase/tests/vendors_type.test.sql (T4 to T6).
 * Spec: docs/specs/vendors-page.md §6.3 (S1 to S4, S9).
 */
const PREFIX = "E2E Vendors ADM";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test.describe("Vendors page (admin)", () => {
  test("S1: lists the vendors A to Z, searches by words, filters and flips the order", async ({
    page,
  }) => {
    const dallas = `${PREFIX} Dallas Trailer Repair`;
    const alpha = `${PREFIX} Alpha Hauling`;
    const zed = `${PREFIX} Zed Freight`;
    await seedVendor({ name: dallas, type: "repairs", status: "verified" });
    await seedVendor({ name: alpha, type: "driver" });
    await seedVendor({ name: zed, type: "driver", status: "caution" });

    await openVendorsPage(page);
    await searchBox(page).fill(PREFIX);
    await expect(vendorRows(page)).toHaveCount(3, { timeout: 60_000 });
    expect(await rowNames(page)).toEqual([alpha, dallas, zed]);

    await test.step("words in any order", async () => {
      await searchBox(page).fill(`${PREFIX} dallas repair`);
      await expect(vendorRows(page)).toHaveCount(1);
      await expect(rowWith(page, dallas)).toBeVisible();
      await searchBox(page).fill(`${PREFIX}`);
    });

    await test.step("the Type filter", async () => {
      await typeFilter(page).selectOption("repairs");
      await expect(vendorRows(page)).toHaveCount(1);
      await typeFilter(page).selectOption("all");
      await expect(vendorRows(page)).toHaveCount(3);
    });

    await test.step("the Status filter takes several values, 'No status' among them", async () => {
      await toggleStatus(page, "Verified");
      await expect(vendorRows(page)).toHaveCount(1);
      await toggleStatus(page, "No status");
      await expect(vendorRows(page)).toHaveCount(2);
      await expect(rowWith(page, zed)).toHaveCount(0);
      await toggleStatus(page, "Verified");
      await toggleStatus(page, "No status");
      await expect(vendorRows(page)).toHaveCount(3);
    });

    await test.step("a click on the Vendor header flips the order", async () => {
      await page.getByTestId("sort-vendor").click();
      expect(await rowNames(page)).toEqual([zed, dallas, alpha]);
      await page.getByTestId("sort-vendor").click();
      expect(await rowNames(page)).toEqual([alpha, dallas, zed]);
    });
  });

  test("S2: Add vendor refuses a missing Type, then saves the vendor with what was filled in", async ({
    page,
  }) => {
    const name = `${PREFIX} New Welding Co`;
    await openVendorsPage(page);

    await addButton(page).click();
    await expect(vendorWindow(page)).toBeVisible();
    await expect(page.locator("#vendorType")).toHaveValue("");
    await fillVendorWindow(page, { name });
    await saveButton(page).click();
    await expect(page.getByText("Type required")).toBeVisible({ timeout: 15_000 });
    expect(await findVendorsByPrefix(name)).toHaveLength(0);

    await fillVendorWindow(page, {
      type: "repairs",
      status: "verified",
      contactName: "Sam Jones",
      phone: "+1 (214) 555-0182",
      email: "sam@example.com",
      notes: "Fast on aluminum",
      aluminumWelding: true,
    });
    await saveVendorWindow(page);

    await searchBox(page).fill(name);
    const row = rowWith(page, name);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(row, "type")).toHaveText("Repairs");
    await expect(cellOf(row, "status")).toHaveText("Verified");
    await expect(cellOf(row, "services")).toContainText("Aluminum welding");
    await expect(cellOf(row, "contact")).toContainText("Sam Jones");

    await expect
      .poll(async () => (await findVendorsByPrefix(name))[0]?.type, { timeout: 30_000 })
      .toBe("repairs");
    const stored = (await findVendorsByPrefix(name))[0];
    expect(stored).toMatchObject({
      status: "verified",
      phone: "+1 (214) 555-0182",
      contact_email: "sam@example.com",
      does_aluminum_welding: true,
      does_trailer_repair: false,
    });
  });

  test("S3: switching a vendor from Driver to Repairs shows in the list and in the Type filter", async ({
    page,
  }) => {
    const name = `${PREFIX} Switch Co`;
    const seeded = await seedVendor({ name, type: "driver" });

    await openVendorsPage(page);
    await searchBox(page).fill(name);
    await rowWith(page, name).click();
    await expect(page.locator("#vendorType")).toHaveValue("driver", { timeout: 30_000 });
    await fillVendorWindow(page, { type: "repairs" });
    await saveVendorWindow(page);

    await expect(cellOf(rowWith(page, name), "type")).toHaveText("Repairs", { timeout: 30_000 });
    await typeFilter(page).selectOption("repairs");
    await expect(rowWith(page, name)).toBeVisible();
    await typeFilter(page).selectOption("driver");
    await expect(rowWith(page, name)).toHaveCount(0);
    await expect
      .poll(async () => (await readVendor(seeded.id)).type, { timeout: 30_000 })
      .toBe("repairs");
  });

  test("S4: Delete hides a vendor, Show Deleted lists it locked, Restore brings it back", async ({
    page,
  }) => {
    const name = `${PREFIX} Delete Me Co`;
    const seeded = await seedVendor({ name, type: "repairs" });

    await openVendorsPage(page);
    await searchBox(page).fill(name);
    await rowWith(page, name).click();
    await deleteVendorInWindow(page);
    await expect(rowWith(page, name)).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(async () => (await readVendor(seeded.id)).is_active, { timeout: 30_000 })
      .toBe(false);

    await showDeletedSwitch(page).check();
    await expect(rowWith(page, name)).toBeVisible({ timeout: 30_000 });
    await rowWith(page, name).click();
    await expect(page.locator("#displayName")).toBeDisabled();
    await expect(saveButton(page)).toHaveCount(0);
    await expect(
      vendorWindow(page).getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
    await vendorWindow(page).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText(/restored$/)).toBeVisible({ timeout: 30_000 });

    await showDeletedSwitch(page).uncheck();
    await expect(rowWith(page, name)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await readVendor(seeded.id)).is_active, { timeout: 30_000 })
      .toBe(true);
  });

  test("S9: the driver page lists Driver vendors only, and keeps the card of a Repairs vendor", async ({
    page,
  }) => {
    const driverCo = `${PREFIX} Pick Driver Co`;
    const repairsCo = `${PREFIX} Pick Repairs Co`;
    await seedVendor({ name: driverCo, type: "driver" });
    const repairs = await seedVendor({ name: repairsCo, type: "repairs" });

    const email = process.env.E2E_DRIVER_EMAIL;
    if (!email) throw new Error("S9 needs E2E_DRIVER_EMAIL");
    const supabase = serviceRoleClient();
    const { data: user } = await supabase.from("Users").select("id").eq("email", email).single();
    const { data: driver } = await supabase
      .from("Drivers")
      .select("id, vendor_uuid")
      .eq("user_uuid", user!.id)
      .single();

    try {
      await page.goto(`/team/${user!.id}/edit/driver`);
      await expect(page.getByLabel("Tax rate percent")).toBeVisible({ timeout: 60_000 });
      await page.getByText("Employee", { exact: true }).first().click();
      await page.getByText("Contractor", { exact: true }).click();

      await page.getByText("Please Assign a Vendor.").click();
      await page.getByPlaceholder("Search vendor...").fill(PREFIX);
      await expect(page.getByText(driverCo)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(repairsCo)).toHaveCount(0);
      await page.keyboard.press("Escape");

      // A driver whose vendor is a Repairs vendor still sees the card.
      await supabase.from("Drivers").update({ vendor_uuid: repairs.id }).eq("id", driver!.id);
      await page.reload();
      await expect(page.getByLabel("Tax rate percent")).toBeVisible({ timeout: 60_000 });
      await page.getByText("Employee", { exact: true }).first().click();
      await page.getByText("Contractor", { exact: true }).click();
      await expect(page.getByText(repairsCo)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Please Assign a Vendor.")).toHaveCount(0);
    } finally {
      await supabase
        .from("Drivers")
        .update({ vendor_uuid: driver!.vendor_uuid ?? null })
        .eq("id", driver!.id);
    }
  });
});
