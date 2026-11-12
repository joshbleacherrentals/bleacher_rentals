"use client";

import { Check, X } from "lucide-react";
import { useLogisticsPlans } from "../hooks/useLogisticsPlans";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { formatDateRange } from "../utils/formatDateRange";
import type { BleacherCheck, HistoryKind } from "../utils/logisticsPlan";

const KIND_LABEL: Record<HistoryKind, string> = {
  work_tracker: "Work tracker",
  event: "Event",
  maintenance: "Maintenance",
};

function LastLocation({ bleacher }: { bleacher: BleacherCheck }) {
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

/**
 * Every event starting in the selected week, with its bleachers. A check on a bleacher means its
 * last location on the start date is the event's street, so it has a logistics plan.
 */
export function LogisticsPlansTab() {
  const [weekStart] = useSelectedWeek();
  const { events, isLoading } = useLogisticsPlans(weekStart);

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No events with bleachers start this week.</p>;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="logistics-plans">
      {events.map((event) => (
        <section key={event.eventId}>
          <h3 className="border-b pb-1 text-sm font-semibold">
            {event.eventName}
            <span className="font-normal text-gray-600">
              {" "}
              · {formatDateRange(event.startDate, event.startDate)} · {event.street ?? "No address"}
            </span>
          </h3>
          <ul className="mt-1 flex flex-col text-sm">
            {event.bleachers.map((bleacher) => (
              <li key={bleacher.bleacherUuid} className="flex items-center gap-2 py-1">
                {bleacher.matches ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-green-600"
                    aria-label="Has a logistics plan"
                  />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-red-600" aria-label="No logistics plan" />
                )}
                <span className="w-16 font-medium">#{bleacher.bleacherNumber}</span>
                <LastLocation bleacher={bleacher} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
