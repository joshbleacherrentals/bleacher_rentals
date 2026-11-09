import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote } from "./helpers/quoteTestData";

/**
 * The database gives a new event its invoice number (docs/specs/invoice-number-01-assign-in-database.md §5).
 *
 * Every way of creating an event (the quote form, a website lead, the dashboard form) ends in the
 * same Events INSERT with no number in it, so the scenarios make that INSERT directly with the
 * service role and then look at what the app shows.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine; the E2E admin
 * user also has no Users row locally).
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** An event the way the app uploads a new one: no invoice_number in the row. */
async function insertEventWithoutNumber(name: string) {
  const { data, error } = await serviceRole()
    .from("Events")
    .insert({
      event_name: name,
      event_start: "2026-10-01",
      event_end: "2026-10-03",
      lenient: false,
      must_be_clean: false,
      event_status: "quoted",
    })
    .select("id, invoice_number")
    .single();
  if (error || !data) throw new Error(`insert failed: ${error?.message}`);
  return { eventId: data.id as string, invoiceNumber: data.invoice_number as number | null };
}

test.describe("Invoice number given by the database", () => {
  const created: string[] = [];

  test.afterEach(async () => {
    for (const id of created.splice(0)) await cleanupQuote(id);
  });

  test("S1: a new event shows its invoice number on its page once it has synced", async ({
    page,
  }) => {
    const event = await insertEventWithoutNumber("E2E Number Assign");
    created.push(event.eventId);
    expect(event.invoiceNumber).not.toBeNull();

    await page.goto(`/quotes-bookings/${event.eventId}`);

    // The number arrives with the sync, not with the insert: wait for it. (How many digits it is
    // written with is spec 02's business; see invoiceNumberFormat.admin.spec.ts.)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/\(#\d+\)/, {
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(event.eventId);
  });

  test("S2: an event inserted without a number gets one from 300000001 to 999999999", async () => {
    // The counter's range since docs/specs/invoice-number-03-start-at-300000001.md.
    const event = await insertEventWithoutNumber("E2E Number Present");
    created.push(event.eventId);

    expect(event.invoiceNumber).toBeGreaterThanOrEqual(300_000_001);
    expect(event.invoiceNumber).toBeLessThanOrEqual(999_999_999);
  });

  test("S3: two events created one after the other get consecutive numbers", async () => {
    const first = await insertEventWithoutNumber("E2E Number First");
    created.push(first.eventId);
    const second = await insertEventWithoutNumber("E2E Number Second");
    created.push(second.eventId);

    // Compared with each other, so it holds whatever the counter's value is. (Other events created
    // by someone else in between could make the gap larger, so the second is above the first by at
    // least one, and the two are different.)
    expect(second.invoiceNumber).toBeGreaterThan(first.invoiceNumber!);
    expect(second.invoiceNumber).not.toBe(first.invoiceNumber);
  });
});
