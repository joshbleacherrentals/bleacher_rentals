import { test, expect, type Page } from "@playwright/test";

// docs/specs/qbo-invoice-03e-canadian-settings-cad-only.md §4 (S1 to S4). Written, not run locally.
// QuickBooks itself is replaced by fakes, as in the specs of 03a and 03c: the connections route, the
// health check, the tax-code list and the province rows are answered here, so no real QuickBooks call
// is made and the database is not written.

const connection = (id: string, name: string, currency: string | null) => ({
  id,
  display_name: name,
  realm_id: `realm-${id}`,
  qbo_tax_code_id: null,
  qbo_no_tax_code_id: null,
  currency,
});

const CAD = connection("00000000-0000-4000-8000-0000000000c1", "Canada Division", "CAD");
const USD = connection("00000000-0000-4000-8000-0000000000c2", "Florida LLC", "USD");
const NONE = connection("00000000-0000-4000-8000-0000000000c3", "Not Yet Connected", null);

const TAX_CODES = [
  { id: "2", name: "Exempt", description: null, taxable: true },
  { id: "5", name: "HST ON", description: null, taxable: true },
];

async function fakeQuickBooks(page: Page, connections: unknown[]) {
  await page.route("**/api/quickbooks/connections", (route) =>
    route.fulfill({ json: { connections } }),
  );
  await page.route("**/api/quickbooks/connections/health*", (route) =>
    route.fulfill({ json: { healthy: true } }),
  );
  await page.route("**/api/quickbooks/tax-codes*", (route) =>
    route.fulfill({ json: { taxCodes: TAX_CODES } }),
  );
  await page.route("**/api/quickbooks/province-tax-codes*", (route) =>
    route.fulfill({ json: { provinceTaxCodes: [] } }),
  );
}

/** The card of one connection, found by its name. */
const card = (page: Page, name: string) =>
  page.locator("div.rounded-lg", { has: page.getByText(name, { exact: true }) }).last();

test.describe("The Canadian settings on /quickbooks are for CAD connections only (admin)", () => {
  test("S1: a CAD connection shows the No-tax code row and the province section", async ({
    page,
  }) => {
    await fakeQuickBooks(page, [CAD]);

    await page.goto("/quickbooks");

    const cad = card(page, CAD.display_name);
    await expect(cad.getByText("No-tax code", { exact: true })).toBeVisible();
    await expect(cad.getByText("No-tax code (Canada)")).toHaveCount(0);
    await expect(cad.getByText("Tax code per Canadian province")).toBeVisible();
    await expect(cad.getByText("Default Tax Code")).toBeVisible();
  });

  test("S2: a USD connection shows neither, and still shows the Default Tax Code", async ({
    page,
  }) => {
    await fakeQuickBooks(page, [USD]);

    await page.goto("/quickbooks");

    const usd = card(page, USD.display_name);
    await expect(usd.getByText("Default Tax Code")).toBeVisible();
    await expect(usd.getByText("No-tax code")).toHaveCount(0);
    await expect(usd.getByText("Tax code per Canadian province")).toHaveCount(0);
  });

  test("S3: a connection with no recorded currency shows neither", async ({ page }) => {
    await fakeQuickBooks(page, [NONE]);

    await page.goto("/quickbooks");

    const none = card(page, NONE.display_name);
    await expect(none.getByText("Default Tax Code")).toBeVisible();
    await expect(none.getByText("No-tax code")).toHaveCount(0);
    await expect(none.getByText("Tax code per Canadian province")).toHaveCount(0);
  });

  test("S4: with a CAD and a USD connection on the page, only the CAD one has the rows", async ({
    page,
  }) => {
    await fakeQuickBooks(page, [CAD, USD, NONE]);

    await page.goto("/quickbooks");

    await expect(page.getByText("Default Tax Code")).toHaveCount(3);
    await expect(page.getByText("No-tax code", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Tax code per Canadian province")).toHaveCount(1);
    await expect(
      card(page, CAD.display_name).getByText("Tax code per Canadian province"),
    ).toBeVisible();
  });
});
