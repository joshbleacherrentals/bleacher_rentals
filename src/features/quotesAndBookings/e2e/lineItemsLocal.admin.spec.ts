import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * Line items are saved through the local database, so another tab sees them at once
 * (docs/specs/quote-detail-04-line-items-local.md, S1).
 *
 * Two tabs of one browser share one local database. A price changed and saved on the edit page of
 * one tab must change the line item list and the Contract Total on the detail page that stays open
 * in the other, with no reload and without waiting for a round trip through the server: until this
 * spec the Save wrote them straight to Supabase.
 *
 * The seeded quote has one line item, "Bleacher Rental", 2 x $500.00.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Runs as an
 * admin, who may edit any quote.
 */

test.describe("Line items saved in one tab show in another", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote();
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: a price saved in tab B changes tab A's list and total with no reload", async ({
    context,
  }) => {
    // Tab A: the detail page, left open.
    const tabA = await context.newPage();
    await tabA.goto(`/quotes-bookings/${quote.eventId}`);
    await expect(tabA.getByText("Bleacher Rental")).toBeVisible({ timeout: 60_000 });
    await expect(tabA.getByText("$1,000.00").first()).toBeVisible();

    // Tab B: change the unit price of that line item to $600.00 and save.
    const tabB = await context.newPage();
    await tabB.goto(`/quotes-bookings/${quote.eventId}/edit`);
    const row = tabB.locator("tr", { has: tabB.locator('input[value="Bleacher Rental"]') });
    const unitPrice = row.getByRole("spinbutton").nth(1);
    await expect(unitPrice).toHaveValue("500", { timeout: 60_000 });
    await unitPrice.fill("600");
    await tabB.getByRole("button", { name: "Save", exact: true }).click();
    await expect(tabB.getByText("Quote updated.")).toBeVisible({ timeout: 60_000 });

    // Tab A, never reloaded: the same browser, the same local database, so no wait for the server.
    await expect(tabA.getByText("$1,200.00").first()).toBeVisible({ timeout: 15_000 });
    await expect(tabA.getByText("$1,000.00")).toHaveCount(0);
  });
});
