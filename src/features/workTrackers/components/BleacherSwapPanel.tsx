"use client";

import { TriangleAlert } from "lucide-react";
import { Dropdown } from "@/components/DropDown";
import { resolveBleacherSwapState } from "@/features/workTrackers/util/bleacherSwap";

type BleacherOption = { uuid: string; label: string };

type Props = {
  assignedBleacherUuid: string | null;
  actualBleacherUuid: string | null;
  reasonCode: string | null;
  bleacherOptions: BleacherOption[];
  canEdit: boolean;
  labelClassName: string;
  onChange: (next: { actualBleacherUuid: string; reasonCode: string | null }) => void;
};

/**
 * Which bleacher the driver actually took, and the reason they gave (read-only text, so a long
 * reason wraps instead of being cut off by a dropdown).
 *
 * Renders nothing until the driver has confirmed: an empty pair of selects on a
 * tracker nobody has touched yet only raises questions the manager cannot
 * answer.
 *
 * A swap is an open problem, not a note: the dashboard still shows the assigned
 * bleacher, so the one the driver really took is unaccounted for until the manager
 * changes the assignment. The panel says so loudly, in red, until they do.
 */
export function BleacherSwapPanel({
  assignedBleacherUuid,
  actualBleacherUuid,
  reasonCode,
  bleacherOptions,
  canEdit,
  labelClassName,
  onChange,
}: Props) {
  const state = resolveBleacherSwapState({
    bleacherUuid: assignedBleacherUuid,
    actualBleacherUuid,
    bleacherChangeReason: reasonCode,
  });

  if (state.kind === "unconfirmed") return null;

  const isSwap = state.kind === "swapped";
  const labelFor = (uuid: string | null) =>
    bleacherOptions.find((option) => option.uuid === uuid)?.label ?? "another bleacher";

  return (
    <div
      className={
        isSwap ? "space-y-2 rounded-md border-2 border-red-500 bg-red-50 p-3" : "space-y-2"
      }
    >
      {isSwap && (
        <div role="alert" className="flex items-start gap-2 text-red-800">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm">
            {/* <p className="font-bold tracking-wide">Action needed</p> */}
            <p>
              <strong>Action Needed:</strong> The driver took{" "}
              <strong>{labelFor(state.actualBleacherUuid)}</strong>, not{" "}
              <strong>{labelFor(state.assignedBleacherUuid)}</strong>.
            </p>
          </div>
        </div>
      )}
      {/* min-w-0 on both halves: without it the reason label sets a min-content
      width that pushes this whole column over the Pickup Time one. */}
      <div className="flex flex-row gap-2">
        <div className="flex-1 min-w-0">
          <label className={labelClassName}>Actual Bleacher</label>
          <div data-testid="actual-bleacher-select">
            <Dropdown
              options={bleacherOptions.map((option) => ({
                label: option.label,
                value: option.uuid,
              }))}
              selected={actualBleacherUuid ?? undefined}
              onSelect={(uuid) => onChange({ actualBleacherUuid: uuid, reasonCode })}
              placeholder="Select Bleacher"
              disabled={!canEdit}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <label className={labelClassName}>Change Reason</label>
          <p data-testid="bleacher-change-reason" className="break-words text-xs text-gray-900">
            {isSwap ? state.reasonLabel : "No change"}
          </p>
        </div>
      </div>
    </div>
  );
}
