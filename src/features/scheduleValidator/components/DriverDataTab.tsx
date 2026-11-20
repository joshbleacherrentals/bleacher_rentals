"use client";

import { useState } from "react";
import { Check, Pencil, Undo2, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { DRIVER_REQUIREMENTS, type DriverData, type RequirementResult } from "../utils/driverData";
import { useCanFixDriverData } from "../hooks/useCanFixDriverData";
import { DriverAddressModal } from "./DriverAddressModal";
import { setDriverExcluded } from "../db/setDriverExcluded";
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

/** Leaves the driver out of the model, or adds them back; a failed save says so. */
async function toggleExcluded(driver: DriverData, excluded: boolean) {
  try {
    await setDriverExcluded(driver.driverUuid, excluded);
  } catch (e) {
    createErrorToastNoThrow([
      `Could not ${excluded ? "remove" : "add back"} ${driver.driverName}.`,
      e instanceof Error ? e.message : "",
    ]);
  }
}

/** The drivers the office left out of the model, each with a way back in. */
function ExcludedDrivers({ drivers, canFix }: { drivers: DriverData[]; canFix: boolean }) {
  return (
    <section className="mt-6" data-testid="driver-data-excluded">
      <h3 className="mb-1 text-sm font-semibold">Removed from the model ({drivers.length})</h3>
      <p className="mb-2 text-sm text-gray-500">
        Creating work trackers never gives these drivers a trip, and they do not count in the Driver
        Data check.
      </p>
      {drivers.length === 0 ? (
        <p className="text-sm text-gray-500">None. Every driver in this zone is in the model.</p>
      ) : (
        <ul className="divide-y rounded-md border border-black/15">
          {drivers.map((driver) => (
            <li
              key={driver.driverUuid}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              data-testid="driver-data-excluded-row"
            >
              <span className="font-medium text-gray-700">{driver.driverName}</span>
              {canFix && (
                <Button size="sm" variant="outline" onClick={() => toggleExcluded(driver, false)}>
                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                  Add back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A table of the selected zone's active drivers the model uses: a column per piece of data the work
 * tracker model needs from a driver (DRIVER_REQUIREMENTS), each a check or a red X with what is
 * missing, and a way to remove the driver from the model. Below it, the drivers already removed.
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

  const included = drivers.filter((d) => !d.excluded);
  const excluded = drivers.filter((d) => d.excluded);

  return (
    <div>
      {included.length === 0 ? (
        <p className="text-sm text-gray-500">
          Every driver in this zone is removed from the model.
        </p>
      ) : (
        <div
          className="grid border-t border-l border-black/15"
          style={{
            gridTemplateColumns: `200px repeat(${DRIVER_REQUIREMENTS.length}, minmax(0, 1fr))${
              canFix ? " 150px" : ""
            }`,
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
          {canFix && <div className={`h-10 bg-gray-200 ${LINES}`} />}

          {included.map((driver) => (
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
                    canFix && FIXABLE.has(r.key)
                      ? () => setEditingUuid(driver.driverUuid)
                      : undefined
                  }
                />
              ))}
              {canFix && (
                <div className={`flex min-h-12 items-center justify-center px-2 ${LINES}`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-600"
                    onClick={() => toggleExcluded(driver, true)}
                    title="Never give this driver a trip when creating work trackers"
                  >
                    <UserMinus className="mr-1 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ExcludedDrivers drivers={excluded} canFix={canFix} />

      <DriverAddressModal driver={editing} onClose={() => setEditingUuid(null)} />
    </div>
  );
}
