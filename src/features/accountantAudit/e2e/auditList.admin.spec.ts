import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";

/**
 * The drivers table of the Audit tab as an administrator sees it
 * (docs/specs/accountant-audit-05-drivers-table.md §3, S13: the same as S1, S2 and S6 for an admin).
 *
 * Written, not run locally (project rule). The seeded E2E admin user has no `Users` row in the
 * local database, so this spec cannot run there anyway (see CLAUDE.md, E2E test users & roles).
 */

const params = (page: Page) => new URL(page.url()).searchParams;
const list = (page: Page) => page.getByTestId("audit-drivers-list");
const driverRows = (page: Page) => page.getByTestId("audit-driver-row");
const NO_LIMIT = "/accountant?tab=audit&from=&to=";

async function loaded(page: Page) {
  await expect(list(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Loading drivers...")).toHaveCount(0, { timeout: 60_000 });
}

test.describe("Audit drivers table (admin)", () => {
  test("S13/S1: opens on This month, with the five columns and no select", async ({ page }) => {
    await page.goto("/accountant?tab=audit");
    await loaded(page);

    await expect
      .poll(() => params(page).get("from"))
      .toBe(DateTime.now().startOf("month").toISODate());
    expect(await list(page).locator("thead th").allTextContents()).toEqual([
      "Driver",
      "Distance",
      "Drive Time",
      "Trips",
      "Pay",
    ]);
    await expect(page.getByText("Choose a driver", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Period")).toHaveValue("this_month");
  });

  test("S13/S2: the search narrows the table and writes asearch", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    const name = (await driverRows(page).first().locator("td").first().innerText()).trim();
    const needle = name.slice(0, 3).toLowerCase();
    await page.getByTestId("audit-search").fill(needle);

    await expect.poll(() => params(page).get("asearch")).toBe(needle);
    for (const text of await driverRows(page).locator("td:nth-child(1)").allInnerTexts()) {
      expect(text.toLowerCase()).toContain(needle);
    }
  });

  test("S13/S6: a click on a row opens the driver page with Back and the name", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    await driverRows(page).first().locator("td").nth(3).click();

    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("audit-driver-name")).toBeVisible();
    await expect(page.getByTestId("audit-driver-info")).toBeVisible();
  });
});
