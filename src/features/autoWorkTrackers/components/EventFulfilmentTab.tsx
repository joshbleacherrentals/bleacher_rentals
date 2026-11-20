"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { formatDateRange } from "@/features/scheduleValidator/utils/formatDateRange";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { useChecks } from "./ChecksProvider";
import { type DeliveryBleacher, type EventDeliveries } from "../utils/deliveryList";
import { kmToMiles } from "../utils/distance";

const KIND_LABEL = { work_tracker: "Work tracker", event: "Event", maintenance: "Maintenance" };

function TimeAvailable({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-400">—</span>;
  const label = days === 0 ? "Same day" : `${days} day${days === 1 ? "" : "s"}`;
  // A move with a day or less to spare is tight.
  return <span className={days <= 1 ? "font-medium text-amber-700" : ""}>{label}</span>;
}

function Distance({ km }: { km: number | null }) {
  if (km === null) return <span className="text-gray-400">—</span>;
  return (
    <span>
      {Math.round(km).toLocaleString()} km{" "}
      <span className="text-gray-500">({Math.round(kmToMiles(km)).toLocaleString()} mi)</span>
    </span>
  );
}

function LastLocation({ bleacher }: { bleacher: DeliveryBleacher }) {
  const { last } = bleacher;
  if (!last) return <span className="text-gray-500">No known location</span>;
  return (
    <span>
      {last.street ?? "No street"}{" "}
      <span className="text-gray-500">
        ({KIND_LABEL[last.kind]}
        {last.kind === "work_tracker" ? "" : `: ${last.label}`},{" "}
        {formatDateRange(last.date, last.date)})
      </span>
    </span>
  );
}

function EventSection({ event, hideReady }: { event: EventDeliveries; hideReady: boolean }) {
  const bleachers = hideReady ? event.bleachers.filter((b) => !b.ready) : event.bleachers;

  const header = (
    <>
      {event.allReady && (
        <Check className="mr-1 inline h-4 w-4 text-green-600" aria-label="Ready" />
      )}
      {event.eventName}
      <span className="font-normal text-gray-600">
        {" "}
        · {formatDateRange(event.startDate, event.startDate)} · {event.street ?? "No address"}
      </span>
      <span
        className={`ml-2 font-normal ${event.toDeliver > 0 ? "text-red-700" : "text-green-700"}`}
      >
        {event.bleachers.length === 0
          ? "No bleachers assigned"
          : event.allReady
            ? "Ready"
            : `${event.toDeliver} of ${event.bleachers.length} to deliver`}
      </span>
    </>
  );

  const rows = (
    <div className="mt-1 grid grid-cols-[4rem_minmax(0,1fr)_7rem_11rem] gap-x-4 text-sm">
      <span className="py-1 text-xs font-semibold text-gray-500">Bleacher</span>
      <span className="py-1 text-xs font-semibold text-gray-500">Last location</span>
      <span className="py-1 text-xs font-semibold text-gray-500">Time available</span>
      <span className="py-1 text-xs font-semibold text-gray-500">Distance to event</span>
      {bleachers.map((bleacher) => (
        <div
          key={bleacher.bleacherUuid}
          className={`contents ${bleacher.ready ? "text-gray-500" : ""}`}
        >
          <span className="border-t py-1 font-medium">
            {bleacher.ready && <Check className="mr-1 inline h-4 w-4 text-green-600" />}#
            {bleacher.bleacherNumber}
          </span>
          <span className="border-t py-1">
            <LastLocation bleacher={bleacher} />
          </span>
          <span className="border-t py-1">
            {bleacher.ready ? "" : <TimeAvailable days={bleacher.daysAvailable} />}
          </span>
          <span className="border-t py-1">
            {bleacher.ready ? "" : <Distance km={bleacher.distanceKm} />}
          </span>
        </div>
      ))}
    </div>
  );

  // An event that is all ready folds away; one with work left is open.
  return (
    <details open={!event.allReady} className="group" data-testid="delivery-event">
      <summary className="cursor-pointer border-b pb-1 text-sm font-semibold">{header}</summary>
      {rows}
    </details>
  );
}

/**
 * Every event starting in the selected week, for the selected zone, with its assigned bleachers:
 * where each was last before the event, how long there is to move it, and how far it has to go (as
 * the crow flies). Bleachers already at the event are ticked, and an event with all of them ready is
 * ticked and folded. "Hide ready" narrows the list to what still needs doing.
 */
export function EventFulfilmentTab() {
  const { zoneId } = useZoneWeekParams();
  const { deliveries, isLoading } = useChecks().eventFulfilment;
  const [hideReady, setHideReady] = useState(false);

  if (!zoneId) return <p className="text-sm text-gray-500">Select a zone to see its deliveries.</p>;
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (deliveries.length === 0) {
    return <p className="text-sm text-gray-500">No events start this week.</p>;
  }

  const visible = hideReady ? deliveries.filter((e) => e.toDeliver > 0) : deliveries;
  const allDone = deliveries.every((e) => e.toDeliver === 0);

  return (
    <div className="flex flex-col gap-4" data-testid="bleacher-deliveries">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideReady}
            onChange={(e) => setHideReady(e.target.checked)}
          />
          Hide ready
        </label>
        {allDone && (
          <span
            className="flex items-center gap-1 text-sm text-green-800"
            data-testid="no-deliveries-needed"
          >
            <Check className="h-4 w-4" />
            Every bleacher is where it needs to be this week.
          </span>
        )}
      </div>
      {visible.map((event) => (
        <EventSection key={event.eventId} event={event} hideReady={hideReady} />
      ))}
    </div>
  );
}
