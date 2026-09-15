import { useCreateQuoteStore } from "../state/useCreateQuoteStore";
import { fetchPaymentInstallments } from "./paymentInstallments";
import { fetchQuoteDetail } from "./fetchQuoteDetail";
import { fetchLineItemsForEvent } from "./fetchLineItems";
import { resolveInvoiceDisplay } from "../utils/invoiceNumber";
import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import type { LostReason } from "../utils/lostReason";

/**
 * Fetches an event by ID (via PowerSync) and loads its data into useCreateQuoteStore for editing.
 * Returns the event ID on success, null on failure.
 */
export async function loadQuoteIntoStore(eventId: string): Promise<string | null> {
  const data = await fetchQuoteDetail(eventId);

  if (!data) {
    console.error("Failed to load quote for editing");
    return null;
  }

  const store = useCreateQuoteStore.getState();

  store.setField("quoteNumber", resolveInvoiceDisplay(data.invoiceNumber, data.id));
  store.setField("status", (data.eventStatus as any) ?? "draft");
  store.setField("lostReason", (data.lostReason as LostReason | null) ?? null);
  store.setField("lostReasonNote", data.lostReasonNote ?? "");
  store.setField("salesOfficeId", data.salesOfficeUuid ?? null);
  store.setField("termsDocumentId", data.termsAndConditionsUuid ?? null);
  store.setField("eventName", data.eventName ?? "");
  store.setField("eventStart", data.eventStart ?? "");
  store.setField("eventEnd", data.eventEnd ?? "");
  store.setField("eventTypeId", data.eventTypeUuid ?? null);
  store.setField("quoteValidTill", data.quoteValidTill ?? "");
  store.setField("clientFacingNotes", data.externalNotes ?? data.notes ?? "");
  store.setField("internalNotes", data.internalNotes ?? "");
  store.setField("taxPercent", data.taxPercent ?? null);
  store.setField("taxOverrideCents", data.taxAmountCents ?? null);

  // Look up AccountManager by created_by_user_uuid
  if (data.createdByUserUuid) {
    store.setField("ownerUserUuid", data.createdByUserUuid);
    try {
      const amQuery = db
        .selectFrom("AccountManagers")
        .select(["id"])
        .where("user_uuid", "=", data.createdByUserUuid)
        .where("is_active", "=", 1)
        .limit(1)
        .compile();
      const amRows = await powerSyncDb.getAll<{ id: string }>(
        amQuery.sql,
        amQuery.parameters as any[],
      );
      if (amRows.length > 0) {
        store.setField("accountManagerId", amRows[0].id);
      }
    } catch (e) {
      console.error("Failed to look up account manager:", e);
    }
  }

  if (data.address) {
    store.setField("eventAddress", data.address.street);
    store.setField("eventAddressData", {
      street: data.address.street,
      city: data.address.city,
      stateProvince: data.address.stateProvince,
      zipPostal: data.address.zipPostal ?? "",
    });
  }

  // Must be set for EventDetailsSection to render the Venue picker as a
  // linked venue instead of falling back to "manual" (plain address, no
  // venue link) — see its venuePickerValue derivation.
  if (data.venue) {
    store.setField("venueId", data.venue.id);
    store.setField("venueName", data.venue.name);
  }

  if (data.financeContact) {
    store.setField("useFinanceContact", true);
    store.setField("financeContactId", data.financeContact.id);
    store.setField("financeContactEmail", data.financeContact.email ?? "");
  }

  if (data.contact) {
    store.setField("contactId", data.contact.id);
    store.setField(
      "contactName",
      `${data.contact.firstName} ${data.contact.lastName ?? ""}`.trim(),
    );
    if (data.contact.email) store.setField("companyEmail", data.contact.email);
    if (data.contact.phone) store.setField("phone", data.contact.phone);
  }

  // Load line items from PowerSync
  try {
    const lineItems = await fetchLineItemsForEvent(data.id);
    store.setField("lineItems", lineItems);
  } catch (e) {
    console.error("Failed to load line items:", e);
  }

  // Load payment installments from PowerSync. Empty when the quote was saved
  // without a schedule — it stays optional.
  try {
    const installments = await fetchPaymentInstallments(data.id);
    store.setField("paymentInstallments", installments);
  } catch (e) {
    console.error("Failed to load payment installments:", e);
  }

  return data.id;
}
