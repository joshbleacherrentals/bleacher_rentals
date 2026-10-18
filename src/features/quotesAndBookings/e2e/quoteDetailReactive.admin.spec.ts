import { test, expect } from "@playwright/test";
import { createQuote, cleanupQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The quote detail page follows the quote (docs/specs/quote-detail-01-reactive-quote.md, S1).
 *
 * Two tabs of one browser share one local database. A title saved in the edit page of one tab
 * must show on the detail page that stays open in the other, with no reload: until this spec the
 * detail page read the quote once and kept it.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Runs as an
 * admin because an admin may edit any quote, whoever created it.
 */

test.describe("Quote detail follows edits made in another tab", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote();
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: a title saved in tab B shows in tab A with no reload", async ({ context }) => {
    const originalName = `E2E Staleness ${quote.invoiceNumber}`;
    const renamed = `E2E Renamed ${quote.invoiceNumber}`;

    // Tab A: the detail page, left open.
    const tabA = await context.newPage();
    await tabA.goto(`/quotes-bookings/${quote.eventId}`);
    const heading = tabA.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(originalName, { timeout: 60_000 });

    // Tab B: rename the quote on the edit page and save it.
    const tabB = await context.newPage();
    await tabB.goto(`/quotes-bookings/${quote.eventId}/edit`);
    const name = tabB.getByPlaceholder("Stadium Concert 2024");
    await expect(name).toHaveValue(originalName, { timeout: 60_000 });
    await name.fill(renamed);
    await tabB.getByRole("button", { name: "Save", exact: true }).click();
    await expect(tabB.getByText("Quote updated.")).toBeVisible({ timeout: 60_000 });

    // Tab A, never reloaded.
    await expect(heading).toContainText(renamed, { timeout: 15_000 });
    await expect(heading).not.toContainText(originalName);
  });
});
