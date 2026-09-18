/**
 * Starter text dropped into Client-Facing Notes when the "+ Create Quote"
 * button on the Quotes & Bookings list starts a genuinely new quote.
 */
export const NEW_QUOTE_CLIENT_NOTES =
  "Standard delivery & setup window is 1-3 days before the event starts, pickup 1-3 days after the event ends.\n\nOverdue payments are charged at 2% interest per month.";

/**
 * Whether clicking "+ Create Quote" should prefill Client-Facing Notes with
 * {@link NEW_QUOTE_CLIENT_NOTES}. True only for a genuinely fresh draft —
 * never while editing an existing quote, and never over an unsaved draft
 * already in progress (so a resumed draft, and any notes the user already
 * typed or deliberately cleared, are left untouched).
 */
export function shouldPrefillNewQuoteNotes(params: {
  editingEventId: string | null;
  hasUnsavedChanges: boolean;
}): boolean {
  return !params.editingEventId && !params.hasUnsavedChanges;
}
