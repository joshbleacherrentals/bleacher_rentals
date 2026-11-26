import { describe, expect, it, vi } from "vitest";
import {
  NO_RATES,
  createRatesRequests,
  fetchRatesWithSignal,
  nextState,
  rateView,
  startCadUsdRatesSession,
  type FetchRates,
  type RatesSessionState,
} from "./cadUsdRatesSession";
import type { RatesFetchResult } from "../api/frankfurterClient";
import { RATE_MEMORY_KEY } from "../utils/exchangeRateMemory";
import type { RatesRequest } from "../utils/exchangeRates";

// docs/specs/dashboard-analytics-03-converter.md §2.6 and §5. This project has no DOM test
// environment, so the logic of the hook (what it reads, asks, merges and writes; one request for
// one pair in strict mode; an unmount aborts the request and sets nothing) lives in
// cadUsdRatesSession.ts and is tested here with a stand-in client and a storage kept in memory.
// The hook itself is a thin wrapper, covered by useCadUsdRates.test.ts for its first frame.

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function memoryStorage(initial?: unknown) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(RATE_MEMORY_KEY, JSON.stringify(initial));
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

const memoryOf = (askedFrom: string, rates: Record<string, number>) => ({
  version: 1,
  askedFrom,
  rates,
});

type Call = {
  request: RatesRequest;
  signal: AbortSignal;
  answer: (result: RatesFetchResult) => void;
};

function harness(storage: StorageLike | null = memoryStorage()) {
  const calls: Call[] = [];
  const fetchRates = vi.fn<FetchRates>(
    (request, signal) =>
      new Promise<RatesFetchResult>((resolve) => {
        calls.push({ request, signal, answer: resolve });
      }),
  );
  const requests = createRatesRequests(fetchRates);
  const states: RatesSessionState[] = [];
  const start = (
    params: { oldestCadDay: string | null; today: string },
    onChange: (state: RatesSessionState) => void = (state) => states.push(state),
  ) => startCadUsdRatesSession({ ...params, storage, requests, onChange });
  return { calls, fetchRates, requests, states, start, storage };
}

const TODAY = "2026-11-25";
const known = { "2026-11-20": 0.69898, "2026-11-23": 0.69626 };

describe("startCadUsdRatesSession: no CAD repair", () => {
  it("is idle, reads nothing and asks nothing", () => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    const stop = h.start({ oldestCadDay: null, today: TODAY });
    expect(h.states).toEqual([{ status: "idle", rates: {} }]);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(h.fetchRates).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});

describe("startCadUsdRatesSession: the memory covers today", () => {
  it("is ready at once and asks nothing", async () => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: "2026-11-23" });
    await flush();
    expect(h.states).toEqual([{ status: "ready", rates: known }]);
    expect(h.fetchRates).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("startCadUsdRatesSession: stale memory", () => {
  it("is ready at once, then asks, merges and writes", async () => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });

    expect(h.states).toEqual([{ status: "ready", rates: known }]);
    expect(h.fetchRates).toHaveBeenCalledTimes(1);
    expect(h.calls[0].request).toEqual({ from: "2026-11-24", to: TODAY });

    h.calls[0].answer({ kind: "rates", rates: { "2026-11-24": 0.7, "2026-11-25": 0.71 } });
    await flush();

    const merged = { ...known, "2026-11-24": 0.7, "2026-11-25": 0.71 };
    expect(h.states).toHaveLength(2);
    expect(h.states[1]).toEqual({ status: "ready", rates: merged });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = storage.setItem.mock.calls[0];
    expect(key).toBe(RATE_MEMORY_KEY);
    expect(JSON.parse(value)).toEqual(memoryOf("2026-11-01", merged));
  });

  it("lets the received value win on the same day", async () => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });
    h.calls[0].answer({ kind: "rates", rates: { "2026-11-23": 0.7, "2026-11-24": 0.71 } });
    await flush();
    expect(h.states[1].rates).toEqual({
      "2026-11-20": 0.69898,
      "2026-11-23": 0.7,
      "2026-11-24": 0.71,
    });
  });

  it("an empty answer changes no rate and stays ready", async () => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });
    h.calls[0].answer({ kind: "rates", rates: {} });
    await flush();
    expect(h.states[1]).toEqual({ status: "ready", rates: known });
  });

  it("asks for the whole range again when the memory does not reach back far enough, and moves askedFrom back", async () => {
    const storage = memoryStorage(memoryOf("2026-11-10", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });
    expect(h.calls[0].request).toEqual({ from: "2026-11-05", to: TODAY });

    h.calls[0].answer({ kind: "rates", rates: { "2026-11-05": 0.69, "2026-11-24": 0.7 } });
    await flush();

    const value = JSON.parse(storage.setItem.mock.calls[0][1]);
    expect(value.askedFrom).toBe("2026-11-05");
    expect(value.rates).toEqual({ ...known, "2026-11-05": 0.69, "2026-11-24": 0.7 });
  });
});

