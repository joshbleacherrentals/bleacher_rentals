import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEventContextForTests } from "@/lib/perf/eventContext";
import { setMetricsSink } from "@/lib/perf/metrics";
import type { PerfEvent } from "@/lib/perf/telemetryEvent";
import {
  connectWithObserver,
  credentialsFetchedWithin,
  getColdStart,
  initialState,
  markCredentialsFetched,
  observeSync,
  recordAppStart,
  resetSyncObserverForTests,
  step,
  trackSqliteOpen,
  type Input,
  type ObservedEvent,
  type StatusSnapshot,
} from "./syncObserver";

// ---------------------------------------------------------------------------
// The state machine — a pure function, so no browser and no SDK.
// ---------------------------------------------------------------------------

const NO_HINTS = { planned: false, tabConnect: false };

function snap(over: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    connected: false,
    connecting: false,
    hasSynced: true,
    lastSyncedAtMs: 1000,
    downloadError: null,
    opsTotal: null,
    buckets: 0,
    ...over,
  };
}

function status(
  now: number,
  over: Partial<StatusSnapshot> = {},
  extra: { hidden?: boolean; planned?: boolean; tabConnect?: boolean } = {},
): Input {
  return {
    type: "status",
    now,
    status: snap(over),
    hints: { planned: extra.planned ?? false, tabConnect: extra.tabConnect ?? false },
    hidden: extra.hidden ?? false,
  };
}

function ready(now: number, hasSynced: boolean, lastSyncedAtMs: number | null = 1000): Input {
  return { type: "ready", now, hasSynced, lastSyncedAtMs, hidden: false };
}

function run(inputs: Input[], connectCalledAt = 0): ObservedEvent[] {
  let state = initialState(connectCalledAt);
  const events: ObservedEvent[] = [];
  for (const input of inputs) {
    const result = step(state, input);
    state = result.state;
    events.push(...result.events);
  }
  return events;
}

const named = (events: ObservedEvent[], name: string) => events.filter((e) => e.name === name);

