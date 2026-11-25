import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers of the Repairs page specs. docs/specs/repairs-04-table.md §6.
 * The page reads from PowerSync, so a seeded row arrives a moment after the page opens.
 */

/** Opens /repairs (with an optional query) and waits until the list has loaded. */
export async function openRepairsPage(page: Page, query = "") {
  await page.goto(`/repairs${query}`);
  await expect(page.getByRole("heading", { name: "Repairs" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("repairs-loading")).toHaveCount(0, { timeout: 120_000 });
}

export const repairRows = (page: Page) => page.getByTestId("repair-row");

/** The row that holds `text` (an invoice number, a status, a bleacher chip). */
export const rowWith = (page: Page, text: string | RegExp) =>
  repairRows(page).filter({ hasText: text });

/** One cell of a row, by its column key (`vendor`, `total`, `reported`, ...). */
export const cellOf = (row: Locator, key: string) => row.locator(`[data-col="${key}"]`);

export const tab = (page: Page, name: "Open" | "Completed") => page.getByRole("tab", { name });

/** `?bleachers=` for one or more seeded bleachers, with extra query parts after it. */
export const bleacherQuery = (uuids: string | string[], extra = "") =>
  `?bleachers=${Array.isArray(uuids) ? uuids.join(",") : uuids}${extra}`;

/** The one-bleacher link of spec 04, which the page still reads (spec 05 D63). */
export const legacyBleacherQuery = (uuid: string, extra = "") => `?bleacher_uuid=${uuid}${extra}`;

export type FilterName = "bleacher" | "zone" | "vendor" | "category";

/** The button of a filter, and its dropdown while it is open (spec 05). */
export const filterButton = (page: Page, key: FilterName) =>
  page.getByTestId(`repairs-filter-${key}`);
export const filterList = (page: Page, key: FilterName) =>
  page.getByTestId(`repairs-filter-list-${key}`);
export const searchBox = (page: Page) => page.getByTestId("repairs-search");

/** Opens a filter, ticks (or unticks) one option by its label and closes the dropdown again. */
export async function toggleOption(page: Page, key: FilterName, label: string) {
  await filterButton(page, key).click();
  await filterList(page, key).getByRole("menuitemcheckbox", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** The sort button in the header of a column. */
export const sortButton = (page: Page, column: string) =>
  page.getByRole("columnheader").getByRole("button", { name: column, exact: true });

export const columnHeader = (page: Page, column: string) =>
  page.getByRole("columnheader").filter({ hasText: new RegExp(`^${column}$`) });

/** The service rows of every open block (spec 06). */
export const serviceRows = (page: Page) => page.getByTestId("repair-service-row");

/** The arrow button of a repair row. */
export const toggleOf = (row: Locator) => row.getByTestId("repair-toggle");

/** The block of services under a repair row: the group that holds the row, then its block. */
export const blockOf = (row: Locator) => row.locator("xpath=..").getByTestId("repair-services");

/** The service window, the damage report window and the repair window (spec 07). */
export const windowOf = (page: Page, which: "service" | "reports" | "repair") =>
  page.getByTestId(
    which === "service"
      ? "service-window"
      : which === "reports"
        ? "damage-report-window"
        : "repair-window",
  );

/** The button at the end of a repair row that opens the repair window (spec 07 D94). */
export const openButtonOf = (row: Locator) => row.getByTestId("repair-open");
