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

/** `?bleacher_uuid=` for a seeded bleacher, with extra query parts after it. */
export const bleacherQuery = (uuid: string, extra = "") => `?bleacher_uuid=${uuid}${extra}`;
