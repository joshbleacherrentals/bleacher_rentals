import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTransport,
  installPageLifecycle,
  type SendResult,
  type Transport,
} from "./telemetryTransport";
import type { PerfEvent } from "./telemetryEvent";

function event(index: number): PerfEvent {
  return {
    name: "app.telemetry_dropped",
    durationMs: null,
    outcome: "ok",
    errorKind: null,
    at: index,
    sessionId: "3f2b8c1e-5d4a-4b7e-9c1a-2f6d8e0a1b3c",
    tabRole: "leader",
    appVersion: "1.16.0",
    env: "production",
    browser: "chrome 141",
    os: "macos",
    deviceClass: "desktop",
    network: null,
    roles: null,
    attrs: null,
  };
}

type Send = (events: PerfEvent[]) => Promise<SendResult> | SendResult;

function setup(over: { send?: Send; sendFinal?: (events: PerfEvent[]) => boolean } = {}) {
  const send = vi.fn(over.send ?? (() => "ok" as SendResult));
  const sendFinal = vi.fn(over.sendFinal ?? (() => true));
  const onDrop = vi.fn();
  const transport = createTransport({ send, sendFinal, onDrop });
  return { transport, send, sendFinal, onDrop };
}

function enqueueMany(transport: Transport, count: number, from = 0) {
  for (let i = 0; i < count; i++) transport.enqueue(event(from + i));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("flush triggers", () => {
  it("flushes 10 seconds after the first event", async () => {
    const { transport, send } = setup();
    transport.enqueue(event(1));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(1);
    transport.stop();
  });

  it("flushes as soon as 50 events are buffered", async () => {
    const { transport, send } = setup();
    enqueueMany(transport, 49);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();

    transport.enqueue(event(49));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(50);
    transport.stop();
  });

  it("does not send when the buffer is empty", async () => {
    const { transport, send } = setup();
    transport.enqueue(event(1));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    transport.stop();
  });

  it("empties the buffer after a successful send", async () => {
    const { transport } = setup();
    enqueueMany(transport, 3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.size()).toBe(0);
    transport.stop();
  });
});

describe("batching", () => {
  it("never sends more than 100 events in one request", async () => {
    const { transport, send } = setup();
    enqueueMany(transport, 250);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    const sizes = send.mock.calls.map((call) => call[0].length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(250);
    expect(transport.size()).toBe(0);
    transport.stop();
  });

  it("also keeps a request under the byte limit, however few events it holds", async () => {
    const send = vi.fn((): SendResult => "ok");
    const transport = createTransport({
      send,
      sendFinal: () => true,
      maxBatchBytes: (JSON.stringify(event(1)).length + 1) * 3,
    });
    enqueueMany(transport, 10);
    await vi.advanceTimersByTimeAsync(60_000);

    const sizes = send.mock.calls.map((call) => (call as unknown as [PerfEvent[]])[0].length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(3);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
    transport.stop();
  });

  it("always sends at least one event, even one bigger than the byte limit", async () => {
    const send = vi.fn((): SendResult => "ok");
    const transport = createTransport({ send, sendFinal: () => true, maxBatchBytes: 10 });
    enqueueMany(transport, 2);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.size()).toBe(0);
    transport.stop();
  });

  it("sends events in the order they were recorded", async () => {
    const { transport, send } = setup();
    enqueueMany(transport, 120);
    await vi.advanceTimersByTimeAsync(10_000);
    const order = send.mock.calls.flatMap((call) => call[0].map((e: PerfEvent) => e.at));
    expect(order).toEqual(Array.from({ length: 120 }, (_, i) => i));
    transport.stop();
  });
});

describe("failure", () => {
  it("keeps the events when a send fails and retries them at the next flush", async () => {
    let attempt = 0;
    const { transport, send } = setup({ send: () => (++attempt === 1 ? "retry" : "ok") });
    enqueueMany(transport, 3);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(transport.size()).toBe(3);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].map((e: PerfEvent) => e.at)).toEqual([0, 1, 2]);
    expect(transport.size()).toBe(0);
    transport.stop();
  });

  it("treats a thrown send as a failure", async () => {
    let attempt = 0;
    const { transport } = setup({
      send: () => {
        if (++attempt === 1) throw new Error("offline");
        return "ok";
      },
    });
    enqueueMany(transport, 2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.size()).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.size()).toBe(0);
    transport.stop();
  });

  it("does not hammer a failing server on every new event", async () => {
    const { transport, send } = setup({ send: () => "retry" });
    enqueueMany(transport, 50);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    enqueueMany(transport, 60, 50);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(2);
    transport.stop();
  });

  it("drops a batch the server rejects for good, and reports it", async () => {
    const { transport, send, onDrop } = setup({ send: () => "reject" });
    enqueueMany(transport, 3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.size()).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(3);
    transport.stop();
  });
});

