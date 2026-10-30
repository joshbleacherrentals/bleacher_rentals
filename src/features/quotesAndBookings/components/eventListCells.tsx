import { DateTime } from "luxon";
import { CellText } from "@/components/DataTable";
import type { QuotesBookingsEvent } from "../types";
import { isInGoodShuffle } from "../utils/filterEvents";
import type { InvoiceAttentionReason } from "../utils/invoiceAttention";
import { GoodShuffleBadge } from "./GoodShuffleBadge";
import { InvoiceAttentionMark } from "./InvoiceAttentionMark";

/**
 * Cells every tab of the /quotes-bookings list draws the same way, so an event
 * reads identically on "All Events" and on the AR tabs.
 */

export function formatListDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = DateTime.fromISO(dateString);
  if (!date.isValid) return "Invalid Date";
  return date.toFormat("MMM d, yyyy");
}

export function accountManagerName(event: QuotesBookingsEvent): string {
  return event.account_manager_first_name || event.account_manager_last_name
    ? `${event.account_manager_first_name || ""} ${event.account_manager_last_name || ""}`.trim()
    : "Not Assigned";
}

export function EventNameCell({
  event,
  attention,
}: {
  event: QuotesBookingsEvent;
  /** Why the event's QuickBooks invoice needs attention (spec 11): a red dot before the name. */
  attention?: InvoiceAttentionReason[];
}) {
  return (
    <div className="max-w-[240px] 2xl:max-w-[320px]">
      <CellText bold>
        <span className="flex items-center gap-1.5">
          <InvoiceAttentionMark reasons={attention} />
          {isInGoodShuffle(event) && <GoodShuffleBadge />}
          <span className="truncate" title={event.event_name ?? undefined}>
            {event.event_name}
          </span>
        </span>
      </CellText>
    </div>
  );
}
