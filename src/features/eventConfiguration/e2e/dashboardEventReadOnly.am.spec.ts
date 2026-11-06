import { test, expect } from "@playwright/test";
import { seedSchedulingConflict, type SeededEventAlert } from "./helpers/eventAlertFixtures";
import {
  expectCoreFieldsReadOnly,
  expectNoSaveControls,
  expectQuoteOpensCard,
  openPanel,
  palette,
} from "./helpers/dashboardEventReadOnlyTests";

/**
 * An account manager on an event somebody else made. The fixture's owner is the admin e2e user.
 * docs/specs/dashboard-events-read-only.md, D3 and D5.
 *
 * The palette assertion assumes the seeded account manager leads no zone: a lead may change any
 * event (`canEditOwnedEntity`), and would see the palette here.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to replicate it before it
// can see an event seeded moments ago. That wait, not the app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Dashboard events are read-only (account manager)", () => {
  let fixture: SeededEventAlert;

  test.beforeAll(async () => {
    fixture = await seedSchedulingConflict({ withoutConflict: true });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("S15: Quote is there and opens the card; no palette on another owner's event", async ({
    page,
  }) => {
    await openPanel(page, fixture);

    await expectNoSaveControls(page);
    await expectCoreFieldsReadOnly(page);
    await expect(palette(page)).toHaveCount(0);

    await expectQuoteOpensCard(page, fixture.eventUuid);
  });
});
