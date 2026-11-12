import { DateTime } from "luxon";

/**
 * The date range of the Audit tab and how it lives in the URL.
 * docs/specs/accountant-audit-05-drivers-table.md §2.1 (D3, D4, D6, D12, D14, R7-R10).
 */
export const AUDIT_FROM_PARAM = "from";
export const AUDIT_TO_PARAM = "to";
/** Dropped with every range write: a new range starts the driver page at page 1 (R11). */
const AUDIT_PAGE_PARAM = "apage";

const ISO = "yyyy-MM-dd";

/** `YYYY-MM-DD`, both ends included; `null` = no limit at that end. */
export type AuditRange = { from: string | null; to: string | null };

export type AuditPresetId =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "all_time";

/** D3: the calendar set, in the order of the select. */
export const AUDIT_PRESETS: readonly { id: AuditPresetId; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_quarter", label: "Last quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
  { id: "all_time", label: "All time" },
];

const span = (start: DateTime, end: DateTime): AuditRange => ({
  from: start.toFormat(ISO),
  to: end.toFormat(ISO),
});

/**
 * R7: a week runs Monday to Sunday (luxon's week, the same as on /work-trackers), a quarter is a
 * calendar quarter, and "Last ..." is the whole previous period. D14: the current periods end on
 * their last day, not on today.
 */
export function resolvePreset(id: AuditPresetId, today: DateTime): AuditRange {
  switch (id) {
    case "this_week":
      return span(today.startOf("week"), today.endOf("week"));
    case "last_week": {
      const d = today.minus({ weeks: 1 });
      return span(d.startOf("week"), d.endOf("week"));
    }
    case "this_month":
      return span(today.startOf("month"), today.endOf("month"));
    case "last_month": {
      const d = today.minus({ months: 1 });
      return span(d.startOf("month"), d.endOf("month"));
    }
    case "this_quarter":
      return span(today.startOf("quarter"), today.endOf("quarter"));
    case "last_quarter": {
      const d = today.minus({ quarters: 1 });
      return span(d.startOf("quarter"), d.endOf("quarter"));
    }
    case "this_year":
      return span(today.startOf("year"), today.endOf("year"));
    case "last_year": {
      const d = today.minus({ years: 1 });
      return span(d.startOf("year"), d.endOf("year"));
    }
    case "all_time":
      return { from: null, to: null };
  }
}

/** D4: what a URL with no dates opens on. */
export function openingRange(today: DateTime): AuditRange {
  return resolvePreset("this_month", today);
}

/** R10: the preset whose range, computed from today, equals the range; the first one wins. */
export function presetOf(range: AuditRange, today: DateTime): AuditPresetId | null {
  for (const { id } of AUDIT_PRESETS) {
    const candidate = resolvePreset(id, today);
    if (candidate.from === range.from && candidate.to === range.to) return id;
  }
  return null;
}

/** A real calendar date written `YYYY-MM-DD` (2026-02-30 is not). */
export function isRealIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromFormat(value, ISO).isValid;
}

/** R9: From after To. The dates are `YYYY-MM-DD`, so a text comparison is a date comparison. */
export function isRangeInverted(range: AuditRange): boolean {
  return range.from !== null && range.to !== null && range.from > range.to;
}

function readEnd(raw: string | null): string | null {
  return raw !== null && isRealIsoDate(raw) ? raw : null;
}

/**
 * R8, D12: `hasRangeParams` is true when at least one of `from` and `to` is in the URL, even
 * empty. An absent, empty or not-a-date end means "no limit".
 */
export function parseAuditRange(searchParams: { get(key: string): string | null }): {
  range: AuditRange;
  hasRangeParams: boolean;
} {
  const from = searchParams.get(AUDIT_FROM_PARAM);
  const to = searchParams.get(AUDIT_TO_PARAM);
  return {
    range: { from: readEnd(from), to: readEnd(to) },
    hasRangeParams: from !== null || to !== null,
  };
}

/** Writes both parameters (an empty string for a null end), drops `apage`, keeps the rest. */
export function withAuditRange(current: URLSearchParams, range: AuditRange): string {
  const next = new URLSearchParams(current.toString());
  next.set(AUDIT_FROM_PARAM, range.from ?? "");
  next.set(AUDIT_TO_PARAM, range.to ?? "");
  next.delete(AUDIT_PAGE_PARAM);
  return next.toString();
}
