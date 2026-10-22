export type QuotesBookingsEvent = {
  id: string;
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
  event_status: string | null;
  contract_revenue_cents: number | null;
  tax_amount_cents: number | null;
  tax_percent: number | null;
  created_at: string | null;
  booked_at: string | null;
  quote_sent_at: string | null;
  created_by_user_uuid: string | null;
  goodshuffle_url: string | null;
  is_qbo: number | null;
  sales_office_uuid: string | null;
  deleted: number | null;
  invoice_number: number | null;
  account_manager_first_name: string | null;
  account_manager_last_name: string | null;
  account_manager_email: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  company_name: string | null;
};

/**
 * What the Quotes & Bookings list adds to its rows, for the Inbound and Zone filters: the raw
 * website form submission (JSON text, null for a quote made in the app) and the zone the event's
 * state belongs to (see utils/zoneOfEvent).
 */
export type InboundFields = {
  lead_submission?: string | null;
  zone_uuid?: string | null;
};

/**
 * The two balances the AR tabs show, per event. Both come from
 * `computeAmountDue`, so they read the same as the event's Billing tab.
 */
export type ReceivableBalances = {
  /** What the payment schedule says should have arrived by today and has not. */
  amount_due_cents: number;
  /** Everything still owed on the event: its total less what was received. */
  remaining_balance_cents: number;
};

export type AccountsReceivableEvent = QuotesBookingsEvent & ReceivableBalances;

export type QuotesBookingsFilters = {
  isOpen: boolean;
  statuses: string[];
  createdFrom: string | null;
  createdTo: string | null;
  eventFrom: string | null;
  eventTo: string | null;
  bookedFrom: string | null;
  bookedTo: string | null;
  quoteSentFrom: string | null;
  quoteSentTo: string | null;
  accountManagerUserUuid: string | null;
  /** null = no filter, true = only events in GoodShuffle, false = only those not in it. */
  inGoodShuffle: boolean | null;
  /** null = no filter, true = only events with is_qbo set, false = only those without. */
  inQuickBooks: boolean | null;
  /** null = every office; otherwise only events belonging to that one office. */
  salesOfficeUuid: string | null;
  /** null = no filter, true = only quotes made from the website form, false = only the others. */
  inbound: boolean | null;
  /** Empty = every zone; otherwise only events in these zones (`UNKNOWN_ZONE` = no zone found). */
  zoneUuids: string[];
};
