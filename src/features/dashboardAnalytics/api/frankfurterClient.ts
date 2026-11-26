import { isDay, isValidRate, type DayRates, type RatesRequest } from "../utils/exchangeRates";

// docs/specs/dashboard-analytics-03-converter.md §2.4 (D8, D34). The client of Frankfurter, the
// free API of the European Central Bank's rates. A plain GET with no headers of its own and no
// cookies: only dates and currency codes leave the app, and the browser sends no preflight.

export const FRANKFURTER_TIMEOUT_MS = 10_000;

const BASE_URL = "https://api.frankfurter.dev/v1";

export type RatesFetchResult =
  | { kind: "rates"; rates: DayRates } // 200 and a body that is read whole
  | { kind: "none" } // 404: no newer day has been published
  | { kind: "failed" }; // no network, the 10 seconds, another status, an unreadable body

const FAILED: RatesFetchResult = { kind: "failed" };

/** The flat map of days, or `null` when anything in the body is not as expected. */
function readRates(body: unknown): DayRates | null {
  if (typeof body !== "object" || body === null) return null;
  const rates = (body as { rates?: unknown }).rates;
  if (typeof rates !== "object" || rates === null || Array.isArray(rates)) return null;

  const days: DayRates = {};
  for (const [day, entry] of Object.entries(rates)) {
    if (!isDay(day) || typeof entry !== "object" || entry === null) return null;
    const usd = (entry as { USD?: unknown }).USD;
    if (!isValidRate(usd)) return null;
    days[day] = usd;
  }
  return days;
}

/** Never throws and never retries. One bad entry makes the whole answer `failed`. */
export async function fetchCadUsdRates(
  request: RatesRequest,
  options?: { fetchFn?: typeof fetch; timeoutMs?: number },
): Promise<RatesFetchResult> {
  const fetchFn = options?.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options?.timeoutMs ?? FRANKFURTER_TIMEOUT_MS;
  const url = `${BASE_URL}/${request.from}..${request.to}?base=CAD&symbols=USD`;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Ends the wait after the time even when a call ignores the abort.
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Frankfurter did not answer in time"));
    }, timeoutMs);
  });

  const ask = async (): Promise<RatesFetchResult> => {
    const response = await fetchFn(url, { credentials: "omit", signal: controller.signal });
    if (response.status === 404) return { kind: "none" };
    if (response.status !== 200) return FAILED;
    const rates = readRates(await response.json());
    return rates ? { kind: "rates", rates } : FAILED;
  };

  try {
    return await Promise.race([ask(), timedOut]);
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}
