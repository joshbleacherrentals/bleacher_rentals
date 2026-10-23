import { test, expect, type Page } from "@playwright/test";

// docs/specs/qbo-invoice-03c-no-tax-code.md §5 (S1, S2, S3, S5). Written, not run locally.
// QuickBooks itself is replaced by fakes: the health check and the tax-code list are answered
// here, and the connections route keeps the connection's two tax codes in memory, so no real
// QuickBooks call is made and the database is not written.

const CONNECTION = {
  id: "00000000-0000-4000-8000-0000000000c1",
  display_name: "Canada Division",
  realm_id: "9341000000001",
  currency: "CAD",
};
const TAX_CODES = [
  { id: "2", name: "Exempt", description: "Tax-exempt", taxable: true },
  { id: "3", name: "Zero-rated", description: "Zero-rated", taxable: true },
  { id: "5", name: "HST ON", description: null, taxable: true },
];

async function fakeQuickBooks(page: Page, opts: { failSave?: boolean } = {}) {
  const stored = { taxCodeId: null as string | null, noTaxCodeId: null as string | null };
  const connectionPatches: unknown[] = [];

  await page.route("**/api/quickbooks/connections", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      connectionPatches.push(body);
      if ("noTaxCodeId" in body) {
        if (opts.failSave) {
          return route.fulfill({ status: 500, json: { error: "QuickBooks says no" } });
        }
        stored.noTaxCodeId = body.noTaxCodeId;
      } else if ("taxCodeId" in body) {
        stored.taxCodeId = body.taxCodeId;
      }
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({
      json: {
        connections: [
          {
            ...CONNECTION,
            qbo_tax_code_id: stored.taxCodeId,
            qbo_no_tax_code_id: stored.noTaxCodeId,
          },
        ],
      },
    });
  });
  await page.route("**/api/quickbooks/connections/health*", (route) =>
    route.fulfill({ json: { healthy: true } }),
  );
  await page.route("**/api/quickbooks/tax-codes*", (route) =>
    route.fulfill({ json: { taxCodes: TAX_CODES } }),
  );
  await page.route("**/api/quickbooks/province-tax-codes*", (route) =>
    route.fulfill({ json: { provinceTaxCodes: [] } }),
  );

  return { stored, connectionPatches };
}

const noTaxSelect = (page: Page) => page.getByTestId(`no-tax-code-${CONNECTION.id}`);

test.describe("No-tax code on /quickbooks (admin)", () => {
  test("S1: a CAD connection shows the No-tax code row, listing its tax codes", async ({
    page,
  }) => {
    await fakeQuickBooks(page);

    await page.goto("/quickbooks");

    await expect(page.getByText("No-tax code", { exact: true })).toBeVisible();
    await expect(noTaxSelect(page)).toBeVisible();
    for (const name of ["— none —", "Exempt", "Zero-rated", "HST ON"]) {
      await expect(noTaxSelect(page).locator("option", { hasText: name })).toHaveCount(1);
    }
  });

  test("S2: a picked code survives a reload, and '— none —' clears it", async ({ page }) => {
    const { connectionPatches } = await fakeQuickBooks(page);
    await page.goto("/quickbooks");

    await noTaxSelect(page).selectOption({ label: "Exempt" });
    await expect(noTaxSelect(page)).toHaveValue("2");
    await expect
      .poll(() => connectionPatches)
      .toContainEqual({ connectionId: CONNECTION.id, noTaxCodeId: "2" });

    await page.reload();
    await expect(noTaxSelect(page)).toHaveValue("2");

    await noTaxSelect(page).selectOption({ label: "— none —" });
    await expect
      .poll(() => connectionPatches)
      .toContainEqual({ connectionId: CONNECTION.id, noTaxCodeId: null });

    await page.reload();
    await expect(noTaxSelect(page)).toHaveValue("");
  });

  test("S3: a failed save shows the error toast and puts the old value back", async ({ page }) => {
    await fakeQuickBooks(page, { failSave: true });
    await page.goto("/quickbooks");

    await noTaxSelect(page).selectOption({ label: "Exempt" });

    await expect(page.getByText("Failed to update no-tax code")).toBeVisible();
    await expect(noTaxSelect(page)).toHaveValue("");
  });

  test("S5: the Default Tax Code select and the province section still work", async ({ page }) => {
    const { connectionPatches } = await fakeQuickBooks(page);
    await page.goto("/quickbooks");

    const defaultTaxCode = page.getByText("Default Tax Code").locator("..").getByRole("combobox");
    await defaultTaxCode.selectOption({ label: "HST ON" });

    await expect
      .poll(() => connectionPatches)
      .toContainEqual({ connectionId: CONNECTION.id, taxCodeId: "5" });
    await expect(page.getByText("Tax code per Canadian province")).toBeVisible();
  });
});
