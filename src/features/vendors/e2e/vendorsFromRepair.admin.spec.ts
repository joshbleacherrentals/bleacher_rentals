import { test, expect } from "@playwright/test";
import { openRepairsPage } from "../../repairs/e2e/helpers/repairsPage";
import { newRepairWindow } from "../../repairs/e2e/helpers/linksFlow";
import { deleteVendorsByPrefix, findVendorsByPrefix, saveButton } from "./helpers/vendorsFlow";

/**
 * "+ Create vendor" in the Vendor select of the New repair window: the vendor window opens over the
 * repair window with Repairs preselected and the text typed in the search as its name, one Save
 * creates the vendor, and the repair's Vendor select shows it at once. Written, not run (project
 * rule). Spec: docs/specs/vendors-page.md §11 (S10).
 */
const PREFIX = "E2E Vendors RPR";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test("S10: + Create vendor makes a Repairs vendor and selects it in the New repair window", async ({
  page,
}) => {
  const name = `${PREFIX} Brand New Welding`;

  await openRepairsPage(page);
  await page.getByTestId("new-repair").click();
  const repairWindow = newRepairWindow(page);
  await expect(repairWindow).toBeVisible({ timeout: 30_000 });

  // The Vendor select is the first combobox of the window; the typed text is carried over.
  await repairWindow.getByRole("combobox").first().click();
  await page.getByPlaceholder("Search vendors...").fill(name);
  await page.getByText("+ Create vendor").click();

  // The vendor window lies over the repair window: Repairs preselected, the name filled in, one Save.
  const vendorWindow = page.getByRole("dialog").filter({ hasText: "Create New Vendor" });
  await expect(vendorWindow).toBeVisible();
  await expect(vendorWindow.locator("#vendorType")).toHaveValue("repairs");
  await expect(vendorWindow.locator("#displayName")).toHaveValue(name);
  await expect(vendorWindow.getByRole("button", { name: "Save & Assign" })).toHaveCount(0);
  await saveButton(page).click();
  await expect(page.getByText(/created successfully/)).toBeVisible({ timeout: 30_000 });
  await expect(vendorWindow).toHaveCount(0);

  // The repair window is still open and its Vendor select shows the new vendor.
  await expect(repairWindow).toBeVisible();
  await expect(repairWindow.getByRole("combobox").first()).toContainText(name);

  await expect
    .poll(async () => (await findVendorsByPrefix(name))[0]?.type, { timeout: 30_000 })
    .toBe("repairs");
});
