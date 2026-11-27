import { test, expect } from "@playwright/test";
import {
  activeSignatureCount,
  addOnSigningSchedule,
  assignTerms,
  bumpLineItemPrice,
  cleanupQuote,
  createQuote,
  getFirstInstallmentDate,
  setFirstInstallmentDate,
  torontoToday,
  type CreatedQuote,
} from "./helpers/quoteTestData";

/**
 * S2 and S5 on the public page (docs/specs/payment-first-installment-on-signing.md): signing dates
 * the first installment with the signing day and leaves the signature active; a second signature
 * leaves that day alone.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */
async function sign(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Approve & Sign" }).click();
  await page.locator('input[placeholder="Full name"]:visible').fill("Jane Client");
  const signed = page.waitForResponse(
    (r) => r.url().includes("/api/contracts/sign") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign Contract" }).click();
  expect((await signed).status()).toBe(200);
}

test("S2: before signing the first row reads Due Now; signing dates it and keeps the signature", async ({
  page,
}) => {
  let quote: CreatedQuote | null = null;
  let termsId: string | undefined;
  try {
    quote = await createQuote();
    termsId = await assignTerms(quote.eventId);
    await addOnSigningSchedule(quote.eventId);

    await page.goto(`/quote/${quote.eventId}`);
    await expect(page.getByText("Due Now").first()).toBeVisible();
    expect(await getFirstInstallmentDate(quote.eventId)).toBeNull();

    await sign(page);

    expect(await activeSignatureCount(quote.eventId)).toBe(1);
    expect(await getFirstInstallmentDate(quote.eventId)).toBe(torontoToday().iso);
  } finally {
    if (quote) await cleanupQuote(quote.eventId, termsId);
  }
});

test("S5: after an edit the client signs again and the first day does not move", async ({
  page,
}) => {
  let quote: CreatedQuote | null = null;
  let termsId: string | undefined;
  try {
    quote = await createQuote();
    termsId = await assignTerms(quote.eventId);
    await addOnSigningSchedule(quote.eventId);

    await page.goto(`/quote/${quote.eventId}`);
    await sign(page);
    // As if the first signature had been on an earlier day.
    await setFirstInstallmentDate(quote.eventId, "2026-10-05");

    // A price change invalidates the signature; the client signs the revised quote.
    await bumpLineItemPrice(quote.eventId);
    await page.goto(`/quote/${quote.eventId}`);
    await sign(page);

    expect(await activeSignatureCount(quote.eventId)).toBe(1);
    expect(await getFirstInstallmentDate(quote.eventId)).toBe("2026-10-05");
  } finally {
    if (quote) await cleanupQuote(quote.eventId, termsId);
  }
});
