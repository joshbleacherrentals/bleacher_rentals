import type { Kysely } from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import type { CompiledResultOf } from "@/lib/powersync/typedQuery";
import type { QuoteDetail } from "./fetchQuoteDetail";

/**
 * The data behind the quote detail page, as six small queries and a JS merge instead of the one
 * query with five JOINs that `fetchQuoteDetail` runs once. Spec:
 * docs/specs/quote-detail-01-reactive-quote.md.
 *
 * Why: the page used to read the quote once, so a change made in another tab never showed. Each
 * small query reads one table, so a commit to `Contacts` re-runs only the contact query and the
 * join is redone here, in memory.
 *
 * `mergeQuoteDetail` returns exactly what `fetchQuoteDetail` returns for the same rows;
 * `quoteDetailData.differential.test.ts` checks that against the old SQL. `fetchQuoteDetail`
 * itself is untouched: the edit page still loads its form from it, once, on purpose.
 *
 * This module never imports `SystemProvider`, so it runs in Node tests: the builders take the
 * Kysely instance as a parameter.
 */

const EVENT_COLUMNS = [
  "id",
  "invoice_number",
  "event_name",
  "event_status",
  "lead_submission",
  "hide_lead_alert",
  "lost_reason",
  "lost_reason_note",
  "event_start",
  "event_end",
  "setup_start",
  "teardown_end",
  "notes",
  "internal_notes",
  "external_notes",
  "pickup_instructions",
  "dropoff_instructions",
  "contract_revenue_cents",
  "event_type_uuid",
  "quote_valid_till",
  "sales_office_uuid",
  "terms_and_conditions_uuid",
  "tax_percent",
  "tax_amount_cents",
  "is_tax_overridden",
  "booked_at",
  "created_at",
  "created_by_user_uuid",
  "deleted",
] as const;

/**
 * The six small queries for one quote. Every one is bound to the event id alone: the event by its
 * primary key, every related row by `where id in (select <foreign key> from Events where id = ?)`.
 * There is no JOIN, so none of them re-runs for a table it does not read.
 */
export function buildQuoteDetailQueries(db: Kysely<PowerSyncDB>, eventId: string) {
  /** The event's own foreign key, which names the related row. */
  const eventsColumn = (
    column:
      | "address_uuid"
      | "venue_uuid"
      | "contact_uuid"
      | "finance_contact_uuid"
      | "created_by_user_uuid",
  ) => db.selectFrom("Events").select(column).where("id", "=", eventId);

  const contactColumns = ["id", "first_name", "last_name", "email", "phone"] as const;

  return {
    event: db.selectFrom("Events").select(EVENT_COLUMNS).where("id", "=", eventId).compile(),

    address: db
      .selectFrom("Addresses")
      .select(["id", "street", "city", "state_province", "zip_postal"])
      .where("id", "in", eventsColumn("address_uuid"))
      .compile(),

    venue: db
      .selectFrom("Venues")
      .select(["id", "name"])
      .where("id", "in", eventsColumn("venue_uuid"))
      .compile(),

    contact: db
      .selectFrom("Contacts")
      .select(contactColumns)
      .where("id", "in", eventsColumn("contact_uuid"))
      .compile(),

    financeContact: db
      .selectFrom("Contacts")
      .select(contactColumns)
      .where("id", "in", eventsColumn("finance_contact_uuid"))
      .compile(),

    // The quote's account manager is the user who created it, as in the old query.
    accountManager: db
      .selectFrom("Users")
      .select(["id", "first_name", "last_name"])
      .where("id", "in", eventsColumn("created_by_user_uuid"))
      .compile(),
  };
}

type Queries = ReturnType<typeof buildQuoteDetailQueries>;

export type EventPart = CompiledResultOf<Queries["event"]>;
export type AddressPart = CompiledResultOf<Queries["address"]>;
export type VenuePart = CompiledResultOf<Queries["venue"]>;
export type ContactPart = CompiledResultOf<Queries["contact"]>;
export type UserNamePart = CompiledResultOf<Queries["accountManager"]>;

/** What the six queries returned, for the event the page is about. */
export type QuoteDetailParts = {
  eventId: string;
  event: EventPart[];
  address: AddressPart[];
  venue: VenuePart[];
  contact: ContactPart[];
  financeContact: ContactPart[];
  accountManager: UserNamePart[];
};

/**
 * Joins the six parts into the `QuoteDetail` the old query returned, or null when there is no
 * such event. The rules are the old mapping's:
 *
 * - an address with an empty street is no address, whatever else the row holds;
 * - a missing city or province is an empty string, a missing zip stays null;
 * - a venue or contact is whatever row exists, with a missing name part as an empty string
 *   (a missing contact last name stays null);
 * - the account manager is the creator's names, null when both are empty;
 * - `isTaxOverridden` and `deleted` are true only for exactly 1;
 * - an event row that is another event's is no event: it is a stale answer.
 */