describe("startCadUsdRatesSession: no memory", () => {
  it("goes loading, then ready on a good answer, and remembers it", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });

    expect(h.states).toEqual([{ status: "loading", rates: {} }]);
    expect(h.calls[0].request).toEqual({ from: "2026-01-05", to: TODAY });

    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7, "2026-01-06": 0.71 } });
    await flush();

    expect(h.states[1]).toEqual({
      status: "ready",
      rates: { "2026-01-05": 0.7, "2026-01-06": 0.71 },
    });
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual(
      memoryOf("2026-01-05", { "2026-01-05": 0.7, "2026-01-06": 0.71 }),
    );
  });

  it("goes loading, then unavailable when the request failed, and writes nothing", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    h.calls[0].answer({ kind: "failed" });
    await flush();
    expect(h.states.map((s) => s.status)).toEqual(["loading", "unavailable"]);
    expect(h.states[1].rates).toEqual({});
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("goes unavailable on none, and writes nothing", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    h.calls[0].answer({ kind: "none" });
    await flush();
    expect(h.states.map((s) => s.status)).toEqual(["loading", "unavailable"]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("goes unavailable when the answer holds no day at all (no rate is known)", async () => {
    const h = harness(memoryStorage());
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    h.calls[0].answer({ kind: "rates", rates: {} });
    await flush();
    expect(h.states.map((s) => s.status)).toEqual(["loading", "unavailable"]);
  });

  it("treats a client that rejects as failed", async () => {
    const requests = createRatesRequests(() => Promise.reject(new Error("boom")));
    const states: RatesSessionState[] = [];
    startCadUsdRatesSession({
      oldestCadDay: "2026-01-05",
      today: TODAY,
      storage: memoryStorage(),
      requests,
      onChange: (s) => states.push(s),
    });
    await flush();
    expect(states.map((s) => s.status)).toEqual(["loading", "unavailable"]);
  });

  it("treats a client that throws at once as failed", async () => {
    const requests = createRatesRequests(() => {
      throw new Error("boom");
    });
    const states: RatesSessionState[] = [];
    startCadUsdRatesSession({
      oldestCadDay: "2026-01-05",
      today: TODAY,
      storage: memoryStorage(),
      requests,
      onChange: (s) => states.push(s),
    });
    await flush();
    expect(states.map((s) => s.status)).toEqual(["loading", "unavailable"]);
  });
});

describe("startCadUsdRatesSession: memory and a request that did not give days", () => {
  it.each<[string, RatesFetchResult]>([
    ["failed", { kind: "failed" }],
    ["none", { kind: "none" }],
  ])("%s: stays ready with the known rates and writes nothing", async (_name, result) => {
    const storage = memoryStorage(memoryOf("2026-11-01", known));
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });
    h.calls[0].answer(result);
    await flush();
    expect(h.states.map((s) => s.status)).toEqual(["ready", "ready"]);
    expect(h.states[1].rates).toEqual(known);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps the very same rates object, so a memo on rateFor stays stable", async () => {
    const h = harness(memoryStorage(memoryOf("2026-11-01", known)));
    h.start({ oldestCadDay: "2026-11-05", today: TODAY });
    h.calls[0].answer({ kind: "failed" });
    await flush();
    expect(h.states[1].rates).toBe(h.states[0].rates);
  });
});

