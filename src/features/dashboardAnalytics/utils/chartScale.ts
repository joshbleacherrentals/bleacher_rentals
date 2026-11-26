// docs/specs/dashboard-analytics-05-page.md §2.6. The vertical scale of the category chart: round
// values on the grid lines, and an axis that always has room above the greatest column.

/** The steps of the axis, in dollars. */
const STEPS = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
/** The greatest column may be at most this many steps high. */
const MAX_STEPS_HIGH = 4;

/**
 * The step is the first of STEPS for which the greatest column divided by the step is at most 4
 * (the last one if none). The top of the axis is the greater of the step and the greatest column
 * rounded up to a whole number of steps. The ticks (dollars) are 0, step, 2 steps up to the top.
 */
export function chartScale(maxCents: number): { topDollars: number; ticks: number[] } {
  const maxDollars = Math.max(0, maxCents) / 100;
  const step = STEPS.find((s) => maxDollars / s <= MAX_STEPS_HIGH) ?? STEPS[STEPS.length - 1];
  const topDollars = Math.max(step, Math.ceil(maxDollars / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= topDollars; value += step) ticks.push(value);
  return { topDollars, ticks };
}

/** 0 -> "$0"; 500 -> "$500"; 2500 -> "$2.5k"; 15000 -> "$15k". */
export function formatTick(dollars: number): string {
  return dollars >= 1000 ? `$${dollars / 1000}k` : `$${dollars}`;
}
