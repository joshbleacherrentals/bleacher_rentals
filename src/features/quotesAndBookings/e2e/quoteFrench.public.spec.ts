import { test, expect } from "@playwright/test";
import { createQuote, assignContact, cleanupQuote, CreatedQuote } from "./helpers/quoteTestData";

/**
 * Public, anonymous page — no storageState, no Clerk (see the `anon` project in
 * playwright.config.ts). The whole point of the language feature is that the
 * client is NOT a logged-in user.
 *
 * Nothing is stubbed: the language comes from a real Contacts.preferred_language
 * row, resolved server-side by buildQuoteDocumentData, exactly as it does for a
 * real client opening the link in their email.
 *
 * See docs/specs/quote-preferred-language.md.
 */

// fr-CA groups thousands and precedes the dollar sign with a no-break space.
const NBSP = "\u00A0";
const FRENCH_TOTAL = `1${NBSP}000,00${NBSP}$`;
const ENGLISH_TOTAL = "$1,000.00";

test.describe("Public quote — language", () => {
  test("renders in French for a French contact, and the client can switch it", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    let contactId: string | undefined;

    try {
      quote = await createQuote();
      contactId = await assignContact(quote.eventId, "french");

      await page.goto(`/quote/${quote.eventId}`);

      // ── The contact's language decides what the client sees ──────────────
      await expect(page.getByRole("button", { name: "Consulter le devis" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Approuver et signer" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Payer la facture" })).toBeVisible();
      await expect(page.getByText("Articles en location")).toBeVisible();

      // Money and dates are localized, not just the labels.
      await expect(page.getByText(FRENCH_TOTAL).first()).toBeVisible();
      await expect(page.getByText(ENGLISH_TOTAL)).toHaveCount(0);

      // The PDF the client would download follows the page.
      await expect(page.getByRole("link", { name: "Télécharger le PDF" })).toHaveAttribute(
        "href",
        new RegExp(`/api/quotes/${quote.eventId}/pdf\\?lang=fr`),
      );

      // ── The client corrects a language the account manager got wrong ─────
      await page.getByRole("button", { name: "Langue du devis" }).click();
      await page.getByRole("menuitem", { name: "English" }).click();

      await expect(page.getByRole("button", { name: "Review Quote" })).toBeVisible();
      await expect(page.getByText(ENGLISH_TOTAL).first()).toBeVisible();
      await expect(page.getByText(FRENCH_TOTAL)).toHaveCount(0);

      // ── The correction survives a reload, without touching the contact ───
      await page.reload();
      await expect(page.getByRole("button", { name: "Review Quote" })).toBeVisible();

      // The contact record is deliberately NOT rewritten from the public page:
      // anyone with the link could otherwise mutate a shared CRM row.
      const response = await page.request.get(`/quote/${quote.eventId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      expect(await response.text()).toContain("Consulter le devis");
    } finally {
      if (quote) await cleanupQuote(quote.eventId, undefined, contactId);
    }
  });
});
