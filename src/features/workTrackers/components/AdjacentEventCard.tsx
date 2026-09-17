"use client";

import { formatDate } from "@/features/quotesAndBookings/utils/formatDate";
import { AppTooltip } from "@/components/AppTooltip";
import type { AdjacentEvent } from "../util/resolveAdjacentEventsForWorkTracker";

/**
 * Read-only context card for the Previous/Next event on this bleacher —
 * never written to the work tracker, just computed for display. Clicking it
 * opens that event's detail page in a new tab.
 */
export function AdjacentEventCard({
  label,
  event,
}: {
  label: string;
  event: AdjacentEvent | null;
}) {
  if (!event) return null;

  return (
    <AppTooltip content="Open In New Tab">
      <a
        href={`/quotes-bookings/${event.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded border border-gray-200 bg-gray-50 px-2 py-1.5 mb-2 hover:bg-gray-100 transition-colors"
      >
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-sm font-bold text-darkBlue truncate">
          {event.eventName ?? "Untitled Event"}
        </div>
        <div className="text-xs text-gray-500">
          {formatDate(event.eventStart)} - {formatDate(event.eventEnd)}
        </div>
      </a>
    </AppTooltip>
  );
}