export function mergeQuoteDetail(parts: QuoteDetailParts): QuoteDetail | null {
  const e = parts.event[0];
  if (!e || e.id !== parts.eventId) return null;

  const a = parts.address[0];
  const v = parts.venue[0];
  const c = parts.contact[0];
  const f = parts.financeContact[0];
  const u = parts.accountManager[0];

  // Every column is nullable in the local schema; the old mapping has always read them as the
  // QuoteDetail types, so a missing value passes through as null, as it did.
  return {
    id: e.id,
    invoiceNumber: e.invoice_number,
    eventName: e.event_name as string,
    eventStatus: e.event_status,
    hasLeadSubmission: (e.lead_submission ?? "").trim() !== "",
    hideLeadAlert: e.hide_lead_alert === 1,
    lostReason: e.lost_reason,
    lostReasonNote: e.lost_reason_note,
    eventStart: e.event_start,
    eventEnd: e.event_end,
    setupStart: e.setup_start,
    teardownEnd: e.teardown_end,
    notes: e.notes,
    internalNotes: e.internal_notes,
    externalNotes: e.external_notes,
    pickupInstructions: e.pickup_instructions,
    dropoffInstructions: e.dropoff_instructions,
    contractRevenueCents: e.contract_revenue_cents,
    eventTypeUuid: e.event_type_uuid,
    quoteValidTill: e.quote_valid_till,
    salesOfficeUuid: e.sales_office_uuid,
    termsAndConditionsUuid: e.terms_and_conditions_uuid,
    taxPercent: e.tax_percent,
    taxAmountCents: e.tax_amount_cents,
    isTaxOverridden: e.is_tax_overridden === 1,
    bookedAt: e.booked_at,
    createdAt: e.created_at as string,
    createdByUserUuid: e.created_by_user_uuid,
    address: a?.street
      ? {
          street: a.street,
          city: a.city ?? "",
          stateProvince: a.state_province ?? "",
          zipPostal: a.zip_postal,
        }
      : null,
    venue: v?.id ? { id: v.id, name: v.name ?? "" } : null,
    contact: c?.id
      ? {
          id: c.id,
          firstName: c.first_name ?? "",
          lastName: c.last_name,
          email: c.email,
          phone: c.phone,
        }
      : null,
    financeContact: f?.id
      ? {
          id: f.id,
          firstName: f.first_name ?? "",
          lastName: f.last_name,
          email: f.email,
          phone: f.phone,
        }
      : null,
    accountManager:
      u && (u.first_name || u.last_name)
        ? { firstName: u.first_name, lastName: u.last_name }
        : null,
    deleted: e.deleted === 1,
  };
}

/** What one `useTypedQuery` reports about itself. */
export type PartStatus = {
  isLoading: boolean;
  isFetching: boolean;
  error?: Error | undefined;
};

export type QuoteDetailState = {
  quote: QuoteDetail | null;
  isLoading: boolean;
  error: Error | null;
  /** The event id whose six answers have all arrived; the hook keeps it between renders. */
  answeredFor: string | null;
};

/**
 * When the page may show a quote.
 *
 * The page is loading until all six queries have answered for THIS event id. Two things need care:
 *
 * - After a re-run caused by a commit, a query reports `isFetching` while it still holds good
 *   rows. That must not bring the "Loading quote..." screen back, so once an event id has been
 *   answered it stays answered.
 * - When the event id changes while the component stays mounted, the watcher keeps the OLD rows
 *   and reports `isFetching` until the new query returns. Those rows are never shown: the state
 *   is loading until the new answers arrive. A settled answer that still holds another event's
 *   row is treated the same way, as a stale one.
 *
 * Any error wins: no quote, the error, and not loading.
 */
export function resolveQuoteDetail(input: {
  answeredFor: string | null;
  parts: QuoteDetailParts;
  statuses: PartStatus[];
}): QuoteDetailState {
  const { answeredFor, parts, statuses } = input;

  const error = statuses.find((status) => status.error)?.error ?? null;
  if (error) return { quote: null, isLoading: false, error, answeredFor };

  const anyLoading = statuses.some((status) => status.isLoading);
  const holdsAnotherEvent = parts.event.length > 0 && parts.event[0].id !== parts.eventId;
  const settled =
    !anyLoading && !holdsAnotherEvent && statuses.every((status) => !status.isFetching);

  const answered = settled ? parts.eventId : answeredFor;
  const isLoading = anyLoading || answered !== parts.eventId;

  return {
    quote: isLoading ? null : mergeQuoteDetail(parts),
    isLoading,
    error: null,
    answeredFor: answered,
  };
}

/**
 * Keeps the previous object when a re-run returned the same data. PowerSync tells a watcher that a
 * TABLE changed, not which row, so the event query re-runs on every edit of any event; handing the
 * page a fresh but equal object each time would re-render all of it for nothing.
 */
export function reuseQuote(previous: QuoteDetail | null, next: QuoteDetail | null) {
  if (previous && next && JSON.stringify(previous) === JSON.stringify(next)) return previous;
  return next;
}
