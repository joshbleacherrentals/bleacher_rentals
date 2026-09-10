import { test, expect } from "@playwright/test";
import {
  daysFromToday,
  seedBleachersWithInspections,
  type InspectionFixture,
} from "./helpers/inspectionFixtures";

/**
 * The annual inspection queue belongs to the Maintainer role. An account
 * manager is bounced off the page — but keeps the inspection on the bleacher
 * itself, in the Assets page, and can still record one from there.
 *
 * Spec: docs/specs/maintainer-role.md §1
 */
test.describe("Annual inspections (account manager)", () => {
  let fixture: InspectionFixture | null = null;

  test.afterEach(async () => {
    await fixture?.cleanup();
    fixture = null;
  });

  test("is redirected away from the queue and offered no link to it", async ({ page }) => {
    await page.goto("/annual-inspections");

    await expect(page).not.toHaveURL(/\/annual-inspections/, { timeout: 30_000 });

    // Quality Assurance keeps its other three entries — only the queue is gone.
    await page.getByRole("button", { name: "Quality Assurance" }).click();
    await expect(page.getByRole("link", { name: "Damage Reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Repairs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Annual Inspections" })).toHaveCount(0);
  });

  test("still sees the inspection on the bleacher, and can record one there", async ({ page }) => {
    const due = daysFromToday(200);
    fixture = await seedBleachersWithInspections([due]);
    const [bleacher] = fixture.bleachers;

    await page.goto(`/assets/bleachers?edit=${bleacher.bleacherNumber}`);

    await expect(page.locator("[data-testid=bleacher-inspection-summary]")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-testid=bleacher-next-due]")).toHaveText(due);

    await page.getByRole("button", { name: "Manage inspections" }).click();

    const nextDue = page.getByLabel("Next inspection due");
    await expect(nextDue).toBeVisible({ timeout: 15_000 });

    const typed = daysFromToday(90);
    await nextDue.fill(typed);
    await page.getByRole("button", { name: "Record inspection" }).click();

    // Exact: the summary behind the sheet now reads "Next due <date>" too, which
    // is the right outcome but a different element.
    await expect(page.getByText(`Due ${typed}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid=bleacher-next-due]")).toHaveText(typed);
  });
});
