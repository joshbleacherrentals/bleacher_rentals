import { test, expect } from "@playwright/test";
import { seedSchedulingConflict, type SeededEventAlert } from "./helpers/eventAlertFixtures";
import {
  dragColourAndExpectSaved,
  expectCoreFieldsReadOnly,
  expectNoSaveControls,
  expectQuoteOpensCard,
  openPanel,
} from "./helpers/dashboardEventReadOnlyTests";

/**
 * The dashboard no longer creates or edits events (docs/specs/dashboard-events-read-only.md).
 * An admin keeps three things there: the colour, the bleachers (not driven here, the grid is a
 * canvas) and Swap.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh browser context starts with an empty PowerSync database and has to replicate it before it
// can see an event seeded moments ago. That wait, not the app, is what sets the ceiling here.
test.describe.configure({ timeout: 300_000 });

test.describe("Dashboard events are read-only (admin)", () => {
  test("S10: the toolbar offers + Create with two items, and no New Event", async ({ page }) => {
    await page.goto("/dashboard");

    const create = page.getByRole("button", { name: /\+ Create/ });
    await expect(create).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("New Event")).toHaveCount(0);

    await create.click();
    await expect(page.getByRole("menuitem")).toHaveCount(2);
    await expect(page.getByRole("menuitem", { name: "Maintenance Event" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sub-Rental Request" })).toBeVisible();
  });

  test.describe("an opened event", () => {
    let fixture: SeededEventAlert;

    test.beforeAll(async () => {
      fixture = await seedSchedulingConflict({ withoutConflict: true });
    });

    test.afterAll(async () => {
      await fixture.cleanup();
    });

    test("S11: it has no Create, Update or Delete, and every field is read-only", async ({
      page,
    }) => {
      await openPanel(page, fixture);

      await expectNoSaveControls(page);
      await expectCoreFieldsReadOnly(page);
      // The locate buttons are navigation, not fields: they stay on for everyone.
      const locate = page.getByTitle("Scroll dashboard to this date");
      await expect(locate).toHaveCount(2);
      for (const button of await locate.all()) await expect(button).toBeEnabled();
    });

    test("S12: Quote goes to the read-only card, not to /edit", async ({ page }) => {
      await openPanel(page, fixture);

      await expectQuoteOpensCard(page, fixture.eventUuid);
    });

    test("S13: letting go of the colour slider saves the colour", async ({ page }) => {
      await openPanel(page, fixture);

      await dragColourAndExpectSaved(page, fixture);
    });
  });
});
