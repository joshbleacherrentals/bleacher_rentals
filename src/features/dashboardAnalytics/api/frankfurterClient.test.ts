import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FRANKFURTER_TIMEOUT_MS, fetchCadUsdRates } from "./frankfurterClient";

// docs/specs/dashboard-analytics-03-converter.md §2.4 and §5. fetchFn is always injected: no test
// reaches the real API. Timers are fake.

const request = { from: "2026-11-20", to: "2026-11-25" };
const URL_EXPECTED = "https://api.frankfurter.dev/v1/2026-11-20..2026-11-25?base=CAD&symbols=USD";

const goodBody = {
  amount: 1,
  base: "CAD",
  start_date: "2026-11-20",
  end_date: "2026-11-25",
  rates: { "2026-11-20": { USD: 0.69898 }, "2026-11-23": { USD: 0.69626 } },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const answering = (response: Response) => vi.fn<typeof fetch>(async () => response);

/** A call that ends only when its signal aborts, as a real one does. */
const hanging = () =>
  vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FRANKFURTER_TIMEOUT_MS", () => {
  it("is 10 seconds (D34)", () => {
    expect(FRANKFURTER_TIMEOUT_MS).toBe(10_000);
  });
});

describe("fetchCadUsdRates: the call", () => {
  it("asks the exact address, with no headers and no cookies", async () => {
    const fetchFn = answering(json(goodBody));
    await fetchCadUsdRates(request, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_EXPECTED);
    expect(init).toEqual({ credentials: "omit", signal: expect.any(AbortSignal) });
    expect(init).not.toHaveProperty("headers");
  });
});

describe("fetchCadUsdRates: 200", () => {
  it("gives the flat map of days for a good body", async () => {
    const result = await fetchCadUsdRates(request, { fetchFn: answering(json(goodBody)) });
    expect(result).toEqual({
      kind: "rates",
      rates: { "2026-11-20": 0.69898, "2026-11-23": 0.69626 },
    });
  });

  it("ignores start_date, end_date and every other key", async () => {
    const result = await fetchCadUsdRates(request, {
      fetchFn: answering(json({ rates: { "2026-11-20": { USD: 0.7 } }, extra: true })),
    });
    expect(result).toEqual({ kind: "rates", rates: { "2026-11-20": 0.7 } });
  });

  it("accepts an empty rates (no new day)", async () => {
    const result = await fetchCadUsdRates(request, { fetchFn: answering(json({ rates: {} })) });
    expect(result).toEqual({ kind: "rates", rates: {} });
  });

  it("ignores other currencies next to USD in an entry", async () => {
    const result = await fetchCadUsdRates(request, {
      fetchFn: answering(json({ rates: { "2026-11-20": { USD: 0.7, EUR: 0.6 } } })),
    });
    expect(result).toEqual({ kind: "rates", rates: { "2026-11-20": 0.7 } });
  });
});

describe("fetchCadUsdRates: 404", () => {
  it("gives none (nothing newer is published yet)", async () => {
    const result = await fetchCadUsdRates(request, {
      fetchFn: answering(json({ message: "not found" }, 404)),
    });
    expect(result).toEqual({ kind: "none" });
  });
});

describe("fetchCadUsdRates: failed", () => {
  it("gives failed for a 500", async () => {
    const result = await fetchCadUsdRates(request, { fetchFn: answering(json(goodBody, 500)) });
    expect(result).toEqual({ kind: "failed" });
  });

  it("gives failed for another status, even a good one such as 204 or 301", async () => {
    for (const status of [204, 301, 400, 429, 503]) {
      const body = status === 204 ? null : JSON.stringify(goodBody);
      const result = await fetchCadUsdRates(request, {
        fetchFn: vi.fn<typeof fetch>(async () => new Response(body, { status })),
      });
      expect(result).toEqual({ kind: "failed" });
    }
  });

  it("gives failed for a rejected call, and never throws", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchCadUsdRates(request, { fetchFn })).resolves.toEqual({ kind: "failed" });
  });

  it("gives failed for a fetchFn that throws at once", async () => {
    const fetchFn = vi.fn<typeof fetch>(() => {
      throw new Error("no network");
    });
    await expect(fetchCadUsdRates(request, { fetchFn })).resolves.toEqual({ kind: "failed" });
  });

  it("gives failed for a body that is not JSON", async () => {
    const result = await fetchCadUsdRates(request, {
      fetchFn: answering(new Response("<html>oops</html>", { status: 200 })),
    });
    expect(result).toEqual({ kind: "failed" });
  });

  it("does not retry", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await fetchCadUsdRates(request, { fetchFn });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchCadUsdRates: one bad entry spoils the whole answer", () => {
  const good = { "2026-11-20": { USD: 0.7 } };
  const bad: [string, unknown][] = [
    ["a body that is null", null],
    ["a body that is an array", []],
    ["a body that is a number", 5],
    ["a missing rates", { amount: 1 }],
    ["rates that is null", { rates: null }],
    ["rates that is an array", { rates: [{ USD: 0.7 }] }],
    ["rates that is a string", { rates: "none" }],
    ["a key that is not a day", { rates: { ...good, monday: { USD: 0.7 } } }],
    ["a key that is not a real day", { rates: { ...good, "2026-02-30": { USD: 0.7 } } }],
    ["a missing USD", { rates: { ...good, "2026-11-23": { EUR: 0.6 } } }],
    ["a USD of zero", { rates: { ...good, "2026-11-23": { USD: 0 } } }],
    ["a negative USD", { rates: { ...good, "2026-11-23": { USD: -0.7 } } }],
    ["a USD that is a string", { rates: { ...good, "2026-11-23": { USD: "0.7" } } }],
    ["a USD that is null", { rates: { ...good, "2026-11-23": { USD: null } } }],
    ["an entry that is a number", { rates: { ...good, "2026-11-23": 0.7 } }],
    ["an entry that is null", { rates: { ...good, "2026-11-23": null } }],
  ];

  it.each(bad)("%s gives failed, with no half answer", async (_name, body) => {
    const result = await fetchCadUsdRates(request, { fetchFn: answering(json(body)) });
    expect(result).toEqual({ kind: "failed" });
  });
});

describe("fetchCadUsdRates: the time limit (D34)", () => {
  it("aborts after 10 seconds and gives failed", async () => {
    const fetchFn = hanging();
    const pending = fetchCadUsdRates(request, { fetchFn });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ kind: "failed" });
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("uses the timeoutMs it is given", async () => {
    const pending = fetchCadUsdRates(request, { fetchFn: hanging(), timeoutMs: 250 });
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toEqual({ kind: "failed" });
  });

  it("gives failed after the time even when the call ignores the abort", async () => {
    const fetchFn = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const pending = fetchCadUsdRates(request, { fetchFn, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ kind: "failed" });
  });

  it("clears the timer when the call ends well", async () => {
    await fetchCadUsdRates(request, { fetchFn: answering(json(goodBody)) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the call ends with 404", async () => {
    await fetchCadUsdRates(request, { fetchFn: answering(json({ message: "not found" }, 404)) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the call fails", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await fetchCadUsdRates(request, { fetchFn });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after the time ran out", async () => {
    const pending = fetchCadUsdRates(request, { fetchFn: hanging(), timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
