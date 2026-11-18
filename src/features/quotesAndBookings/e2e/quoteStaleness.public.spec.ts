import { test, expect } from "@playwright/test";
import {
  addPaymentSchedule,
  createQuote,
  bumpLineItemPrice,
  assignTerms,
  activeSignatureCount,
  cleanupQuote,
  CreatedQuote,
} from "./helpers/quoteTestData";

// Public, anonymous page — no storageState (see the `anon` project in playwright.config.ts).
// Timings are shortened with dev-only query params (?pollMs / ?idleMs) so the REAL timers,
// fetches, hashes and modals are exercised quickly. Nothing is stubbed. See spec §14.

const loaded = (invoiceNumber: number) => new RegExp(`E2E Staleness ${invoiceNumber}`);

test.describe("Public quote — staleness & presence", () => {
  test("shows the update modal when the quote changes", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();
      await page.goto(`/quote/${quote.eventId}?pollMs=400`);
      await expect(page.getByText(loaded(quote.invoiceNumber)).first()).toBeVisible();
      await expect(page.getByText("This quote has been updated")).toHaveCount(0);

      // Manager edits the price → trigger recomputes content_hash → next poll detects it.
      await bumpLineItemPrice(quote.eventId);

      await expect(page.getByText("This quote has been updated")).toBeVisible();
      await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });

  test("does NOT show the update modal when nothing changes", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();
      await page.goto(`/quote/${quote.eventId}?pollMs=400`);
      await expect(page.getByText(loaded(quote.invoiceNumber)).first()).toBeVisible();

      await page.waitForTimeout(2500); // several real poll cycles, no DB change
      await expect(page.getByText("This quote has been updated")).toHaveCount(0);
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });

  test("prompts 'Are you still here?' after the idle threshold", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();
      await page.goto(`/quote/${quote.eventId}?idleMs=1500`);
      await expect(page.getByText(loaded(quote.invoiceNumber)).first()).toBeVisible();
      await expect(page.getByText("Are you still here?")).toHaveCount(0);

      await expect(page.getByText("Are you still here?")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Yes" }).click();
      await expect(page.getByText("Are you still here?")).toHaveCount(0);
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });

  test("pauses polling while inactive and resumes on focus", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();
      let versionCalls = 0;
      page.on("request", (r) => {
        if (r.url().includes("/version")) versionCalls++;
      });

      await page.goto(`/quote/${quote.eventId}?pollMs=400`);
      await expect(page.getByText(loaded(quote.invoiceNumber)).first()).toBeVisible();

      // Active → polls fire.
      await expect.poll(() => versionCalls, { timeout: 5_000 }).toBeGreaterThan(0);

      // Blur → inactive → no further polls.
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      const afterBlur = versionCalls;
      await page.waitForTimeout(1500);
      expect(versionCalls).toBe(afterBlur);

      // Focus → immediate resume poll.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => versionCalls, { timeout: 5_000 }).toBeGreaterThan(afterBlur);
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });

  test("sign-time guard: signing a changed quote is rejected and records no signature", async ({
    page,
  }) => {
    let quote: CreatedQuote | null = null;
    let termsId: string | undefined;
    try {
      quote = await createQuote();
      termsId = await assignTerms(quote.eventId);

      await page.goto(`/quote/${quote.eventId}`);
      await page.getByRole("button", { name: "Approve & Sign" }).click();
      // Tabs stay mounted (hidden), so scope to the visible signer input.
      await page.locator('input[placeholder="Full name"]:visible').fill("Jane Client");

      // Manager changes a contract-material field after the client loaded the page.
      await bumpLineItemPrice(quote.eventId);

      await page.getByRole("button", { name: "Sign Contract" }).click();

      // Server returns 409 → shared update modal, and NO active signature is created.
      await expect(page.getByText("This quote has been updated")).toBeVisible();
      expect(await activeSignatureCount(quote.eventId)).toBe(0);
    } finally {
      if (quote) await cleanupQuote(quote.eventId, termsId);
    }
  });

  test("signing does not tell the client their own signature changed the quote", async ({
    page,
  }) => {
    // Signing moves content_hash — the signed state is part of the page — so the
    // poll used to report the client's own action as someone else's edit.
    // See docs/specs/payment-does-not-invalidate-signature.md §8.
    let quote: CreatedQuote | null = null;
    let termsId: string | undefined;
    try {
      quote = await createQuote();
      termsId = await assignTerms(quote.eventId);

      await page.goto(`/quote/${quote.eventId}?pollMs=400`);
      await page.getByRole("button", { name: "Approve & Sign" }).click();
      await page.locator('input[placeholder="Full name"]:visible').fill("Jane Client");

      // Signing renders a PDF and sends two emails, so wait for the response
      // itself rather than racing the button back out of "Signing...".
      const signed = page.waitForResponse(
        (r) => r.url().includes("/api/contracts/sign") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Sign Contract" }).click();
      const signResponse = await signed;

      // The signature is recorded, and the response carries the fresh hash the
      // page rebases onto.
      expect(signResponse.status()).toBe(200);
      expect(typeof (await signResponse.json()).contentHash).toBe("string");
      expect(await activeSignatureCount(quote.eventId)).toBe(1);

      // ...and several real poll cycles later the client is still not being
      // asked to refresh a page nobody else touched.
      await page.waitForTimeout(2500);
      await expect(page.getByText("This quote has been updated")).toHaveCount(0);
    } finally {
      if (quote) await cleanupQuote(quote.eventId, termsId);
    }
  });

  test("the Pay tab lists the payment schedule", async ({ page }) => {
    // The client cannot plan around instalments they cannot see. The schedule is
    // built server-side in buildQuoteDocumentData, so a bad column in that query
    // fails silently: an empty schedule renders as no section at all.
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();
      await addPaymentSchedule(quote.eventId);

      await page.goto(`/quote/${quote.eventId}`);
      await page.getByRole("button", { name: "Pay Invoice" }).click();

      // Tabs stay mounted while hidden, so scope to the visible Pay tab.
      const schedule = page
        .locator("div")
        .filter({ has: page.getByRole("heading", { name: "Payment Schedule" }) })
        .last();

      await expect(schedule).toBeVisible();
      await expect(schedule.getByText("$600.00").first()).toBeVisible();
      await expect(schedule.getByText("$400.00").first()).toBeVisible();
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });

  test("old invoice-number URL does not resolve a quote (404)", async ({ page }) => {
    let quote: CreatedQuote | null = null;
    try {
      quote = await createQuote();

      // Public quotes are addressed by event UUID only. The invoice number is no
      // longer a route slug, so the old path must NOT render the quote.
      const res = await page.goto(`/quote/${quote.invoiceNumber}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByText(loaded(quote.invoiceNumber)).first()).toHaveCount(0);
    } finally {
      if (quote) await cleanupQuote(quote.eventId);
    }
  });
});
