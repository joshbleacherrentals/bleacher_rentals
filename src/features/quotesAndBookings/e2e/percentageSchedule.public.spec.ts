import { test, expect } from "@playwright/test";
import {
  createQuote,
  addPaymentSchedule,
  bumpLineItemPrice,
  cleanupQuote,
} from "./helpers/quoteTestData";

test("public payment amounts follow the quote price after reload", async ({ page }) => {
  const quote = await createQuote();
  try {
    await addPaymentSchedule(quote.eventId);
    await page.goto(`/quote/${quote.eventId}`);
    await page.getByRole("button", { name: "Pay Invoice" }).click();
    const schedule = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Payment Schedule" }) })
      .last();
    await expect(schedule.getByText("$600.00").first()).toBeVisible();
    await bumpLineItemPrice(quote.eventId, 50000);
    await page.reload();
    await page.getByRole("button", { name: "Pay Invoice" }).click();
    await expect(schedule.getByText("$1,200.00").first()).toBeVisible();
    await expect(schedule.getByText("$800.00").first()).toBeVisible();
  } finally {
    await cleanupQuote(quote.eventId);
  }
});
