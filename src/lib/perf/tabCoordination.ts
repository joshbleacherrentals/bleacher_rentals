import { setTabRole } from "./eventContext";

/**
 * Which tab is the leader, and "another tab is about to connect" notes.
 * Spec: docs/specs/perf-powersync-lifecycle.md §1a (D2) and D5.
 *
 * The PowerSync connection is shared by every tab (a SharedWorker), a tab is not. The leader
 * is the tab that currently holds a Web Lock; only it records connection-level metrics, so one
 * shared connection is not counted once per open tab. The lock is released when its tab
 * closes and the next waiting tab becomes leader: "leader" is not "the first tab for ever".
 *
 * A connect note exists because a `connect()` from any tab resets the shared connection
 * (observed, spec 2 §2 P3). The tab that is about to connect tells the others, so the leader
 * can label the reconnect that follows instead of reporting an unexplained drop.
 *
 * Nothing here may break the app: every failure leaves the role `unknown` and no note.
 */

export const LEADER_LOCK_NAME = "powersync-telemetry-leader";
const CHANNEL_NAME = "powersync-telemetry";

type LockCallback = (lock: unknown) => unknown;
export type LockManagerLike = {
  request: (name: string, optionsOrCallback: unknown, callback?: LockCallback) => unknown;
};

type ChannelLike = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (data: unknown) => void;
};

export type CoordinationDeps = {
  /** `null` means "this browser has no Web Locks". Omitted means "use the real one". */
  locks?: LockManagerLike | null;
  /** `null` means "no BroadcastChannel". Omitted means "use the real one". */
  createChannel?: () => ChannelLike | null;
};

let started = false;
let channel: ChannelLike | null = null;
let lastNoteAt: number | null = null;

/** Holds the lock until the tab closes. */
const HOLD_FOREVER = (): Promise<never> => new Promise<never>(() => {});

function defaultLocks(): LockManagerLike | null {
  return typeof navigator !== "undefined" && navigator.locks
    ? (navigator.locks as unknown as LockManagerLike)
    : null;
}

function defaultChannel(): ChannelLike | null {
  return typeof BroadcastChannel !== "undefined"
    ? (new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike)
    : null;
}

function electLeader(locks: LockManagerLike | null): void {
  if (!locks) {
    setTabRole("unknown");
    return;
  }

  try {
    // First ask only for a lock nobody holds: that tells a leader from a follower at once.
    void locks.request(LEADER_LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) {
        setTabRole("leader");
        return HOLD_FOREVER();
      }

      setTabRole("follower");
      // Then queue; this resolves when the current leader's tab closes.
      void locks.request(LEADER_LOCK_NAME, () => {
        setTabRole("leader");
        return HOLD_FOREVER();
      });
      return undefined;
    });
  } catch {
    setTabRole("unknown");
  }
}

function openChannel(create: () => ChannelLike | null): void {
  try {
    channel = create();
    if (!channel) return;

    channel.onmessage = (event) => {
      const data = event.data as { type?: unknown } | null;
      if (data && typeof data === "object" && data.type === "connect") lastNoteAt = Date.now();
    };
  } catch {
    channel = null;
  }
}

/** Idempotent: the lock is requested and the channel opened once per page load. */
export function startTabCoordination(deps: CoordinationDeps = {}): void {
  if (started) return;
  started = true;

  electLeader(deps.locks === undefined ? defaultLocks() : deps.locks);
  openChannel(deps.createChannel ?? defaultChannel);
}

/** Tell the other tabs this one is about to call `connect()`. */
export function announceConnect(): void {
  try {
    channel?.postMessage({ type: "connect" });
  } catch {
    // A note that is not sent only costs a label.
  }
}

/** Did another tab announce a `connect()` within the last `withinMs`? */
export function recentConnectNote(withinMs: number): boolean {
  return lastNoteAt !== null && Date.now() - lastNoteAt <= withinMs;
}

/** Test seam. */
export function resetTabCoordinationForTests(): void {
  started = false;
  channel = null;
  lastNoteAt = null;
}
