import { test, expect } from "@playwright/test";

/**
 * The Accountant on the Work Trackers pages (docs/specs/accountant-work-trackers.md, S2–S6).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured
 * (see playwright.config.ts); it needs a Clerk accountant user with a seeded Users +
 * Accountants row, and at least one driver with a work tracker in some week.
 *
 * The database half of the same rules — an accountant cannot create, edit, release or delete a
 * work tracker even with a hand-written request — is asserted in
 * supabase/tests/accountant_work_trackers.test.sql. This file only asserts what the UI shows.
 */

const WEEK_ROW =
  /\d{4}|January|February|March|April|May|June|July|August|September|October|November|December/;

test.describe("Work Trackers (accountant)", () => {
  test("S2 — a week lists every driver at once, with no 'See All Drivers' switch", async ({
    page,
  }) => {
    await page.goto("/work-trackers");

    // Open the first week in the list.
    await page.locator("tbody tr").filter({ hasText: WEEK_ROW }).first().click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/work-trackers\/\d{4}-\d{2}-\d{2}$/);

    await expect(page.getByRole("columnheader", { name: "Driver" })).toBeVisible();
    await expect(page.getByText("Access Denied")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /See All Drivers|See My Drivers Only/ }),
    ).toHaveCount(0);
    // The currency filter is still there: it narrows, it does not widen.
    await expect(page.getByLabel("Currency:")).toBeVisible();
  });

  test("S3 — a driver's week: header, trips, totals and the PDF, but no Release All", async ({
    page,
  }) => {
    await page.goto("/work-trackers");
    await page.locator("tbody tr").filter({ hasText: WEEK_ROW }).first().click({ timeout: 60_000 });
    await page.locator("tbody tr").filter({ hasText: /trip/ }).first().click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/work-trackers\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(page.getByText("Total Amount To Be Paid")).toBeVisible();

    // Spec §0: releasing work trackers is not available to the role.
    await expect(page.getByRole("button", { name: /Release All/ })).toHaveCount(0);
  });

  test("S4 — the payment window: Ready for Payment and back, with Edit Profile", async ({
    page,
  }) => {
    await page.goto("/work-trackers");
    await page.locator("tbody tr").filter({ hasText: WEEK_ROW }).first().click({ timeout: 60_000 });
    await page.locator("tbody tr").filter({ hasText: /trip/ }).first().click({ timeout: 60_000 });

    await page
      .getByRole("button", { name: /^(Draft|Ready for Payment|Bill Created|Error)$/ })
      .first()
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Payment Details")).toBeVisible({ timeout: 30_000 });
    await expect(modal.getByRole("button", { name: "Close" })).toBeVisible();

    // accountant-work-trackers D1 hid the link because the accountant had no Team pages. It has them
    // since docs/specs/accountant-team.md (C6), and the link is shown whenever the roles can reach
    // /team, so it is offered now.
    await expect(modal.getByRole("button", { name: /Edit Profile/ })).toHaveCount(1);

    const toReady = modal.getByRole("button", { name: "Mark as Ready for Payment" });
    if (await toReady.isVisible()) {
      await toReady.click();
      await expect(modal.getByText(/no bill ready for payment/i)).toBeVisible({ timeout: 30_000 });
      await modal.getByRole("button", { name: "Mark as Draft" }).click();
      await expect(modal.getByText(/^draft$/i)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("S6 — a work tracker opens read-only", async ({ page }) => {
    await page.goto("/work-trackers");
    await page.locator("tbody tr").filter({ hasText: WEEK_ROW }).first().click({ timeout: 60_000 });
    await page.locator("tbody tr").filter({ hasText: /trip/ }).first().click({ timeout: 60_000 });

    // A row of the trip table.
    await page.locator("table tbody tr").first().click({ timeout: 60_000 });

    await expect(page.getByText("You have read-only access to this work tracker.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Edit types/ })).toHaveCount(0);
    // Every field of the Details tab is inside a disabled fieldset.
    await expect(page.locator("fieldset[disabled]").first()).toBeVisible();
  });
});
