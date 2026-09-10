import { test, expect } from "@playwright/test";
import {
  daysFromToday,
  seedBleachersWithInspections,
  setInspectionQueueLastSeen,
  type InspectionFixture,
} from "./helpers/inspectionFixtures";

/**
 * Annual inspections, end to end: the queue, recording one, and the highlight
 * that has to survive a visit and be gone on the next one.
 *
 * Spec: docs/specs/bleacher-annual-inspections.md
 *
 * Every date is relative to today, because the whole feature is arithmetic on
 * the calendar — a fixed date would start failing on a particular Tuesday.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";

test.describe("Annual inspections (admin)", () => {
  // Serial, against the project's fullyParallel default. Every test here signs
  // in as the same admin, and the highlight is measured against that one user's
  // `inspection_queue_last_seen_at`. Run in parallel, the specs that open the
  // queue stamp that column out from under the spec that checks the highlight.
  test.describe.configure({ mode: "serial" });

  let fixture: InspectionFixture | null = null;

  test.afterEach(async () => {
    await fixture?.cleanup();
    fixture = null;
  });

  test("sorts the queue by how soon each bleacher needs attention", async ({ page }) => {
    // Never scheduled, overdue, red, yellow, ok — deliberately seeded in the
    // wrong order so a passing assertion means the query sorted them.
    fixture = await seedBleachersWithInspections([
      daysFromToday(200), // ok
      daysFromToday(-20), // overdue
      null, // never scheduled
      daysFromToday(20), // yellow
      daysFromToday(3), // red
    ]);
    const [ok, overdue, unscheduled, warning, critical] = fixture.bleachers;

    await page.goto("/annual-inspections");

    const seeded = page
      .locator("[data-testid=inspection-row]")
      .filter({ hasText: `#${unscheduled.bleacherNumber}` });
    await expect(seeded).toBeVisible({ timeout: 30_000 });

    const numbers = await page
      .locator("[data-testid=inspection-row]")
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.bleacher));

    const positionOf = (n: number) => numbers.indexOf(String(n));
    expect(positionOf(unscheduled.bleacherNumber)).toBeLessThan(positionOf(overdue.bleacherNumber));
    expect(positionOf(overdue.bleacherNumber)).toBeLessThan(positionOf(critical.bleacherNumber));
    expect(positionOf(critical.bleacherNumber)).toBeLessThan(positionOf(warning.bleacherNumber));
    expect(positionOf(warning.bleacherNumber)).toBeLessThan(positionOf(ok.bleacherNumber));

    const statusOf = (n: number) =>
      page.locator(`[data-testid=inspection-row][data-bleacher="${n}"]`);
    await expect(statusOf(overdue.bleacherNumber)).toHaveAttribute("data-status", "overdue");
    await expect(statusOf(critical.bleacherNumber)).toHaveAttribute("data-status", "critical");
    await expect(statusOf(warning.bleacherNumber)).toHaveAttribute("data-status", "warning");
    await expect(statusOf(ok.bleacherNumber)).toHaveAttribute("data-status", "ok");
    await expect(statusOf(unscheduled.bleacherNumber)).toHaveAttribute(
      "data-status",
      "unscheduled",
    );
  });

  test("prefills next year's date when an inspection is recorded, and lets it be overridden", async ({
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

    const inspectedOn = page.getByLabel("Inspected on");
    await expect(inspectedOn).toBeVisible({ timeout: 15_000 });

    const today = daysFromToday(0);
    await inspectedOn.fill(today);

    // The convenience: one year on, so nobody types the same date twice.
    const nextDue = page.getByLabel("Next inspection due");
    const oneYearOn = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
    await expect(nextDue).toHaveValue(oneYearOn);

    // ...but typing the date by hand is the primary path, and it must win.
    const typed = daysFromToday(45);
    await nextDue.fill(typed);
    await page.getByRole("button", { name: "Record inspection" }).click();

    await expect(page.getByText(`Due ${typed}`)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(row).toHaveAttribute("data-status", "ok", { timeout: 30_000 });
    await expect(row).toContainText(typed);
  });

  test("is not chased by the queue — no badge, no highlight, even with one overdue", async ({
    page,
  }) => {
    test.skip(!ADMIN_EMAIL, "E2E_ADMIN_EMAIL is not set");

    // Nobody has looked at the queue yet, and one bleacher is already flagged:
    // for a maintainer this is exactly the state that raises a badge.
    await setInspectionQueueLastSeen(ADMIN_EMAIL, null);
    fixture = await seedBleachersWithInspections([daysFromToday(3), daysFromToday(300)]);
    const [flagged] = fixture.bleachers;

    await page.goto("/assets/bleachers");
    await expect(page.locator("[data-testid=sidebar]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid=sidebar-badge]")).toHaveCount(0);

    // The page still opens and still reads correctly — an administrator loses
    // the nagging, not the queue.
    await page.goto("/annual-inspections");
    const flaggedRow = page.locator(
      `[data-testid=inspection-row][data-bleacher="${flagged.bleacherNumber}"]`,
    );
    await expect(flaggedRow).toHaveAttribute("data-status", "critical", { timeout: 30_000 });
    await expect(flaggedRow).toHaveAttribute("data-new", "false");
    await expect(page.locator("[data-testid=sidebar-badge]")).toHaveCount(0);
  });

  test("shows the same due date on the bleacher itself", async ({ page }) => {
    const due = daysFromToday(120);
    fixture = await seedBleachersWithInspections([due]);
    const [bleacher] = fixture.bleachers;

    await page.goto(`/assets/bleachers?edit=${bleacher.bleacherNumber}`);

    const summary = page.locator("[data-testid=bleacher-inspection-summary]");
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid=bleacher-next-due]")).toHaveText(due);
  });
});
