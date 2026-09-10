/**
 * The date the form suggests once an inspection is recorded: one year on.
 *
 * A convenience only — the field stays editable, and typing the date by hand is
 * the primary way it gets set (spec §2). A leap day clamps to the 28th rather
 * than sliding into March.
 */
export function nextDueFromInspected(inspectedOn: string | null): string | null {
  if (!inspectedOn) return null;

  const [year, month, day] = inspectedOn.split("-").map(Number);
  const nextYear = year + 1;
  const daysInMonth = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInMonth);

  return `${nextYear}-${`${month}`.padStart(2, "0")}-${`${clampedDay}`.padStart(2, "0")}`;
}
