import { test, expect } from "@playwright/test";
import {
  createConnection,
  deleteConnection,
  eventTypeId,
  fakeQuickBooks,
  pick,
  rowOf,
  type E2eConnection,
} from "./helpers/quoteTypes";

// docs/specs/qbo-invoice-12a-quote-types-page.md §5 (S4, S5) and
// docs/specs/qbo-invoice-12c-manage-quote-types.md §5 (S12), as an accountant.
// Written, not run locally (standing instruction: no Playwright runs on this machine). This project
// only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).

const LOAD = { timeout: 60_000 };

test.describe("Quote Types page (accountant)", () => {
  let connection: E2eConnection;
  let cityId: string;

  test.beforeAll(async () => {
    connection = await createConnection();
    cityId = await eventTypeId("City");
  });

  test.afterAll(async () => {
    await deleteConnection(connection.id);
  });

  test.beforeEach(async ({ page }) => {
    await fakeQuickBooks(page, connection);
  });

  test("S4: the Configuration section holds Quote Types only, and the page saves like an administrator's", async ({
    page,
  }) => {
    await page.goto("/accountant");
    await page.getByRole("button", { name: "Configuration" }).click();

    await expect(page.getByRole("link", { name: "Quote Types" })).toBeVisible();
    for (const hidden of [
      "Zone Manager",
      "Inspection Form",
      "QuickBooks",
      "Work Tracker Types",
      "Stripe",
      "Pricing Matrix",
      "Terms & Conditions",
      "Sales Offices",
      "Storage Locations",
    ]) {
      await expect(page.getByRole("link", { name: hidden, exact: true }), hidden).toHaveCount(0);
    }

    await page.getByRole("link", { name: "Quote Types" }).click();
    await expect(page).toHaveURL(/\/qbo-quote-types/);
    const row = rowOf(page, cityId, connection.id);
    await expect(row).toBeVisible(LOAD);

    await pick(page, row, "Bleacher Rental - City");
    await page.reload();
    await expect(rowOf(page, cityId, connection.id).getByRole("combobox")).toContainText(
      "Bleacher Rental - City",
      LOAD,
    );
  });

  test("S12: there is no Add, Rename or Delete control, and assigning still works", async ({
    page,
  }) => {
    await page.goto("/qbo-quote-types");
    const row = rowOf(page, cityId, connection.id);
    await expect(row).toBeVisible(LOAD);

    await expect(page.getByTestId("add-quote-type")).toHaveCount(0);
    await expect(page.locator('[data-testid^="rename-quote-type-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="delete-quote-type-"]')).toHaveCount(0);

    await pick(page, row, "Bleacher Rental - City");
    await expect(row.getByRole("combobox")).toContainText("Bleacher Rental - City");
  });

  test("S5: every other Configuration page is out of reach by URL", async ({ page }) => {
    for (const path of ["/quickbooks", "/work-tracker-types", "/zones", "/pricing-matrix"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/accountant/);
    }
  });
});
