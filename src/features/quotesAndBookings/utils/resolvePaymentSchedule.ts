import type { PaymentInstallment } from "../types/quoteTypes";

export type ResolvedPaymentInstallment = PaymentInstallment & { amountCents: number };

function orderedRemainders<T extends { id: string; dueDate: string }>(
  rows: readonly T[],
  values: number[],
) {
  return rows
    .map((row, index) => ({ ...row, index, remainder: values[index] - Math.floor(values[index]) }))
    .sort(
      (a, b) =>
        b.remainder - a.remainder || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
}

/** Largest-remainder apportionment, with a stable tie break independent of query order. */
function apportion<T extends { id: string; dueDate: string }>(
  rows: readonly T[],
  values: number[],
  total: number,
): number[] {
  const result = values.map(Math.floor);
  const remaining = total - result.reduce((sum, value) => sum + value, 0);
  for (const row of orderedRemainders(rows, values).slice(0, remaining)) result[row.index]++;
  return result;
}

export function resolvePaymentSchedule(
  installments: readonly PaymentInstallment[],
  totalCents: number,
): ResolvedPaymentInstallment[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new Error("Quote total must be a nonnegative whole number of cents.");
  if (installments.some((i) => !Number.isSafeInteger(i.percentageBps) || i.percentageBps < 0))
    throw new Error("Invalid payment schedule percentage.");
  const values = installments.map((i) => (totalCents * i.percentageBps) / 10000);
  const balanced = installments.reduce((sum, i) => sum + i.percentageBps, 0) === 10000;
  const cents = balanced ? apportion(installments, values, totalCents) : values.map(Math.round);
  return installments.map((i, index) => ({ ...i, amountCents: cents[index] }));
}

export function validatePaymentSchedule(
  installments: readonly PaymentInstallment[],
): string | null {
  if (!installments.length) return null;
  if (
    installments.some(
      (i) =>
        !Number.isSafeInteger(i.percentageBps) || i.percentageBps < 0 || i.percentageBps > 10000,
    )
  )
    return "Percentages must be between 0 and 100 with at most two decimal places.";
  if (installments.reduce((sum, i) => sum + i.percentageBps, 0) !== 10000)
    return "Payment schedule percentages must total 100%.";
  if (
    installments.some(
      (i) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) ||
        !Number.isFinite(Date.parse(i.dueDate)) ||
        new Date(i.dueDate).toISOString().slice(0, 10) !== i.dueDate,
    )
  )
    return "All installments need a valid due date.";
  return null;
}

/** Upgrade old drafts with the same rules as the SQL backfill. Never normalize an imbalance. */
export function convertLegacySchedule(
  installments: readonly { id: string; dueDate: string; amountCents: number }[],
  totalCents: number,
): PaymentInstallment[] {
  if (!installments.length) return [];
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    installments.some((i) => !Number.isSafeInteger(i.amountCents) || i.amountCents < 0)
  )
    throw new Error(
      "This saved draft's payment schedule cannot be converted. Review its total and amounts.",
    );
  const sum = installments.reduce((s, i) => s + i.amountCents, 0);
  if (totalCents === 0 && sum !== 0)
    throw new Error(
      "This saved draft has payment amounts but no quote total. Review it before converting.",
    );
  const values = installments.map((i) =>
    totalCents ? (i.amountCents * 10000) / totalCents : Math.floor(10000 / installments.length),
  );
  const shares =
    totalCents && sum === totalCents
      ? apportion(installments, values, 10000)
      : values.map(Math.round);
  if (!totalCents) shares[shares.length - 1] += 10000 - shares.reduce((s, v) => s + v, 0);
  return installments.map(({ id, dueDate }, index) => ({
    id,
    dueDate,
    percentageBps: shares[index],
  }));
}
