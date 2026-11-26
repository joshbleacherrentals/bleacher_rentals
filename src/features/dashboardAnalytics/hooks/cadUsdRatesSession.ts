import { fetchCadUsdRates, type RatesFetchResult } from "../api/frankfurterClient";
import { readRateMemory, writeRateMemory } from "../utils/exchangeRateMemory";
import { planRatesRequest, type DayRates, type RatesRequest } from "../utils/exchangeRates";
import type { CadUsdRatesState } from "./useCadUsdRates";

// docs/specs/dashboard-analytics-03-converter.md §2.6. The logic of useCadUsdRates without React:
// what it reads, asks, merges and writes, and when it stops. The hook is a thin wrapper around
// startCadUsdRatesSession, so every rule of §2.6 is tested here in node, with a stand-in client and
// a storage kept in memory (this project has no DOM test environment).

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const NO_RATES: DayRates = Object.freeze({}) as DayRates;

export type RatesSessionState = {
  status: CadUsdRatesState["status"];
  rates: DayRates;
};

/** Asks the API for one range. `signal` aborts the call. It must not throw. */
export type FetchRates = (request: RatesRequest, signal: AbortSignal) => Promise<RatesFetchResult>;

/** The client of the spec, with an outer signal that aborts the call. */
export function fetchRatesWithSignal(
  request: RatesRequest,
  signal: AbortSignal,
  fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<RatesFetchResult> {
  // Already aborted: there is nothing to ask.
  if (signal.aborted) return Promise.resolve({ kind: "failed" });

  const linked: typeof fetch = (input, init) => {
    const own = init?.signal ?? undefined;
    const both = new AbortController();
    const abort = () => both.abort();
    signal.addEventListener("abort", abort, { once: true });
    own?.addEventListener("abort", abort, { once: true });
    return fetchFn(input, { ...init, signal: both.signal }).finally(() => {
      signal.removeEventListener("abort", abort);
      own?.removeEventListener("abort", abort);
    });
  };
  return fetchCadUsdRates(request, { fetchFn: linked });
}

export type RatesRequests = {
  /** Starts the call for a range, or joins the one already open for the same range. */
  acquire(request: RatesRequest): { result: Promise<RatesFetchResult>; release: () => void };
};

/**
 * The calls of one mounting. React in strict mode starts a mounting, stops it and starts it again;
 * this makes that one call for one range, not two. A call is aborted only when the last one
 * waiting for it lets go and nobody takes its place in the same breath.
 */
export function createRatesRequests(fetchRates: FetchRates = fetchRatesWithSignal): RatesRequests {
  type Entry = { controller: AbortController; users: number; result: Promise<RatesFetchResult> };
  const open = new Map<string, Entry>();

  return {
    acquire(request) {
      const key = `${request.from}..${request.to}`;
      let entry = open.get(key);

      if (!entry) {
        const controller = new AbortController();
        let call: Promise<RatesFetchResult>;
        try {
          call = Promise.resolve(fetchRates(request, controller.signal));
        } catch {
          call = Promise.resolve({ kind: "failed" });
        }
        const result = call.catch((): RatesFetchResult => ({ kind: "failed" }));
        const created: Entry = { controller, users: 0, result };
        entry = created;
        open.set(key, created);
        // A range whose call has ended is asked again next time.
        void result.then(() => {
          if (open.get(key) === created) open.delete(key);
        });
      }

      const joined = entry;
      joined.users += 1;
      let released = false;
      return {
        result: joined.result,
        release() {
          if (released) return;
          released = true;
          joined.users -= 1;
          if (joined.users > 0) return;
          queueMicrotask(() => {
            if (joined.users > 0) return;
            joined.controller.abort();
            if (open.get(key) === joined) open.delete(key);
          });
        },
      };
    },
  };
}

const hasRate = (rates: DayRates) => Object.keys(rates).length > 0;

/**
 * One run of the hook for one pair of `oldestCadDay` and `today`. Calls `onChange` with the first
 * state at once, and again when a request gives days or ends without them. Returns the function
 * that stops it: after that an open request is aborted and nothing is set or written.
 */
export function startCadUsdRatesSession(params: {
  oldestCadDay: string | null;
  today: string;
  storage: StorageLike | null;
  requests: RatesRequests;
  onChange: (state: RatesSessionState) => void;
}): () => void {
  const { oldestCadDay, today, storage, requests, onChange } = params;

  // No CAD repair: nothing is read and nothing is asked.
  if (oldestCadDay === null) {
    onChange({ status: "idle", rates: NO_RATES });
    return () => {};
  }

  const memory = storage ? readRateMemory(storage) : null;
  const known = memory?.rates ?? NO_RATES;
  onChange({ status: hasRate(known) ? "ready" : "loading", rates: known });

  const plan = planRatesRequest({ memory, oldestCadDay, today });
  if (!plan) return () => {};

  let stopped = false;
  const call = requests.acquire(plan);

  void call.result.then((answer) => {
    if (stopped) return;
    if (answer.kind === "rates") {
      const merged = { ...known, ...answer.rates }; // the received value wins on the same day
      const askedFrom = memory && memory.askedFrom < plan.from ? memory.askedFrom : plan.from;
      if (storage) writeRateMemory(storage, { askedFrom, rates: merged });
      onChange({ status: hasRate(merged) ? "ready" : "unavailable", rates: merged });
    } else {
      // none or failed: nothing changes; the memory is not written.
      onChange({ status: hasRate(known) ? "ready" : "unavailable", rates: known });
    }
  });

  return () => {
    stopped = true;
    call.release();
  };
}

function sameRates(a: DayRates, b: DayRates): boolean {
  if (a === b) return true;
  const days = Object.keys(a);
  return days.length === Object.keys(b).length && days.every((day) => a[day] === b[day]);
}

/**
 * The state after `next` arrives. When the days are the same as before, the old `rates` object is
 * kept, so `rateFor` keeps its identity until the known days change (§2.6, rule 7); and when the
 * whole state is the same, the old state is kept, so nothing renders again.
 */
export function nextState(previous: RatesSessionState, next: RatesSessionState): RatesSessionState {
  if (!sameRates(previous.rates, next.rates)) return next;
  return previous.status === next.status
    ? previous
    : { status: next.status, rates: previous.rates };
}

/**
 * What the hook shows. The first frame is the same on the server and in the browser, so it knows
 * only `oldestCadDay`: with no CAD repair the hook is idle, and with one it is never idle.
 */
export function rateView(oldestCadDay: string | null, state: RatesSessionState): RatesSessionState {
  if (oldestCadDay === null) return { status: "idle", rates: NO_RATES };
  if (state.status === "idle") return { status: "loading", rates: state.rates };
  return state;
}
