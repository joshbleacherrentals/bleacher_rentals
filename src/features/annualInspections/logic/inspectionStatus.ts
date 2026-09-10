import { addDays, daysBetween } from "./dateOnly";

export type InspectionStatus =
  | "unscheduled" // no inspection row at all
  | "ok" // more than 30 days out
  | "warning" // 30 days or fewer, more than 7
  | "critical" // 7 days or fewer, not yet past
  | "overdue"; // past next_due_on

export const WARNING_DAYS = 30;
export const CRITICAL_DAYS = 7;

/**
 * Where a bleacher stands today. `nextDueOn` and `today` are calendar days.
 *
 * The due date itself is `critical`, not `overdue` — the inspection can still
 * happen that day.
 */
export function inspectionStatus(nextDueOn: string | null, today: string): InspectionStatus {
  if (!nextDueOn) return "unscheduled";

  const daysLeft = daysBetween(today, nextDueOn);
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= CRITICAL_DAYS) return "critical";
  if (daysLeft <= WARNING_DAYS) return "warning";
  return "ok";
}

/**
 * The three days on which a bleacher changes status, oldest first.
 *
 * These are what "new since my last visit" is measured against, which is why
 * the feature needs no notification table at all: a crossing is a pure function
 * of the due date and the calendar.
 */
export function thresholdDates(nextDueOn: string): {
  warning: string;
  critical: string;
  overdue: string;
} {
  return {
    warning: addDays(nextDueOn, -WARNING_DAYS),
    critical: addDays(nextDueOn, -CRITICAL_DAYS),
    overdue: nextDueOn,
  };
}
