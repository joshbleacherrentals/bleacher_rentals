import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role helper for the public-quote e2e specs. Runs in the Node side of the
 * Playwright test (never in the browser) and mutates the seeded DB directly so a test can
 * simulate a manager editing a quote while a client has it open.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (loaded from .env.local by
 * the `test:e2e` script).
 */
function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("e2e admin helper needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type CreatedQuote = { eventId: string; invoiceNumber: number; contactId?: string };

/** Create a minimal, self-contained quote (event + one line item) and return its ids. */
export async function createQuote(): Promise<CreatedQuote> {
  const db = admin();
  const invoiceNumber = 900_000_000 + Math.floor(Math.random() * 90_000_000);

  const { data: event, error } = await db
    .from("Events")
    .insert({
      event_name: `E2E Staleness ${invoiceNumber}`,
      event_start: "2026-10-01",
      event_end: "2026-10-03",
      lenient: false,
      must_be_clean: false,
      event_status: "quoted",
      invoice_number: invoiceNumber,
      external_notes: "Original client note.",
      tax_percent: 0,
      tax_amount_cents: 0,
    })
    .select("id")
    .single();
  if (error || !event) throw new Error(`createQuote: event insert failed: ${error?.message}`);

  const eventId = event.id as string;
  const { error: liError } = await db.from("EventLineItems").insert({
    event_uuid: eventId,
    header: "Bleacher Rental",
    description: "10 row",
    quantity: 2,
    value_cents: 50_000,
    currency: "USD",
    is_template: false,
    deleted: false,
  });
  if (liError) throw new Error(`createQuote: line item insert failed: ${liError.message}`);

  return { eventId, invoiceNumber };
}

/**
 * Attach a contact whose quotes render in the given language, so the public page
 * resolves a language the way a real quote does — through Contacts.preferred_language,
 * not through a query param. See docs/specs/quote-preferred-language.md.
 */
export async function assignContact(
  eventId: string,
  preferredLanguage: "english" | "french",
): Promise<string> {
  const db = admin();
  const { data: contact, error } = await db
    .from("Contacts")
    .insert({
      first_name: "E2E",
      last_name: `Contact ${Date.now()}`,
      email: "e2e@example.com",
      preferred_language: preferredLanguage,
      deleted: false,
    })
    .select("id")
    .single();
  if (error || !contact) throw new Error(`assignContact: insert failed: ${error?.message}`);

  await db.from("Events").update({ contact_uuid: contact.id }).eq("id", eventId);
  return contact.id as string;
}

/** Simulate a manager editing the price — bumps both content_hash and contract_hash. */
export async function bumpLineItemPrice(eventId: string, delta = 12_345): Promise<void> {
  const db = admin();
  const { data: li, error } = await db
    .from("EventLineItems")
    .select("id, value_cents")
    .eq("event_uuid", eventId)
    .eq("deleted", false)
    .limit(1)
    .single();
  if (error || !li) throw new Error(`bumpLineItemPrice: no line item: ${error?.message}`);
  const { error: upErr } = await db
    .from("EventLineItems")
    .update({ value_cents: (li.value_cents as number) + delta })
    .eq("id", li.id);
  if (upErr) throw new Error(`bumpLineItemPrice: update failed: ${upErr.message}`);
}

/** Read the event's current contract_hash (used to assert the sign-time guard). */
export async function getContractHash(eventId: string): Promise<string> {
  const db = admin();
  const { data } = await db.from("Events").select("contract_hash").eq("id", eventId).single();
  return (data?.contract_hash as string) ?? "";
}

/** Attach a terms doc so the contract tab renders and can be signed. */
export async function assignTerms(eventId: string): Promise<string> {
  const db = admin();
  const { data: terms, error } = await db
    .from("TermsAndConditions")
    .insert({ name: `E2E Terms ${Date.now()}`, html_content: "<p>Test terms</p>", deleted: false })
    .select("id")
    .single();
  if (error || !terms) throw new Error(`assignTerms: terms insert failed: ${error?.message}`);
  await db.from("Events").update({ terms_and_conditions_uuid: terms.id }).eq("id", eventId);
  return terms.id as string;
}

/** Give the quote a two-part payment schedule, so the Pay tab has one to render. */
export async function addPaymentSchedule(eventId: string): Promise<void> {
  const db = admin();
  const { error } = await db.from("PaymentInstallments").insert([
    { event_uuid: eventId, due_date: "2026-09-01", percentage_bps: 6000, currency: "USD" },
    { event_uuid: eventId, due_date: "2026-09-20", percentage_bps: 4000, currency: "USD" },
  ]);
  if (error) throw new Error(`addPaymentSchedule: insert failed: ${error.message}`);
}

/** Count active signatures for an event (asserting the guard created none). */
export async function activeSignatureCount(eventId: string): Promise<number> {
  const db = admin();
  const { count } = await db
    .from("ContractSignatures")
    .select("id", { count: "exact", head: true })
    .eq("event_uuid", eventId)
    .eq("status", "active");
  return count ?? 0;
}

/** Remove everything created for a test. */
export async function cleanupQuote(
  eventId: string,
  termsId?: string,
  contactId?: string,
): Promise<void> {
  const db = admin();
  await db.from("ContractSignatures").delete().eq("event_uuid", eventId);
  await db.from("EventLineItems").delete().eq("event_uuid", eventId);
  await db.from("PaymentInstallments").delete().eq("event_uuid", eventId);
  await db.from("Events").delete().eq("id", eventId);
  if (termsId) await db.from("TermsAndConditions").delete().eq("id", termsId);
  // After the event, which references it.
  if (contactId) await db.from("Contacts").delete().eq("id", contactId);
}
