import { test, expect, type Page } from "@playwright/test";

/**
 * The Accountant page as an admin sees it (docs/specs/accountant-quotes-02-accountant-page.md,
 * S5 and S8).
 *
 * Written, not run locally.
 */

const ACCOUNTANT = "/accountant";

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

const searchBox = (page: Page) => page.getByPlaceholder(/^Search by name, invoice #/);

test.describe("Accountant page (admin)", () => {
  test("S5: an admin opens /accountant — the same page — and the sidebar lists Accountant just before Work Trackers", async ({
    page,
  }) => {
    await page.goto(ACCOUNTANT);

    await expect(page).toHaveURL(/\/accountant/);
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    await expect(page.getByRole("heading", { name: "Accountant" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^AR Deposits/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Quote/ })).toHaveCount(0);

    const sidebar = page.getByTestId("sidebar");
    const accountant = await sidebar.getByText("Accountant", { exact: true }).boundingBox();
    const workTrackers = await sidebar.getByText("Work Trackers", { exact: true }).boundingBox();
    expect(accountant).not.toBeNull();
    expect(workTrackers).not.toBeNull();
    expect(accountant!.y).toBeLessThan(workTrackers!.y);
  });

  test("S8: a click on an AR row opens that booking at /quotes-bookings/{id}", async ({ page }) => {
    await page.goto(ACCOUNTANT);

    // Needs at least one booked event with an amount due. For an accountant the same click opens
    // the booking once docs/specs/accountant-quotes-04 is released with this spec.
    await page.locator("tbody tr").first().click({ timeout: 60_000 });

    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}/);
  });
});
