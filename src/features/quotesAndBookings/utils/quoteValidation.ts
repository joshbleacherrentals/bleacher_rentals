import type { AddressFields, LineItem } from "../types/quoteTypes";

export type QuoteValidationResult = { ok: true } | { ok: false; errors: string[] };

/**
 * A draft has no required fields — Save always succeeds. But event_name,
 * event_start and event_end are NOT NULL columns in the DB (see
 * database.types.ts), so a blank field gets a placeholder here rather than
 * failing the write. This only affects what gets persisted — the visible
 * form fields are untouched, so the input stays blank for the user to fill
 * in and save again later.
 */
export function draftSaveDefaults(state: {
  eventName: string;
  eventStart: string;
  eventEnd: string;
}): { eventName: string; eventStart: string; eventEnd: string } {
  const today = new Date().toISOString().split("T")[0];
  return {
    eventName: state.eventName.trim() || "Untitled Quote",
    eventStart: state.eventStart || today,
    eventEnd: state.eventEnd || today,
  };
}

type SendValidationState = {
  salesOfficeId: string | null;
  contactId: string | null;
  eventName: string;
  eventAddressData: AddressFields | null;
  eventTypeId: string | null;
  eventStart: string;
  eventEnd: string;
  lineItems: LineItem[];
  termsDocumentId: string | null;
  quoteValidTill: string;
};

/**
 * Full completeness check — everything a quote needs before it can be sent
 * (or previewed as a PDF) to a client.
 */
export function validateQuoteForSend(state: SendValidationState): QuoteValidationResult {
  const missing: string[] = [];
  if (!state.salesOfficeId) missing.push("Sales Office");
  if (!state.contactId) missing.push("Contact");
  if (!state.eventName.trim()) missing.push("Event Name");
  // "Venue" here just means an address is set — via a linked Venue or a
  // manually-typed one ("detached", see docs/specs/venue-history.md §2.3).
  // Only the label changed; a manual address is just as sendable as one
  // backed by a Venue record.
  if (!state.eventAddressData) missing.push("Venue");
  if (!state.eventTypeId) missing.push("Event Type");
  if (!state.eventStart) missing.push("Event Start");
  if (!state.eventEnd) missing.push("Event End");
  if (state.lineItems.length === 0) missing.push("Line Items");
  if (!state.termsDocumentId) missing.push("Terms and Conditions");

  if (missing.length > 0) {
    return { ok: false, errors: [`Required fields missing: ${missing.join(", ")}`] };
  }

  const today = new Date().toISOString().split("T")[0];
  const dateErrors: string[] = [];
  if (state.eventStart < today) dateErrors.push("Event Start cannot be in the past");
  if (state.eventEnd < today) dateErrors.push("Event End cannot be in the past");
  if (state.quoteValidTill && state.quoteValidTill < today)
    dateErrors.push("Quote Valid Till cannot be in the past");
  if (state.eventEnd < state.eventStart) dateErrors.push("Event End cannot be before Event Start");
  if (state.quoteValidTill && state.eventStart && state.quoteValidTill > state.eventStart)
    dateErrors.push("Quote Valid Till cannot be after Event Start");

  if (dateErrors.length > 0) {
    return { ok: false, errors: dateErrors };
  }

  return { ok: true };
}
