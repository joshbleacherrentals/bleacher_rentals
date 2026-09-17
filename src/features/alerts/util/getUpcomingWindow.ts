/** Returns the end of the upcoming window as a local YYYY-MM-DD string (next Sunday). */
export function getUpcomingWindowEnd(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const daysToAdd = day === 0 ? 7 : 14 - day;
  const end = new Date(now);
  end.setDate(end.getDate() + daysToAdd);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Same window as `getUpcomingWindowEnd`, expressed as an instant so it can be
 * compared against timestamp columns (`Events.event_start`) the way
 * `todayStart()` is. The date-shaped string cannot: `"2026-09-27T20:00:00Z"`
 * sorts after `"2026-09-27"`, so every event on the closing day would be
 * dropped from the window.
 */
export function upcomingWindowEndInstant(): string {
  const [year, month, day] = getUpcomingWindowEnd().split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}
