import { test, expect, type Page } from "@playwright/test";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §5 (S1, S2, S3, S5). Written, not run locally.
// QuickBooks itself is replaced by fakes: the health check and the tax-code list are answered
// here, and the province-tax-codes route keeps its rows in memory, so no real QuickBooks call is
// made and the database is not written.

const CONNECTION = {
  id: "00000000-0000-4000-8000-0000000000c1",
  display_name: "Canada Division",
  realm_id: "9341000000001",
  qbo_tax_code_id: null,
};
const TAX_CODES = [
  { id: "5", name: "HST ON 13%", description: null, taxable: true },
  { id: "7", name: "GST/QST QC", description: null, taxable: true },
];
const PROVINCE_CODES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

async function fakeQuickBooks(page: Page, opts: { failSave?: boolean } = {}) {
  const stored = new Map<string, string>();
  const connectionPatches: unknown[] = [];

  await page.route("**/api/quickbooks/connections", async (route) => {
    if (route.request().method() === "PATCH") {
      connectionPatches.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { connections: [CONNECTION] } });
  });
  await page.route("**/api/quickbooks/connections/health*", (route) =>
    route.fulfill({ json: { healthy: true } }),
  );
  await page.route("**/api/quickbooks/tax-codes*", (route) =>
    route.fulfill({ json: { taxCodes: TAX_CODES } }),
  );
  await page.route("**/api/quickbooks/province-tax-codes*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      if (opts.failSave) {
        return route.fulfill({ status: 500, json: { error: "QuickBooks says no" } });
      }
      const { province, taxCodeId } = request.postDataJSON();
      if (taxCodeId === null) stored.delete(province);
      else stored.set(province, taxCodeId);
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({
      json: {
        provinceTaxCodes: [...stored].map(([province, qbo_tax_code_id]) => ({
          province,
          qbo_tax_code_id,
        })),
      },
    });
  });

  return { stored, connectionPatches };
}

async function openSection(page: Page) {
  await page.goto("/quickbooks");
  await page.getByText("Tax code per Canadian province").click();
}

test.describe("Province tax codes on /quickbooks (admin)", () => {
  test("S1: each connection has the section, listing the 13 provinces", async ({ page }) => {
    await fakeQuickBooks(page);

    await openSection(page);

    for (const code of PROVINCE_CODES) {
      await expect(page.getByTestId(`province-row-${code}`)).toBeVisible();
    }
    await expect(page.getByTestId("province-row-ON")).toContainText("Ontario");
    await expect(page.getByTestId("province-row-ON")).toContainText("13%");
    await expect(page.getByTestId("province-row-QC")).toContainText("GST 5% + QST 9.975%");
  });

  test("S2: a picked code survives a reload, and '— none —' removes it", async ({ page }) => {
    await fakeQuickBooks(page);
    await openSection(page);
    const ontario = page.getByTestId("province-row-ON").getByRole("combobox");

    await ontario.selectOption({ label: "HST ON 13%" });
    await expect(ontario).toHaveValue("5");

    await page.reload();
    await page.getByText("Tax code per Canadian province").click();
    await expect(page.getByTestId("province-row-ON").getByRole("combobox")).toHaveValue("5");

    await page
      .getByTestId("province-row-ON")
      .getByRole("combobox")
      .selectOption({ label: "— none —" });
    await page.reload();
    await page.getByText("Tax code per Canadian province").click();
    await expect(page.getByTestId("province-row-ON").getByRole("combobox")).toHaveValue("");
  });

  test("S3: a failed save shows the error toast and puts the old value back", async ({ page }) => {
    await fakeQuickBooks(page, { failSave: true });
    await openSection(page);
    const ontario = page.getByTestId("province-row-ON").getByRole("combobox");

    await ontario.selectOption({ label: "HST ON 13%" });

    await expect(page.getByText("Failed to update the tax code for Ontario")).toBeVisible();
    await expect(ontario).toHaveValue("");
  });

  test("S5: the connection's Default Tax Code select still works as before", async ({ page }) => {
    const { connectionPatches } = await fakeQuickBooks(page);
    await page.goto("/quickbooks");

    const defaultTaxCode = page
      .locator("div", { hasText: "Default Tax Code" })
      .getByRole("combobox")
      .first();
    await defaultTaxCode.selectOption({ label: "HST ON 13%" });

    await expect
      .poll(() => connectionPatches)
      .toContainEqual({
        connectionId: CONNECTION.id,
        taxCodeId: "5",
      });
  });
});
