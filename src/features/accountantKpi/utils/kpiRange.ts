import { isRealIsoDate, type AuditRange } from "@/features/accountantAudit/utils/auditRange";

/**
 * The KPI tab's date range and how it lives in the URL: its own `kfrom` and `kto`, so the Audit
 * tab's `from` and `to` are neither read nor written. The controls, the presets and the rules for
 * an empty or unreal value are the Audit tab's (accountantAudit/utils/auditRange.ts); only the
 * parameter names differ, and there is no `apage` to drop here.
 * docs/specs/accountant-kpi.md §2.1, §2.4 (D12, D13).
 */
export const KPI_FROM_PARAM = "kfrom";
export const KPI_TO_PARAM = "kto";

function readEnd(raw: string | null): string | null {
  return raw !== null && isRealIsoDate(raw) ? raw : null;
}

/**
 * `hasRangeParams` is true when at least one of `kfrom` and `kto` is in the URL, even empty. An
 * absent, empty or not-a-date end means "no limit".
 */
export function parseKpiRange(searchParams: { get(key: string): string | null }): {
  range: AuditRange;
  hasRangeParams: boolean;
} {
  const from = searchParams.get(KPI_FROM_PARAM);
  const to = searchParams.get(KPI_TO_PARAM);
  return {
    range: { from: readEnd(from), to: readEnd(to) },
    hasRangeParams: from !== null || to !== null,
  };
}

/** Writes both parameters (an empty string for a null end) and keeps every other parameter. */
export function withKpiRange(current: URLSearchParams, range: AuditRange): string {
  const next = new URLSearchParams(current.toString());
  next.set(KPI_FROM_PARAM, range.from ?? "");
  next.set(KPI_TO_PARAM, range.to ?? "");
  return next.toString();
}
