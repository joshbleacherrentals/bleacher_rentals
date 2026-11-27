import { formatDate } from "./formatDate";

/**
 * How staff screens write an installment's due date. The first installment is due on signing: it
 * has no date until the event is first booked, so an empty date reads "On signing". Every
 * installment of a saved quote has a date or is that one, so an empty date means nothing else.
 * See docs/specs/payment-first-installment-on-signing.md.
 */

export function formatInstallmentDue(dueDate: string | null): string {
  return dueDate ? formatDate(dueDate) : "On signing";
}

/** "due Nov 26, 2026" or "due on signing", for the middle of a sentence. */
export function installmentDueWords(dueDate: string | null): string {
  return dueDate ? `due ${formatDate(dueDate)}` : "due on signing";
}

/** "Due Nov 26, 2026" or "Due on signing". */
export function installmentDueLabel(dueDate: string | null): string {
  const words = installmentDueWords(dueDate);
  return words.charAt(0).toUpperCase() + words.slice(1);
}
