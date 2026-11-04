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
 * A viewer reads the event and may open its quote card; the colour is not theirs to change.
 * docs/specs/dashboard-events-read-only.md, D3 and D5.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to replicate it before it
// can see an event seeded moments ago. That wait, not the app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Dashboard events are read-only (viewer)", () => {
  let fixture: SeededEventAlert;

  test.beforeAll(async () => {
    fixture = await seedSchedulingConflict({ withoutConflict: true });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("S14: Quote is there and opens the card; no palette; fields are read-only", async ({
    page,
  }) => {
    await openPanel(page, fixture);

    await expectNoSaveControls(page);
    await expectCoreFieldsReadOnly(page);
    await expect(palette(page)).toHaveCount(0);
    // A viewer has no toolbar button either.
    await expect(page.getByRole("button", { name: /\+ Create/ })).toHaveCount(0);

    await expectQuoteOpensCard(page, fixture.eventUuid);
  });
});
