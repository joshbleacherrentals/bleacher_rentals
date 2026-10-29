import { daysBetween } from "./calendarDays";

/**
 * The wording of the Collections list for dates and days.
 * docs/specs/accountant-collections-07-collections-list.md §1.
 *
 * Months are 30 days: 1 to 29 days read in days, 30 to 59 read `Month`, and from 60 days
 * `floor(days / 30) Months`.
 */

const DAYS_PER_MONTH = 30;

/** `3 days`, `Month`, `3 Months`: the span without its direction. */
function span(days: number): string {
  if (days < DAYS_PER_MONTH) return days === 1 ? "1 day" : `${days} days`;
  const months = Math.floor(days / DAYS_PER_MONTH);
  return months === 1 ? "Month" : `${months} Months`;
}

/** The Next Follow Up column: where the task's date lies against today. Both are `YYYY-MM-DD`. */
export function followUpLabel(dueDate: string, today: string): string {
  const offset = daysBetween(today, dueDate);
  if (offset === 0) return "Due Today";
  if (offset === 1) return "Due tomorrow";
  return offset < 0 ? `${span(-offset)} ago` : `${span(offset)} after`;
}

/** The Payment Overdue column. No figure (a null, or an Amount Due of 0) is a dash. */
export function overdueLabel(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "Due today";
  return span(days);
}
