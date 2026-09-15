import { db } from "@/components/providers/SystemProvider";
import { typedGetAll, expect } from "@/lib/powersync/typedQuery";

export type ContactEventRelation = "primary" | "finance";

export type ContactEventRow = {
  id: string;
  event_name: string | null;
  invoice_number: number | null;
  event_start: string | null;
  event_end: string | null;
  event_status: string | null;
  contact_uuid: string | null;
  finance_contact_uuid: string | null;
};

export type ContactEvent = {
  id: string;
  eventName: string | null;
  invoiceNumber: number | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
  relation: ContactEventRelation;
};

export type ContactEventBuckets = {
  past: ContactEvent[];
  future: ContactEvent[];
};

/**
 * Decide whether a row belongs to Past or Future, tag it with why it matched
 * this contact (primary vs finance), and sort each bucket:
 *  - Future: soonest event_end first (ascending)
 *  - Past: most recently ended first (descending)
 *
 * An event is "Past" once its event_end has passed `nowIso`. Events with no
 * event_end are treated as Future (nothing to say they're over yet).
 */
export function bucketAndSortContactEvents(
  rows: ContactEventRow[],
  contactId: string,
  nowIso: string = new Date().toISOString(),
): ContactEventBuckets {
  const now = new Date(nowIso).getTime();
  const past: ContactEvent[] = [];
  const future: ContactEvent[] = [];

  for (const r of rows) {
    const relation: ContactEventRelation = r.contact_uuid === contactId ? "primary" : "finance";
    const event: ContactEvent = {
      id: r.id,
      eventName: r.event_name,
      invoiceNumber: r.invoice_number,
      eventStart: r.event_start,
      eventEnd: r.event_end,
      eventStatus: r.event_status,
      relation,
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

export async function fetchContactEvents(
  contactId: string,
  nowIso?: string,
): Promise<ContactEventBuckets> {
  const compiled = db
    .selectFrom("Events")
    .select([
      "id",
      "event_name",
      "invoice_number",
      "event_start",
      "event_end",
      "event_status",
      "contact_uuid",
      "finance_contact_uuid",
    ])
    .where("deleted", "=", 0)
    .where((eb) =>
      eb.or([eb("contact_uuid", "=", contactId), eb("finance_contact_uuid", "=", contactId)]),
    )
    .compile();

  const rows = await typedGetAll(compiled, expect<ContactEventRow>());

  return bucketAndSortContactEvents(rows, contactId, nowIso);
}
