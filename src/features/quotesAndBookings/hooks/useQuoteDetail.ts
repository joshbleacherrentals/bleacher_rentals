"use client";

import { useMemo, useRef, useState } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { QuoteDetail } from "../db/fetchQuoteDetail";
import {
  buildQuoteDetailQueries,
  resolveQuoteDetail,
  reuseQuote,
  type AddressPart,
  type ContactPart,
  type EventPart,
  type UserNamePart,
  type VenuePart,
} from "../db/quoteDetailData";

/**
 * The quote the detail page shows, read reactively: it changes when the quote is edited in another
 * tab or arrives by sync. Six small queries, one per table, joined in JS. Spec:
 * docs/specs/quote-detail-01-reactive-quote.md.
 *
 * - `isLoading` is true until all six have answered for this `eventId`, and again right after the
 *   id changes; the previous quote is never returned for a new id.
 * - `quote` is null when the quote is not there (not synced yet, or removed), or when a query
 *   failed (`error` is set then). It fills in by itself when the row arrives.
 * - A re-run that returns the same data returns the same `quote` object.
 */
export function useQuoteDetail(eventId: string): {
  quote: QuoteDetail | null;
  isLoading: boolean;
  error: Error | null;
} {
  const queries = useMemo(() => buildQuoteDetailQueries(db, eventId), [eventId]);

  const event = useTypedQuery(queries.event, expect<EventPart>());
  const address = useTypedQuery(queries.address, expect<AddressPart>());
  const venue = useTypedQuery(queries.venue, expect<VenuePart>());
  const contact = useTypedQuery(queries.contact, expect<ContactPart>());
  const financeContact = useTypedQuery(queries.financeContact, expect<ContactPart>());
  const accountManager = useTypedQuery(queries.accountManager, expect<UserNamePart>());

  // The event id whose six answers have all arrived. Kept in state and adjusted while rendering
  // (React re-renders at once, with no frame in between), so a re-run after a commit never brings
  // the loading screen back and a changed id always does.
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);

  const state = resolveQuoteDetail({
    answeredFor,
    parts: {
      eventId,
      event: event.data ?? [],
      address: address.data ?? [],
      venue: venue.data ?? [],
      contact: contact.data ?? [],
      financeContact: financeContact.data ?? [],
      accountManager: accountManager.data ?? [],
    },
    statuses: [event, address, venue, contact, financeContact, accountManager].map((part) => ({
      isLoading: part.isLoading,
      isFetching: part.isFetching,
      error: part.error,
    })),
  });
  if (state.answeredFor !== answeredFor) setAnsweredFor(state.answeredFor);

  // The watcher hands over new arrays after every commit to any table it reads, equal or not.
  const previous = useRef<QuoteDetail | null>(null);
  const quote = reuseQuote(previous.current, state.quote);
  previous.current = quote;

  return { quote, isLoading: state.isLoading, error: state.error };
}
