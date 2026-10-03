import { test, expect, type Page } from "@playwright/test";

/**
 * The /quotes-bookings list state and its round trip through the URL.
 *
 * docs/specs/accountant-quotes-01-list-state-hook.md §6 (S1–S5). The state moved into
 * `useListPageState` with no change in behaviour, so these scenarios describe what the page did
 * before and must still do.
 */

const LIST = "/quotes-bookings";
const SEARCH = /^Search by name, invoice #/;

const searchBox = (page: Page) => page.getByPlaceholder(SEARCH);

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

test.describe("Quotes & Bookings list state (admin)", () => {
  test("S1: search and Show Deleted reach the URL, survive a reload and a trip into a quote", async ({
    page,
  }) => {
    await page.goto(LIST);
    await searchBox(page).fill("a");
    await page.getByRole("switch", { name: "Show Deleted" }).click();

    // The write is debounced, so wait for the URL rather than for the click.
    await expect.poll(() => params(page).get("q")).toBe("a");
    expect(params(page).get("showDeleted")).toBe("1");

    await page.reload();
    await expect(searchBox(page)).toHaveValue("a");
    await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Open a quote and come back: Back restores the same state.
    await page.getByRole("row").nth(1).click();
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}/);
    await page.goBack();
    await expect(searchBox(page)).toHaveValue("a");
    expect(params(page).get("showDeleted")).toBe("1");
  });

  test("S2: changing a filter sends the list back to page 1", async ({ page }) => {
    // The URL may name a page past the end; the list shows the last one but the state is page 3.
    await page.goto(`${LIST}?page=3`);
    await expect.poll(() => params(page).get("page")).toBe("3");

    await searchBox(page).fill("a");

    await expect.poll(() => params(page).get("q")).toBe("a");
    expect(params(page).get("page")).toBeNull();
  });

  test("S3: opening and closing the filter sidebar keeps the page", async ({ page }) => {
    await page.goto(`${LIST}?page=3`);
    await expect.poll(() => params(page).get("page")).toBe("3");

    await page.getByRole("button", { name: "Hide filters" }).click();
    await page.getByRole("button", { name: /^Filters/ }).click();

    // Give a (wrong) page reset time to be written before asserting that it did not happen.
    await page.waitForTimeout(600);
    expect(params(page).get("page")).toBe("3");
  });

  test("S4: each tab starts on its own sort and drops a status the tab does not offer", async ({
    page,
  }) => {
    await page.goto(`${LIST}?statuses=booked`);
    await expect.poll(() => params(page).get("statuses")).toBe("booked");
    expect(params(page).get("sort")).toBeNull();

    await page.getByRole("tab", { name: /^AR(?! Deposits)/ }).click();
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    expect(params(page).get("statuses")).toBeNull();

    await page.getByRole("tab", { name: /^AR Deposits/ }).click();
    await expect.poll(() => params(page).get("tab")).toBe("ar_deposits");

    await page.getByRole("tab", { name: "All Events" }).click();
    await expect.poll(() => params(page).get("tab")).toBeNull();
    // The status chosen at the start did not come back with the tab.
    expect(params(page).get("statuses")).toBeNull();
  });

  test("S5: a scorecard link applies its filters, and a manual edit replaces them in the URL", async ({
    page,
  }) => {
    await page.goto(`${LIST}?template=quotes-sent&timeRange=weekly`);
    await expect(page.getByText("Scorecard: Quotes Sent")).toBeVisible();
    // The scorecard's date range is written out as ordinary filter parameters.
    await expect.poll(() => params(page).get("createdFrom")).not.toBeNull();

    await searchBox(page).fill("a");
    await expect.poll(() => params(page).get("q")).toBe("a");
    // The deep-link parameters are not owned by the list, so the write keeps them.
    expect(params(page).get("template")).toBe("quotes-sent");
  });
});
