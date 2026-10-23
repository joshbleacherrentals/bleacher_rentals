import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-06a-check-on-save.md §4 and §8: after a Save, a quote that has an invoice is
// sent to the check route, once the local write has reached the server. The local database and the
// network are fakes.

const { state } = vi.hoisted(() => ({
  state: {
    rows: [{ qbo_invoice_id: "inv-1" }] as Array<{ qbo_invoice_id: string | null }>,
    queue: [0] as number[],
    queueCalls: 0,
    readSql: [] as string[],
  },
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const kysely = await import("kysely");
  return {
    db: new kysely.Kysely({
      dialect: {
        createAdapter: () => new kysely.SqliteAdapter(),
        createDriver: () => new kysely.DummyDriver(),
        createIntrospector: (d) => new kysely.SqliteIntrospector(d),
        createQueryCompiler: () => new kysely.SqliteQueryCompiler(),
      },
    }),
    powerSyncDb: {
      getUploadQueueStats: async () => {
        // The last answer repeats: a queue that does not move.
        const count = state.queue[Math.min(state.queueCalls, state.queue.length - 1)];
        state.queueCalls++;
        return { count, size: null };
      },
    },
  };
});

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: vi.fn(async (compiled: { sql: string }) => {
    state.readSql.push(compiled.sql);
    return state.rows;
  }),
}));

import { requestInvoiceCheck, waitForEmptyUploadQueue } from "./requestInvoiceCheck";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  state.rows = [{ qbo_invoice_id: "inv-1" }];
  state.queue = [0];
  state.queueCalls = 0;
  state.readSql = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("waitForEmptyUploadQueue", () => {
  const waitWith = (counts: number[], over: { intervalMs?: number; maxMs?: number } = {}) => {
    const sleeps: number[] = [];
    let call = 0;
    const result = waitForEmptyUploadQueue({
      pending: async () => counts[Math.min(call++, counts.length - 1)],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      ...over,
    });
    return { result, sleeps, calls: () => call };
  };

  it("an empty queue is true at once, and nothing is slept", async () => {
    const w = waitWith([0]);

    expect(await w.result).toBe(true);
    expect(w.sleeps).toEqual([]);
  });

  it("polls every 500 ms until the queue is empty", async () => {
    const w = waitWith([3, 2, 0]);

    expect(await w.result).toBe(true);
    expect(w.sleeps).toEqual([500, 500]);
    expect(w.calls()).toBe(3);
  });

  it("a queue that never empties is false after 10 s", async () => {
    const w = waitWith([1]);

    expect(await w.result).toBe(false);
    expect(w.sleeps).toHaveLength(20);
    expect(w.sleeps.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("takes the interval and the limit it is given", async () => {
    const w = waitWith([1], { intervalMs: 100, maxMs: 300 });

    expect(await w.result).toBe(false);
    expect(w.sleeps).toEqual([100, 100, 100]);
  });
});

describe("requestInvoiceCheck", () => {
  it("sends a quote that has an invoice to the check route, with its id", async () => {
    await requestInvoiceCheck("event-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/quickbooks/invoice/check");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ eventId: "event-1" });
  });

  it("reads the invoice id of that event from the local database", async () => {
    await requestInvoiceCheck("event-1");

    expect(state.readSql).toHaveLength(1);
    expect(state.readSql[0]).toContain('from "Events"');
    expect(state.readSql[0]).toContain("qbo_invoice_id");
  });

  it("a quote with no invoice causes no request", async () => {
    state.rows = [{ qbo_invoice_id: null }];

    await requestInvoiceCheck("event-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an event the local database does not have causes no request", async () => {
    state.rows = [];

    await requestInvoiceCheck("event-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for the upload queue to empty, then sends", async () => {
    state.queue = [2, 1, 0];

    const done = requestInvoiceCheck("event-1");
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    await done;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.queueCalls).toBe(3);
  });

  it("a queue that never empties sends nothing, after 10 s", async () => {
    state.queue = [4];

    const done = requestInvoiceCheck("event-1");
    await vi.advanceTimersByTimeAsync(11_000);
    await done;

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a second call for the same event while one runs shares it", async () => {
    state.queue = [1, 0];

    const first = requestInvoiceCheck("event-1");
    const second = requestInvoiceCheck("event-1");
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("another event is its own check", async () => {
    await Promise.all([requestInvoiceCheck("event-1"), requestInvoiceCheck("event-2")]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("once a check is over, the next call for the event runs again", async () => {
    await requestInvoiceCheck("event-1");
    await requestInvoiceCheck("event-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a request that fails is swallowed and logged: the promise resolves", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(requestInvoiceCheck("event-1")).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });

  it("an answer that is not OK is logged, and nothing is shown", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 502 }));

    await expect(requestInvoiceCheck("event-1")).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });

  it("a local read that fails is swallowed and logged, and sends nothing", async () => {
    const typed = await import("@/lib/powersync/typedQuery");
    vi.mocked(typed.typedGetAll).mockRejectedValueOnce(new Error("sqlite is locked"));

    await expect(requestInvoiceCheck("event-1")).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
