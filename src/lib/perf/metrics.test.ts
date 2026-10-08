import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEventContextForTests } from "./eventContext";
import { metrics, setMetricsSink } from "./metrics";
import type { PerfEvent } from "./telemetryEvent";

let events: PerfEvent[];

function stubClock(...values: number[]) {
  const queue = [...values];
  return vi.spyOn(performance, "now").mockImplementation(() => queue.shift() ?? 0);
}

beforeEach(() => {
  events = [];
  resetEventContextForTests();
  setMetricsSink((event) => {
    events.push(event);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setMetricsSink(null);
});

describe("metrics.start", () => {
  it("records a duration from performance.now", () => {
    stubClock(100, 142.5);
    metrics.start("app.telemetry_dropped").end();
    expect(events).toHaveLength(1);
    expect(events[0].durationMs).toBe(42.5);
    expect(events[0].outcome).toBe("ok");
    expect(events[0].errorKind).toBeNull();
    expect(events[0].name).toBe("app.telemetry_dropped");
  });

  it("never uses Date.now for the duration", () => {
    stubClock(10, 30);
    // Date.now is only the event's timestamp; a wall clock that disagrees with the
    // monotonic one must not change the duration.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    metrics.start("app.telemetry_dropped").end();
    expect(events[0].durationMs).toBe(20);
    expect(events[0].at).toBe(1_700_000_000_000);
  });

  it("attaches the shared context once, at record time", () => {
    metrics.start("app.telemetry_dropped").end();
    expect(events[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events[0].appVersion).toEqual(expect.any(String));
    expect(events[0].tabRole).toBe("unknown");
    expect(["development", "production"]).toContain(events[0].env);
  });

  it("merges the attrs given at start with those given at end", () => {
    metrics.start("app.telemetry_dropped", { a: 1 }).end({ b: "x" });
    expect(events[0].attrs).toEqual({ a: 1, b: "x" });
  });

  it("has null attrs when none were given", () => {
    metrics.start("app.telemetry_dropped").end();
    expect(events[0].attrs).toBeNull();
  });

  it("records an end only once", () => {
    const handle = metrics.start("app.telemetry_dropped");
    handle.end();
    handle.end();
    handle.fail("timeout");
    expect(events).toHaveLength(1);
  });
});

describe("handle.fail", () => {
  it("records an error with a classified kind", () => {
    metrics.start("app.telemetry_dropped").fail({ status: 503, message: "row {x}" });
    expect(events[0].outcome).toBe("error");
    expect(events[0].errorKind).toBe("http_5xx");
  });

  it("accepts an already-classified kind", () => {
    metrics.start("app.telemetry_dropped").fail("timeout");
    expect(events[0].errorKind).toBe("timeout");
  });

  it("does not let free text through as a kind", () => {
    metrics.start("app.telemetry_dropped").fail("Could not insert row for person@x.com");
    expect(events[0].errorKind).toBe("unknown");
  });
});

describe("metrics.record and metrics.count", () => {
  it("records an already-measured duration", () => {
    metrics.record({ name: "app.telemetry_dropped", durationMs: 1234, attrs: { n: 1 } });
    expect(events[0].durationMs).toBe(1234);
    expect(events[0].outcome).toBe("ok");
    expect(events[0].attrs).toEqual({ n: 1 });
  });

  it("records a count event with a null duration", () => {
    metrics.count("app.telemetry_dropped", { dropped: 4 });
    expect(events[0].durationMs).toBeNull();
    expect(events[0].attrs).toEqual({ dropped: 4 });
  });
});

describe("failure isolation", () => {
  it("swallows an error thrown by the sink", () => {
    setMetricsSink(() => {
      throw new Error("storage full");
    });
    expect(() => metrics.start("app.telemetry_dropped").end()).not.toThrow();
    expect(() => metrics.count("app.telemetry_dropped")).not.toThrow();
    expect(() => metrics.record({ name: "app.telemetry_dropped", durationMs: 1 })).not.toThrow();
  });

  it("swallows an error thrown while reading the clock", () => {
    vi.spyOn(performance, "now").mockImplementation(() => {
      throw new Error("no clock");
    });
    expect(() => metrics.start("app.telemetry_dropped").end()).not.toThrow();
  });
});

describe("console output", () => {
  it("prints in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    metrics.start("app.telemetry_dropped").end();
    expect(debug).toHaveBeenCalled();
  });

  it("writes nothing to the console in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    metrics.start("app.telemetry_dropped").end();
    metrics.start("app.telemetry_dropped").fail("timeout");
    metrics.count("app.telemetry_dropped");
    for (const spy of [debug, log, warn, error]) expect(spy).not.toHaveBeenCalled();
  });
});
