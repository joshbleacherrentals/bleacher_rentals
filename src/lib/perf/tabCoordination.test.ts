import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTabRole, resetEventContextForTests } from "./eventContext";
import {
  LEADER_LOCK_NAME,
  announceConnect,
  recentConnectNote,
  resetTabCoordinationForTests,
  startTabCoordination,
} from "./tabCoordination";

type Callback = (lock: { name: string } | null) => unknown;

/** A minimal Web Locks manager: one named lock, a queue, and `ifAvailable`. */
function fakeLocks() {
  const held = new Set<string>();
  const queue = new Map<string, Array<() => void>>();
  const requests: string[] = [];

  return {
    requests,
    release(name: string) {
      held.delete(name);
      queue.get(name)?.shift()?.();
    },
    request(name: string, a: unknown, b?: unknown) {
      requests.push(name);
      const options = (typeof a === "function" ? {} : a) as { ifAvailable?: boolean };
      const callback = (typeof a === "function" ? a : b) as Callback;

      if (!held.has(name)) {
        held.add(name);
        return Promise.resolve(callback({ name }));
      }
      if (options.ifAvailable) return Promise.resolve(callback(null));

      return new Promise((resolve) => {
        const list = queue.get(name) ?? [];
        list.push(() => {
          held.add(name);
          resolve(callback({ name }));
        });
        queue.set(name, list);
      });
    },
  };
}

type Channel = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (data: unknown) => void;
  close: () => void;
};

/** BroadcastChannel semantics: a message reaches every other member, never the sender. */
function fakeHub() {
  const members: Channel[] = [];
  return {
    create(): Channel {
      const channel: Channel = {
        onmessage: null,
        postMessage(data) {
          for (const member of members) if (member !== channel) member.onmessage?.({ data });
        },
        close() {},
      };
      members.push(channel);
      return channel;
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

beforeEach(() => {
  resetEventContextForTests();
  resetTabCoordinationForTests();
});

afterEach(() => vi.restoreAllMocks());

describe("leader election (Web Locks)", () => {
  it("the tab that gets the lock is the leader", async () => {
    const locks = fakeLocks();
    startTabCoordination({ locks, createChannel: () => null });
    await settle();
    expect(getTabRole()).toBe("leader");
    expect(locks.requests).toEqual([LEADER_LOCK_NAME]);
  });

  it("a second tab is a follower, and becomes the leader when the lock is released", async () => {
    const locks = fakeLocks();

    startTabCoordination({ locks, createChannel: () => null });
    await settle();
    expect(getTabRole()).toBe("leader");

    // The second tab: a fresh module state against the same lock manager.
    resetTabCoordinationForTests();
    resetEventContextForTests();
    startTabCoordination({ locks, createChannel: () => null });
    await settle();
    expect(getTabRole()).toBe("follower");

    locks.release(LEADER_LOCK_NAME);
    await settle();
    expect(getTabRole()).toBe("leader");
  });

  it("stays unknown when the browser has no Web Locks", async () => {
    startTabCoordination({ locks: null, createChannel: () => null });
    await settle();
    expect(getTabRole()).toBe("unknown");
  });

  it("asks for the lock once, however often it is started", async () => {
    const locks = fakeLocks();
    startTabCoordination({ locks, createChannel: () => null });
    startTabCoordination({ locks, createChannel: () => null });
    await settle();
    expect(locks.requests).toHaveLength(1);
  });

  it("falls back to unknown when asking for the lock throws", async () => {
    const locks = {
      request: () => {
        throw new Error("denied");
      },
    };
    expect(() => startTabCoordination({ locks, createChannel: () => null })).not.toThrow();
    expect(getTabRole()).toBe("unknown");
  });
});

describe("connect notes (BroadcastChannel)", () => {
  it("a note from another tab counts for a second", () => {
    const hub = fakeHub();
    const other = hub.create();
    startTabCoordination({ locks: null, createChannel: () => hub.create() });

    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    other.postMessage({ type: "connect" });

    now.mockReturnValue(10_500);
    expect(recentConnectNote(1000)).toBe(true);
    now.mockReturnValue(11_500);
    expect(recentConnectNote(1000)).toBe(false);
  });

  it("is false when no note arrived", () => {
    const hub = fakeHub();
    startTabCoordination({ locks: null, createChannel: () => hub.create() });
    expect(recentConnectNote(1000)).toBe(false);
  });

  it("a tab's own announcement does not count as another tab's", () => {
    const hub = fakeHub();
    startTabCoordination({ locks: null, createChannel: () => hub.create() });
    announceConnect();
    expect(recentConnectNote(1000)).toBe(false);
  });

  it("an announcement reaches the other tabs", () => {
    const hub = fakeHub();
    const other = hub.create();
    const heard = vi.fn();
    other.onmessage = heard;

    startTabCoordination({ locks: null, createChannel: () => hub.create() });
    announceConnect();
    expect(heard).toHaveBeenCalledWith({ data: { type: "connect" } });
  });

  it("ignores messages that are not connect notes", () => {
    const hub = fakeHub();
    const other = hub.create();
    startTabCoordination({ locks: null, createChannel: () => hub.create() });

    vi.spyOn(Date, "now").mockReturnValue(10_000);
    other.postMessage({ type: "something-else" });
    other.postMessage("text");
    other.postMessage(null);
    expect(recentConnectNote(1000)).toBe(false);
  });

  it("tags nothing and throws nothing where there is no BroadcastChannel", () => {
    startTabCoordination({ locks: null, createChannel: () => null });
    expect(() => announceConnect()).not.toThrow();
    expect(recentConnectNote(1000)).toBe(false);
  });

  it("swallows a channel that throws", () => {
    startTabCoordination({
      locks: null,
      createChannel: () => {
        throw new Error("blocked");
      },
    });
    expect(() => announceConnect()).not.toThrow();
    expect(recentConnectNote(1000)).toBe(false);
  });
});
