import { addDays } from "./calendarDays";

/** What the Done / Next Task modal opens with: an editable note, not a placeholder. */
export const NEXT_TASK_DEFAULT_NOTE = "Follow-up needed";
export const NEXT_TASK_DEFAULT_DAYS = 2;

/** The date the modal opens with: `today` plus two days. */
export function defaultNextTaskDate(today: string): string {
  return addDays(today, NEXT_TASK_DEFAULT_DAYS);
}
