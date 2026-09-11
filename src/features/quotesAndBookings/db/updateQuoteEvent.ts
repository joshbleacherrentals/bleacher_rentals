import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { CreateQuoteState } from "../state/useCreateQuoteStore";
import { syncPaymentInstallments } from "./paymentInstallments";
import { ScheduleBlockedError } from "../utils/scheduleDiff";
import { calculateTotals } from "../utils/calculateTotals";
import {
  logEventChanges,
  logLineItemChanges,
  TRACKED_FIELDS,
  SimpleLineItem,
} from "./logEventChanges";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { shouldReuseExistingAddressRow } from "@/features/venues/logic/shouldReuseExistingAddressRow";

type OldEventRow = {
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
  event_status: string | null;
  event_type_uuid: string | null;
  contact_uuid: string | null;
  finance_contact_uuid: string | null;
  address_uuid: string | null;
  venue_uuid: string | null;
  sales_office_uuid: string | null;
  terms_and_conditions_uuid: string | null;
  quote_valid_till: string | null;
  notes: string | null;
  internal_notes: string | null;
  external_notes: string | null;
  tax_percent: number | null;
  tax_amount_cents: number | null;
  contract_revenue_cents: number | null;
  po_number: string | null;
  created_by_user_uuid: string | null;
};
type OldLineItemRow = {
  header: string | null;
  quantity: number | null;
  value_cents: number | null;
  currency: string | null;
};
type AddressUuidRow = { address_uuid: string | null; venue_uuid: string | null };

