import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { CreateQuoteState } from "../state/useCreateQuoteStore";
import { syncPaymentInstallments } from "./paymentInstallments";
import { calculateTotals } from "../utils/calculateTotals";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

export async function createQuoteEvent(
  state: CreateQuoteState,
  supabase: SupabaseClient<Database>,
  currentUserUuid?: string | null,
): Promise<string> {
  // 1. Address / Venue — see docs/specs/venue-history.md §4.
  //    venueId set ("venue" mode): write venue_uuid only, the
  //    events_sync_address_from_venue trigger sets address_uuid from it.
  //    No venueId ("manual"/"empty" mode): insert this event's own private
  //    Addresses row, exactly as before Venues existed.
  let addressUuid: string | null = null;
  const venueUuid: string | null = state.venueId ?? null;

  if (!venueUuid && state.eventAddressData) {
    addressUuid = crypto.randomUUID();
    await typedExecute(
      db
        .insertInto("Addresses")
        .values({
          id: addressUuid,
          street: state.eventAddressData.street ?? "",
          city: state.eventAddressData.city ?? "",
          state_province: state.eventAddressData.stateProvince ?? "",
          zip_postal: state.eventAddressData.zipPostal || null,
          latitude: state.eventAddressData.lat ?? null,
          longitude: state.eventAddressData.lng ?? null,
          country: state.eventAddressData.country ?? null,
          place_id: state.eventAddressData.placeId ?? null,
        })
        .compile(),
    );
  }

  // 2. Insert Event
  const { taxAmount } = calculateTotals(state.lineItems, state.taxPercent);
  const effectiveTaxCents = state.taxOverrideCents ?? Math.round(taxAmount);
  const contractRevenueCents =
    state.lineItems.reduce((sum, li) => sum + li.lineTotalCents, 0) + effectiveTaxCents;

  const eventUuid = crypto.randomUUID();

  const ownerUserUuid = state.ownerUserUuid ?? currentUserUuid ?? null;

  await typedExecute(
    db
      .insertInto("Events")
      .values({
        id: eventUuid,
        event_name: state.eventName,
        event_start: state.eventStart || null,
        event_end: state.eventEnd || null,
        address_uuid: addressUuid,
        venue_uuid: venueUuid,
        event_status: state.status || "draft",
        event_type_uuid: state.eventTypeId || null,
        quote_valid_till: state.quoteValidTill || null,
        contract_revenue_cents: contractRevenueCents,
        tax_percent: state.taxPercent,
        tax_amount_cents: effectiveTaxCents,
        lenient: 0,
        must_be_clean: 0,
        deleted: 0,
        notes: state.clientFacingNotes || null,
        internal_notes: state.internalNotes || null,
        external_notes: state.clientFacingNotes || null,
        created_by_user_uuid: ownerUserUuid,
        contact_uuid: state.contactId || null,
        finance_contact_uuid: state.financeContactId || null,
        sales_office_uuid: state.salesOfficeId || null,
        terms_and_conditions_uuid: state.termsDocumentId || null,
      } as any)
      .compile(),
  );

  // The owner's chat subscription is NOT created here. `events_auto_subscribe_owner`
  // (20260709120000) does it server-side on this INSERT, with
  // ON CONFLICT (event_uuid, user_uuid) DO NOTHING.
  //
  // Doing it from here as well used to lose a race with that trigger: PowerSync
  // uploads the Events row first, the trigger inserts the subscription with its
  // own gen_random_uuid(), and the client row — which conflicts on the natural
  // key but not on the primary key the upsert resolves — came back 23505. That
  // code is fatal to the connector, so the write was discarded and the user was
  // told their change could not be saved, on a quote that had saved perfectly.

  // Generate unique 9-digit invoice number (must use Supabase RPC)
  const { data: invoiceData } = await (supabase.rpc as any)("generate_invoice_number");

  if (invoiceData != null) {
    await typedExecute(
      db
        .updateTable("Events")
        .set({ invoice_number: Number(invoiceData) } as any)
        .where("id", "=", eventUuid)
        .compile(),
    );
  }

  // 3. Insert line items
  if (state.lineItems.length > 0) {
    for (const li of state.lineItems) {
      await typedExecute(
        db
          .insertInto("EventLineItems")
          .values({
            id: crypto.randomUUID(),
            event_uuid: eventUuid,
            header: li.label,
            description: null,
            bleacher_type_uuid: li.bleacherTypeUuid || null,
            value_cents: li.category === "discounts" ? li.lineTotalCents : li.unitPriceCents,
            quantity: li.qty,
            currency: state.currency,
            is_template: 0,
            deleted: 0,
          } as any)
          .compile(),
      );
    }
  }

  // 4. Sync payment installments — optional; only persisted when the manager
  // saved a schedule (non-empty). No schedule → nothing written.
  if (state.paymentInstallments.length > 0) {
    try {
      await syncPaymentInstallments(eventUuid, state.paymentInstallments, state.currency);
    } catch (e) {
      console.error("Payment installments sync failed (quote still saved):", e);
    }
  }

  // 5. Log creation via PowerSync local (not Supabase) so it uploads
  //    in the same batch as the Event — avoids FK violation on event_uuid.
  await typedExecute(
    db
      .insertInto("EventChangeLog")
      .values({
        id: crypto.randomUUID(),
        event_uuid: eventUuid,
        changed_by_user_uuid: currentUserUuid ?? null,
        field_name: "event_name",
        prev_value: null,
        next_value: state.eventName,
        action_type: "create",
        changed_at: new Date().toISOString(),
      } as any)
      .compile(),
  );

  return eventUuid;
}
