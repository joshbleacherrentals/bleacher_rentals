import { test, expect } from "@playwright/test";
import { seedSchedulingConflict, type SeededEventAlert } from "./helpers/eventAlertFixtures";
import { openEventForm, openAlertsTab, expectAlert } from "./helpers/eventFormPage";

/**
 * A viewer reads everything and writes nothing. The alerts are a read, so they
 * must still be computed — a read-only form that silently shows no warnings is
 * indistinguishable from an event with no problems.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to
// replicate it before it can see an event seeded moments ago. That wait, not the
// app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Event form alerts (viewer)", () => {
  let fixture: SeededEventAlert;

  test.beforeAll(async () => {
    fixture = await seedSchedulingConflict();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("S8: the read-only form still computes its alerts", async ({ page }) => {
    await openEventForm(page, fixture.eventUuid);
    await openAlertsTab(page);

    await expectAlert(page, /overlapping with other events/i);
  });
});
