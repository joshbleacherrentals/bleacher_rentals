import { test } from "@playwright/test";
import {
  seedSchedulingConflict,
  seedPriorLocation,
  type SeededEventAlert,
} from "./helpers/eventAlertFixtures";
import { openEventForm, openAlertsTab, expectAlert } from "./helpers/eventFormPage";

/**
 * The event form's alerts, computed in the browser from PowerSync.
 *
 * They used to be computed from Zustand stores that mirrored whole tables over
 * REST and silently truncated at 1000 rows, so `schedulingConflict` was deciding
 * on a fraction of `BleacherEvents`. Nothing covered any of this end to end.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to
// replicate it before it can see an event seeded moments ago. That wait, not the
// app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Event form alerts (admin)", () => {
  test.describe("two booked events share a bleacher", () => {
    let fixture: SeededEventAlert;

    test.beforeAll(async () => {
      // No explicit setup date on purpose: the form stores "no setup" as "",
      // which used to reach `new Date("")` and disable this alert entirely.
      fixture = await seedSchedulingConflict();
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("S2: the scheduling conflict is reported", async ({ page }) => {
      await openEventForm(page, fixture.eventUuid);
      await openAlertsTab(page);

      await expectAlert(page, /overlapping with other events/i);
    });

    // S3 (clearing the booked status clears the alert without a save) is gone: the status is
    // read-only on the dashboard now, so nothing in the panel can be edited to move an alert.
    // docs/specs/dashboard-events-read-only.md §10, R9.
  });

  test.describe("assigned seats do not meet the requirement", () => {
    let fixture: SeededEventAlert;

    test.beforeAll(async () => {
      fixture = await seedSchedulingConflict({ withoutConflict: true, totalSeats: 999 });
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("S4: the seat mismatch is reported with both numbers", async ({ page }) => {
      await openEventForm(page, fixture.eventUuid);
      await openAlertsTab(page);

      await expectAlert(
        page,
        new RegExp(`Seat mismatch: 999 required, ${fixture.bleacherSeats} assigned`),
      );
    });
  });

  test.describe("a conflict and a transportation gap at once", () => {
    let fixture: SeededEventAlert;
    let cleanupPrior: () => Promise<void>;

    test.beforeAll(async () => {
      fixture = await seedSchedulingConflict();
      cleanupPrior = await seedPriorLocation(fixture);
    });

    test.afterAll(async () => {
      await cleanupPrior();
      await fixture.cleanup();
    });

    test("S5: both alert families are shown, neither erases the other", async ({ page }) => {
      await openEventForm(page, fixture.eventUuid);
      await openAlertsTab(page);

      // Two hooks write into the same list. Each owns its own titles; an empty
      // result from one must never be read as "clear the list".
      await expectAlert(page, /overlapping with other events/i);
      await expectAlert(page, /Last known location/i);
    });
  });

  // S9 (Delete Event on the dashboard removes the event) is gone with the Delete Event button.
  // Deleting an event is done from its quote card. docs/specs/dashboard-events-read-only.md §10, R9.
});
