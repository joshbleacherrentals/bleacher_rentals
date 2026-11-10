import type { Currency } from "../types/quoteTypes";
import { currencySymbol } from "./formatMoney";

/**
 * An event is priced in the currency of the sales office that sells it — the
 * office's QuickBooks currency, with its province as a fallback
 * (`resolveOfficeCurrency`). This is the one rule; the line items, the payment
 * installments and the Stripe charge all follow from it.
 *
 * USD is the fallback for an event with no office, and for the moment before
 * the office currencies have loaded — the same default every screen used before.
 */
export function pickEventCurrency(
  salesOfficeUuid: string | null | undefined,
  currencyByOfficeId: ReadonlyMap<string, Currency>,
): Currency {
  return (salesOfficeUuid ? currencyByOfficeId.get(salesOfficeUuid) : undefined) ?? "USD";
}

export type CurrencyTotal = { currency: Currency; cents: number };

/** USD before CAD, so a column header does not reshuffle as rows are filtered. */
const ORDER: Currency[] = ["USD", "CAD"];

/**
 * Money in two currencies does not add up. A list showing both offices gets one
 * total per currency rather than a single number that is true of neither.
 */
export function sumByCurrency<T>(
  rows: readonly T[] | null | undefined,
  centsOf: (row: T) => number,
  currencyOf: (row: T) => Currency,
): CurrencyTotal[] {
  const totals = new Map<Currency, number>();
  for (const row of rows ?? []) {
    const currency = currencyOf(row);
    totals.set(currency, (totals.get(currency) ?? 0) + centsOf(row));
  }
  if (totals.size === 0) return [{ currency: "USD", cents: 0 }];
  return ORDER.filter((c) => totals.has(c)).map((c) => ({ currency: c, cents: totals.get(c)! }));
}

/** `$120,000 + C$45,000` — the amounts of a header total, whole dollars, one per currency. */
export function formatTotalsAmounts(totals: readonly CurrencyTotal[]): string {
  return totals
    .map((t) => `${currencySymbol(t.currency)}${Math.round(t.cents / 100).toLocaleString("en-US")}`)
    .join(" + ");
}

/** `Subtotal ($120,000 + C$45,000)` — whole dollars, as the header always showed. */
export function formatTotalsLabel(label: string, totals: readonly CurrencyTotal[]): string {
  return `${label} (${formatTotalsAmounts(totals)})`;
}
