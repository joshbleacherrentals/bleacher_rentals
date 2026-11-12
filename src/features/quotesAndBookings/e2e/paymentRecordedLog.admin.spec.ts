import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * Record payment writes a row to the Log
 * (docs/specs/event-change-log-01-payment-recorded.md §4, S1, S3 and S4).
 *
 * Written, not run locally (project rule). What the row says — amount · method · paid date, never
 * the notes — and that it travels in the payment's own transaction are pinned in
 * recordManualPayment.test.ts; this file asserts what the Billing and Log tabs show. Each test
 * records a payment with an amount and a reference of its own, so the tests do not depend on each
 * other or on the order they run in, and the paid date is typed (not "today") so the text is the
 * same on every day the suite runs.
 */

const PAID_DATE = "2026-08-14";
const PAID_TEXT = "Aug 14, 2026";

const paymentRow = (page: Page, text: string | RegExp) =>
  page.getByRole("row", { name: /Payment details for .*/ }).filter({ hasText: text });

/** One row of the Log tab's Internal Activity list. */
const logRow = (page: Page, text: string | RegExp) =>
  page.getByRole("button").filter({ hasText: text });

async function recordCheck(page: Page, amount: string, reference: string) {
  await page.getByRole("button", { name: "+ Record Payment" }).click();
  await page.getByLabel(/^Amount/).fill(amount);
  await page.getByLabel("Date Received").fill(PAID_DATE);
  await page.getByLabel("Check #").fill(reference);
  await page.getByRole("button", { name: "Record Payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(paymentRow(page, reference)).toBeVisible();
}

test.describe("Payment recorded in the Log (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  });

  test("S1: a recorded check is listed in the Log as amount · method · date, with the admin's name", async ({
    page,
  }) => {
    await recordCheck(page, "25.31", "LOG1-REF");

    await page.goto(LOG);
    const recorded = logRow(page, `Payment recorded: $25.31 · Check · ${PAID_TEXT}`).first();
    await expect(recorded).toBeVisible();
    // The author is the admin: not the "System" the tab prints for a row with nobody behind it.
    await expect(recorded).not.toContainText("System");
  });

  test("S1: the row never carries the payment's reference", async ({ page }) => {
    await recordCheck(page, "25.32", "LOG1-SECRET-REF");

    await page.goto(LOG);
    const recorded = logRow(page, `Payment recorded: $25.32 · Check · ${PAID_TEXT}`).first();
    await expect(recorded).toBeVisible();
    await expect(recorded).not.toContainText("LOG1-SECRET-REF");

    // Opened, the row says it once more: the recorded payment, and who and when.
    await recorded.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Recorded payment")).toBeVisible();
    await expect(dialog.getByText(`$25.32 · Check · ${PAID_TEXT}`)).toBeVisible();
    await expect(dialog.getByText("LOG1-SECRET-REF")).toHaveCount(0);
  });

  test("S3: a negative amount is recorded with its minus sign", async ({ page }) => {
    await recordCheck(page, "-50.17", "LOG3-REF");

    await page.goto(LOG);
    await expect(
      logRow(page, `Payment recorded: -$50.17 · Check · ${PAID_TEXT}`).first(),
    ).toBeVisible();
  });

  test("S4: a payment edited after it was recorded keeps its original text, and a Payment edited row is added above it", async ({
    page,
  }) => {
    await recordCheck(page, "31.41", "LOG4-REF");

    await paymentRow(page, "LOG4-REF").click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel(/^Amount/).fill("41.41");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(paymentRow(page, "LOG4-REF")).toContainText("$41.41");

    await page.goto(LOG);

    // The recorded row still says what was recorded, not what the payment is now.
    await expect(
      logRow(page, `Payment recorded: $31.41 · Check · ${PAID_TEXT}`).first(),
    ).toBeVisible();
    await expect(logRow(page, "Payment recorded: $41.41")).toHaveCount(0);
    await expect(
      logRow(page, `Payment edited: $41.41 · Check · ${PAID_TEXT}`).first(),
    ).toBeVisible();

    // Newest first: the edit sits above the recording.
    const titles = await page
      .getByRole("button")
      .filter({ hasText: /Payment (recorded|edited):/ })
      .allInnerTexts();
    const edited = titles.findIndex((t) => t.includes("Payment edited: $41.41"));
    const recorded = titles.findIndex((t) => t.includes("Payment recorded: $31.41"));
    expect(edited).toBeGreaterThanOrEqual(0);
    expect(recorded).toBeGreaterThanOrEqual(0);
    expect(edited).toBeLessThan(recorded);
  });
});
