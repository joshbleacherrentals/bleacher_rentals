import { test, expect } from "@playwright/test";
import { seedSchedulingConflict, type SeededEventAlert } from "./helpers/eventAlertFixtures";
import { openEventForm, openAlertsTab, expectAlert } from "./helpers/eventFormPage";

/**
 * The same alerts under an account manager, plus the owner dropdown.
 *
 * Sync rules and RLS are not the same rules written twice. The form now reads
 * `Users` through PowerSync, and the web stream gives the full table only to
 * admins, active account managers and viewers — so the account manager's view
 * of that dropdown is the one worth proving, not the admin's.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to
// replicate it before it can see an event seeded moments ago. That wait, not the
// app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Event form alerts (account manager)", () => {
  let fixture: SeededEventAlert;

  test.beforeAll(async () => {
    fixture = await seedSchedulingConflict({ totalSeats: 999 });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("S6: both alert families reach an account manager too", async ({ page }) => {
    await openEventForm(page, fixture.eventUuid);
    await openAlertsTab(page);

    await expectAlert(page, /overlapping with other events/i);
    await expectAlert(
      page,
      new RegExp(`Seat mismatch: 999 required, ${fixture.bleacherSeats} assigned`),
    );
  });

  test("S7: the owner dropdown lists more than the signed-in user", async ({ page }) => {
    await openEventForm(page, fixture.eventUuid);

    // A role that syncs only its own Users row would show a one-entry list —
    // the silent regression this migration could have introduced.
    await page.getByTestId("event-owner-select").getByRole("button").click();
    await expect(page.getByRole("listitem")).not.toHaveCount(0);
    await expect(page.getByRole("listitem")).not.toHaveCount(1);
  });
});
