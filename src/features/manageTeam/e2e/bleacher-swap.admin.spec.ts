import { test, expect, type Page } from "@playwright/test";
import { seedBleacherSwap, type SeededSwap } from "./helpers/bleacherSwapFixtures";

// A laptop-sized window on purpose: the work tracker modal has to fit — or
// scroll — on the smallest screen a manager actually uses.
test.use({ viewport: { width: 1280, height: 720 } });

async function openTrip(page: Page, fixture: SeededSwap) {
  await page.goto(`/work-trackers/${fixture.weekStart}/${fixture.driverUserUuid}`);
  await page.getByRole("row").filter({ hasText: fixture.note }).click();
  // WorkTrackerModal is a hand-rolled overlay, not a Radix dialog — there is no
  // role="dialog" to scope to.
  await expect(page.getByTestId("actual-bleacher-select")).toBeVisible({ timeout: 30_000 });
}

test.describe("Actual bleacher (admin)", () => {
  test.describe("driver took a different bleacher", () => {
    let fixture: SeededSwap;

    test.beforeAll(async () => {
      fixture = await seedBleacherSwap({ reason: "blocked_by_other_units" });
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("the swap is called out as an action for the manager to take", async ({ page }) => {
      await openTrip(page, fixture);

      await expect(page.getByTestId("actual-bleacher-select")).toContainText(
        String(fixture.actualNumber),
      );
      await expect(page.getByTestId("bleacher-change-reason")).toContainText(
        "Blocked by other bleachers",
      );
      await expect(page.getByRole("alert").filter({ hasText: "Action needed" })).toBeVisible();
    });

    test("the reason is shown in full and stays clear of the Pickup Time column", async ({
      page,
    }) => {
      await openTrip(page, fixture);

      const reason = page.getByTestId("bleacher-change-reason");
      // Plain text now, so it wraps rather than being cut off by a control.
      await expect(reason).toHaveText("Blocked by other bleachers");
      const box = await reason.boundingBox();
      const pickupTime = await page.getByText("Pickup Time", { exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(pickupTime!.x);
    });

    test("the assigned bleacher select stays clear of the Pickup Time column", async ({ page }) => {
      await openTrip(page, fixture);

      const bleacher = await page.getByTestId("assigned-bleacher-select").boundingBox();
      const pickupTime = await page.getByText("Pickup Time", { exact: true }).boundingBox();
      expect(bleacher).not.toBeNull();
      expect(pickupTime).not.toBeNull();
      expect(bleacher!.x + bleacher!.width).toBeLessThanOrEqual(pickupTime!.x);
    });

    test("the modal's footer is reachable without a taller screen", async ({ page }) => {
      await openTrip(page, fixture);

      const save = page.getByRole("button", { name: "Save", exact: true });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
    });
  });

  // Its own fixture: this is the only test that mutates the row, and the read-only
  // tests above run against theirs in parallel.
  test.describe("manager corrects the swap", () => {
    let fixture: SeededSwap;

    test.beforeAll(async () => {
      fixture = await seedBleacherSwap({ reason: "damaged" });
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("correcting it back to the assigned bleacher clears the reason", async ({ page }) => {
      await openTrip(page, fixture);

      await page.getByTestId("actual-bleacher-select").click();
      // Dropdown portals its list into <body> as plain <li>s.
      await page
        .locator("li")
        .filter({ hasText: new RegExp(`^${fixture.assignedNumber}$`) })
        .click();
      const save = page.getByRole("button", { name: "Save", exact: true });
      await save.scrollIntoViewIfNeeded();
      await save.click();

      await expect(async () => {
        const row = await fixture.readBack();
        expect(row.bleacher_change_reason).toBeNull();
      }).toPass({ timeout: 30_000 });
    });
  });

  test.describe("driver took the assigned bleacher", () => {
    let fixture: SeededSwap;

    test.beforeAll(async () => {
      fixture = await seedBleacherSwap({ confirmed: true });
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("shows the assigned bleacher and no reason to pick", async ({ page }) => {
      await openTrip(page, fixture);

      await expect(page.getByTestId("actual-bleacher-select")).toContainText(
        String(fixture.assignedNumber),
      );
      // Nothing was swapped, so there is no reason and no alert.
      await expect(page.getByTestId("bleacher-change-reason")).toHaveText("No change");
      await expect(page.getByRole("alert").filter({ hasText: "Action needed" })).toHaveCount(0);
    });
  });
});
