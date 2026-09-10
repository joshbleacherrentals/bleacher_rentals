import { test, expect } from "@playwright/test";
import {
  daysFromToday,
  seedBleachersWithInspections,
  setInspectionQueueLastSeen,
  type InspectionFixture,
} from "./helpers/inspectionFixtures";

/**
 * A viewer reads the queue and cannot add to it. RLS refuses the write either
 * way (see supabase/tests/bleacher_annual_inspections.test.sql); this checks
 * they are never handed a form that would be refused — PowerSync drops an RLS
 * rejection silently, so an offered-then-discarded write is the worst version
 * of this bug.
 */
const VIEWER_EMAIL = process.env.E2E_VIEWER_EMAIL ?? "";

test.describe("Annual inspections (viewer)", () => {
  let fixture: InspectionFixture | null = null;

  test.afterEach(async () => {
    await fixture?.cleanup();
    fixture = null;
  });

  test("can read the queue but is offered no way to record an inspection", async ({ page }) => {
    // Rewound to "has never opened the queue", so a bleacher three days out is
    // exactly the state that would raise a badge for a maintainer. The viewer
    // must still see none.
    await setInspectionQueueLastSeen(VIEWER_EMAIL, null);
    fixture = await seedBleachersWithInspections([daysFromToday(3)]);
    const [bleacher] = fixture.bleachers;

    await page.goto("/annual-inspections");
    const row = page.locator(
      `[data-testid=inspection-row][data-bleacher="${bleacher.bleacherNumber}"]`,
    );
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-status", "critical");

    // A viewer reads the queue; it does not chase them. The counter and the
    // highlight belong to the Maintainer.
    await expect(row).toHaveAttribute("data-new", "false");
    await expect(page.locator("[data-testid=sidebar-badge]")).toHaveCount(0);

    await row.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Record inspection" })).toHaveCount(0);
    await expect(page.getByLabel("Next inspection due")).toHaveCount(0);
  });
});
