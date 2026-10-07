import { DateTime } from "luxon";
import { CellText } from "@/components/DataTable";
import type { QuotesBookingsEvent } from "../types";
import { isInGoodShuffle } from "../utils/filterEvents";
import { GoodShuffleBadge } from "./GoodShuffleBadge";

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

export function EventNameCell({ event }: { event: QuotesBookingsEvent }) {
  return (
    <div className="max-w-[240px] 2xl:max-w-[320px]">
      <CellText bold>
        <span className="flex items-center gap-1.5">
          {isInGoodShuffle(event) && <GoodShuffleBadge />}
          <span className="truncate" title={event.event_name ?? undefined}>
            {event.event_name}
          </span>
        </span>
      </CellText>
    </div>
  );
}
