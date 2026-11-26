import { isDay, isValidRate, type DayRates, type RateMemory } from "./exchangeRates";

// docs/specs/dashboard-analytics-03-converter.md §2.5 (D32). The days the browser has received, in
// localStorage. It holds only days and numbers. The storage is passed in, so a test never touches
// a real one.

export const RATE_MEMORY_KEY = "dashboard-analytics:cad-usd-rates:v1";

const VERSION = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The memory, or `null` when the key is missing, the text is not JSON, the version is not 1,
 * `askedFrom` is not a day, or any entry is not a day with a good rate. A memory that fails is
 * ignored, not deleted: the next successful write replaces it.
 */
export function readRateMemory(storage: Pick<Storage, "getItem">): RateMemory | null {
  let text: string | null;
  try {
    text = storage.getItem(RATE_MEMORY_KEY);
  } catch {
    return null;
  }
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed) || parsed.version !== VERSION) return null;
  if (!isDay(parsed.askedFrom) || !isPlainObject(parsed.rates)) return null;

  const rates: DayRates = {};
  for (const [day, rate] of Object.entries(parsed.rates)) {
    if (!isDay(day) || !isValidRate(rate)) return null;
    rates[day] = rate;
  }
  return { askedFrom: parsed.askedFrom, rates };
}

/** Never throws: a full or blocked storage is swallowed and the rates are asked for again later. */
export function writeRateMemory(storage: Pick<Storage, "setItem">, memory: RateMemory): void {
  try {
    storage.setItem(
      RATE_MEMORY_KEY,
      JSON.stringify({ version: VERSION, askedFrom: memory.askedFrom, rates: memory.rates }),
    );
  } catch {
    // Nothing to do: the page works with the rates of this opening.
  }
}
