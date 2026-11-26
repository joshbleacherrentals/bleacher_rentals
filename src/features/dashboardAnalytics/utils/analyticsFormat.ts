// docs/specs/dashboard-analytics-05-page.md §3. How the page writes money and percents: all USD, a
// "$" sign, cents in the cards and tables, whole dollars in captions and chart labels.

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 123456 -> "$1,234.56"; -494600 -> "-$4,946.00". A minus goes before the dollar sign. */
export function formatUsd(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${group(dollars)}.${rest}`;
}

/** 123456 -> "$1,235": rounded to a whole dollar, a half rounds up. */
export function formatUsdWhole(cents: number): string {
  const dollars = Math.floor((Math.abs(Math.round(cents)) + 50) / 100);
  return `${cents < 0 ? "-" : ""}$${group(dollars)}`;
}

/** 0.195 -> "19.5%"; 1.145 -> "114.5%"; 0 -> "0.0%". One decimal. */
export function formatPercent(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`;
}
