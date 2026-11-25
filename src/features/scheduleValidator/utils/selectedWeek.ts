import { DateTime } from "luxon";
import { currentWeekStart, weekStartOf } from "@/features/autoWorkTrackers/utils/week";

/**
 * The Monday of the week named by the `week` address parameter. Any day in a week names that week;
 * a missing or unreadable value means the current week.
 */
export function parseWeekParam(value: string | null | undefined): string {
  if (!value || !DateTime.fromISO(value, { zone: "utc" }).isValid) return currentWeekStart();
  return weekStartOf(value);
}
