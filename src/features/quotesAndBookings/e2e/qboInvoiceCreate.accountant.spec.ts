import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice as an accountant (docs/specs/qbo-invoice-04-create.md §9, S4).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * An accountant may create the invoice of a quote of any office. The quote used here is not booked,
 * so the real route refuses it with 400 before it reaches QuickBooks: a 400 and not a 403 is the
 * proof that the role was let in.
 */

test.describe("Create invoice route (accountant)", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote(); // belongs to no sales office
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S4: an accountant is allowed on a quote of another office", async ({ page }) => {
    const res = await page.request.post("/api/quickbooks/invoice", {
      data: { eventId: quote.eventId },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("booked");
  });
});
