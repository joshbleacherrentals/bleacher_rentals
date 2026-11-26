import { test, expect } from "@playwright/test";
import {
  addButton,
  deleteVendorsByPrefix,
  fillVendorWindow,
  findVendorsByPrefix,
  openVendorsPage,
  saveVendorWindow,
  vendorWindow,
} from "./helpers/vendorsFlow";

/**
 * The Vendors page as an account manager: the Add button works and the QuickBooks connection
 * select is filled, because the connections list now answers an account manager (D14).
 * Written, not run (project rule). Spec: docs/specs/vendors-page.md §6.3 (S5).
 */
const PREFIX = "E2E Vendors AM";

test.afterAll(async () => {
  await deleteVendorsByPrefix(PREFIX);
});

test("S5: an account manager adds a vendor and the QuickBooks connections are readable", async ({
  page,
}) => {
  await openVendorsPage(page);
  await expect(addButton(page)).toBeVisible();

  const connections = await page.request.get("/api/quickbooks/connections");
  expect(connections.status()).toBe(200);
  const { connections: list } = (await connections.json()) as { connections: { id: string }[] };

  await addButton(page).click();
  await expect(vendorWindow(page)).toBeVisible();
  // One option for "Select a connection..." and one per connection the server returned.
  await expect(vendorWindow(page).locator("select").nth(2).locator("option")).toHaveCount(
    list.length + 1,
    { timeout: 30_000 },
  );

  const name = `${PREFIX} Added Co`;
  await fillVendorWindow(page, { name, type: "driver" });
  await saveVendorWindow(page);
  await expect
    .poll(async () => (await findVendorsByPrefix(name)).length, { timeout: 30_000 })
    .toBe(1);
});
