import { test, expect, type Page } from "@playwright/test";

/**
 * The Audit tab of /accountant as an accountant sees it
 * (docs/specs/accountant-audit-01-tab.md §4, S1, S2, S3 and S6; since
 * accountant-audit-05-drivers-table.md the tab opens on the drivers list, not on an empty state).
 *
 * Written, not run locally (project rule). This project only exists once E2E_ACCOUNTANT_EMAIL is
 * configured (see playwright.config.ts). It only checks the tab, so there is no data to seed.
 */

const tabNames = async (page: Page) =>
  (await page.getByRole("tab").allInnerTexts()).map((t) => t.trim().split("\n")[0]);

const expectNoReceivablesChrome = async (page: Page) => {
  await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveCount(0);
};

test.describe("Audit tab (accountant)", () => {
  test("S1: /accountant lists Collections, AR Deposits, Need attention, Audit, and opens on Collections", async ({
    page,
  }) => {
    await page.goto("/accountant");

    await expect(page.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    expect(await tabNames(page)).toEqual(["Collections", "AR Deposits", "Need attention", "Audit"]);
  });

  test("S2: clicking Audit puts tab=audit in the URL, shows the drivers list and hides the receivables controls", async ({
    page,
  }) => {
    await page.goto("/accountant");
    await expect(page.getByRole("tab", { name: "Audit" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Audit" }).click();

    await expect(page).toHaveURL(/[?&]tab=audit(&|$)/);
    await expect(page.getByTestId("audit-tab")).toBeVisible();
    await expect(page.getByTestId("audit-drivers-list")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Choose a driver", { exact: true })).toHaveCount(0);
    await expectNoReceivablesChrome(page);
  });

  test("S3: /accountant?tab=audit opens Audit directly, on the drivers list", async ({ page }) => {
    await page.goto("/accountant?tab=audit");

    await expect(page.getByRole("tab", { name: "Audit" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("audit-drivers-list")).toBeVisible({ timeout: 60_000 });
  });

  test("S6: going from Audit back to Collections brings the Collections controls back", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");
    await expect(page.getByTestId("audit-drivers-list")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Collections" }).click();

    await expect(page.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("audit-tab")).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Not Due Yet" })).toBeVisible();

    // The filter sidebar and the search box belong to the receivables tabs.
    await page.getByRole("tab", { name: /^AR Deposits/ }).click();
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toBeVisible();
  });
});
