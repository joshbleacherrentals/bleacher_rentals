import { daysBetween, localDayOf } from "./dateOnly";
import { inspectionStatus, thresholdDates } from "./inspectionStatus";

/**
 * True when this bleacher crossed a threshold the user has not looked at yet.
 *
 * The window is (lastSeenAt, today] — open at the last visit, because a
 * crossing on that day was already on screen while they were reading, and
 * closed at today, because a crossing this morning is exactly what they came
 * to see.
 *
 * A null `lastSeenAt` means they have never opened the page: everything that
 * is flagged right now is new to them.
 */
export function isNewSinceLastSeen(
  nextDueOn: string | null,
  today: string,
  lastSeenAt: string | null,
): boolean {
  if (!nextDueOn) return false;

  if (!lastSeenAt) {
    const status = inspectionStatus(nextDueOn, today);
    return status === "warning" || status === "critical" || status === "overdue";
  }

  const lastSeenDay = localDayOf(lastSeenAt);
  const { warning, critical, overdue } = thresholdDates(nextDueOn);

  return [warning, critical, overdue].some(
    (crossedOn) => daysBetween(lastSeenDay, crossedOn) > 0 && daysBetween(crossedOn, today) >= 0,
  );
}
