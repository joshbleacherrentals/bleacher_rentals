"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { EVENT_REQUIREMENTS, type EventData, type EventRole } from "../utils/eventData";
import { useCanFixZoneData } from "../hooks/useCanFixZoneData";
import { AddressFixModal } from "./AddressFixModal";
import { Mark, RequirementCell } from "./RequirementCell";
import { GRID_LINES as LINES } from "./DriverWeekGrid";

const ROLE_LABELS: Record<EventRole, string> = { starts: "Starts this week", pickup: "Pickup" };

/** The requirements with a fix on this page, by key. */
const FIXABLE = new Set(["address"]);

/**
 * A table of the events the zone's trips touch this week: the events starting this week (as on the
 * Dashboard) and the events their bleachers are picked up from. A column per piece of data the work
 * tracker model needs from an event (EVENT_REQUIREMENTS), each a check or a red X with what is
 * missing; the address opens a fix, as on Driver Data.
 */
export function EventDataTab() {
  const { zoneId } = useZoneWeekParams();
  const { events, isLoading } = useChecks().eventData;
  const canFix = useCanFixZoneData(zoneId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing: EventData | null = events.find((e) => e.eventId === editingId) ?? null;

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its events.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No events with this zone&apos;s bleachers start this week.
      </p>
    );
  }

  return (
    <div>
      <div
        className="grid border-t border-l border-black/15"
        style={{
          gridTemplateColumns: `minmax(220px, 1.2fr) 110px 150px repeat(${EVENT_REQUIREMENTS.length}, minmax(0, 1fr))`,
        }}
        data-testid="event-data"
      >
        {["Event", "Starts", "Why it's here"].map((heading) => (
          <div
            key={heading}
            className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${LINES}`}
          >
            {heading}
          </div>
        ))}
        {EVENT_REQUIREMENTS.map((r) => (
          <div
            key={r.key}
            className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${LINES}`}
            title={r.why}
          >
            {r.label}
          </div>
        ))}

        {events.map((event) => (
          <div key={event.eventId} className="contents" data-testid="event-data-row">
            <div className={`flex min-h-12 items-center gap-2 px-2 text-sm font-medium ${LINES}`}>
              <Mark ok={event.ok} label={event.ok ? "Ready" : "Missing data"} />
              {event.eventName}
            </div>
            <div className={`flex min-h-12 items-center px-2 text-sm text-gray-600 ${LINES}`}>
              {event.startDate ? DateTime.fromISO(event.startDate).toFormat("EEE, MMM d") : "—"}
            </div>
            <div className={`flex min-h-12 items-center px-2 text-sm text-gray-600 ${LINES}`}>
              {event.roles.map((r) => ROLE_LABELS[r]).join(", ")}
            </div>
            {EVENT_REQUIREMENTS.map((r) => (
              <RequirementCell
                key={r.key}
                result={event.results[r.key]}
                testId="event-data-cell"
                onFix={canFix && FIXABLE.has(r.key) ? () => setEditingId(event.eventId) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      <AddressFixModal
        target={
          editing && {
            owner: { table: "Events", id: editing.eventId },
            title: `${editing.eventName}: address`,
            addressUuid: editing.addressUuid,
            address: editing.address,
            problem: editing.results.address?.problem ?? null,
          }
        }
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}