describe("powersync.connect", () => {
  it("is emitted once, at the first connected status", () => {
    const events = run([
      ready(350, true),
      status(534, { connecting: true }),
      status(1302, { connected: true }),
    ]);
    expect(named(events, "powersync.connect")).toHaveLength(1);
    expect(named(events, "powersync.connect")[0]).toMatchObject({
      outcome: "ok",
      durationMs: 952,
    });
  });

  it("starts at database-ready when connect() was called before it (the later of the two)", () => {
    const [connect] = named(
      run([ready(353, true), status(1302, { connected: true })], 2),
      "powersync.connect",
    );
    expect(connect.durationMs).toBe(1302 - 353);
  });

  it("starts at the connect() call when the database was ready earlier", () => {
    const [connect] = named(
      run([ready(100, true), status(1500, { connected: true })], 500),
      "powersync.connect",
    );
    expect(connect.durationMs).toBe(1000);
  });

  it("ignores a status that arrives before the database is ready", () => {
    expect(run([status(10, { connected: true })])).toEqual([]);
  });

  it("emits an error when the first attempt fails, once, and an ok when a retry connects", () => {
    const error = { status: 503 };
    const events = run([
      ready(100, true),
      status(300, { connecting: true, downloadError: error }),
      status(900, { connecting: true, downloadError: error }),
      status(5100, { connected: true }),
    ]);
    const connects = named(events, "powersync.connect");
    expect(connects).toHaveLength(2);
    expect(connects[0]).toMatchObject({ outcome: "error", errorKind: "http_5xx", durationMs: 200 });
    expect(connects[1]).toMatchObject({ outcome: "ok", durationMs: 5000 });
  });

  it("never carries the error's message", () => {
    const events = run([
      ready(100, true),
      status(300, {
        downloadError: Object.assign(new Error("row {email: a@b.c}"), { status: 500 }),
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("a@b.c");
  });
});

describe("sync.initial and sync.catchup", () => {
  it("a device that never synced emits sync.initial when hasSynced turns true, and never catchup", () => {
    const events = run([
      ready(350, false, null),
      status(1300, { connected: true, hasSynced: false, lastSyncedAtMs: null }),
      status(1400, {
        connected: true,
        hasSynced: false,
        lastSyncedAtMs: null,
        opsTotal: 40,
        buckets: 3,
      }),
      status(2000, { connected: true, hasSynced: true, lastSyncedAtMs: 5000 }),
    ]);
    expect(named(events, "sync.initial")).toEqual([
      expect.objectContaining({
        durationMs: 2000 - 350,
        outcome: "ok",
        attrs: expect.objectContaining({ ops: 40, buckets: 3 }),
      }),
    ]);
    expect(named(events, "sync.catchup")).toHaveLength(0);
  });

  it("a returning device emits sync.catchup at the first newer lastSyncedAt, and never initial", () => {
    const events = run([
      ready(350, true, 1000),
      status(1300, { connected: true, lastSyncedAtMs: 1000 }),
      status(1310, { connected: true, opsTotal: 0 }),
      status(1322, { connected: true, lastSyncedAtMs: 2000 }),
    ]);
    expect(named(events, "sync.catchup")).toEqual([
      expect.objectContaining({
        durationMs: 1322 - 350,
        attrs: expect.objectContaining({ ops: 0 }),
      }),
    ]);
    expect(named(events, "sync.initial")).toHaveLength(0);
  });

  it("ends catchup at the time of the event, not at the lastSyncedAt value", () => {
    const [catchup] = named(
      run([
        ready(100, true, 1000),
        status(900, { connected: true, lastSyncedAtMs: 1_700_000_000_000 }),
      ]),
      "sync.catchup",
    );
    expect(catchup.durationMs).toBe(800);
  });

  it("ignores a null lastSyncedAt, which the SDK shows for a moment while connecting", () => {
    const events = run([
      ready(100, true, 1000),
      status(200, { connecting: true, lastSyncedAtMs: null }),
      status(300, { connecting: true, lastSyncedAtMs: 1000 }),
    ]);
    expect(named(events, "sync.catchup")).toHaveLength(0);
  });

  it("emits at most one sync metric per observer", () => {
    const events = run([
      ready(100, true, 1000),
      status(300, { connected: true, lastSyncedAtMs: 2000 }),
      status(900, { connected: true, lastSyncedAtMs: 3000 }),
    ]);
    expect(named(events, "sync.catchup")).toHaveLength(1);
  });

  it("with no lastSyncedAt at start, the first one that appears ends catchup", () => {
    const events = run([
      ready(100, true, null),
      status(300, { connected: true, lastSyncedAtMs: 4000 }),
    ]);
    expect(named(events, "sync.catchup")).toHaveLength(1);
  });
});

describe("disconnect and reconnect", () => {
  const connected = (now: number) => status(now, { connected: true });
  const lost = (now: number, over: Partial<StatusSnapshot> = {}, extra = {}) =>
    status(now, { connected: false, ...over }, extra);

  it("a loss and a recovery give one disconnect (n: 1) and one reconnect with the gap", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(62_000),
      status(62_100, { connecting: true }),
      status(62_700, { connected: true }),
    ]);
    expect(named(events, "powersync.disconnect")).toEqual([
      expect.objectContaining({ durationMs: null, attrs: { n: 1, hadError: false } }),
    ]);
    expect(named(events, "powersync.reconnect")).toEqual([
      expect.objectContaining({ outcome: "ok", durationMs: 700 }),
    ]);
  });

  it("a second loss is n: 2", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000),
      connected(5700),
      lost(9000),
      connected(9900),
    ]);
    const numbers = named(events, "powersync.disconnect").map((e) => e.attrs.n);
    expect(numbers).toEqual([1, 2]);
    expect(named(events, "powersync.reconnect").map((e) => e.durationMs)).toEqual([700, 900]);
  });

  it("ignores the flapping statuses between loss and recovery", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000),
      status(5073, { connecting: true }),
      status(5074, { connecting: false }),
      status(5074, { connecting: true }),
      status(5074, { connecting: true }),
      status(5200, { connecting: true }),
      connected(5719),
    ]);
    expect(named(events, "powersync.disconnect")).toHaveLength(1);
    expect(named(events, "powersync.reconnect")).toHaveLength(1);
    expect(named(events, "powersync.reconnect")[0].durationMs).toBe(719);
  });

  it("a repeated identical status yields nothing", () => {
    const events = run([ready(100, true), connected(1300), connected(1400), connected(1500)]);
    expect(named(events, "powersync.connect")).toHaveLength(1);
    expect(named(events, "powersync.disconnect")).toHaveLength(0);
  });

  it("a download error during the gap makes the reconnect an error", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000),
      status(5300, { connecting: true, downloadError: { status: 503 } }),
      connected(7000),
    ]);
    expect(named(events, "powersync.reconnect")[0]).toMatchObject({
      outcome: "error",
      errorKind: "http_5xx",
      durationMs: 2000,
    });
  });

  it("an error already on the losing status shows as hadError", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000, { downloadError: { code: "ECONNRESET" } }),
      connected(5500),
    ]);
    expect(named(events, "powersync.disconnect")[0].attrs.hadError).toBe(true);
    expect(named(events, "powersync.reconnect")[0].outcome).toBe("error");
  });

  it("marks the cause when another tab connected", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000, {}, { tabConnect: true }),
      connected(5700),
    ]);
    expect(named(events, "powersync.reconnect")[0].attrs).toMatchObject({ cause: "tab_connect" });
  });

  it("marks a planned restart that follows a credentials refresh", () => {
    const events = run([
      ready(100, true),
      connected(1300),
      lost(5000, {}, { planned: true }),
      connected(5700),
    ]);
    expect(named(events, "powersync.reconnect")[0].attrs).toMatchObject({ planned: true });
  });

  it("sets neither mark when neither applies", () => {
    const events = run([ready(100, true), connected(1300), lost(5000), connected(5700)]);
    const attrs = named(events, "powersync.reconnect")[0].attrs;
    expect(attrs).not.toHaveProperty("cause");
    expect(attrs).not.toHaveProperty("planned");
  });
});

