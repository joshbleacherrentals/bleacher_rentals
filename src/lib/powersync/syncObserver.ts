import type { AbstractPowerSyncDatabase, SyncStatus } from "@powersync/web";
import { classifyError } from "@/lib/perf/classifyError";
import { getTabRole } from "@/lib/perf/eventContext";
import { metrics } from "@/lib/perf/metrics";
import {
  announceConnect,
  recentConnectNote,
  startTabCoordination,
} from "@/lib/perf/tabCoordination";
import type { Attrs, MetricName, Outcome, TabRole } from "@/lib/perf/telemetryEvent";

/**
 * Turns the SDK's status stream into the PowerSync lifecycle metrics.
 * Spec: docs/specs/perf-powersync-lifecycle.md.
 *
 * The signal is the SDK's own status (`connected`, `hasSynced`, `lastSyncedAt`), never a
 * timer. The state machine is a pure function so it is tested without a browser or the SDK;
 * `observeSync` is the thin shell that feeds it.
 */

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

export type StatusSnapshot = {
  connected: boolean;
  connecting: boolean;
  hasSynced: boolean;
  /** The SDK's value has one-second resolution and is null for a moment while connecting. */
  lastSyncedAtMs: number | null;
  /** Only ever classified, never read for its message. */
  downloadError: unknown;
  opsTotal: number | null;
  buckets: number;
};

export type Hints = {
  /** A credentials refresh just happened: this stream restart is the planned kind (D1). */
  planned: boolean;
  /** Another tab just called `connect()` (D5). */
  tabConnect: boolean;
};

export type Input =
  | {
      type: "ready";
      now: number;
      hasSynced: boolean;
      lastSyncedAtMs: number | null;
      hidden: boolean;
    }
  | { type: "status"; now: number; status: StatusSnapshot; hints: Hints; hidden: boolean }
  | { type: "hidden" };

export type ObservedEvent = {
  name: MetricName;
  /** Null for a count event. */
  durationMs: number | null;
  outcome: Outcome;
  errorKind: string | null;
  attrs: Attrs;
};

type Gap = {
  startedAt: number;
  error: unknown;
  planned: boolean;
  tabConnect: boolean;
  hidden: boolean;
};

export type ObserverState = {
  connectCalledAt: number;
  ready: boolean;
  /** The later of the `connect()` call and the database becoming ready. */
  startedAt: number;
  hasSyncedAtReady: boolean;
  baselineSyncedMs: number | null;
  connectDone: boolean;
  connectErrorSent: boolean;
  connectHidden: boolean;
  syncDone: boolean;
  syncHidden: boolean;
  connected: boolean;
  disconnects: number;
  gap: Gap | null;
  opsMax: number;
  bucketsMax: number;
};

export function initialState(connectCalledAt: number): ObserverState {
  return {
    connectCalledAt,
    ready: false,
    startedAt: connectCalledAt,
    hasSyncedAtReady: false,
    baselineSyncedMs: null,
    connectDone: false,
    connectErrorSent: false,
    connectHidden: false,
    syncDone: false,
    syncHidden: false,
    connected: false,
    disconnects: 0,
    gap: null,
    opsMax: 0,
    bucketsMax: 0,
  };
}

const since = (start: number, now: number) => Math.max(0, now - start);

function errorFields(error: unknown): { outcome: Outcome; errorKind: string | null } {
  return error == null
    ? { outcome: "ok", errorKind: null }
    : { outcome: "error", errorKind: classifyError(error) };
}

/**
 * `(state, input) -> { state, events }`. A status that arrives before the database is ready is
 * ignored. While reconnecting the SDK's status flaps (`connecting` true, false, true within a
 * millisecond, several identical statuses in a row), so only two transitions count:
 * `connected` true to false opens a gap, the next false to true closes it.
 */
