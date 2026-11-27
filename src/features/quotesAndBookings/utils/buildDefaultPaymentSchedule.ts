import { PaymentInstallment } from "../types/quoteTypes";

/** Today's date as YYYY-MM-DD (UTC, matching how installment dates are stored). */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Add (or subtract) whole days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Builds the default payment schedule for a quote:
 *   - 50% due on signing: the first row has no date until the event is first booked, when the
 *     database writes that day onto it (nobody sets it by hand).
 *   - remaining 50% due 7 days before `eventStart`.
 *
 * Edge cases:
 *   - If the event is less than 7 days out (or in the past), the second
 *     installment is clamped to `today`.
 *   - If `eventStart` is not set yet, the second installment also defaults
 *     to `today`.
 *
 * Percentages stay fixed as the quote total changes.
 */
export function buildDefaultPaymentSchedule(
  eventStart: string | null | undefined,
  today: string = todayISO(),
  idFn: () => string = () => crypto.randomUUID(),
): PaymentInstallment[] {
  let secondDate = today;
  if (eventStart) {
    const sevenDaysBefore = addDaysISO(eventStart, -7);
    secondDate = sevenDaysBefore < today ? today : sevenDaysBefore;
  }

  return [
    { id: idFn(), dueDate: "", percentageBps: 5000, dueOnSigning: true },
    { id: idFn(), dueDate: secondDate, percentageBps: 5000, dueOnSigning: false },
  ];
}
