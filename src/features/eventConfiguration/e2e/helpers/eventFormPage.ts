import { expect, type Page } from "@playwright/test";

/**
 * Opens an event in the configuration form.
 *
 * The dashboard itself is a PixiJS canvas, so there is no clickable event rect
 * for a test to reach. The quote *detail* page's "Open in Dashboard" is the same
 * entry point a manager uses and it is ordinary DOM: it loads the event into
 * `useCurrentEventStore` and expands the form on /dashboard. Note it is
 * `/quotes-bookings/<id>`, not `/edit` — the edit route renders the quote form
 * and bounces back to the list when `loadQuoteIntoStore` finds nothing.
 *
 * The generous timeout is the seeded rows making their way through PowerSync
 * replication into the browser's local database.
 */
export async function openEventForm(page: Page, eventUuid: string): Promise<void> {
  const openButton = page.getByRole("button", { name: "Open in Dashboard" });

  // The detail page reads the event once, on mount. A fixture writes to Postgres
  // and PowerSync replicates from there, so an event seeded a moment ago may not
  // be in the browser's local database yet — and the page will sit on "Quote not
  // found" forever rather than re-querying. Reloading is what re-runs the read.
  await expect(async () => {
    await page.goto(`/quotes-bookings/${eventUuid}`);
    await expect(openButton).toBeVisible({ timeout: 2_000 });
    // A cold browser context syncs the whole local database before it can answer
    // this query, so the ceiling is generous — it is waiting on replication, not
    // on the app.
  }).toPass({ timeout: 240_000, intervals: [1_000] });

  await openButton.click();
  await expect(page.getByTestId("event-tab-Alerts")).toBeVisible({ timeout: 60_000 });
}

/** Switches to the Alerts tab. Its label carries a count, hence the test id. */
export async function openAlertsTab(page: Page): Promise<void> {
  await page.getByTestId("event-tab-Alerts").click();
}

/** The alert messages currently shown, in render order. */
export function alertMessages(page: Page) {
  return page.getByTestId("event-alert");
}

/**
 * Waits for one alert matching `message`.
 *
 * Filtered rather than compared against the whole list, because the two alert
 * hooks write independently and a scenario often expects one family while the
 * other is also present.
 *
 * The long default is a cold browser context syncing the local PowerSync
 * database from scratch — the alert cannot appear before the rows it reads do.
 */
export async function expectAlert(page: Page, message: RegExp, timeout = 90_000): Promise<void> {
  await expect(alertMessages(page).filter({ hasText: message })).toHaveCount(1, { timeout });
}
