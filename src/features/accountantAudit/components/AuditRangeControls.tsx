"use client";

import { DateTime } from "luxon";
import {
  AUDIT_PRESETS,
  presetOf,
  resolvePreset,
  type AuditPresetId,
  type AuditRange,
} from "../utils/auditRange";

type Props = {
  range: AuditRange;
  onChange: (range: AuditRange) => void;
  /** Tests fix the day; the page uses the browser's today. */
  today?: DateTime;
};

/** The look of `PeriodControl` of Driver Satisfaction (R1). */
const CONTROL =
  "border border-gray-300 rounded-lg px-3 py-2 bg-white text-darkBlue font-semibold text-sm";

const CUSTOM = "custom";

/**
 * The preset select and the From / To date fields. The select is not in the URL: it shows the
 * preset whose range equals the current dates, or a disabled "Custom" (R10). Choosing a preset
 * writes both dates; a date field writes its end and keeps the other; a cleared field means "no
 * limit". `max` on From and `min` on To keep the browser from making an inverted range (R9).
 * docs/specs/accountant-audit-05-drivers-table.md §2.3.
 */
export function AuditRangeControls({ range, onChange, today }: Props) {
  const now = today ?? DateTime.now();
  const preset = presetOf(range, now);

  return (
    <div data-testid="audit-range-controls" className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Period"
        value={preset ?? CUSTOM}
        onChange={(e) => {
          const id = e.target.value as AuditPresetId;
          if (AUDIT_PRESETS.some((p) => p.id === id)) onChange(resolvePreset(id, now));
        }}
        className={`${CONTROL} cursor-pointer`}
      >
        {AUDIT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        {preset === null && (
          <option value={CUSTOM} disabled>
            Custom
          </option>
        )}
      </select>
      <input
        type="date"
        aria-label="From"
        value={range.from ?? ""}
        max={range.to ?? undefined}
        onChange={(e) => onChange({ from: e.target.value || null, to: range.to })}
        className={CONTROL}
      />
      <input
        type="date"
        aria-label="To"
        value={range.to ?? ""}
        min={range.from ?? undefined}
        onChange={(e) => onChange({ from: range.from, to: e.target.value || null })}
        className={CONTROL}
      />
    </div>
  );
}
