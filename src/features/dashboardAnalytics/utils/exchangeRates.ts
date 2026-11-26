// docs/specs/dashboard-analytics-03-converter.md §2.2 and §2.3. Pure functions: the rate of a day,
// the conversion of cents and the one range of days to ask the API for. No network, no storage.

/** "YYYY-MM-DD" -> USD for 1 CAD. */
export type DayRates = Record<string, number>;

export type RatesRequest = { from: string; to: string };

/** What the browser remembers. `askedFrom` is the first day any past request started from. */
export type RateMemory = { askedFrom: string; rates: DayRates };

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day written as YYYY-MM-DD. Days compare correctly as text. */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_FORMAT.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** True for a rate the page may use: a finite number above 0. */
export function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * The rate of a day (D6, D9): the rate of the latest known day that is not after it, or `null`
 * when every known day is later. A day after the newest known day gets the newest rate.
 */
export function makeRateLookup(rates: DayRates): (day: string) => number | null {
  const days = Object.keys(rates).sort();
  return (day) => {
    let low = 0;
    let high = days.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (days[middle] <= day) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found === -1 ? null : rates[days[found]];
  };
}

/**
 * Cents of CAD to cents of USD, to the nearest cent, a half going away from zero (D35).
 * The caller guarantees finite numbers.
 */
export function convertCents(cents: number, rate: number): number {
  const converted = Math.sign(cents) * Math.round(Math.abs(cents) * rate);
  return converted === 0 ? 0 : converted; // never minus zero
}

function dayAfter(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The one range to ask for, or `null` (D33). `oldestCadDay` is the Repair from day of the oldest
 * live CAD repair of all time; `today` is the day in the app time zone.
 */
export function planRatesRequest(params: {
  memory: RateMemory | null;
  oldestCadDay: string | null;
  today: string;
}): RatesRequest | null {
  const { memory, oldestCadDay, today } = params;

  // 1. Nothing to convert, nothing to ask.
  if (oldestCadDay === null) return null;

  // 2. No rate in memory, or the memory does not reach back far enough: the whole range. A CAD
  //    repair dated in the future starts the range at today, never after it.
  const knownDays = memory ? Object.keys(memory.rates) : [];
  if (!memory || knownDays.length === 0 || oldestCadDay < memory.askedFrom) {
    return { from: oldestCadDay < today ? oldestCadDay : today, to: today };
  }

  // 3. Otherwise only the days after the newest one the memory has.
  const newest = knownDays.reduce((latest, day) => (day > latest ? day : latest));
  if (newest >= today) return null;
  return { from: dayAfter(newest), to: today };
}