describe("attrs.hidden", () => {
  it("is false when the page was visible throughout the span", () => {
    const [connect] = named(
      run([ready(100, true), status(900, { connected: true })]),
      "powersync.connect",
    );
    expect(connect.attrs.hidden).toBe(false);
  });

  it("is true when the page was hidden when a status arrived", () => {
    const [connect] = named(
      run([ready(100, true), status(900, { connected: true }, { hidden: true })]),
      "powersync.connect",
    );
    expect(connect.attrs.hidden).toBe(true);
  });

  it("is true when the page was hidden between two statuses", () => {
    const events = run([ready(100, true), { type: "hidden" }, status(900, { connected: true })]);
    expect(named(events, "powersync.connect")[0].attrs.hidden).toBe(true);
  });

  it("belongs to the span: a reconnect after a hidden connect is visible again", () => {
    const events = run([
      ready(100, true),
      { type: "hidden" },
      status(900, { connected: true }),
      status(5000, { connected: false }),
      status(5700, { connected: true }),
    ]);
    expect(named(events, "powersync.reconnect")[0].attrs.hidden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// observeSync, against a fake database
// ---------------------------------------------------------------------------

type FakeStatus = {
  connected: boolean;
  connecting: boolean;
  hasSynced?: boolean;
  lastSyncedAt?: Date;
  dataFlowStatus: {
    downloadError?: unknown;
    downloading?: boolean;
    downloadProgress?: object | null;
  };
  downloadProgress: { totalOperations: number } | null;
};

function fakeStatus(over: Partial<FakeStatus> = {}): FakeStatus {
  return {
    connected: false,
    connecting: false,
    hasSynced: true,
    lastSyncedAt: new Date(1000),
    dataFlowStatus: {},
    downloadProgress: null,
    ...over,
  };
}

function fakeDb(initial: FakeStatus = fakeStatus()) {
  let listener: { statusChanged?: (s: FakeStatus) => void } | undefined;
  const calls: string[] = [];
  const db = {
    currentStatus: initial,
    waitForReady: vi.fn(async () => {
      calls.push("waitForReady");
    }),
    registerListener: vi.fn((l: typeof listener) => {
      listener = l;
      calls.push("registerListener");
      return () => {
        listener = undefined;
        calls.push("unsubscribe");
      };
    }),
    connect: vi.fn(async () => {
      calls.push("connect");
    }),
    disconnect: vi.fn(async () => {
      calls.push("disconnect");
    }),
  };
  return {
    db,
    calls,
    emit: (status: FakeStatus) => listener?.statusChanged?.(status),
    hasListener: () => listener !== undefined,
  };
}

function fakeDeps(over: Record<string, unknown> = {}) {
  let t = 0;
  const record = vi.fn();
  return {
    record,
    deps: {
      now: () => t,
      advance: (to: number) => {
        t = to;
      },
      getTabRole: () => "leader" as const,
      record,
      isHidden: () => false,
      onHidden: () => () => {},
      credentialsFetchedWithin: () => false,
      recentConnectNote: () => false,
      startCoordination: () => {},
      announceConnect: () => {},
      ...over,
    },
    setTime: (to: number) => {
      t = to;
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("observeSync", () => {
  it("sends observed events to the recorder", async () => {
    const { db, emit } = fakeDb();
    const { deps, record, setTime } = fakeDeps();
    observeSync(db as never, deps as never);
    await settle();

    setTime(900);
    emit(fakeStatus({ connected: true }));
    expect(record.mock.calls.map((c) => c[0].name)).toContain("powersync.connect");
  });

  it("records a connection event with a duration and a count event without", async () => {
    const { db, emit } = fakeDb();
    const { deps, record, setTime } = fakeDeps();
    observeSync(db as never, deps as never);
    await settle();

    setTime(900);
    emit(fakeStatus({ connected: true }));
    setTime(5000);
    emit(fakeStatus({ connected: false }));

    const byName = Object.fromEntries(record.mock.calls.map((c) => [c[0].name, c[0]]));
    expect(byName["powersync.connect"].durationMs).toBe(900);
    expect(byName["powersync.disconnect"].durationMs).toBeNull();
  });

  it("stops observing when unsubscribed", async () => {
    const { db, emit, hasListener } = fakeDb();
    const { deps, record } = fakeDeps();
    const stop = observeSync(db as never, deps as never);
    await settle();
    expect(hasListener()).toBe(true);

    stop();
    expect(hasListener()).toBe(false);
    emit(fakeStatus({ connected: true }));
    expect(record).not.toHaveBeenCalled();
  });

  it("registers nothing when unsubscribed before the database was ready", async () => {
    const { db, hasListener } = fakeDb();
    const { deps } = fakeDeps();
    const stop = observeSync(db as never, deps as never);
    stop();
    await settle();
    expect(hasListener()).toBe(false);
  });

  it("does not record connection-level events in a follower tab", async () => {
    const { db, emit } = fakeDb();
    const { deps, record } = fakeDeps({ getTabRole: () => "follower" });
    observeSync(db as never, deps as never);
    await settle();
    emit(fakeStatus({ connected: true }));
    expect(record).not.toHaveBeenCalled();
  });

  it.each(["leader", "unknown"] as const)("records in a %s tab", async (role) => {
    const { db, emit } = fakeDb();
    const { deps, record } = fakeDeps({ getTabRole: () => role });
    observeSync(db as never, deps as never);
    await settle();
    emit(fakeStatus({ connected: true }));
    expect(record).toHaveBeenCalled();
  });

  it("reads the role when the event happens, so a follower that becomes leader starts recording", async () => {
    let role: "leader" | "follower" = "follower";
    const { db, emit } = fakeDb();
    const { deps, record } = fakeDeps({ getTabRole: () => role });
    observeSync(db as never, deps as never);
    await settle();

    emit(fakeStatus({ connected: false }));
    role = "leader";
    emit(fakeStatus({ connected: true }));
    expect(record).toHaveBeenCalled();
  });

  it("marks a reconnect when another tab connected just before the loss", async () => {
    const { db, emit } = fakeDb();
    const { deps, record, setTime } = fakeDeps({ recentConnectNote: () => true });
    observeSync(db as never, deps as never);
    await settle();

    emit(fakeStatus({ connected: true }));
    setTime(5000);
    emit(fakeStatus({ connected: false }));
    setTime(5700);
    emit(fakeStatus({ connected: true }));

    const reconnect = record.mock.calls
      .map((c) => c[0])
      .find((e) => e.name === "powersync.reconnect");
    expect(reconnect.attrs.cause).toBe("tab_connect");
  });

  it("splits initial from catchup on hasSynced read when the database became ready", async () => {
    const { db, emit } = fakeDb(fakeStatus({ hasSynced: false, lastSyncedAt: undefined }));
    const { deps, record, setTime } = fakeDeps();
    observeSync(db as never, deps as never);
    await settle();

    setTime(300);
    emit(fakeStatus({ connected: true, hasSynced: false, lastSyncedAt: undefined }));
    setTime(900);
    emit(fakeStatus({ connected: true, hasSynced: true, lastSyncedAt: new Date(5000) }));

    const names = record.mock.calls.map((c) => c[0].name);
    expect(names).toContain("sync.initial");
    expect(names).not.toContain("sync.catchup");
  });

  it("reads the number of buckets from the download progress", async () => {
    const { db, emit } = fakeDb(fakeStatus({ hasSynced: false, lastSyncedAt: undefined }));
    const { deps, record } = fakeDeps();
    observeSync(db as never, deps as never);
    await settle();

    emit(
      fakeStatus({
        connected: true,
        hasSynced: false,
        lastSyncedAt: undefined,
        downloadProgress: { totalOperations: 12 },
        dataFlowStatus: { downloading: true, downloadProgress: { a: {}, b: {}, c: {} } },
      }),
    );
    emit(fakeStatus({ connected: true, hasSynced: true, lastSyncedAt: new Date(5000) }));

    const initial = record.mock.calls.map((c) => c[0]).find((e) => e.name === "sync.initial");
    expect(initial.attrs).toMatchObject({ ops: 12, buckets: 3 });
  });
});

describe("connectWithObserver", () => {
  it("observes before it connects, and passes the connector and options through", async () => {
    const { db, calls } = fakeDb();
    const { deps } = fakeDeps();
    const connector = { id: "c" };
    const options = { params: { app: "web" } };

    connectWithObserver(db as never, connector as never, options as never, deps as never);
    await settle();

    expect(db.waitForReady).toHaveBeenCalled();
    expect(calls.indexOf("waitForReady")).toBeLessThan(calls.indexOf("connect"));
    expect(db.connect).toHaveBeenCalledWith(connector, options);
  });

  it("unsubscribes before it disconnects, so its own disconnect is not counted", async () => {
    const { db, calls, emit } = fakeDb();
    const { deps, record } = fakeDeps();
    const cleanup = connectWithObserver(db as never, {} as never, {} as never, deps as never);
    await settle();
    emit(fakeStatus({ connected: true }));
    record.mockClear();

    cleanup();
    emit(fakeStatus({ connected: false }));

    expect(calls.indexOf("unsubscribe")).toBeLessThan(calls.indexOf("disconnect"));
    expect(record).not.toHaveBeenCalled();
    expect(db.disconnect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The per-tab metrics and the credentials clock
// ---------------------------------------------------------------------------

describe("per-tab metrics", () => {
  let events: PerfEvent[];

  beforeEach(() => {
    events = [];
    resetEventContextForTests();
    resetSyncObserverForTests();
    setMetricsSink((event) => events.push(event));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setMetricsSink(null);
  });

  it("trackSqliteOpen records sqlite.open when the database becomes ready", async () => {
    const clock = vi.spyOn(performance, "now");
    clock.mockReturnValueOnce(100).mockReturnValue(453);
    await trackSqliteOpen({ waitForReady: () => Promise.resolve() });
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.open", outcome: "ok" });
    expect(events[0].durationMs).toBe(353);
    expect(events[0].attrs).toMatchObject({ hidden: false });
  });

  it("trackSqliteOpen records an error when the database fails to open", async () => {
    await trackSqliteOpen({ waitForReady: () => Promise.reject({ code: "ENOENT" }) });
    await settle();
    expect(events[0]).toMatchObject({ name: "sqlite.open", outcome: "error" });
  });

  it("remembers whether the device had synced when the database became ready", async () => {
    expect(getColdStart()).toBeNull();
    await trackSqliteOpen({
      waitForReady: () => Promise.resolve(),
      currentStatus: { hasSynced: false },
    });
    expect(getColdStart()).toBe(true);
  });

  it("is warm when it had synced", async () => {
    await trackSqliteOpen({
      waitForReady: () => Promise.resolve(),
      currentStatus: { hasSynced: true },
    });
    expect(getColdStart()).toBe(false);
  });

  it("stays unknown when the status is not there or the database fails to open", async () => {
    await trackSqliteOpen({ waitForReady: () => Promise.resolve() });
    expect(getColdStart()).toBeNull();
    await trackSqliteOpen({ waitForReady: () => Promise.reject(new Error("no")) });
    expect(getColdStart()).toBeNull();
  });

  it("does not change the answer once it is known: the first sync later flips hasSynced", async () => {
    const status = { hasSynced: false };
    await trackSqliteOpen({ waitForReady: () => Promise.resolve(), currentStatus: status });
    status.hasSynced = true;
    expect(getColdStart()).toBe(true);
  });

  it("recordAppStart records one app.start per page load, with the navigation type", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" }] as never);
    recordAppStart();
    recordAppStart();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "app.start", durationMs: null });
    expect(events[0].attrs).toEqual({ navType: "reload" });
  });

  it.each([
    ["navigate", "navigate"],
    ["back_forward", "back_forward"],
    ["prerender", "navigate"],
  ])("recordAppStart maps %s to %s", (type, expected) => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type }] as never);
    recordAppStart();
    expect(events[0].attrs).toEqual({ navType: expected });
  });

  it("recordAppStart defaults to navigate when the browser has no navigation entry", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    recordAppStart();
    expect(events[0].attrs).toEqual({ navType: "navigate" });
  });
});

describe("credentials clock (written by spec 3's connector)", () => {
  beforeEach(() => resetSyncObserverForTests());
  afterEach(() => vi.restoreAllMocks());

  it("is false before any fetch was marked", () => {
    expect(credentialsFetchedWithin(1000, 5000)).toBe(false);
  });

  it("is true within the window after a fetch and false outside it", () => {
    vi.spyOn(performance, "now").mockReturnValue(10_000);
    markCredentialsFetched();
    expect(credentialsFetchedWithin(1000, 10_600)).toBe(true);
    expect(credentialsFetchedWithin(1000, 11_500)).toBe(false);
  });
});
