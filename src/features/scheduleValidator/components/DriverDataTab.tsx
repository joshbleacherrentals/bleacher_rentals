"use client";

import { useState } from "react";
import { Undo2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { DRIVER_REQUIREMENTS, type DriverData } from "../utils/driverData";
import { Mark, RequirementCell } from "./RequirementCell";
import { useCanFixZoneData } from "../hooks/useCanFixZoneData";
import { AddressFixModal } from "./AddressFixModal";
import { DriverLinksMenu } from "./DriverLinksMenu";
import { DriverNameWithKind } from "./DriverNameWithKind";
import { useDriverKinds } from "../hooks/useDriverKinds";
import type { DriverKind } from "../utils/driverKind";
import { useDriverUserUuids } from "../hooks/useDriverUserUuids";
import { setDriverExcluded } from "../db/setDriverExcluded";
import { GRID_LINES as LINES } from "./DriverWeekGrid";

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
function ExcludedDrivers({
  drivers,
  canFix,
  userUuids,
  kinds,
  weekStart,
}: {
  drivers: DriverData[];
  canFix: boolean;
  userUuids: Map<string, string>;
  kinds: Map<string, DriverKind>;
  weekStart: string;
}) {
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
              <span className="flex flex-1 items-center gap-2 font-medium text-gray-700">
                <DriverNameWithKind name={driver.driverName} kind={kinds.get(driver.driverUuid)} />
                <DriverLinksMenu
                  userUuid={userUuids.get(driver.driverUuid)}
                  weekStart={weekStart}
                  driverName={driver.driverName}
                />
              </span>
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
  const { zoneId, weekStart } = useZoneWeekParams();
  const { drivers, isLoading } = useChecks().driverData;
  const userUuids = useDriverUserUuids(zoneId);
  const kinds = useDriverKinds(zoneId);
  const canFix = useCanFixZoneData(zoneId);
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
                <DriverNameWithKind name={driver.driverName} kind={kinds.get(driver.driverUuid)} />
                <DriverLinksMenu
                  userUuid={userUuids.get(driver.driverUuid)}
                  weekStart={weekStart}
                  driverName={driver.driverName}
                />
              </div>
              {DRIVER_REQUIREMENTS.map((r) => (
                <RequirementCell
                  key={r.key}
                  result={driver.results[r.key]}
                  testId="driver-data-cell"
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

      <ExcludedDrivers
        drivers={excluded}
        canFix={canFix}
        userUuids={userUuids}
        kinds={kinds}
        weekStart={weekStart}
      />

      <AddressFixModal
        target={
          editing && {
            owner: { table: "Drivers", id: editing.driverUuid },
            title: `${editing.driverName}: home address`,
            addressUuid: editing.addressUuid,
            address: editing.address,
            problem: editing.results.address?.problem ?? null,
          }
        }
        onClose={() => setEditingUuid(null)}
      />
    </div>
  );
}
