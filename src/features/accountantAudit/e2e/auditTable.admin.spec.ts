import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";

/**
 * The table of the Audit tab as an administrator sees it
 * (docs/specs/accountant-audit-04-table.md §4: the same S1 to S9 as for the accountant).
 *
 * Written, not run locally (project rule). The seeded E2E admin user has no `Users` row in the
 * local database, so this spec cannot run there anyway (see CLAUDE.md, E2E test users & roles).
 * Nothing is written. Several scenarios need seed data (a driver with more than 25 trackers, with
 * Paid and Not paid weeks, with none): each one looks through the drivers of the select for a fit
 * and skips with a message when the seed has none.
 */

const params = (page: Page) => new URL(page.url()).searchParams;
const table = (page: Page) => page.getByTestId("audit-table");
const statusCells = (page: Page) => page.getByTestId("audit-row-status");
const bodyRows = (page: Page) => table(page).locator("tbody tr");
const pager = (page: Page) => page.getByRole("navigation", { name: "Pagination" });
const MAX_DRIVERS = 25;

/** Opens the Audit tab and chooses the driver at `index`; its name, or false past the list's end. */
async function chooseDriver(page: Page, index: number): Promise<string | false> {
  await page.goto("/accountant?tab=audit");
  const select = page.getByRole("combobox");
  await expect(select).toBeEnabled({ timeout: 60_000 });
  await select.click();
  const options = page.getByRole("option");
  if (index >= (await options.count())) return false;
  const name = ((await options.nth(index).innerText()).split("\n")[0] ?? "").trim();
  await options.nth(index).click();
  await expect(table(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Loading work trackers...")).toHaveCount(0, { timeout: 60_000 });
  return name;
}

/** The first driver the test accepts, or null. The page is left on that driver. */
async function findDriver(
  page: Page,
  accepts: (page: Page) => Promise<boolean>,
): Promise<string | null> {
  for (let index = 0; index < MAX_DRIVERS; index++) {
    const name = await chooseDriver(page, index);
    if (name === false) return null;
    if (await accepts(page)) return name;
  }
  return null;
}

/** The total behind the pager ("1–25 of 61"); 0 when there is no pager. */
async function totalOf(page: Page): Promise<number> {
  if ((await pager(page).count()) === 0) return 0;
  const match = /of (\d+)/.exec(await pager(page).innerText());
  return match ? Number(match[1]) : 0;
}

const hasRows = async (page: Page) => (await statusCells(page).count()) > 0;

test.describe("Audit table (admin)", () => {
  test("S1: a driver with trackers shows the nine headers", async ({ page }) => {
    const name = await findDriver(page, hasRows);
    test.skip(name === null, "No driver with work trackers in the seed.");

    expect(await table(page).locator("thead th").allTextContents()).toEqual([
      "Status",
      "Date",
      "Bleacher",
      "Type",
      "Pickup location",
      "Dropoff location",
      "Drive time",
      "Distance",
      "Payment status",
    ]);
  });

  test("S2: dates go from newest to oldest and a Trip row has the Trip badge", async ({ page }) => {
    const name = await findDriver(
      page,
      async (p) => (await bodyRows(p).filter({ hasText: /trip/i }).count()) > 0,
    );
    test.skip(name === null, "No driver with a Trip work tracker in the seed.");

    const cells = await table(page).locator("tbody tr td:nth-child(2)").allTextContents();
    const dates = cells.filter((text) => /^\d{4}-\d{2}-\d{2}$/.test(text.trim()));
    expect(dates).toEqual([...dates].sort().reverse());

    const tripRow = bodyRows(page).filter({ hasText: /trip/i }).first();
    await expect(tripRow.locator("td").nth(3)).toContainText(/trip/i);
    await expect(tripRow.locator("td").nth(3).locator("svg")).toHaveCount(1);
  });

  test("S2: a Repair row shows a dash for drive time and distance", async ({ page }) => {
    const name = await findDriver(
      page,
      async (p) =>
        (await bodyRows(p)
          .filter({ hasText: /repair/i })
          .count()) > 0,
    );
    test.skip(name === null, "No driver with a Repair work tracker in the seed.");

    const repairRow = bodyRows(page)
      .filter({ hasText: /repair/i })
      .first();
    await expect(repairRow.locator("td").nth(6)).toHaveText("–");
    await expect(repairRow.locator("td").nth(7)).toHaveText("–");
  });

  test("S3: every row shows a status icon with a title", async ({ page }) => {
    const name = await findDriver(page, hasRows);
    test.skip(name === null, "No driver with work trackers in the seed.");

    for (const cell of await statusCells(page).all()) {
      await expect(cell).toHaveAttribute("title", /\S/);
      await expect(cell.locator("svg")).toHaveCount(1);
    }
  });

  test("S3: a Cancelled or Declined tracker is in the list, every status is listed", async ({
    page,
  }) => {
    const name = await findDriver(
      page,
      async (p) =>
        (await p.locator('[data-testid="audit-row-status"][title="Cancelled"]').count()) +
          (await p.locator('[data-testid="audit-row-status"][title="Declined"]').count()) >
        0,
    );
    test.skip(name === null, "No driver with a Cancelled or Declined tracker on a first page.");

    await expect(
      page
        .locator(
          '[data-testid="audit-row-status"][title="Cancelled"], [data-testid="audit-row-status"][title="Declined"]',
        )
        .first(),
    ).toBeVisible();
  });

  test("S4: a Paid row and a Not paid row show their pills, a tracker with no group a dash", async ({
    page,
  }) => {
    const name = await findDriver(
      page,
      async (p) =>
        (await table(p).locator('[data-payment="paid"]').count()) > 0 &&
        (await table(p).locator('[data-payment="not_paid"]').count()) > 0,
    );
    test.skip(name === null, "No driver with both a Paid and a Not paid tracker in the seed.");

    await expect(table(page).locator('[data-payment="paid"]').first()).toHaveText("Paid");
    await expect(table(page).locator('[data-payment="not_paid"]').first()).toHaveText("Not paid");
    for (const dash of await table(page).locator('[data-payment="none"]').all()) {
      await expect(dash).toHaveText("–");
    }
  });

  test("S5: the pager moves to page 2 and a new size starts again at page 1", async ({ page }) => {
    const name = await findDriver(page, async (p) => (await totalOf(p)) > 25);
    test.skip(name === null, "No driver with more than 25 work trackers in the seed.");

    const firstPage = await bodyRows(page).allInnerTexts();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => params(page).get("apage")).toBe("2");
    await expect.poll(() => bodyRows(page).allInnerTexts()).not.toEqual(firstPage);

    await page.getByLabel("Rows per page").selectOption("50");
    await expect.poll(() => params(page).get("apagesize")).toBe("50");
    expect(params(page).has("apage")).toBe(false);
  });

  test("S6: a reload keeps page 2 and another driver starts at page 1", async ({ page }) => {
    const name = await findDriver(page, async (p) => (await totalOf(p)) > 25);
    test.skip(name === null, "No driver with more than 25 work trackers in the seed.");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => params(page).get("apage")).toBe("2");
    const secondPage = await bodyRows(page).allInnerTexts();
    const driver = params(page).get("driver");

    await page.reload();
    await expect(page.getByRole("button", { name: "Go to page 2" })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 60_000 },
    );
    expect(params(page).get("apage")).toBe("2");
    await expect.poll(() => bodyRows(page).allInnerTexts()).toEqual(secondPage);

    await page.getByRole("combobox").click();
    await page.getByRole("option").filter({ hasNotText: name! }).first().click();
    await expect.poll(() => params(page).get("driver")).not.toBe(driver);
    expect(params(page).has("apage")).toBe(false);
  });

  test("S7: a click on a row does nothing", async ({ page }) => {
    const name = await findDriver(page, hasRows);
    test.skip(name === null, "No driver with work trackers in the seed.");

    const url = page.url();
    await bodyRows(page).first().locator("td").nth(1).click();

    await expect(page).toHaveURL(url);
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("S8: the payment of a row equals the week's state on /work-trackers", async ({ page }) => {
    const name = await findDriver(
      page,
      async (p) =>
        (await table(p).locator('[data-payment="paid"], [data-payment="not_paid"]').count()) > 0,
    );
    test.skip(name === null, "No driver with a Paid or Not paid tracker in the seed.");

    const row = bodyRows(page)
      .filter({ has: page.locator('[data-payment="paid"], [data-payment="not_paid"]') })
      .first();
    const payment = await row.getByTestId("audit-payment").getAttribute("data-payment");
    const date = (await row.locator("td").nth(1).innerText()).trim();
    const weekStart = DateTime.fromISO(date).startOf("week").toISODate();

    await page.goto(`/work-trackers/${weekStart}`);
    // An admin's week list may start on "my drivers only"; the driver has to be in it.
    const seeAll = page.getByRole("button", { name: "See All Drivers" });
    if (await seeAll.isVisible()) await seeAll.click();
    const button = page
      .locator("tbody tr")
      .filter({ hasText: name! })
      .first()
      .getByTestId("mark-paid-button");
    await expect(button).toBeVisible({ timeout: 60_000 });
    await expect(button).toHaveAttribute("data-paid", payment === "paid" ? "true" : "false");
  });

  test("S9: a driver with no trackers shows the empty message and no pager", async ({ page }) => {
    const name = await findDriver(
      page,
      async (p) => (await p.getByText("This driver has no work trackers").count()) > 0,
    );
    test.skip(name === null, "No driver without work trackers in the seed.");

    await expect(page.getByText("This driver has no work trackers")).toBeVisible();
    await expect(pager(page)).toHaveCount(0);
  });
});
