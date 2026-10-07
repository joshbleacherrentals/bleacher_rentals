import type { QuotesBookingsCapabilities } from "@/features/userAccess/logic/getQuotesBookingsCapabilities";

/**
 * What /quotes-bookings/new and /quotes-bookings/{id}/edit do with the user who opened them. A role
 * without the capability never sees the form: it is sent to the list (`/new`) or to the card
 * (`/{id}/edit`). docs/specs/accountant-quotes-04-accountant-quote-access.md, D2, D8.
 *
 * "loading" is a third answer on purpose, and is never a redirect. The store's roles are empty
 * until sign-in fills them, and a page's effect runs before the effect that fills them, so a page
 * that decided on the first render would send an admin away on every reload. A redirect cannot be
 * taken back; waiting costs a moment of the loading state.
 */
export type QuotePageDecision = "loading" | "redirect" | "form";

/** `/quotes-bookings/new`: the form, for a role that can create a quote. */
export function newQuotePageDecision(input: {
  /** Whether sign-in has filled the store's roles. */
  rolesKnown: boolean;
  can: Pick<QuotesBookingsCapabilities, "createQuote">;
}): QuotePageDecision {
  if (!input.rolesKnown) return "loading";
  return input.can.createQuote ? "form" : "redirect";
}

/**
 * `/quotes-bookings/{id}/edit`: the form, for a role that can manage this quote. Until the quote
 * has loaded the page cannot know its creator (the owner rule needs it), so it keeps the loading
 * state rather than flashing the form.
 */
export function editQuotePageDecision(input: {
  rolesKnown: boolean;
  quoteLoaded: boolean;
  can: Pick<QuotesBookingsCapabilities, "manageQuote">;
}): QuotePageDecision {
  if (!input.rolesKnown || !input.quoteLoaded) return "loading";
  return input.can.manageQuote ? "form" : "redirect";
}
