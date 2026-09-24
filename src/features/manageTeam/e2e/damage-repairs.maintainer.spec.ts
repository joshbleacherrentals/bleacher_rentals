import { test, expect } from "@playwright/test";
import {
  damageReportCardByNote,
  openCreateDamageReportModal,
  waitForDamageReportsLoaded,
} from "./helpers/damageReportsPage";
import { seedDamageReport, type SeededDamageReport } from "./helpers/damageReportsFixtures";

/**
 * The Maintainer role on Damage Reports and Repairs.
 *
 * Only runs once E2E_MAINTAINER_EMAIL is configured (see playwright.config.ts). The seeded report
 * has to arrive through PowerSync, which proves the new sync rules reach a maintainer; the SQL test
 * supabase/tests/maintainer_damage_maintenance.test.sql proves RLS accepts the writes.
 *
 * Spec: docs/specs/maintainer-damage-and-maintenance.md
 */
test.describe("Damage reports and repairs (maintainer)", () => {
  test("reaches both pages and sees them in the Quality Assurance menu", async ({ page }) => {
    await page.goto("/damage-reports");
    await expect(page).toHaveURL(/\/damage-reports/);
    await waitForDamageReportsLoaded(page);

    await page.goto("/repairs");
    await expect(page).toHaveURL(/\/repairs/);
    await expect(page.getByRole("heading", { name: /repairs/i }).first()).toBeVisible();
  });

  test("still cannot open the dashboard or the quotes", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/annual-inspections/);
    await page.goto("/quotes-bookings");
    await expect(page).toHaveURL(/\/annual-inspections/);
  });

  test("gets the admin-style controls: Show Deleted on both pages", async ({ page }) => {
    await page.goto("/damage-reports");
    await waitForDamageReportsLoaded(page);
    await expect(page.getByRole("button", { name: "Show Deleted" })).toBeVisible();

    await page.goto("/repairs");
    await expect(page.getByRole("button", { name: "Show Deleted" })).toBeVisible();
  });

  test.describe("with a seeded damage report", () => {
    let seeded: SeededDamageReport | null = null;

    test.afterEach(async () => {
      await seeded?.cleanup();
      seeded = null;
    });

    test("sees a damage report and can open the create form", async ({ page }) => {
      seeded = await seedDamageReport({ photoStatuses: ["uploaded"] });
      await page.goto("/damage-reports");
      await waitForDamageReportsLoaded(page);
      await expect(damageReportCardByNote(page, seeded.note)).toBeVisible({ timeout: 30_000 });

      await openCreateDamageReportModal(page);
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  });
});
