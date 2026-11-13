import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";

/**
 * The drivers table of the Audit tab as an accountant sees it
 * (docs/specs/accountant-audit-05-drivers-table.md §3, S1 to S12 and S15 to S18).
 *
 * Written, not run locally (project rule). This project only exists once E2E_ACCOUNTANT_EMAIL is
 * configured (see playwright.config.ts). Nothing is written. Scenarios that need seed data (a
 * driver with trackers in the range, a USD and a CAD driver) skip with a message when the seed
 * has none. S14 (account manager, viewer) is auditAccess.am.spec.ts and auditAccess.viewer.spec.ts.
 */

const params = (page: Page) => new URL(page.url()).searchParams;
const list = (page: Page) => page.getByTestId("audit-drivers-list");
const driverRows = (page: Page) => page.getByTestId("audit-driver-row");
const NO_LIMIT = "/accountant?tab=audit&from=&to=";

async function loaded(page: Page) {
  await expect(list(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Loading drivers...")).toHaveCount(0, { timeout: 60_000 });
}

/** The text of one column of the table (0 Driver, 1 Distance, 2 Drive Time, 3 Trips, 4 Pay). */
const column = (page: Page, n: number) => driverRows(page).locator(`td:nth-child(${n + 1})`);

const payNumber = (text: string) => Number(/\$([\d,]+\.\d{2})/.exec(text)?.[1].replace(/,/g, ""));

test.describe("Audit drivers table (accountant)", () => {
  test("S1: opens on This month, no KPI cards, no select, Pay largest first", async ({ page }) => {
    await page.goto("/accountant?tab=audit");
    await loaded(page);

    const now = DateTime.now();
    await expect.poll(() => params(page).get("from")).toBe(now.startOf("month").toISODate());
    expect(params(page).get("to")).toBe(now.endOf("month").toISODate());

    expect(await list(page).locator("thead th").allTextContents()).toEqual([
      "Driver",
      "Distance",
      "Drive Time",
      "Trips",
      "Pay",
    ]);
    await expect(page.getByText("Total Distance")).toHaveCount(0);
    await expect(page.getByText("Maintenance Cost")).toHaveCount(0);
    await expect(page.getByText("Choose a driver", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Period")).toHaveValue("this_month");
    await expect(page.getByLabel("Period")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pay" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);

    const pays = (await column(page, 4).allTextContents()).map(payNumber);
    expect(pays).toEqual([...pays].sort((a, b) => b - a));
  });

  test("S2: the search narrows the table, writes asearch, and clears", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    const total = await driverRows(page).count();
    const name = (await column(page, 0).first().innerText()).trim();
    const needle = name.slice(0, 3).toLowerCase();
    const box = page.getByTestId("audit-search");

    await box.fill(needle);
    await expect.poll(() => params(page).get("asearch")).toBe(needle);
    expect(await driverRows(page).count()).toBeLessThanOrEqual(total);
    for (const text of await column(page, 0).allInnerTexts()) {
      expect(text.toLowerCase()).toContain(needle);
    }

    await box.fill("");
    await expect.poll(() => params(page).has("asearch")).toBe(false);
    await expect(driverRows(page)).toHaveCount(total);

    await box.fill("zzzzzzzz");
    await expect(page.getByText("No driver found.")).toBeVisible();
  });

  test("S3: a preset sets both dates, All time writes from=&to= and survives a reload", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");
    await loaded(page);

    await page.getByLabel("Period").selectOption("last_month");
    const last = DateTime.now().minus({ months: 1 });
    await expect.poll(() => params(page).get("from")).toBe(last.startOf("month").toISODate());
    expect(params(page).get("to")).toBe(last.endOf("month").toISODate());
    await expect(page.getByLabel("From")).toHaveValue(last.startOf("month").toISODate()!);
    await expect(page.getByLabel("To")).toHaveValue(last.endOf("month").toISODate()!);

    await page.getByLabel("Period").selectOption("all_time");
    await expect.poll(() => params(page).get("from")).toBe("");
    expect(params(page).has("to")).toBe(true);
    expect(params(page).get("to")).toBe("");
    await expect(page.getByLabel("From")).toHaveValue("");

    await page.reload();
    await loaded(page);
    expect(params(page).get("from")).toBe("");
    await expect(page.getByLabel("Period")).toHaveValue("all_time");
  });

  test("S4: clearing only From keeps To and reads Custom; typed dates reach the URL", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit&from=2026-10-01&to=2026-10-31");
    await loaded(page);

    await page.getByLabel("From").fill("");
    await expect.poll(() => params(page).get("from")).toBe("");
    expect(params(page).get("to")).toBe("2026-10-31");
    await expect(page.getByLabel("Period")).toHaveValue("custom");

    await page.getByLabel("From").fill("2026-10-05");
    await page.getByLabel("To").fill("2026-10-20");
    await expect.poll(() => params(page).get("from")).toBe("2026-10-05");
    expect(params(page).get("to")).toBe("2026-10-20");
  });

  test("S5: From after To shows the message and no rows", async ({ page }) => {
    await page.goto("/accountant?tab=audit&from=2026-11-30&to=2026-11-01");

    await expect(page.getByText("The start date is after the end date.")).toBeVisible({
      timeout: 60_000,
    });
    await expect(driverRows(page)).toHaveCount(0);
  });

  test("S6: a click on a row opens the driver page and keeps the dates and the search", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT + "&asearch=");
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    // Any cell of the row, not only the name.
    await column(page, 3).first().click();

    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    expect(params(page).get("from")).toBe("");
    expect(params(page).get("to")).toBe("");
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("audit-driver-name")).toBeVisible();
    await expect(page.getByTestId("audit-driver-info")).toBeVisible();
    await expect(page.getByLabel("Period")).toBeVisible();
    await expect(page.getByTestId("audit-drivers-list")).toHaveCount(0);
    await expect(page.getByText("Choose a driver", { exact: true })).toHaveCount(0);
  });

  test("S6: only trackers inside the range are listed on the driver page", async ({ page }) => {
    await page.goto(`/accountant?tab=audit&from=2000-01-01&to=${DateTime.now().toISODate()}`);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");
    const from = "2000-01-01";
    const to = DateTime.now().toISODate()!;

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Loading work trackers...")).toHaveCount(0, { timeout: 60_000 });

    const dates = (
      await page.getByTestId("audit-table").locator("tbody tr td:nth-child(2)").allTextContents()
    )
      .map((t) => t.trim())
      .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t));
    for (const date of dates) {
      expect(date >= from && date <= to).toBe(true);
    }
  });

  test("S7: the browser's Back button returns to the table with the same dates and search", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");
    const name = (await column(page, 0).first().innerText()).trim();
    const needle = name.slice(0, 2).toLowerCase();
    await page.getByTestId("audit-search").fill(needle);
    await expect.poll(() => params(page).get("asearch")).toBe(needle);

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });

    await page.goBack();

    await loaded(page);
    expect(params(page).has("driver")).toBe(false);
    expect(params(page).get("from")).toBe("");
    expect(params(page).get("asearch")).toBe(needle);
    await expect(page.getByTestId("audit-search")).toHaveValue(needle);
  });

  test("S8: the Back button on the page does the same", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("audit-back").click();

    await loaded(page);
    expect(params(page).has("driver")).toBe(false);
    expect(params(page).get("from")).toBe("");
    expect(params(page).get("to")).toBe("");
  });

  test("S9: on the driver page a new range drops apage", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");
    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await page.goto(page.url() + "&apage=2");
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });

    await page.getByLabel("Period").selectOption("this_year");

    await expect.poll(() => params(page).has("apage")).toBe(false);
    expect(params(page).get("from")).toBe(DateTime.now().startOf("year").toISODate());
  });

  test("S10: a driver link with no dates is given This month's dates", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");
    const href = (await driverRows(page).first().getByRole("link").getAttribute("href")) ?? "";
    const driver = new URL(href, "http://localhost").searchParams.get("driver");

    await page.goto(`/accountant?tab=audit&driver=${driver}`);

    await expect
      .poll(() => params(page).get("from"))
      .toBe(DateTime.now().startOf("month").toISODate());
    expect(params(page).get("to")).toBe(DateTime.now().endOf("month").toISODate());
    expect(params(page).get("driver")).toBe(driver);
  });

  test("S11: Trips of a row equals the pager total of that driver's page for the same range", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");
    const trips = Number((await column(page, 3).first().innerText()).trim());

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Loading work trackers...")).toHaveCount(0, { timeout: 60_000 });

    const pager = page.getByRole("navigation", { name: "Pagination" });
    const total =
      (await pager.count()) > 0
        ? Number(/of (\d+)/.exec(await pager.innerText())?.[1])
        : await page.getByTestId("audit-row-status").count();
    expect(total).toBe(trips);
  });

  test("S11: for one whole year a row equals the same driver on /driver-scorecard", async ({
    page,
  }) => {
    const year = DateTime.now().year;
    await page.goto(`/accountant?tab=audit&from=${year}-01-01&to=${year}-12-31`);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, `No driver with trackers in ${year}.`);
    const row = driverRows(page).first();
    const name = (await row.locator("td").nth(0).innerText()).trim();
    const distance = (await row.locator("td").nth(1).innerText()).trim();
    const time = (await row.locator("td").nth(2).innerText()).trim();
    const trips = (await row.locator("td").nth(3).innerText()).trim();
    const pay = (await row.locator("td").nth(4).innerText()).trim();

    await page.goto(`/driver-scorecard?year=${year}`);
    const scoreRow = page.locator("tbody tr").filter({ hasText: name }).first();
    await expect(scoreRow).toBeVisible({ timeout: 60_000 });

    const km = /^([\d,]+\.\d) km/.exec(distance)?.[1];
    await expect(scoreRow.locator("td").nth(2)).toContainText(`${km} km`);
    await expect(scoreRow.locator("td").nth(3)).toHaveText(time);
    await expect(scoreRow.locator("td").nth(4)).toHaveText(trips);
    await expect(scoreRow.locator("td").nth(5)).toHaveText(pay.replace(/ (USD|CAD)$/, ""));
  });

  test("S12: a driver id that does not exist is removed from the URL", async ({ page }) => {
    await page.goto(`${NO_LIMIT}&driver=00000000-0000-0000-0000-000000000000`);

    await expect.poll(() => params(page).has("driver"), { timeout: 60_000 }).toBe(false);
    await loaded(page);
  });

  test("S15: a click on a header sorts, flips, and Pay brings back the opening order", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) < 2, "Fewer than two drivers in the seed.");

    await page.getByTestId("audit-sort-driver").click();
    await expect.poll(() => params(page).get("asort")).toBe("driver");
    expect(params(page).get("adir")).toBe("asc");
    await expect(page.getByRole("columnheader", { name: "Driver" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    const names = (await column(page, 0).allInnerTexts()).map((t) => t.trim().toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    await page.getByTestId("audit-sort-driver").click();
    await expect.poll(() => params(page).get("adir")).toBe("desc");

    await page.getByTestId("audit-sort-trips").click();
    await expect.poll(() => params(page).get("asort")).toBe("trips");
    expect(params(page).has("adir")).toBe(false);
    const trips = (await column(page, 3).allInnerTexts()).map(Number);
    expect(trips).toEqual([...trips].sort((a, b) => b - a));

    await page.getByTestId("audit-sort-pay").click();
    await expect.poll(() => params(page).has("asort")).toBe(false);
    expect(params(page).has("adir")).toBe(false);
  });

  test("S16: after a sort and a click on a row, both Back buttons bring the sort back", async ({
    page,
  }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) < 1, "No driver with trackers in the seed.");
    await page.getByTestId("audit-sort-driver").click();
    await expect.poll(() => params(page).get("asort")).toBe("driver");

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await page.goBack();
    await loaded(page);
    expect(params(page).get("asort")).toBe("driver");
    expect(params(page).get("adir")).toBe("asc");

    await driverRows(page).first().getByRole("link").click();
    await expect(page.getByTestId("audit-back")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("audit-back").click();
    await loaded(page);
    expect(params(page).get("asort")).toBe("driver");
    expect(params(page).get("adir")).toBe("asc");
  });

  test("S17: the cells read like 34.4 km/21.4 mi, $1,234.00 USD and 2h 5m", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    test.skip((await driverRows(page).count()) === 0, "No driver with trackers in the seed.");

    for (const text of await column(page, 1).allInnerTexts()) {
      expect(text.trim()).toMatch(/^\d+\.\d km\/\d+\.\d mi$/);
    }
    for (const text of await column(page, 2).allInnerTexts()) {
      expect(text.trim()).toMatch(/^(—|\d+m|\d+h( \d+m)?)$/);
    }
    for (const text of await column(page, 4).allInnerTexts()) {
      expect(text.trim()).toMatch(/^\$[\d,]+\.\d{2} (USD|CAD)$/);
    }
  });

  test("S18: Pay sorts on the plain number, whatever the currency", async ({ page }) => {
    await page.goto(NO_LIMIT);
    await loaded(page);
    const pays = await column(page, 4).allInnerTexts();
    test.skip(
      !(pays.some((t) => t.endsWith("USD")) && pays.some((t) => t.endsWith("CAD"))),
      "The seed has no USD driver and CAD driver together.",
    );

    const numbers = pays.map(payNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  });
});