describe("overflow", () => {
  it("keeps at most 500 events and drops the oldest first", async () => {
    const { transport, send, onDrop } = setup({ send: () => "retry" });
    enqueueMany(transport, 520);
    expect(transport.size()).toBe(500);

    await vi.advanceTimersByTimeAsync(10_000);
    const firstBatch: PerfEvent[] = send.mock.calls.at(-1)![0];
    expect(firstBatch[0].at).toBe(20);
    expect(onDrop).toHaveBeenCalledWith(20);
    transport.stop();
  });

  it("reports a drop once, not again at the next flush", async () => {
    const { transport, onDrop } = setup({ send: () => "retry" });
    enqueueMany(transport, 510);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(10);
    transport.stop();
  });
});

describe("final flush", () => {
  it("sends what is buffered through the beacon path", () => {
    const { transport, sendFinal } = setup();
    enqueueMany(transport, 3);
    transport.flushFinal();
    expect(sendFinal).toHaveBeenCalledTimes(1);
    expect(sendFinal.mock.calls[0][0]).toHaveLength(3);
    expect(transport.size()).toBe(0);
    transport.stop();
  });

  it("keeps the events when the browser refuses to queue the beacon", () => {
    const { transport } = setup({ sendFinal: () => false });
    enqueueMany(transport, 3);
    transport.flushFinal();
    expect(transport.size()).toBe(3);
    transport.stop();
  });

  it("sends nothing when the buffer is empty", () => {
    const { transport, sendFinal } = setup();
    transport.flushFinal();
    expect(sendFinal).not.toHaveBeenCalled();
  });

  it("splits a large buffer into chunks of at most 100", () => {
    const { transport, sendFinal } = setup({ send: () => "retry" });
    enqueueMany(transport, 230);
    transport.flushFinal();
    const sizes = sendFinal.mock.calls.map((call) => call[0].length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(230);
    transport.stop();
  });
});

describe("installPageLifecycle", () => {
  function fakeTargets() {
    const handlers = new Map<string, () => void>();
    const addEventListener = (type: string, handler: () => void) => {
      handlers.set(type, handler);
    };
    const doc = { addEventListener, visibilityState: "visible" };
    const win = { addEventListener };
    return { doc, win, handlers };
  }

  it("flushes when the page becomes hidden", () => {
    const { doc, win, handlers } = fakeTargets();
    const flushFinal = vi.fn();
    installPageLifecycle(flushFinal, doc, win);

    doc.visibilityState = "hidden";
    handlers.get("visibilitychange")!();
    expect(flushFinal).toHaveBeenCalledTimes(1);
  });

  it("does not flush when the page becomes visible again", () => {
    const { doc, win, handlers } = fakeTargets();
    const flushFinal = vi.fn();
    installPageLifecycle(flushFinal, doc, win);

    doc.visibilityState = "visible";
    handlers.get("visibilitychange")!();
    expect(flushFinal).not.toHaveBeenCalled();
  });

  it("flushes on pagehide", () => {
    const { doc, win, handlers } = fakeTargets();
    const flushFinal = vi.fn();
    installPageLifecycle(flushFinal, doc, win);

    handlers.get("pagehide")!();
    expect(flushFinal).toHaveBeenCalledTimes(1);
  });
});
