import { test, expect } from "@playwright/test";
import {
  assignContact,
  cleanupQuote,
  createQuote,
  renameEvent,
  type CreatedQuote,
} from "./helpers/quoteTestData";

/**
 * The Contact history panel follows the contact's events while it is open
 * (docs/specs/quote-detail-03-history-panels.md, S1).
 *
 * The quote itself is one of its contact's events, so the panel lists it. Renaming it elsewhere
 * must change the row in the open panel with no reload: until this spec the panel read its events
 * once, when it opened.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Runs as an
 * admin, who may open any quote.
 */

test.describe("Contact history panel follows the contact's events", () => {
  let quote: CreatedQuote;
  let contactId: string;

  test.beforeAll(async () => {
    quote = await createQuote();
    contactId = await assignContact(quote.eventId, "english");
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId, undefined, contactId);
  });

  test("S1: an event renamed elsewhere changes its row in the open panel", async ({ page }) => {
    const originalName = `E2E Staleness ${quote.invoiceNumber}`;
    const renamed = `E2E Renamed ${quote.invoiceNumber}`;

    await page.goto(`/quotes-bookings/${quote.eventId}`);
    await page.getByRole("button", { name: /^E2E Contact / }).click({ timeout: 60_000 });

    const panel = page.locator("div.fixed.inset-0").filter({
      hasText: "Past and future events for this contact",
    });
    await expect(panel.getByText(originalName)).toBeVisible({ timeout: 60_000 });

    // The rename arrives through sync; the panel is never closed and reopened.
    await renameEvent(quote.eventId, renamed);
    await expect(panel.getByText(renamed)).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText(originalName)).toHaveCount(0);
  });
});
