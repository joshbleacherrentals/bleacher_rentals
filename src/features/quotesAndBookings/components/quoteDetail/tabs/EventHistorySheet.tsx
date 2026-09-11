"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type HistoryEvent = {
  id: string;
  eventName: string | null;
  invoiceNumber: number | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
  /** Optional secondary badge, e.g. "primary" / "finance" on the Contact history sheet. */
  tag?: string | null;
};

export type HistoryEventBuckets = { past: HistoryEvent[]; future: HistoryEvent[] };

function formatDate(d: string | null): string {
  if (!d) return "N/A";
  const dt = DateTime.fromISO(d);
  return dt.isValid ? dt.toFormat("MMM d, yyyy") : "N/A";
}

export function statusBadgeClass(status: string | null): string {
  switch (status) {
    case "booked":
      return "bg-green-100 text-green-800";
    case "quoted":
      return "bg-yellow-100 text-yellow-800";
    case "lost":
      return "bg-red-100 text-red-800";
    case "draft":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function EventRow({ event }: { event: HistoryEvent }) {
  return (
    <a
      href={`/quotes-bookings/${event.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-gray-50 transition"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-darkBlue truncate">
          {event.eventName ?? "Untitled Event"} (#{event.invoiceNumber ?? "—"})
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {formatDate(event.eventStart)} - {formatDate(event.eventEnd)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClass(event.eventStatus)}`}
        >
          {event.eventStatus ?? "unknown"}
        </span>
        {event.tag && <span className="text-[10px] text-gray-400 capitalize">{event.tag}</span>}
      </div>
    </a>
  );
}

function EventList({ events, emptyLabel }: { events: HistoryEvent[]; emptyLabel: string }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 py-2">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {events.map((event) => (
        <EventRow key={`${event.id}-${event.tag ?? ""}`} event={event} />
      ))}
    </div>
  );
}

export function EventHistorySheet({
  title,
  subtitle,
  open,
  onOpenChange,
  fetchEvents,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchEvents: () => Promise<HistoryEventBuckets>;
}) {
  const [buckets, setBuckets] = useState<HistoryEventBuckets | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    fetchEvents()
      .then((result) => {
        if (!cancelled) setBuckets(result);
      })
      .catch(() => {
        if (!cancelled) setBuckets({ past: [], future: [] });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => onOpenChange(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={close}
      />

      <div className="fixed inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl ring-1 ring-black/10 animate-in slide-in-from-right sm:max-w-md">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-darkBlue">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
          </div>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-600 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {isLoading || !buckets ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading events...</p>
          ) : (
            <Accordion type="multiple" defaultValue={["future", "past"]}>
              <AccordionItem value="past">
                <AccordionTrigger>Past Events ({buckets.past.length})</AccordionTrigger>
                <AccordionContent>
                  <EventList events={buckets.past} emptyLabel="No past events" />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="future">
                <AccordionTrigger>Future Events ({buckets.future.length})</AccordionTrigger>
                <AccordionContent>
                  <EventList events={buckets.future} emptyLabel="No upcoming events" />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
