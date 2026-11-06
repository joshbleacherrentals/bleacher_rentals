import { test, expect, type Page } from "@playwright/test";

/**
 * The driver select of the Audit tab as an accountant sees it
 * (docs/specs/accountant-audit-02-driver-select.md §4, S1 to S5 and S7).
 *
 * Written, not run locally (project rule). This project only exists once E2E_ACCOUNTANT_EMAIL is
 * configured (see playwright.config.ts). It reads the seeded drivers; nothing is written.
 */

const params = (page: Page) => new URL(page.url()).searchParams;

async function openFirstDriver(page: Page) {
  await page.goto("/accountant?tab=audit");
  const select = page.getByRole("combobox");
  await expect(select).toBeEnabled({ timeout: 60_000 });
  await select.click();
  const first = page.getByRole("option").first();
  await expect(first).toBeVisible();
  await first.click();
}

test.describe("Audit driver select (accountant)", () => {
  test("S1: choosing a driver puts driver=<id> in the URL and shows the details block", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");
    const select = page.getByRole("combobox");
    await expect(select).toBeEnabled({ timeout: 60_000 });
    await select.click();
    await expect(page.getByPlaceholder("Search drivers...")).toBeVisible();
    const options = page.getByRole("option");
    expect(await options.count()).toBeGreaterThan(0);

    // Typing narrows the list.
    const before = await options.count();
    const name = ((await options.first().innerText()).split("\n")[0] ?? "").trim();
    await page.getByPlaceholder("Search drivers...").fill(name.slice(0, 3));
    expect(await options.count()).toBeLessThanOrEqual(before);

    await options.first().click();

    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    const info = page.getByTestId("audit-driver-info");
    await expect(info).toBeVisible();
    await expect(info.getByText("Address", { exact: true })).toBeVisible();
    await expect(info.getByText("Phone", { exact: true })).toBeVisible();
    await expect(info.getByText("Email", { exact: true })).toBeVisible();
    await expect(page.getByTestId("audit-empty-state")).toHaveCount(0);
  });

  test("S2: reload keeps the same driver chosen", async ({ page }) => {
    await openFirstDriver(page);
    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    const id = params(page).get("driver");

    await page.reload();

    await expect(page.getByTestId("audit-driver-info")).toBeVisible({ timeout: 60_000 });
    expect(params(page).get("driver")).toBe(id);
  });

  test("S3: clearing the driver removes it from the URL and brings the empty state back", async ({
    page,
  }) => {
    await openFirstDriver(page);
    await expect(page.getByTestId("audit-driver-info")).toBeVisible();

    await page.getByLabel("Clear selection").dispatchEvent("pointerdown");

    await expect.poll(() => params(page).has("driver")).toBe(false);
    await expect(page.getByTestId("audit-empty-state")).toBeVisible();
  });

  test("S4: an unknown driver in the URL ends up as no driver", async ({ page }) => {
    await page.goto("/accountant?tab=audit&driver=00000000-0000-0000-0000-000000000000");

    await expect(page.getByTestId("audit-empty-state")).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => params(page).has("driver")).toBe(false);
    await expect(page.getByTestId("audit-driver-info")).toHaveCount(0);
  });

  test("S5: an Inactive label sits beside a deactivated driver and not beside an active one", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=audit");
    const select = page.getByRole("combobox");
    await expect(select).toBeEnabled({ timeout: 60_000 });
    await select.click();

    const inactive = page.getByRole("option").filter({ hasText: "Inactive" });
    test.skip((await inactive.count()) === 0, "No deactivated driver in the seed.");
    const all = await page.getByRole("option").count();
    expect(await inactive.count()).toBeLessThan(all);
  });

  test("S7: going to Collections and back keeps the chosen driver", async ({ page }) => {
    await openFirstDriver(page);
    await expect.poll(() => params(page).get("driver")).toBeTruthy();
    const id = params(page).get("driver");

    await page.getByRole("tab", { name: "Collections" }).click();
    await expect(page.getByTestId("audit-tab")).toHaveCount(0);
    await page.getByRole("tab", { name: "Audit" }).click();

    await expect(page.getByTestId("audit-driver-info")).toBeVisible({ timeout: 60_000 });
    expect(params(page).get("driver")).toBe(id);
  });
});