export function step(
  previous: ObserverState,
  input: Input,
): { state: ObserverState; events: ObservedEvent[] } {
  const state: ObserverState = { ...previous, gap: previous.gap ? { ...previous.gap } : null };
  const events: ObservedEvent[] = [];

  if (input.type === "hidden") {
    markHidden(state);
    return { state, events };
  }

  if (input.type === "ready") {
    state.ready = true;
    state.startedAt = Math.max(state.connectCalledAt, input.now);
    state.hasSyncedAtReady = input.hasSynced;
    state.baselineSyncedMs = input.lastSyncedAtMs;
    if (input.hidden) markHidden(state);
    return { state, events };
  }

  if (!state.ready) return { state, events };

  const { now, status, hints } = input;
  if (input.hidden) markHidden(state);

  if (status.opsTotal !== null) state.opsMax = Math.max(state.opsMax, status.opsTotal);
  state.bucketsMax = Math.max(state.bucketsMax, status.buckets);

  // --- the connection ---------------------------------------------------
  if (status.connected && !state.connected) {
    if (!state.connectDone) {
      events.push({
        name: "powersync.connect",
        durationMs: since(state.startedAt, now),
        outcome: "ok",
        errorKind: null,
        attrs: { hidden: state.connectHidden },
      });
      state.connectDone = true;
    } else if (state.gap) {
      const gap = state.gap;
      const attrs: Attrs = { hidden: gap.hidden };
      if (gap.tabConnect) attrs.cause = "tab_connect";
      if (gap.planned) attrs.planned = true;
      events.push({
        name: "powersync.reconnect",
        durationMs: since(gap.startedAt, now),
        ...errorFields(gap.error),
        attrs,
      });
      state.gap = null;
    }
    state.connected = true;
  } else if (!status.connected && state.connected) {
    state.disconnects += 1;
    events.push({
      name: "powersync.disconnect",
      durationMs: null,
      outcome: "ok",
      errorKind: null,
      attrs: { n: state.disconnects, hadError: status.downloadError != null },
    });
    state.gap = {
      startedAt: now,
      error: status.downloadError ?? null,
      planned: hints.planned,
      tabConnect: hints.tabConnect,
      hidden: input.hidden,
    };
    state.connected = false;
  } else if (!status.connected && status.downloadError != null) {
    if (!state.connectDone && !state.connectErrorSent) {
      events.push({
        name: "powersync.connect",
        durationMs: since(state.startedAt, now),
        outcome: "error",
        errorKind: classifyError(status.downloadError),
        attrs: { hidden: state.connectHidden },
      });
      state.connectErrorSent = true;
    } else if (state.gap && state.gap.error == null) {
      state.gap.error = status.downloadError;
    }
  }

  // --- the data: one sync metric per observer, never both ---------------
  if (!state.syncDone) {
    if (!state.hasSyncedAtReady && status.hasSynced) {
      events.push({
        name: "sync.initial",
        durationMs: since(state.startedAt, now),
        outcome: "ok",
        errorKind: null,
        attrs: { ops: state.opsMax, buckets: state.bucketsMax, hidden: state.syncHidden },
      });
      state.syncDone = true;
    } else if (
      state.hasSyncedAtReady &&
      status.lastSyncedAtMs !== null &&
      status.lastSyncedAtMs !== state.baselineSyncedMs
    ) {
      // The end is when this event arrived: the value itself only says that it changed.
      events.push({
        name: "sync.catchup",
        durationMs: since(state.startedAt, now),
        outcome: "ok",
        errorKind: null,
        attrs: { ops: state.opsMax, hidden: state.syncHidden },
      });
      state.syncDone = true;
    }
  }

  return { state, events };
}

/** "Was the page hidden at any point in the span": only spans that are still open count. */
function markHidden(state: ObserverState): void {
  if (!state.connectDone) state.connectHidden = true;
  if (!state.syncDone) state.syncHidden = true;
  if (state.gap) state.gap.hidden = true;
}

// ---------------------------------------------------------------------------
// The shell around the SDK
// ---------------------------------------------------------------------------

/** What `observeSync` needs from the database: a slice of `PowerSyncDatabase`. */
export type ObservableDb = Pick<
  AbstractPowerSyncDatabase,
  "waitForReady" | "registerListener" | "currentStatus"
>;

type ConnectableDb = ObservableDb & Pick<AbstractPowerSyncDatabase, "connect" | "disconnect">;

export type ObserverDeps = {
  now: () => number;
  getTabRole: () => TabRole;
  record: (event: ObservedEvent) => void;
  isHidden: () => boolean;
  onHidden: (callback: () => void) => () => void;
  credentialsFetchedWithin: (withinMs: number, now: number) => boolean;
  recentConnectNote: (withinMs: number) => boolean;
  startCoordination: () => void;
  announceConnect: () => void;
};

/** The window inside which a refresh or another tab's connect is taken as the cause (mine, D1/D5). */
const CAUSE_WINDOW_MS = 1000;

const pageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

