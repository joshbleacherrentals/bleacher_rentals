export type ValidateNextTaskInput = {
  /** `YYYY-MM-DD`. */
  dueDate: string;
  note: string;
  /** `YYYY-MM-DD`, the date in the timezone store (`useToday`). */
  today: string;
};

export type ValidateNextTaskResult = { ok: true } | { ok: false; errors: string[] };

const NOTE_REQUIRED = "Write a note for the next task.";
const DATE_REQUIRED = "Choose a date.";
const DATE_IN_PAST = "The date cannot be in the past.";

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Checks the Done / Next Task form. "Today or later" is enforced here and nowhere else: the
 * database accepts any date.
 */
export function validateNextTask({
  dueDate,
  note,
  today,
}: ValidateNextTaskInput): ValidateNextTaskResult {
  const errors: string[] = [];
  if (note.trim() === "") errors.push(NOTE_REQUIRED);
  if (!isRealDate(dueDate)) errors.push(DATE_REQUIRED);
  // Both are `YYYY-MM-DD`, so comparing the strings compares the days.
  else if (dueDate < today) errors.push(DATE_IN_PAST);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
