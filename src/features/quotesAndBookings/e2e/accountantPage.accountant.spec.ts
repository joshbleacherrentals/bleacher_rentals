import { test, expect, type Page } from "@playwright/test";

/**
 * The Accountant page as an accountant sees it (docs/specs/accountant-quotes-02-accountant-page.md,
 * S1–S4 and S9).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts); it needs a Clerk accountant user with a seeded Users + Accountants row.
 * The database half — what the accountant may read and write — is asserted in
 * supabase/tests/accountant_receivables.test.sql; this file only asserts what the page shows.
 */

const ACCOUNTANT = "/accountant";

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

const searchBox = (page: Page) => page.getByPlaceholder(/^Search by name, invoice #/);

test.describe("Accountant page (accountant)", () => {
  test("S1: lands on /accountant with ?tab=ar, and the sidebar offers Accountant, Work Trackers, Documentation", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/accountant/, { timeout: 60_000 });
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    await expect(page.getByRole("heading", { name: "Accountant" })).toBeVisible();

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Accountant", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Work Trackers", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Role Permissions")).toBeVisible();
    for (const label of ["Dashboard", "Quotes & Bookings", "Team", "Assets"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toHaveCount(0);
    }
  });

  test("S2: AR Deposits writes ?tab=ar_deposits, each tab starts on its own sort, and there is no Status filter", async ({
    page,
  }) => {
    await page.goto(ACCOUNTANT);
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    // The tab's own starting sort stays out of the URL.
    expect(params(page).get("sort")).toBeNull();

    await page.getByRole("tab", { name: /^AR Deposits/ }).click();
    await expect.poll(() => params(page).get("tab")).toBe("ar_deposits");
    expect(params(page).get("sort")).toBeNull();

    await expect(
      page.getByRole("complementary", { name: "Filters" }).getByText("Status", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: /^AR(?! Deposits)/ }).click();
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    await expect(
      page.getByRole("complementary", { name: "Filters" }).getByText("Status", { exact: true }),
    ).toHaveCount(0);
  });

  test("S3: a search reaches the URL and survives a reload and a trip away and back", async ({
    page,
  }) => {
    await page.goto(ACCOUNTANT);
    await searchBox(page).fill("a");
    await expect.poll(() => params(page).get("q")).toBe("a");
    expect(params(page).get("tab")).toBe("ar");

    await page.reload();
    await expect(searchBox(page)).toHaveValue("a");

    await page.goto("/permissions");
    await page.goBack();
    await expect(searchBox(page)).toHaveValue("a");
    expect(params(page).get("tab")).toBe("ar");
  });

  test("S4: Show Deleted writes ?showDeleted=1 and shows the Deleted only chip", async ({
    page,
  }) => {
    await page.goto(ACCOUNTANT);
    await page.getByRole("switch", { name: "Show Deleted" }).click();

    await expect.poll(() => params(page).get("showDeleted")).toBe("1");
    await expect(page.getByText("Deleted only")).toBeVisible();
  });

  test("S9: an old ?tab=all with a status opens AR, rewrites the URL, and ignores the status", async ({
    page,
  }) => {
    await page.goto(`${ACCOUNTANT}?tab=all&statuses=quoted`);

    await expect.poll(() => params(page).get("tab")).toBe("ar");
    expect(params(page).get("statuses")).toBeNull();
    await expect(page.getByRole("tab", { name: /^AR(?! Deposits)/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
