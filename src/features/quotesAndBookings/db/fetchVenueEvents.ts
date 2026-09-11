import { db } from "@/components/providers/SystemProvider";
import { typedGetAll, expect } from "@/lib/powersync/typedQuery";

export type VenueEventRow = {
  id: string;
  event_name: string | null;
  invoice_number: number | null;
  event_start: string | null;
  event_end: string | null;
  event_status: string | null;
};

export type VenueEvent = {
  id: string;
  eventName: string | null;
  invoiceNumber: number | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
};

export type VenueEventBuckets = {
  past: VenueEvent[];
  future: VenueEvent[];
};

/**
 * Same past/future split + sort as bucketAndSortContactEvents (see
 * fetchContactEvents.ts): Past = event_end before now, most-recent-first;
 * Future = event_end on/after now (or no event_end at all), soonest-first.
 */
export function bucketAndSortVenueEvents(
  rows: VenueEventRow[],
  nowIso: string = new Date().toISOString(),
): VenueEventBuckets {
  const now = new Date(nowIso).getTime();
  const past: VenueEvent[] = [];
  const future: VenueEvent[] = [];

  for (const r of rows) {
    const event: VenueEvent = {
      id: r.id,
      eventName: r.event_name,
      invoiceNumber: r.invoice_number,
      eventStart: r.event_start,
      eventEnd: r.event_end,
      eventStatus: r.event_status,
    };

    const endTime = r.event_end ? new Date(r.event_end).getTime() : NaN;
    const isPast = !Number.isNaN(endTime) && endTime < now;

    if (isPast) {
      past.push(event);
    } else {
      future.push(event);
    }
  }

  past.sort((a, b) => new Date(b.eventEnd ?? 0).getTime() - new Date(a.eventEnd ?? 0).getTime());
  future.sort((a, b) => new Date(a.eventEnd ?? 0).getTime() - new Date(b.eventEnd ?? 0).getTime());

  return { past, future };
}

export async function fetchVenueEvents(
  venueUuid: string,
  nowIso?: string,
): Promise<VenueEventBuckets> {
  const compiled = db
    .selectFrom("Events")
    .select(["id", "event_name", "invoice_number", "event_start", "event_end", "event_status"])
    .where("deleted", "=", 0)
    .where("venue_uuid", "=", venueUuid)
    .compile();

  const rows = await typedGetAll(compiled, expect<VenueEventRow>());

  return bucketAndSortVenueEvents(rows, nowIso);
}