describe("startCadUsdRatesSession: storage that does not work", () => {
  it("still works when getItem and setItem throw", async () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    expect(h.states).toEqual([{ status: "loading", rates: {} }]);

    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7 } });
    await flush();
    expect(h.states[1]).toEqual({ status: "ready", rates: { "2026-01-05": 0.7 } });
  });

  it("still works with no storage at all", async () => {
    const h = harness(null);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7 } });
    await flush();
    expect(h.states.map((s) => s.status)).toEqual(["loading", "ready"]);
  });
});

describe("startCadUsdRatesSession: strict mode", () => {
  const params = { oldestCadDay: "2026-01-05", today: TODAY };

  it("makes one request for one pair when the mounting is started twice", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = h.start(params, first); // effect
    stopFirst(); // the cleanup React runs in strict mode
    h.start(params, second); // the effect again

    expect(h.fetchRates).toHaveBeenCalledTimes(1);

    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7 } });
    await flush();

    expect(h.calls[0].signal.aborted).toBe(false);
    expect(first).toHaveBeenCalledTimes(1); // only its first state: it was stopped
    expect(second).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenLastCalledWith({
      status: "ready",
      rates: { "2026-01-05": 0.7 },
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("aborts the request when the mounting then really ends", async () => {
    const h = harness(memoryStorage());
    const onChange = vi.fn();
    h.start(params, onChange)();
    const stop = h.start(params, onChange);
    stop();
    await flush();
    expect(h.fetchRates).toHaveBeenCalledTimes(1);
    expect(h.calls[0].signal.aborted).toBe(true);
  });
});

describe("startCadUsdRatesSession: unmount", () => {
  const params = { oldestCadDay: "2026-01-05", today: TODAY };

  it("aborts the open request", async () => {
    const h = harness(memoryStorage());
    const stop = h.start(params);
    expect(h.calls[0].signal.aborted).toBe(false);
    stop();
    await flush();
    expect(h.calls[0].signal.aborted).toBe(true);
  });

  it("sets nothing after it, and writes nothing", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    const stop = h.start(params);
    stop();
    await flush();
    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7 } });
    await flush();
    expect(h.states).toEqual([{ status: "loading", rates: {} }]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("can be called twice", async () => {
    const h = harness(memoryStorage());
    const stop = h.start(params);
    stop();
    expect(() => stop()).not.toThrow();
  });
});

