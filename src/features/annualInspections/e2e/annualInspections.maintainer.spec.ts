import { test, expect } from "@playwright/test";
import {
  daysFromToday,
  seedBleachersWithInspections,
  setInspectionQueueLastSeen,
  type InspectionFixture,
} from "./helpers/inspectionFixtures";

/**
 * The Maintainer role, end to end.
 *
 * This project only exists once E2E_MAINTAINER_EMAIL is configured (see
 * playwright.config.ts), so the file is inert until the Clerk user is created
 * and starts running the day it is.
 *
 * The write in the second test is the one that matters: it is the only proof
 * that RLS accepts a maintainer. PowerSync drops an RLS refusal silently, so a
 * broken policy looks exactly like a working one until the page is reloaded.
 *
 * Spec: docs/specs/maintainer-role.md §2.3, §7.5
 */
const MAINTAINER_EMAIL = process.env.E2E_MAINTAINER_EMAIL ?? "";

test.describe("Annual inspections (maintainer)", () => {
  // Serial: every test here is the same user, and the highlight is measured
  // against that user's `inspection_queue_last_seen_at` — a parallel test that
  // opens the queue would stamp it out from under the notification test.
  test.describe.configure({ mode: "serial" });

  let fixture: InspectionFixture | null = null;

  test.afterEach(async () => {
    await fixture?.cleanup();
    fixture = null;
  });

  test("lands on the queue and sees the fleet ordered by what is due soonest", async ({ page }) => {
    fixture = await seedBleachersWithInspections([daysFromToday(200), daysFromToday(-20)]);
    const [ok, overdue] = fixture.bleachers;

    await page.goto("/annual-inspections");

    const overdueRow = page.locator(
      `[data-testid=inspection-row][data-bleacher="${overdue.bleacherNumber}"]`,
    );
    await expect(overdueRow).toBeVisible({ timeout: 30_000 });
    await expect(overdueRow).toHaveAttribute("data-status", "overdue");

    const numbers = await page
      .locator("[data-testid=inspection-row]")
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.bleacher));
    expect(numbers.indexOf(String(overdue.bleacherNumber))).toBeLessThan(
      numbers.indexOf(String(ok.bleacherNumber)),
    );
  });

  test("records an inspection that survives a reload — the write really reached the database", async ({
    page,
  }) => {
    fixture = await seedBleachersWithInspections([null]);
    const [bleacher] = fixture.bleachers;

    await page.goto("/annual-inspections");
    const row = page.locator(
      `[data-testid=inspection-row][data-bleacher="${bleacher.bleacherNumber}"]`,
    );
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    const nextDue = page.getByLabel("Next inspection due");
    await expect(nextDue).toBeVisible({ timeout: 15_000 });

    const typed = daysFromToday(300);
    await nextDue.fill(typed);
    await page.getByRole("button", { name: "Record inspection" }).click();

    await page.reload();
    await expect(row).toContainText(typed, { timeout: 30_000 });
    await expect(row).toHaveAttribute("data-status", "ok");
  });

  test("sees Quality Assurance with only the annual inspections under it", async ({ page }) => {
    await page.goto("/annual-inspections");

    await page.getByRole("button", { name: "Quality Assurance" }).click();
    await expect(page.getByRole("link", { name: "Annual Inspections" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Damage Reports" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Repairs" })).toHaveCount(0);
  });

  test("is told what changed, once: the badge raises, opening clears it, the next visit is quiet", async ({
    page,
  }) => {
    // Never opened the queue, and one bleacher has just gone critical.
    await setInspectionQueueLastSeen(MAINTAINER_EMAIL, null);
    fixture = await seedBleachersWithInspections([daysFromToday(3), daysFromToday(300)]);
    const [flagged, quiet] = fixture.bleachers;

    // The sidebar says so before the page is ever opened — that is the whole
    // point of putting it there rather than in Alerts.
    await page.goto("/annual-inspections");
    await expect(page.locator("[data-testid=sidebar-badge]").first()).toBeVisible({
      timeout: 30_000,
    });

    const flaggedRow = page.locator(
      `[data-testid=inspection-row][data-bleacher="${flagged.bleacherNumber}"]`,
    );
    const quietRow = page.locator(
      `[data-testid=inspection-row][data-bleacher="${quiet.bleacherNumber}"]`,
    );
    await expect(flaggedRow).toHaveAttribute("data-new", "true", { timeout: 30_000 });
    await expect(quietRow).toHaveAttribute("data-new", "false");

    // Opening the page is what marks it read: the badge goes while they are
    // still reading, and the next visit does not nag about the same bleacher.
    await expect(page.locator("[data-testid=sidebar-badge]")).toHaveCount(0, { timeout: 30_000 });

    await page.reload();
    await expect(flaggedRow).toHaveAttribute("data-new", "false", { timeout: 30_000 });
  });
});
