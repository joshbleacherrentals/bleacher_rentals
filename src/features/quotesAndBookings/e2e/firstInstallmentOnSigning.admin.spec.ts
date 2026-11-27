import { test, expect } from "@playwright/test";
import {
  addOnSigningSchedule,
  bookWithoutSignature,
  cleanupQuote,
  createQuote,
  getFirstInstallmentDate,
  setFirstInstallmentDate,
  torontoToday,
  type CreatedQuote,
} from "./helpers/quoteTestData";

/**
 * S3, S4, S6 and S7 as an administrator (docs/specs/payment-first-installment-on-signing.md): the
 * database writes the first installment's day when the event is first booked, once, and nothing
 * moves it afterwards.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */
const BILLING = (id: string) => `/quotes-bookings/${id}?tab=billing`;

async function setStatus(page: import("@playwright/test").Page, from: string, to: string) {
  await page.getByRole("button", { name: from, exact: true }).click();
  await page.getByRole("menuitem", { name: to, exact: true }).click();
  await expect(page.getByRole("button", { name: to, exact: true })).toBeVisible({
    timeout: 60000,
  });
}

test("S3: setting a quote to Booked by hand dates the first installment with that day", async ({
  page,
}) => {
  let quote: CreatedQuote | null = null;
  try {
    quote = await createQuote();
    await addOnSigningSchedule(quote.eventId);
    await page.goto(BILLING(quote.eventId));
    await expect(page.getByRole("cell", { name: "On signing", exact: true })).toBeVisible({
      timeout: 60000,
    });

    await setStatus(page, "Quote Sent", "Quote Signed");
    const today = torontoToday();
    await expect(page.getByRole("cell", { name: today.label, exact: true })).toBeVisible({
      timeout: 60000,
    });
    expect(await getFirstInstallmentDate(quote.eventId)).toBe(today.iso);
  } finally {
    if (quote) await cleanupQuote(quote.eventId);
  }
});

test("S4: booked, quote sent, booked again: the first installment keeps the first day", async ({
  page,
}) => {
  let quote: CreatedQuote | null = null;
  try {
    quote = await createQuote();
    await addOnSigningSchedule(quote.eventId);
    await page.goto(BILLING(quote.eventId));
    await setStatus(page, "Quote Sent", "Quote Signed");
    await expect
      .poll(() => getFirstInstallmentDate(quote!.eventId), { timeout: 60000 })
      .toBe(torontoToday().iso);

    // As if the first booking had been on an earlier day.
    await setFirstInstallmentDate(quote.eventId, "2026-10-05");
    await setStatus(page, "Quote Signed", "Quote Sent");
    await setStatus(page, "Quote Sent", "Quote Signed");

    await expect(page.getByRole("cell", { name: "Oct 5, 2026", exact: true })).toBeVisible({
      timeout: 60000,
    });
    expect(await getFirstInstallmentDate(quote.eventId)).toBe("2026-10-05");
  } finally {
    if (quote) await cleanupQuote(quote.eventId);
  }
});

test("S6: the Booked date button moves the booked date, not the first installment", async ({
  page,
}) => {
  let quote: CreatedQuote | null = null;
  try {
    quote = await createQuote();
    await addOnSigningSchedule(quote.eventId);
    await page.goto(`/quotes-bookings/${quote.eventId}`);
    await setStatus(page, "Quote Sent", "Quote Signed");
    await expect
      .poll(() => getFirstInstallmentDate(quote!.eventId), { timeout: 60000 })
      .toBe(torontoToday().iso);
    await setFirstInstallmentDate(quote.eventId, "2026-10-05");

    const button = page.getByRole("button", { name: /^Booked: / });
    const before = await button.innerText();
    await button.click();
    const picker = page.getByLabel("Choose the booked date");
    const dayOfMonth = Number(torontoToday().iso.slice(8));
    const other = dayOfMonth === 15 ? "14" : "15";
    await picker
      .locator("button")
      .filter({ hasText: new RegExp(`^${other}$`) })
      .click();
    await expect(page.getByRole("button", { name: /^Booked: / })).not.toHaveText(before, {
      timeout: 60000,
    });

    expect(await getFirstInstallmentDate(quote.eventId)).toBe("2026-10-05");
  } finally {
    if (quote) await cleanupQuote(quote.eventId);
  }
});

test("S7: a schedule given to an old booked event with none is dated at once", async ({ page }) => {
  let quote: CreatedQuote | null = null;
  try {
    quote = await createQuote();
    await bookWithoutSignature(quote.eventId);
    await page.goto(`/quotes-bookings/${quote.eventId}/edit`);
    await page.getByRole("button", { name: "Set up schedule" }).click({ timeout: 60000 });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save Schedule", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/quotes-bookings/${quote.eventId}$`), {
      timeout: 60000,
    });

    await page.goto(BILLING(quote.eventId));
    await expect(page.getByRole("cell", { name: torontoToday().label, exact: true })).toBeVisible({
      timeout: 60000,
    });
    expect(await getFirstInstallmentDate(quote.eventId)).toBe(torontoToday().iso);
  } finally {
    if (quote) await cleanupQuote(quote.eventId);
  }
});
