export type ScheduleBalance =
  | { status: "empty" }
  | { status: "balanced" }
  | { status: "short"; diffCents: number }
  | { status: "over"; diffCents: number };

/**
 * How a quote's payment schedule compares with the quote total — the one thing a manager has to
 * check after changing line items, since the schedule does not follow the total on its own.
 * `diffCents` is always positive; `status` says which way it goes.
 */
export function scheduleBalance(
  installments: readonly { amountCents: number }[],
  totalCents: number,
): ScheduleBalance {
  if (installments.length === 0) return { status: "empty" };
  const scheduledCents = installments.reduce((sum, i) => sum + i.amountCents, 0);
  const diff = scheduledCents - totalCents;
  if (diff === 0) return { status: "balanced" };
  return diff < 0 ? { status: "short", diffCents: -diff } : { status: "over", diffCents: diff };
}

/** Share of the total one installment covers, rounded to a whole percent. 0 when there is no total. */
export function installmentPercent(amountCents: number, totalCents: number): number {
  return totalCents > 0 ? Math.round((amountCents / totalCents) * 100) : 0;
}
