import type { InboundFields, QuotesBookingsEvent, QuotesBookingsFilters } from "../types";
import { isWithinRange } from "./dateRange";
import { UNKNOWN_ZONE } from "./zoneOfEvent";

/**
 * An event is in GoodShuffle when it carries a real URL. A blank string is a
 * field someone opened and left empty — to a user that event is not in
 * GoodShuffle, so it must not pass the "yes" filter.
 *
 * Exported so the table badge and the filter cannot disagree about what "in
 * GoodShuffle" means.
 */
export function isInGoodShuffle(event: QuotesBookingsEvent): boolean {
  return (event.goodshuffle_url ?? "").trim() !== "";
}

/**
 * QuickBooks is a manual flag stored locally as 0/1, so anything that is not a
 * literal 1 (including a missing row) means "not in QuickBooks".
 */
export function isInQuickBooks(event: QuotesBookingsEvent): boolean {
  return event.is_qbo === 1;
}

/**
 * An event is inbound when it was created from the website form, which is the only thing that
 * stores a submission. Exported so a badge and the filter cannot disagree.
 */
export function isInbound(event: InboundFields): boolean {
  return (event.lead_submission ?? "").trim() !== "";
}

export function filterQuotesBookingsEvents<E extends QuotesBookingsEvent & InboundFields>(
  events: E[],
  filters: QuotesBookingsFilters,
  timezone?: string,
): E[] {
  return events.filter((event) => {
    if (filters.statuses.length > 0) {
      const status = event.event_status?.toLowerCase() ?? "";
      if (!filters.statuses.includes(status)) return false;
    }

    if (!isWithinRange(event.created_at, filters.createdFrom, filters.createdTo, timezone)) {
      return false;
    }

    if (!isWithinRange(event.event_start, filters.eventFrom, filters.eventTo, timezone)) {
      return false;
    }

    if (!isWithinRange(event.booked_at, filters.bookedFrom, filters.bookedTo, timezone)) {
      return false;
    }

    if (!isWithinRange(event.quote_sent_at, filters.quoteSentFrom, filters.quoteSentTo, timezone)) {
      return false;
    }

    if (filters.inGoodShuffle !== null && isInGoodShuffle(event) !== filters.inGoodShuffle) {
      return false;
    }

    if (filters.inQuickBooks !== null && isInQuickBooks(event) !== filters.inQuickBooks) {
      return false;
    }

    if (filters.inbound !== null && isInbound(event) !== filters.inbound) {
      return false;
    }

    if (filters.zoneUuids.length > 0) {
      // An event whose state is missing or in no zone is "Zone Unknown", which is its own choice.
      if (!filters.zoneUuids.includes(event.zone_uuid ?? UNKNOWN_ZONE)) return false;
    }

    if (filters.salesOfficeUuid && event.sales_office_uuid !== filters.salesOfficeUuid) {
      return false;
    }

    if (filters.accountManagerUserUuid) {
      const owner = event.created_by_user_uuid ?? "";
      if (filters.accountManagerUserUuid !== owner) return false;
    }

    return true;
  });
}
