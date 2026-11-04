import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote } from "./helpers/quoteTestData";

/**
 * The invoice number is written with nine digits (docs/specs/invoice-number-02-nine-digit-format.md §5).
 *
 * The spec's example is number 42, but in a database where the counter has run, 42 is already taken
 * by another event (the numbers are unique). The test uses an eight-digit number, which also needs
 * one zero: 99999042 is shown as 099999042.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine; the E2E admin
 * user also has no Users row locally).
 */

const NUMBER = 99_999_042;
const PRINTED = "099999042";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const searchBox = (page: Page) => page.getByPlaceholder(/^Search by name, invoice #/);

test.describe("Invoice number with nine digits", () => {
  let eventId: string;

  test.beforeEach(async () => {
    const { data, error } = await serviceRole()
      .from("Events")
      .insert({
        event_name: "E2E Number Format",
        event_start: "2026-10-01",
        event_end: "2026-10-03",
        lenient: false,
        must_be_clean: false,
        event_status: "quoted",
        invoice_number: NUMBER,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`insert failed: ${error?.message}`);
    eventId = data.id as string;
  });

  test.afterEach(async () => {
    await cleanupQuote(eventId);
  });

  test("S1: the quote page title carries the number with its zeros", async ({ page }) => {
    await page.goto(`/quotes-bookings/${eventId}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(`(#${PRINTED})`, {
      timeout: 60_000,
    });
  });

  test("S2: both ways of typing the number in the list search find the event", async ({ page }) => {
    await page.goto("/quotes-bookings");
    await searchBox(page).fill(PRINTED);
    await expect(page.getByText("E2E Number Format")).toBeVisible({ timeout: 60_000 });

    await searchBox(page).fill(String(NUMBER));
    await expect(page.getByText("E2E Number Format")).toBeVisible();
  });
});
