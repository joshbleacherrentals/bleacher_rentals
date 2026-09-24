import { test, expect } from "@playwright/test";
import { seedPastAndCurrentAlerts, type SeededPastAlerts } from "./helpers/pastAlertFixtures";

/**
 * Alerts about something already over are never shown — docs/specs/no-past-alerts.md.
 *
 * The date rules and the write gate have unit tests. What only a browser can check is the query
 * behind the dropdown: it joins each alert to its event or work tracker to find the date that
 * decides whether it is past. A wrong join would either hide everything or hide nothing.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh context starts with an empty PowerSync database and has to replicate before it can see
// rows seeded moments ago.
test.describe.configure({ timeout: 300_000 });

test.describe("Past alerts are hidden (admin)", () => {
  let fixture: SeededPastAlerts;

  test.beforeAll(async () => {
    fixture = await seedPastAndCurrentAlerts();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test("the dropdown shows the current alert and never the past one", async ({ page }) => {
    await page.goto("/dashboard");

    // The header bell, not the event form's "Alerts" tab, which shares the name.
    await page.getByLabel("Alerts", { exact: true }).click();

    // The current alert proves replication finished and the join returns rows at all — without it,
    // an empty dropdown would make the past-alert assertion pass for the wrong reason.
    await expect(page.getByText(fixture.currentMessage)).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(fixture.pastMessage)).toHaveCount(0);
  });
});
