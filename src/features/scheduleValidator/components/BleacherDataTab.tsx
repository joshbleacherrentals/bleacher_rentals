"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { formatAddressLine } from "@/components/AddressAutoComplete";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import type { BleacherMove } from "../utils/bleacherMoves";
import { useCanFixZoneData } from "../hooks/useCanFixZoneData";
import { AddressFixModal, type AddressFixTarget } from "./AddressFixModal";
import { Mark, RequirementCell } from "./RequirementCell";
import { GRID_LINES as LINES } from "./DriverWeekGrid";

type End = BleacherMove["pickup"];
type Editing = { move: BleacherMove; side: "pickup" | "dropoff" };

const day = (date: string) => DateTime.fromISO(date).toFormat("EEE, MMM d");

/** The day of a work tracker, or the window a needed trip can happen in. */
function when(move: BleacherMove): string {
  if (move.date) return day(move.date);
  if (move.window) return `${day(move.window.from)} – ${day(move.window.to)}`;
  return "—";
}

function addressLine(end: End): string {
  if (!end.address) return end.street || "No address";
  return (
    formatAddressLine({
      street: end.address.street,
      city: end.address.city,
      state: end.address.state_province,
      postalCode: end.address.zip_postal,
    }) ||
    end.street ||
    "No address"
  );
}

/**
 * An end can be fixed when it has an address row (it is overwritten in place, fixing everywhere it
 * is used) or, with none, when it is an event's place (a new row is linked to the event).
 */
function fixTarget(end: End, title: string): AddressFixTarget | null {
  if (!end.addressUuid && !end.eventUuid) return null;
  return {
    owner: { table: "Events", id: end.eventUuid ?? "" },
    title,
    addressUuid: end.addressUuid,
    address: end.address,
    problem: end.result.problem,
  };
}

/**
 * Every move of the zone's bleachers that touches the week: the trips still needed (what Create work
 * trackers would plan) and the work trackers already dated in it. Each shows where the bleacher is
 * picked up and dropped off, with a check or a red X on each address; clicking one fixes it, as on
 * Driver Data.
 */
export function BleacherDataTab() {
  const { zoneId } = useZoneWeekParams();
  const { moves, eventNames, isLoading } = useChecks().bleacherData;
  const canFix = useCanFixZoneData(zoneId);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its bleachers.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (moves.length === 0) {
    return (
      <p className="text-sm text-gray-500">No bleacher in this zone moves or needs to this week.</p>
    );
  }

  const name = (eventUuid: string | null) => (eventUuid ? eventNames.get(eventUuid) : undefined);
  const titleFor = (move: BleacherMove, side: "pickup" | "dropoff") => {
    const end = move[side];
    const what = side === "pickup" ? "pickup" : "drop-off";
    return `Bleacher #${move.bleacherNumber ?? "?"} ${what}${name(end.eventUuid) ? `: ${name(end.eventUuid)}` : ""}`;
  };
  const editingTarget = editing
    ? fixTarget(editing.move[editing.side], titleFor(editing.move, editing.side))
    : null;

  const endCell = (move: BleacherMove, side: "pickup" | "dropoff") => {
    const end = move[side];
    const event = name(end.eventUuid);
    const canEdit = canFix && fixTarget(end, "") !== null;
    return (
      <RequirementCell
        result={end.result}
        testId={`bleacher-data-${side}`}
        label={event ? `${event} · ${addressLine(end)}` : addressLine(end)}
        onFix={canEdit ? () => setEditing({ move, side }) : undefined}
      />
    );
  };

  return (
    <div>
      <div
        className="grid border-t border-l border-black/15"
        style={{ gridTemplateColumns: "110px 190px 150px minmax(0, 1fr) minmax(0, 1fr)" }}
        data-testid="bleacher-data"
      >
        {["Bleacher", "When", "Move", "Pickup", "Drop-off"].map((heading) => (
          <div
            key={heading}
            className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${LINES}`}
          >
            {heading}
          </div>
        ))}

        {moves.map((move) => (
          <div key={move.key} className="contents" data-testid="bleacher-data-row">
            <div className={`flex min-h-12 items-center gap-2 px-2 text-sm font-medium ${LINES}`}>
              <Mark ok={move.ok} label={move.ok ? "Ready" : "Missing data"} />#
              {move.bleacherNumber ?? "?"}
            </div>
            <div className={`flex min-h-12 items-center px-2 text-sm text-gray-600 ${LINES}`}>
              {when(move)}
            </div>
            <div className={`flex min-h-12 items-center px-2 text-sm text-gray-600 ${LINES}`}>
              {move.source === "needed"
                ? "Trip needed"
                : `Work tracker${move.status ? ` (${move.status})` : ""}`}
            </div>
            {endCell(move, "pickup")}
            {endCell(move, "dropoff")}
          </div>
        ))}
      </div>

      <AddressFixModal target={editingTarget} onClose={() => setEditing(null)} />
    </div>
  );
}
