import { test, expect, type Page } from "@playwright/test";

/**
 * The Audit tab of /accountant as an administrator sees it
 * (docs/specs/accountant-audit-01-tab.md §4, S4: the same as S1 to S3 for an admin).
 *
 * Written, not run locally (project rule). The seeded E2E admin user has no `Users` row in the
 * local database, so this spec cannot run there anyway (see CLAUDE.md, E2E test users & roles).
 */

const tabNames = async (page: Page) =>
  (await page.getByRole("tab").allInnerTexts()).map((t) => t.trim().split("\n")[0]);

test.describe("Audit tab (admin)", () => {
  test("S4/S1: /accountant lists Collections, AR Deposits, Need attention, Audit, and opens on Collections", async ({
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

  test("S4/S2: clicking Audit puts tab=audit in the URL, shows the empty state and hides the receivables controls", async ({
    page,
  }) => {
    await page.goto("/accountant");
    await expect(page.getByRole("tab", { name: "Audit" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Audit" }).click();

    await expect(page).toHaveURL(/[?&]tab=audit(&|$)/);
    await expect(page.getByTestId("audit-tab")).toBeVisible();
    await expect(page.getByTestId("audit-empty-state")).toBeVisible();
    await expect(page.getByText("Choose a driver", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveCount(0);
  });

  test("S4/S3: /accountant?tab=audit opens Audit directly, on the empty state", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");

    await expect(page.getByRole("tab", { name: "Audit" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("audit-empty-state")).toBeVisible();
  });
});
