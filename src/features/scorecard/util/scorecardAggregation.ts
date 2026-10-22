import { DateTime } from "luxon";
import { QuotesBookingsEvent } from "../../quotesAndBookings/types";
import { WorkTrackerRow } from "../../allWorkTrackers/types";

type EventDateField = "created_at" | "booked_at" | "quote_sent_at" | "event_start";

/**
 * Convert an ISO date/timestamp string to a YYYY-MM-DD day key.
 * When a timezone is provided the timestamp is interpreted in that zone
 * so that the "which calendar day?" answer is consistent for all users.
 */
function toDayKey(value: string | null, timezone?: string): string | null {
  if (!value) return null;
  const dt = timezone ? DateTime.fromISO(value, { zone: timezone }) : DateTime.fromISO(value);
  if (!dt.isValid) return null;
  return dt.toFormat("yyyy-MM-dd");
}

/**
 * Build cumulative totals from a daily map over an ordered array of day keys.
 */
function cumulate(days: string[], daily: Record<string, number>): Record<string, number> {
  const cumulative: Record<string, number> = {};
  let running = 0;
  for (const day of days) {
    running += daily[day] ?? 0;
    cumulative[day] = running;
  }
  return cumulative;
}

/**
 * Count pre-filtered events per day by a date field, return cumulative totals.
 * O(events + days).
 *
 * IMPORTANT: The events passed in should already be filtered by
 * `filterQuotesBookingsEvents` — do NOT pass a separate filter function.
 * This ensures the scorecard and quotes-bookings page use identical logic.
 */
export function cumulativeEventCountByDay(
  days: string[],
  events: QuotesBookingsEvent[],
  dateField: EventDateField,
  timezone?: string,
): Record<string, number> {
  const daySet = new Set(days);
  const daily: Record<string, number> = {};
  for (const day of days) daily[day] = 0;

  for (const event of events) {
    const key = toDayKey(event[dateField], timezone);
    if (key && daySet.has(key)) {
      daily[key] += 1;
    }
  }

  return cumulate(days, daily);
}

/**
 * Sum a cents-based event field per day by a date field, convert to dollars, return cumulative.
 * O(events + days).
 *
 * IMPORTANT: The events passed in should already be filtered by
 * `filterQuotesBookingsEvents` — do NOT pass a separate filter function.
 */
export function cumulativeEventCentsByDay(
  days: string[],
  events: QuotesBookingsEvent[],
  dateField: EventDateField,
  centsField: "contract_revenue_cents",
  timezone?: string,
): Record<string, number> {
  const daySet = new Set(days);
  const daily: Record<string, number> = {};
  for (const day of days) daily[day] = 0;

  for (const event of events) {
    const key = toDayKey(event[dateField], timezone);
    if (key && daySet.has(key)) {
      daily[key] += (event[centsField] ?? 0) / 100;
    }
  }

  return cumulate(days, daily);
}

/**
 * Sum pay_cents from work trackers per day using the `date` field,
 * convert to dollars, and return cumulative totals.
 * O(workTrackers + days).
 */
export function cumulativeWorkTrackerPayByDay(
  days: string[],
  workTrackers: WorkTrackerRow[],
  timezone?: string,
): Record<string, number> {
  const daySet = new Set(days);
  const daily: Record<string, number> = {};
  for (const day of days) daily[day] = 0;

  for (const wt of workTrackers) {
    const key = toDayKey(wt.date, timezone);
    if (key && daySet.has(key)) {
      daily[key] += (wt.pay_cents ?? 0) / 100;
    }
  }

  return cumulate(days, daily);
}