export async function updateQuoteEvent(
  eventId: string,
  state: CreateQuoteState,
  supabase: SupabaseClient<Database>,
  currentUserUuid?: string | null,
): Promise<void> {
  // 1. Handle address / venue — see docs/specs/venue-history.md §4.
  //    venueId set ("venue" mode): write venue_uuid only, skip the Addresses
  //    block entirely — the events_sync_address_from_venue trigger sets
  //    address_uuid from it. No venueId + address present ("manual" mode,
  //    i.e. the address was hand-edited): run the same insert-or-update
  //    Addresses logic as before Venues existed, and explicitly detach by
  //    writing venue_uuid = null (this event may currently be linked to a
  //    venue). No venueId + no address ("empty" mode): leave both untouched,
  //    same as today when eventAddressData is absent.
  let addressUuid: string | null = null;
  let venueUuid: string | null | undefined;

  if (state.venueId) {
    venueUuid = state.venueId;
  } else if (state.eventAddressData) {
    venueUuid = null;
    const existingRows = await typedGetAll(
      db
        .selectFrom("Events")
        .select(["address_uuid", "venue_uuid"])
        .where("id", "=", eventId)
        .limit(1)
        .compile(),
      expect<AddressUuidRow>(),
    );
    const existingAddressUuid = existingRows[0]?.address_uuid ?? null;
    // If this event was linked to a Venue, its address_uuid IS that Venue's
    // own private Addresses row (see §1.3's trigger) — shared with every
    // other event still linked to that Venue. Detaching must never mutate it
    // in place; always give a detaching event a brand-new private row instead
    // (docs/specs/venue-history.md §0.1).
    const wasLinkedToVenue = Boolean(existingRows[0]?.venue_uuid);

    if (shouldReuseExistingAddressRow(existingAddressUuid, wasLinkedToVenue)) {
      addressUuid = existingAddressUuid;
      await typedExecute(
        db
          .updateTable("Addresses")
          .set({
            street: state.eventAddressData.street ?? "",
            city: state.eventAddressData.city ?? "",
            state_province: state.eventAddressData.stateProvince ?? "",
            zip_postal: state.eventAddressData.zipPostal || null,
            latitude: state.eventAddressData.lat ?? null,
            longitude: state.eventAddressData.lng ?? null,
            country: state.eventAddressData.country ?? null,
            place_id: state.eventAddressData.placeId ?? null,
          })
          .where("id", "=", existingAddressUuid)
          .compile(),
      );
    } else {
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
  }

  // 2. Fetch old state for change logging (from PowerSync)
  const oldEventRows = await typedGetAll(
    db
      .selectFrom("Events")
      .select([
        "event_name",
        "event_start",
        "event_end",
        "event_status",
        "event_type_uuid",
        "contact_uuid",
        "finance_contact_uuid",
        "address_uuid",
        "venue_uuid",
        "sales_office_uuid",
        "terms_and_conditions_uuid",
        "quote_valid_till",
        "notes",
        "internal_notes",
        "external_notes",
        "tax_percent",
        "tax_amount_cents",
        "contract_revenue_cents",
        "po_number",
        "created_by_user_uuid",
      ])
      .where("id", "=", eventId)
      .limit(1)
      .compile(),
    expect<OldEventRow>(),
  );
  const oldEvent = oldEventRows[0] ?? null;

  const oldLineItemRows = await typedGetAll(
    db
      .selectFrom("EventLineItems")
      .select(["header", "quantity", "value_cents", "currency"])
      .where("event_uuid", "=", eventId)
      .where("deleted", "=", 0)
      .compile(),
    expect<OldLineItemRow>(),
  );

  const oldLineItems: SimpleLineItem[] = oldLineItemRows.map((r) => ({
    label: r.header ?? "",
    qty: r.quantity ?? 1,
    unitPriceCents: r.value_cents ?? 0,
    lineTotalCents: (r.value_cents ?? 0) * (r.quantity ?? 1),
  }));

  // 3. Update Event
  const { taxAmount } = calculateTotals(state.lineItems, state.taxPercent);
  const effectiveTaxCents = state.taxOverrideCents ?? Math.round(taxAmount);
  const contractRevenueCents =
    state.lineItems.reduce((sum, li) => sum + li.lineTotalCents, 0) + effectiveTaxCents;

  const updates: Record<string, any> = {
    event_name: state.eventName,
    event_start: state.eventStart || null,
    event_end: state.eventEnd || null,
    event_status: state.status || "draft",
    event_type_uuid: state.eventTypeId || null,
    quote_valid_till: state.quoteValidTill || null,
    contract_revenue_cents: contractRevenueCents,
    tax_percent: state.taxPercent,
    tax_amount_cents: effectiveTaxCents,
    notes: state.clientFacingNotes || null,
    internal_notes: state.internalNotes || null,
    external_notes: state.clientFacingNotes || null,
    created_by_user_uuid: state.ownerUserUuid ?? currentUserUuid ?? null,
    contact_uuid: state.contactId || null,
    finance_contact_uuid: state.financeContactId || null,
    sales_office_uuid: state.salesOfficeId || null,
    terms_and_conditions_uuid: state.termsDocumentId || null,
  };

  if (venueUuid !== undefined) {
    // "venue" mode: venueUuid is the picked id, address_uuid is left alone —
    // the trigger sets it from the venue. "manual" mode: venueUuid is
    // explicitly null (detach), addressUuid is this event's own row.
    updates.venue_uuid = venueUuid;
  }
  if (addressUuid) {
    updates.address_uuid = addressUuid;
  }

  await typedExecute(db.updateTable("Events").set(updates).where("id", "=", eventId).compile());

  // A new owner's subscription is the server's job, not ours: the same trigger
  // fires on `UPDATE OF created_by_user_uuid`. Subscribing from here raced it
  // and got the whole write discarded — see the note in createQuoteEvent.ts.

  // 4. Log field changes + line item changes in parallel
  if (oldEvent) {
    const newState: Record<string, unknown> = {};
    for (const key of TRACKED_FIELDS) {
      if (key in updates) {
        newState[key] = updates[key] ?? null;
      }
    }

    const newLineItems: SimpleLineItem[] = state.lineItems.map((li) => ({
      label: li.label,
      qty: li.qty,
      unitPriceCents: li.category === "discounts" ? li.lineTotalCents : li.unitPriceCents,
      lineTotalCents: li.lineTotalCents,
    }));

    await Promise.all([
      logEventChanges(
        supabase,
        eventId,
        currentUserUuid ?? null,
        oldEvent as Record<string, unknown>,
        newState,
        "update",
        state.currency,
      ),
      logLineItemChanges(
        supabase,
        eventId,
        currentUserUuid ?? null,
        oldLineItems,
        newLineItems,
        state.currency,
      ),
    ]);
  }

  // 5. Sync line items via Supabase (not local PowerSync) to avoid duplication across clients
  await supabase.from("EventLineItems").delete().eq("event_uuid", eventId);

  if (state.lineItems.length > 0) {
    const rows = state.lineItems.map((li) => ({
      id: crypto.randomUUID(),
      event_uuid: eventId,
      header: li.label,
      description: null,
      bleacher_type_uuid: li.bleacherTypeUuid || null,
      value_cents: li.category === "discounts" ? li.lineTotalCents : li.unitPriceCents,
      quantity: li.qty,
      currency: state.currency,
      is_template: false,
      deleted: false,
    }));
    await supabase.from("EventLineItems").insert(rows);
  }

  // 6. Sync payment installments — optional. Empty clears any existing schedule.
  try {
    await syncPaymentInstallments(eventId, state.paymentInstallments, state.currency);
  } catch (e) {
    // Removing an installment that holds money is a refusal, not a failure: the
    // person needs to read it. Everything else stays a logged non-event, since
    // the quote itself is already saved by this point.
    if (e instanceof ScheduleBlockedError) {
      createErrorToast(["The payment schedule was not changed.", e.message]);
    } else {
      console.error("Payment installments sync failed (quote still saved):", e);
    }
  }
}
