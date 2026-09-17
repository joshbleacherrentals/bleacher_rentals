import { test, expect } from "@playwright/test";
import {
  seedWorkTrackerWithAddresses,
  type SeededTripAddresses,
} from "./helpers/workTrackerAddressFixtures";

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("Work tracker addresses (admin)", () => {
  let fixture: SeededTripAddresses;

  test.beforeAll(async () => {
    fixture = await seedWorkTrackerWithAddresses();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("S10: the modal opens with both addresses filled in", async ({ page }) => {
    await page.goto(`/work-trackers/${fixture.weekStart}/${fixture.driverUserUuid}`);
    await page.getByRole("row").filter({ hasText: fixture.note }).click();
    await expect(page.getByTestId("work-tracker-modal")).toBeVisible({ timeout: 60_000 });

    // Half of these lookups used to come back null, because the store behind
    // them held only the first 1000 rows of the Addresses table.
    await expect(page.getByTestId("pickup-address-field").locator("input")).toHaveValue(
      fixture.pickupStreet,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("dropoff-address-field").locator("input")).toHaveValue(
      fixture.dropoffStreet,
    );
  });
});