function onPageHidden(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const listener = () => {
    if (document.visibilityState === "hidden") callback();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function recordObserved(event: ObservedEvent): void {
  if (event.durationMs === null) {
    metrics.count(event.name, event.attrs);
    return;
  }
  metrics.record({
    name: event.name,
    durationMs: event.durationMs,
    outcome: event.outcome,
    errorKind: event.errorKind,
    attrs: event.attrs,
  });
}

function defaultDeps(): ObserverDeps {
  return {
    now: () => performance.now(),
    getTabRole,
    record: recordObserved,
    isHidden: pageHidden,
    onHidden: onPageHidden,
    credentialsFetchedWithin,
    recentConnectNote,
    startCoordination: () => startTabCoordination(),
    announceConnect,
  };
}

function toSnapshot(status: SyncStatus): StatusSnapshot {
  return {
    connected: status.connected,
    connecting: status.connecting,
    hasSynced: status.hasSynced ?? false,
    lastSyncedAtMs: status.lastSyncedAt?.getTime() ?? null,
    downloadError: status.dataFlowStatus.downloadError ?? null,
    opsTotal: status.downloadProgress?.totalOperations ?? null,
    buckets: Object.keys(status.dataFlowStatus.downloadProgress ?? {}).length,
  };
}

/**
 * Call just before `connect()`. Returns the unsubscribe. Nothing is read from the database
 * before it is ready, and a follower tab keeps the state but records nothing: the shared
 * connection is the leader's to report (spec §1a). The role is read when an event happens.
 */
export function observeSync(db: ObservableDb, overrides: Partial<ObserverDeps> = {}): () => void {
  const deps = { ...defaultDeps(), ...overrides };
  let state = initialState(deps.now());
  let disposed = false;
  let unsubscribe: (() => void) | null = null;
  let stopHidden: () => void = () => {};

  const dispatch = (input: Input) => {
    try {
      const result = step(state, input);
      state = result.state;
      if (deps.getTabRole() === "follower") return;
      for (const event of result.events) deps.record(event);
    } catch {
      // Telemetry never breaks the app.
    }
  };

  db.waitForReady().then(
    () => {
      if (disposed) return;
      const current = db.currentStatus;
      dispatch({
        type: "ready",
        now: deps.now(),
        hasSynced: current.hasSynced ?? false,
        lastSyncedAtMs: current.lastSyncedAt?.getTime() ?? null,
        hidden: deps.isHidden(),
      });

      stopHidden = deps.onHidden(() => dispatch({ type: "hidden" }));
      unsubscribe = db.registerListener({
        statusChanged: (status) => {
          const now = deps.now();
          dispatch({
            type: "status",
            now,
            status: toSnapshot(status),
            hints: {
              planned: deps.credentialsFetchedWithin(CAUSE_WINDOW_MS, now),
              tabConnect: deps.recentConnectNote(CAUSE_WINDOW_MS),
            },
            hidden: deps.isHidden(),
          });
        },
      });
    },
    () => {},
  );

  return () => {
    disposed = true;
    unsubscribe?.();
    stopHidden();
  };
}

/**
 * Observes, announces, connects; the returned cleanup unsubscribes **first** and only then
 * disconnects, so the provider's own disconnect is not counted as a lost connection.
 */
export function connectWithObserver(
  db: ConnectableDb,
  connector: Parameters<AbstractPowerSyncDatabase["connect"]>[0],
  options: Parameters<AbstractPowerSyncDatabase["connect"]>[1],
  overrides: Partial<ObserverDeps> = {},
): () => void {
  const deps = { ...defaultDeps(), ...overrides };

  deps.startCoordination();
  const stopObserving = observeSync(db, deps);
  deps.announceConnect();
  void db.connect(connector, options);

  return () => {
    stopObserving();
    void db.disconnect?.();
  };
}

// ---------------------------------------------------------------------------
// Per-tab metrics
// ---------------------------------------------------------------------------

/** "Was the page hidden at any point since this was called". `stop()` ends the tracking. */
export function trackHidden(): { stop: () => boolean } {
  let seen = pageHidden();
  const off = onPageHidden(() => {
    seen = true;
  });
  return {
    stop() {
      off();
      return seen;
    },
  };
}

let coldStart: boolean | null = null;

/**
 * Whether this load began on a device that had never synced: `hasSynced` was false at the moment
 * the local database became ready. Read then and kept, because the first sync flips `hasSynced`
 * to true before the page has anything to show. Null until the database is ready or when its
 * status is not available. Spec: docs/specs/perf-first-data.md §2.
 */
export function getColdStart(): boolean | null {
  return coldStart;
}

/**
 * From the construction of the database to `waitForReady()`, and the cold-start state at that
 * moment. Call right after constructing the database.
 */
export function trackSqliteOpen(
  db: Pick<AbstractPowerSyncDatabase, "waitForReady"> & {
    currentStatus?: { hasSynced?: boolean };
  },
): Promise<void> {
  const hidden = trackHidden();
  const handle = metrics.start("sqlite.open");

  return db.waitForReady().then(
    () => {
      if (coldStart === null && db.currentStatus)
        coldStart = !(db.currentStatus.hasSynced ?? false);
      handle.end({ hidden: hidden.stop() });
    },
    (error: unknown) => handle.fail(error, { hidden: hidden.stop() }),
  );
}

let appStartRecorded = false;

/** One count event per page load: the denominator for every other metric. */
export function recordAppStart(): void {
  if (appStartRecorded) return;
  appStartRecorded = true;

  const entry = performance.getEntriesByType?.("navigation")[0] as { type?: string } | undefined;
  const navType =
    entry?.type === "reload" || entry?.type === "back_forward" ? entry.type : "navigate";
  metrics.count("app.start", { navType });
}

// ---------------------------------------------------------------------------
// The credentials clock (written by spec 3's connector, read for `planned`)
// ---------------------------------------------------------------------------

let lastCredentialsAt: number | null = null;

/** Spec 3's connector calls this when it fetches a new token. One number, no data. */
export function markCredentialsFetched(): void {
  lastCredentialsAt = performance.now();
}

export function credentialsFetchedWithin(withinMs: number, now = performance.now()): boolean {
  if (lastCredentialsAt === null) return false;
  const elapsed = now - lastCredentialsAt;
  return elapsed >= 0 && elapsed <= withinMs;
}

/** Test seam. */
export function resetSyncObserverForTests(): void {
  appStartRecorded = false;
  coldStart = null;
  lastCredentialsAt = null;
}
