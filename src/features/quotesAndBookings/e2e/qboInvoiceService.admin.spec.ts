import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice as an admin, for a quote whose event type has no QuickBooks
 * Product/Service assigned (docs/specs/qbo-invoice-12b-use-the-mapping.md §5: S1).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The route
 * refuses the quote before it reaches QuickBooks, so no QuickBooks call is made. The quote has an
 * event type and a sales office whose QuickBooks connection is made for the run, and no assignment.
 * Whatever else the quote lacks (a contact, a venue) is joined into the same message, so the
 * assertion is `toContain`.
 */

const INVOICE_ROUTE = "/api/quickbooks/invoice";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test.describe("Create invoice route — the Product/Service of the quote's type (admin)", () => {
  let connectionId: string;
  let officeId: string;
  let officeConnectionBefore: string | null;
  let typeId: string;
  let typeName: string;
  let eventId: string;

  test.beforeAll(async () => {
    const db = serviceRole();

    const { data: connection, error: connectionError } = await db
      .from("QboConnections")
      .insert({ display_name: "E2E Service Check", encrypted_token_value: "__pending__" })
      .select("id")
      .single();
    if (connectionError || !connection) {
      throw new Error(`connection insert failed: ${connectionError?.message}`);
    }
    connectionId = connection.id as string;

    // A seeded office is pointed at the run's connection; it is put back afterwards.
    const { data: office, error: officeError } = await db
      .from("SalesOffices")
      .select("id, quickbook_uuid")
      .eq("deleted", false)
      .limit(1)
      .single();
    if (officeError || !office) throw new Error(`no sales office: ${officeError?.message}`);
    officeId = office.id as string;
    officeConnectionBefore = (office.quickbook_uuid as string | null) ?? null;
    await db.from("SalesOffices").update({ quickbook_uuid: connectionId }).eq("id", officeId);

    const { data: type, error: typeError } = await db
      .from("EventTypes")
      .select("id, name")
      .eq("deleted", false)
      .limit(1)
      .single();
    if (typeError || !type) throw new Error(`no event type: ${typeError?.message}`);
    typeId = type.id as string;
    typeName = type.name as string;

    const { data: event, error: eventError } = await db
      .from("Events")
      .insert({
        event_name: `E2E Service ${Math.floor(Math.random() * 1_000_000)}`,
        event_start: "2026-10-01",
        event_end: "2026-10-03",
        lenient: false,
        must_be_clean: false,
        event_status: "booked",
        invoice_number: 900_000_000 + Math.floor(Math.random() * 90_000_000),
        event_type_uuid: typeId,
        sales_office_uuid: officeId,
      })
      .select("id")
      .single();
    if (eventError || !event) throw new Error(`event insert failed: ${eventError?.message}`);
    eventId = event.id as string;
  });

  test.afterAll(async () => {
    const db = serviceRole();
    await cleanupQuote(eventId);
    await db
      .from("SalesOffices")
      .update({ quickbook_uuid: officeConnectionBefore })
      .eq("id", officeId);
    // The connection's assignments go with it (ON DELETE CASCADE).
    await db.from("QboConnections").delete().eq("id", connectionId);
  });

  test("S1: a type with no Product/Service assigned is refused with a message that names the type and the page", async ({
    page,
  }) => {
    const res = await page.request.post(INVOICE_ROUTE, { data: { eventId } });

    expect(res.status()).toBe(400);
    const { error } = await res.json();
    expect(error).toContain(`quote type "${typeName}"`);
    expect(error).toContain("Quote Types page");
  });
});
