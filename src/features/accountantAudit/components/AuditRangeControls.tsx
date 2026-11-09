"use client";

import { DateTime } from "luxon";
import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
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

/**
 * One height (40px, as the search box), one border and one focus ring for every control of the
 * row, so the select and the two dates read as a single toolbar instead of three native widgets.
 */
const CONTROL =
  "h-10 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-400";
const FOCUS = "focus:border-darkBlue focus:outline-none focus:ring-1 focus:ring-darkBlue";
const DATE_LABEL = "text-xs font-medium uppercase tracking-wide text-gray-500";
const DATE_INPUT = "bg-transparent text-sm font-medium text-gray-700 focus:outline-none";

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
      <div className="relative">
        <CalendarDays
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        />
        <select
          aria-label="Period"
          value={preset ?? CUSTOM}
          onChange={(e) => {
            const id = e.target.value as AuditPresetId;
            if (AUDIT_PRESETS.some((p) => p.id === id)) onChange(resolvePreset(id, now));
          }}
          className={`${CONTROL} ${FOCUS} cursor-pointer appearance-none pl-9 pr-9`}
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
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        />
      </div>
      <div
        className={`${CONTROL} inline-flex items-center gap-2 px-3 focus-within:border-darkBlue focus-within:ring-1 focus-within:ring-darkBlue`}
      >
        <span aria-hidden="true" className={DATE_LABEL}>
          From
        </span>
        <input
          type="date"
          aria-label="From"
          value={range.from ?? ""}
          max={range.to ?? undefined}
          onChange={(e) => onChange({ from: e.target.value || null, to: range.to })}
          className={DATE_INPUT}
        />
        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
        <span aria-hidden="true" className={DATE_LABEL}>
          To
        </span>
        <input
          type="date"
          aria-label="To"
          value={range.to ?? ""}
          min={range.from ?? undefined}
          onChange={(e) => onChange({ from: range.from, to: e.target.value || null })}
          className={DATE_INPUT}
        />
      </div>
    </div>
  );
}