describe("startCadUsdRatesSession: the pair changes", () => {
  it("asks again when today changes, aborts the old request and drops its answer", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    const oldSession = vi.fn();
    const newSession = vi.fn();

    const stopOld = h.start({ oldestCadDay: "2026-01-05", today: "2026-11-25" }, oldSession);
    stopOld();
    h.start({ oldestCadDay: "2026-01-05", today: "2026-11-26" }, newSession);

    expect(h.fetchRates).toHaveBeenCalledTimes(2);
    expect(h.calls[0].request).toEqual({ from: "2026-01-05", to: "2026-11-25" });
    expect(h.calls[1].request).toEqual({ from: "2026-01-05", to: "2026-11-26" });

    await flush();
    expect(h.calls[0].signal.aborted).toBe(true);
    expect(h.calls[1].signal.aborted).toBe(false);

    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.1 } });
    h.calls[1].answer({ kind: "rates", rates: { "2026-01-05": 0.7 } });
    await flush();

    expect(oldSession).toHaveBeenCalledTimes(1);
    expect(newSession).toHaveBeenLastCalledWith({ status: "ready", rates: { "2026-01-05": 0.7 } });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("asks again when the oldest CAD day changes", () => {
    const h = harness(memoryStorage());
    h.start({ oldestCadDay: "2026-01-05", today: TODAY })();
    h.start({ oldestCadDay: "2026-01-02", today: TODAY });
    expect(h.fetchRates).toHaveBeenCalledTimes(2);
    expect(h.calls[1].request).toEqual({ from: "2026-01-02", to: TODAY });
  });

  it("does not ask again for the same pair once the answer has come", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    h.calls[0].answer({ kind: "rates", rates: { "2026-01-05": 0.7, "2026-11-25": 0.71 } });
    await flush();
    // a later start (a new mounting) reads the memory it has just written and has nothing to ask
    h.start({ oldestCadDay: "2026-01-05", today: TODAY });
    expect(h.fetchRates).toHaveBeenCalledTimes(1);
  });
});

describe("createRatesRequests", () => {
  const range = { from: "2026-11-20", to: "2026-11-25" };

  it("starts one call for one range, however many ask", () => {
    const h = harness();
    h.requests.acquire(range);
    h.requests.acquire({ ...range });
    expect(h.fetchRates).toHaveBeenCalledTimes(1);
  });

  it("starts a call for each different range", () => {
    const h = harness();
    h.requests.acquire(range);
    h.requests.acquire({ from: "2026-11-21", to: "2026-11-25" });
    expect(h.fetchRates).toHaveBeenCalledTimes(2);
  });

  it("gives everyone the same answer", async () => {
    const h = harness();
    const a = h.requests.acquire(range);
    const b = h.requests.acquire(range);
    h.calls[0].answer({ kind: "none" });
    await expect(a.result).resolves.toEqual({ kind: "none" });
    await expect(b.result).resolves.toEqual({ kind: "none" });
  });

  it("asks again for a range whose call has ended", async () => {
    const h = harness();
    h.requests.acquire(range);
    h.calls[0].answer({ kind: "failed" });
    await flush();
    h.requests.acquire(range);
    expect(h.fetchRates).toHaveBeenCalledTimes(2);
  });

  it("aborts when the last one lets go, but not in the same breath", async () => {
    const h = harness();
    const a = h.requests.acquire(range);
    a.release();
    expect(h.calls[0].signal.aborted).toBe(false);
    await flush();
    expect(h.calls[0].signal.aborted).toBe(true);
  });

  it("does not abort when someone asks again in the same breath", async () => {
    const h = harness();
    h.requests.acquire(range).release();
    const again = h.requests.acquire(range);
    await flush();
    expect(h.fetchRates).toHaveBeenCalledTimes(1);
    expect(h.calls[0].signal.aborted).toBe(false);
    again.release();
    await flush();
    expect(h.calls[0].signal.aborted).toBe(true);
  });

  it("does not abort while another still waits", async () => {
    const h = harness();
    const a = h.requests.acquire(range);
    h.requests.acquire(range);
    a.release();
    await flush();
    expect(h.calls[0].signal.aborted).toBe(false);
  });

  it("counts a second release of the same one as nothing", async () => {
    const h = harness();
    const a = h.requests.acquire(range);
    h.requests.acquire(range);
    a.release();
    a.release();
    await flush();
    expect(h.calls[0].signal.aborted).toBe(false);
  });

  it("asks again for a range that was aborted", async () => {
    const h = harness();
    h.requests.acquire(range).release();
    await flush();
    h.requests.acquire(range);
    expect(h.fetchRates).toHaveBeenCalledTimes(2);
    expect(h.calls[1].signal.aborted).toBe(false);
  });
});

