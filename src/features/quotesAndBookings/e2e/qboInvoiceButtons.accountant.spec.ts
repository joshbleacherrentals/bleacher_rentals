import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The Create invoice button as an accountant (docs/specs/qbo-invoice-07-card-buttons.md §6, S3).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * An accountant is no one's account manager and belongs to no office, so a booked quote of any
 * sales office is "another office" to them. Nothing is pressed: the route is not touched.
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test.describe("Create and Update invoice buttons (accountant)", () => {
  let quote: CreatedQuote;
  let officeId: string;
  let connectionId: string;

  test.beforeAll(async () => {
    const db = serviceRole();
    quote = await createQuote();

    const stamp = Date.now();
    const { data: connection, error: connectionError } = await db
      .from("QboConnections")
      .insert({
        display_name: `E2E Company ${stamp}`,
        encrypted_token_value: "e2e",
        realm_id: `e2e-${stamp}`,
      })
      .select("id")
      .single();
    if (connectionError || !connection) throw new Error(`connection: ${connectionError?.message}`);
    connectionId = connection.id;

    const { data: office, error: officeError } = await db
      .from("SalesOffices")
      .insert({ name: `E2E Office ${stamp}`, quickbook_uuid: connectionId })
      .select("id")
      .single();
    if (officeError || !office) throw new Error(`office: ${officeError?.message}`);
    officeId = office.id;

    const { error } = await db
      .from("Events")
      .update({ event_status: "booked", sales_office_uuid: officeId })
      .eq("id", quote.eventId);
    if (error) throw new Error(`could not book the quote: ${error.message}`);
  });

  test.afterAll(async () => {
    const db = serviceRole();
    await db.from("Events").update({ sales_office_uuid: null }).eq("id", quote.eventId);
    await cleanupQuote(quote.eventId);
    await db.from("SalesOffices").delete().eq("id", officeId);
    await db.from("QboConnections").delete().eq("id", connectionId);
  });

  test("S3: a booked quote of another office shows Create invoice", async ({ page }) => {
    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    await expect(page.getByRole("button", { name: "Create invoice" })).toBeVisible({
      timeout: 60_000,
    });
  });
});
