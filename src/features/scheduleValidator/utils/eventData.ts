/**
 * Event Data: what each event needs on file for the work tracker model to plan its trips. The events
 * are the zone's events for the week (as on the Dashboard) and the events their bleachers are picked
 * up from. Each requirement is one entry in EVENT_REQUIREMENTS, as on Driver Data. Pure: no database.
 */

import type { EventLogisticsCheck } from "./logisticsPlan";
import { checkAddress, type RequirementResult, type StoredAddress } from "./addressCheck";

/** Why an event is listed: it starts this week, or a bleacher for one that does is picked up there. */
export type EventRole = "starts" | "pickup";

/**
 * The events to list, each with why: every event starting this week, plus the event each of their
 * bleachers is last at when it is not at the event already (that is where it gets picked up).
 */
export function eventDataRoles(events: EventLogisticsCheck[]): Map<string, EventRole[]> {
  const roles = new Map<string, Set<EventRole>>();
  const add = (id: string, role: EventRole) => {
    if (!roles.has(id)) roles.set(id, new Set());
    roles.get(id)!.add(role);
  };
  for (const event of events) {
    add(event.eventId, "starts");
    for (const bleacher of event.bleachers) {
      if (!bleacher.matches && bleacher.last?.kind === "event") add(bleacher.last.id, "pickup");
    }
  }
  return new Map(
    [...roles].map(([id, set]) => [id, (["starts", "pickup"] as const).filter((r) => set.has(r))]),
  );
}

/** One listed event and the data the requirements read. */
export type EventDataInput = {
  eventId: string;
  eventName: string;
  /** "YYYY-MM-DD"; null when the event has no date. */
  startDate: string | null;
  /** The Addresses row the event points at, null when none. */
  addressUuid: string | null;
  address: StoredAddress | null;
  roles: EventRole[];
};

export type EventRequirement = {
  key: string;
  label: string;
  /** Why the model needs it, shown on the column heading. */
  why: string;
  check: (event: EventDataInput) => RequirementResult;
};

export type EventData = EventDataInput & {
  results: Record<string, RequirementResult>;
  /** Every requirement passed. */
  ok: boolean;
};

/** The event's address, with every column filled: trips start and end there. */
export const EVENT_ADDRESS_REQUIREMENT: EventRequirement = {
  key: "address",
  label: "Address",
  why: "Trips are picked up and dropped off at the event's address; the model measures distance from its coordinates.",
  check: ({ address }) => checkAddress(address, "No address"),
};

/** Every requirement, in column order. */
export const EVENT_REQUIREMENTS: EventRequirement[] = [EVENT_ADDRESS_REQUIREMENT];

/** Each event's result on every requirement, by start date then name. */
export function buildEventData(
  events: EventDataInput[],
  requirements: EventRequirement[] = EVENT_REQUIREMENTS,
): EventData[] {
  return events
    .map((event) => {
      const results = Object.fromEntries(requirements.map((r) => [r.key, r.check(event)]));
      return { ...event, results, ok: Object.values(results).every((r) => r.ok) };
    })
    .sort(
      (a, b) =>
        (a.startDate ?? "").localeCompare(b.startDate ?? "") ||
        a.eventName.localeCompare(b.eventName),
    );
}
