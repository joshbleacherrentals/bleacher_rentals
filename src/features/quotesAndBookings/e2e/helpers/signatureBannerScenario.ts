import { expect, type Page } from "@playwright/test";
import {
  assignTerms,
  bumpLineItemPrice,
  cleanupQuote,
  createQuote,
  recordSignature,
} from "./quoteTestData";

/**
 * The Signed banner follows the signature (docs/specs/quote-detail-02-contract-signature.md, S3).
 *
 * One open Contract tab: a signature recorded in the database makes the banner appear, and a
 * change to the contract that invalidates the signature makes it go, each with no reload. Run as
 * any role that may open a quote; the specs that call this differ only in the role.
 */
export async function runSignatureBannerScenario(page: Page): Promise<void> {
  const quote = await createQuote();
  const termsId = await assignTerms(quote.eventId);

  try {
    await page.goto(`/quotes-bookings/${quote.eventId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `E2E Staleness ${quote.invoiceNumber}`,
      { timeout: 60_000 },
    );
    await expect(page.getByText(/^Signed:/)).toHaveCount(0);

    // A client signs: the row reaches this browser through sync.
    await recordSignature(quote.eventId, termsId, "Dana Whitfield");
    await expect(page.getByText(/^Signed: .* by Dana Whitfield$/)).toBeVisible({ timeout: 60_000 });

    // The price changes: the database invalidates the signature, and the banner goes.
    await bumpLineItemPrice(quote.eventId);
    await expect(page.getByText(/^Signed:/)).toHaveCount(0, { timeout: 60_000 });
  } finally {
    await cleanupQuote(quote.eventId, termsId);
  }
}
