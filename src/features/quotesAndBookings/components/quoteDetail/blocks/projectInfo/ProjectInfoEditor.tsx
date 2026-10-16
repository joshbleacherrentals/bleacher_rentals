"use client";

import { Dropdown } from "@/components/DropDown";
import { useEventTypes } from "../../../../hooks/useEventTypes";
import { LostReasonFields } from "../../../lostReason/LostReasonFields";
import type { QuoteStatus } from "../../../../types/quoteTypes";
import type { ProjectInfoValue } from "./projectInfoValue";

const STATUS_OPTIONS: { label: string; value: QuoteStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Quoted", value: "quoted" },
  { label: "Booked", value: "booked" },
  { label: "Lost", value: "lost" },
];

const LABEL = "block text-sm font-medium text-gray-700 mb-1";
const INPUT = "w-full h-[40px] px-3 border rounded text-sm";

export function ProjectInfoEditor({
  draft,
  onChange,
  eventStart,
}: {
  draft: ProjectInfoValue;
  onChange: (next: ProjectInfoValue) => void;
  eventStart: string | null;
}) {
  const { eventTypes } = useEventTypes();
  const eventTypeOptions = eventTypes.map((t) => ({ label: t.name, value: t.id }));
  const set = <K extends keyof ProjectInfoValue>(key: K, value: ProjectInfoValue[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className={LABEL}>Event Name</label>
        <input
          type="text"
          value={draft.eventName}
          onChange={(e) => set("eventName", e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label className={LABEL}>Event Type</label>
        <Dropdown
          options={eventTypeOptions}
          selected={draft.eventTypeId}
          onSelect={(id) => set("eventTypeId", id)}
          placeholder="Select event type"
        />
      </div>
      <div>
        <label className={LABEL}>Status</label>
        <Dropdown
          options={STATUS_OPTIONS}
          selected={draft.status}
          onSelect={(status) => set("status", status)}
        />
      </div>
      <div>
        <label className={LABEL}>Quote Valid Till</label>
        <input
          type="date"
          value={draft.quoteValidTill}
          max={eventStart || undefined}
          onChange={(e) => set("quoteValidTill", e.target.value)}
          className={INPUT}
        />
      </div>
      {draft.status === "lost" && (
        <LostReasonFields
          reason={draft.lostReason}
          note={draft.lostReasonNote}
          onReasonChange={(reason) => set("lostReason", reason)}
          onNoteChange={(note) => set("lostReasonNote", note)}
        />
      )}
    </div>
  );
}
