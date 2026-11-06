import { test, expect, type Page } from "@playwright/test";

/**
 * The driver select of the Audit tab as an administrator sees it
 * (docs/specs/accountant-audit-02-driver-select.md §4, S6: the same as S1 for an admin).
 *
 * Written, not run locally (project rule). The seeded E2E admin user has no `Users` row in the
 * local database, so this spec cannot run there anyway (see CLAUDE.md, E2E test users & roles).
 */

const params = (page: Page) => new URL(page.url()).searchParams;

test.describe("Audit driver select (admin)", () => {
  test("S6/S1: choosing a driver puts driver=<id> in the URL and shows the details block", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");
    const select = page.getByRole("combobox");
    await expect(select).toBeEnabled({ timeout: 60_000 });
    await select.click();
    const options = page.getByRole("option");
    expect(await options.count()).toBeGreaterThan(0);

    await options.first().click();

    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    await expect(page.getByTestId("audit-driver-info")).toBeVisible();
    await expect(page.getByTestId("audit-empty-state")).toHaveCount(0);
  });
});
