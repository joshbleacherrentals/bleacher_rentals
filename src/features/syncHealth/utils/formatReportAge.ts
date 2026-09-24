const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5m ago", "2h ago", "9d ago" — how long since the phone last reported. */
export function formatReportAge(reportedAt: string, now: Date): string {
  const at = Date.parse(reportedAt);
  if (Number.isNaN(at)) return "—";
  const elapsed = now.getTime() - at;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
