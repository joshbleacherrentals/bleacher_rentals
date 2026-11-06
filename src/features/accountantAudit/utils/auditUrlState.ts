/** URL state of the Audit tab. docs/specs/accountant-audit-02-driver-select.md §3 (D8, R6) */
export const AUDIT_DRIVER_PARAM = "driver";

export function parseAuditDriver(searchParams: { get(key: string): string | null }): string | null {
  const value = searchParams.get(AUDIT_DRIVER_PARAM)?.trim();
  return value ? value : null;
}

/** Sets or deletes `driver`, keeps every other parameter, returns the query string. */
export function withAuditDriver(current: URLSearchParams, driverUuid: string | null): string {
  const next = new URLSearchParams(current.toString());
  if (driverUuid) next.set(AUDIT_DRIVER_PARAM, driverUuid);
  else next.delete(AUDIT_DRIVER_PARAM);
  return next.toString();
}