describe("fetchRatesWithSignal", () => {
  const range = { from: "2026-11-20", to: "2026-11-25" };
  const hanging = () =>
    vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

  it("asks the client for the range and gives its answer", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ rates: { "2026-11-20": { USD: 0.7 } } }), { status: 200 }),
    );
    const result = await fetchRatesWithSignal(range, new AbortController().signal, fetchFn);
    expect(result).toEqual({ kind: "rates", rates: { "2026-11-20": 0.7 } });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://api.frankfurter.dev/v1/2026-11-20..2026-11-25?base=CAD&symbols=USD",
    );
  });

  it("aborts the call when the outer signal aborts, and gives failed", async () => {
    const fetchFn = hanging();
    const outer = new AbortController();
    const pending = fetchRatesWithSignal(range, outer.signal, fetchFn);
    outer.abort();
    await expect(pending).resolves.toEqual({ kind: "failed" });
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("gives failed at once, and asks nothing, when the outer signal is already aborted", async () => {
    const fetchFn = hanging();
    const outer = new AbortController();
    outer.abort();
    await expect(fetchRatesWithSignal(range, outer.signal, fetchFn)).resolves.toEqual({
      kind: "failed",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("rateView", () => {
  const ready: RatesSessionState = { status: "ready", rates: known };

  it("is idle with no rate when there is no CAD repair, whatever the state was", () => {
    expect(rateView(null, ready)).toEqual({ status: "idle", rates: {} });
    expect(rateView(null, { status: "loading", rates: {} })).toEqual({ status: "idle", rates: {} });
  });

  it("is loading while a CAD repair exists and the state is still the idle of before", () => {
    expect(rateView("2026-01-05", { status: "idle", rates: {} })).toEqual({
      status: "loading",
      rates: {},
    });
  });

  it("shows the state as it is otherwise", () => {
    expect(rateView("2026-01-05", ready)).toBe(ready);
    const unavailable: RatesSessionState = { status: "unavailable", rates: {} };
    expect(rateView("2026-01-05", unavailable)).toBe(unavailable);
    const loading: RatesSessionState = { status: "loading", rates: {} };
    expect(rateView("2026-01-05", loading)).toBe(loading);
  });
});

describe("nextState", () => {
  it("keeps the old rates object when the days are the same, so rateFor keeps its identity", () => {
    const previous: RatesSessionState = { status: "ready", rates: { ...known } };
    const next: RatesSessionState = { status: "unavailable", rates: { ...known } };
    const result = nextState(previous, next);
    expect(result.status).toBe("unavailable");
    expect(result.rates).toBe(previous.rates);
  });

  it("keeps the whole old state when nothing changed, so nothing renders again", () => {
    const previous: RatesSessionState = { status: "ready", rates: { ...known } };
    expect(nextState(previous, { status: "ready", rates: { ...known } })).toBe(previous);
  });

  it("takes the new state when a day was added or a rate changed", () => {
    const previous: RatesSessionState = { status: "ready", rates: known };
    const added: RatesSessionState = { status: "ready", rates: { ...known, "2026-11-24": 0.7 } };
    expect(nextState(previous, added)).toBe(added);
    const changed: RatesSessionState = { status: "ready", rates: { ...known, "2026-11-23": 0.5 } };
    expect(nextState(previous, changed)).toBe(changed);
  });

  it("takes the new state when the days are other days with the same count", () => {
    const previous: RatesSessionState = { status: "ready", rates: { "2026-11-20": 0.7 } };
    const next: RatesSessionState = { status: "ready", rates: { "2026-11-21": 0.7 } };
    expect(nextState(previous, next)).toBe(next);
  });

  it("goes from the first loading state to a ready one", () => {
    const previous: RatesSessionState = { status: "loading", rates: NO_RATES };
    const next: RatesSessionState = { status: "ready", rates: known };
    expect(nextState(previous, next)).toBe(next);
  });
});

describe("NO_RATES", () => {
  it("is an empty map", () => {
    expect(NO_RATES).toEqual({});
  });
});
