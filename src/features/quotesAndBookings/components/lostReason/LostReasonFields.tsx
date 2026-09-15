"use client";

import { Dropdown } from "@/components/DropDown";
import { LOST_REASON_OPTIONS, type LostReason } from "../../utils/lostReason";

type Props = {
  reason: LostReason | null;
  note: string;
  onReasonChange: (reason: LostReason) => void;
  onNoteChange: (note: string) => void;
  /** The two screens style their labels differently; everything else is shared. */
  labelClassName?: string;
};

/**
 * The Lost Reason picker, rendered next to the Status dropdown on both screens
 * that can mark a quote lost. Render it only while the status *is* lost — it
 * says nothing useful otherwise, and the save path clears the fields anyway.
 */
export function LostReasonFields({
  reason,
  note,
  onReasonChange,
  onNoteChange,
  labelClassName = "block text-sm font-medium text-gray-700 mb-1",
}: Props) {
  return (
    <div data-testid="lost-reason-fields">
      <label className={labelClassName}>
        Lost Reason <span className="text-red-500">*</span>
      </label>
      <Dropdown
        options={LOST_REASON_OPTIONS}
        selected={reason ?? undefined}
        onSelect={onReasonChange}
        placeholder="Why was it lost?"
      />
      {reason === "other" && (
        <input
          type="text"
          value={note}
          maxLength={200}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Tell us why"
          aria-label="Lost Reason Note"
          data-testid="lost-reason-note"
          className="mt-2 w-full h-[40px] px-3 border bg-white rounded text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
        />
      )}
    </div>
  );
}
