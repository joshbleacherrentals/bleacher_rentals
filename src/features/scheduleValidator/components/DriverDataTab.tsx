"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { DRIVER_REQUIREMENTS, type DriverData, type RequirementResult } from "../utils/driverData";
import { useCanFixDriverData } from "../hooks/useCanFixDriverData";
import { DriverAddressModal } from "./DriverAddressModal";
import { GRID_LINES as LINES } from "./DriverWeekGrid";

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Check className="h-4 w-4 shrink-0 text-green-600" aria-label={label} />
  ) : (
    <X className="h-4 w-4 shrink-0 text-red-600" aria-label={label} />
  );
}

function RequirementCell({
  result,
  onFix,
}: {
  result: RequirementResult;
  /** Opens the fix for this requirement; absent when it has none or the user may not fix it. */
  onFix?: () => void;
}) {
  const className = `flex min-h-12 w-full items-center gap-2 px-2 text-left text-sm ${LINES} ${
    result.ok ? "" : "bg-red-50 text-red-700"
  }`;
  const content = (
    <>
      <Mark ok={result.ok} label={result.ok ? "Complete" : "Incomplete"} />
      {result.problem && <span>{result.problem}</span>}
      {onFix && <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />}
    </>
  );
  return onFix ? (
    <button
      type="button"
      className={`${className} cursor-pointer ${result.ok ? "hover:bg-gray-50" : "hover:bg-red-100"}`}
      onClick={onFix}
      data-testid="driver-data-cell"
      data-ok={result.ok}
    >
      {content}
    </button>
  ) : (
    <div className={className} data-testid="driver-data-cell" data-ok={result.ok}>
      {content}
    </div>
  );
}

/** The requirements with a fix on this page, by key. */
const FIXABLE = new Set(["address"]);

/**
 * A table of the selected zone's active drivers: a column per piece of data the work tracker model
 * needs from a driver (DRIVER_REQUIREMENTS), each a check or a red X with what is missing.
 */
export function DriverDataTab() {
  const { zoneId } = useZoneWeekParams();
  const { drivers, isLoading } = useChecks().driverData;
  const canFix = useCanFixDriverData(zoneId);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const editing: DriverData | null = drivers.find((d) => d.driverUuid === editingUuid) ?? null;

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its drivers.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (drivers.length === 0) {
    return <p className="text-sm text-gray-500">No active drivers are linked to this zone.</p>;
  }

  return (
    <div
      className="grid border-t border-l border-black/15"
      style={{
        gridTemplateColumns: `200px repeat(${DRIVER_REQUIREMENTS.length}, minmax(0, 1fr))`,
      }}
      data-testid="driver-data"
    >
      <div className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${LINES}`}>
        Driver
      </div>
      {DRIVER_REQUIREMENTS.map((r) => (
        <div
          key={r.key}
          className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${LINES}`}
          title={r.why}
        >
          {r.label}
        </div>
      ))}

      {drivers.map((driver) => (
        <div key={driver.driverUuid} className="contents" data-testid="driver-data-row">
          <div className={`flex min-h-12 items-center gap-2 px-2 text-sm font-medium ${LINES}`}>
            <Mark ok={driver.ok} label={driver.ok ? "Ready" : "Missing data"} />
            {driver.driverName}
          </div>
          {DRIVER_REQUIREMENTS.map((r) => (
            <RequirementCell
              key={r.key}
              result={driver.results[r.key]}
              onFix={
                canFix && FIXABLE.has(r.key) ? () => setEditingUuid(driver.driverUuid) : undefined
              }
            />
          ))}
        </div>
      ))}

      <DriverAddressModal driver={editing} onClose={() => setEditingUuid(null)} />
    </div>
  );
}
