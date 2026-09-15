/**
 * Local-day boundaries as instants.
 *
 * Alert evaluation compares `DateTime.fromISO(event_start).toISODate()` — a
 * *local* date — against a date-shaped `targetDate`. `Events.event_start` is a
 * timestamp column, so pushing that comparison into SQL needs the boundary as an
 * instant, the same lesson as `upcomingWindowEndInstant`: a date-shaped string
 * cannot be compared against a timestamp without silently dropping rows.
 *
 * The argument may itself be a timestamp — `bleacherTransportation` passes
 * `event_start` as the target date, and the existing JS comparison works on
 * string ordering, which makes same-day rows inclusive. Taking the date part
 * preserves that exactly.
 */
function datePart(dateOrTimestamp: string): [number, number, number] {
  const [year, month, day] = dateOrTimestamp.slice(0, 10).split("-").map(Number);
  return [year, month, day];
}

/** Local 00:00:00.000 of the given day, as an ISO instant. */
export function localDayStartInstant(dateOrTimestamp: string): string {
  const [year, month, day] = datePart(dateOrTimestamp);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** Local 23:59:59.999 of the given day, as an ISO instant. */
export function localDayEndInstant(dateOrTimestamp: string): string {
  const [year, month, day] = datePart(dateOrTimestamp);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}
