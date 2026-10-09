import { describe, expect, it } from "vitest";
import {
  ATTR_ALLOWLIST,
  MAX_ATTR_STRING,
  MAX_DURATION_MS,
  METRIC_NAMES,
  eventToRow,
  validateBatch,
  validateEvent,
} from "./telemetryEvent";

const valid = (over: Record<string, unknown> = {}) => ({
  name: "app.telemetry_dropped",
  durationMs: null,
  outcome: "ok",
  errorKind: null,
  at: 1_700_000_000_000,
  sessionId: "3f2b8c1e-5d4a-4b7e-9c1a-2f6d8e0a1b3c",
  tabRole: "leader",
  appVersion: "1.16.0",
  env: "production",
  browser: "chrome 141",
  os: "macos",
  deviceClass: "desktop",
  network: { effectiveType: "4g", rttMs: 50 },
  roles: ["admin"],
  attrs: { dropped: 3 },
  ...over,
});

describe("registry", () => {
  it("has dot-separated lowercase names", () => {
    for (const name of METRIC_NAMES) expect(name).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it("has an attrs allow-list for every name", () => {
    for (const name of METRIC_NAMES) expect(ATTR_ALLOWLIST[name]).toBeDefined();
  });
});

describe("spec 2 names", () => {
  it.each([
    "app.start",
    "sqlite.open",
    "powersync.connect",
    "powersync.disconnect",
    "powersync.reconnect",
    "sync.initial",
    "sync.catchup",
  ])("%s is in the registry and keeps only its own attrs", (name) => {
    const event = validateEvent(valid({ name, attrs: { sql: "select 1", email: "a@b.c" } }));
    expect(event).not.toBeNull();
    expect(event?.attrs).toBeNull();
  });

  it("keeps the attrs each lifecycle metric defines", () => {
    const keep = (name: string, attrs: Record<string, unknown>) =>
      validateEvent(valid({ name, attrs }))?.attrs;

    expect(keep("app.start", { navType: "reload" })).toEqual({ navType: "reload" });
    expect(keep("sqlite.open", { hidden: true })).toEqual({ hidden: true });
    expect(keep("powersync.connect", { hidden: false })).toEqual({ hidden: false });
    expect(keep("powersync.disconnect", { n: 2, hadError: true })).toEqual({
      n: 2,
      hadError: true,
    });
    expect(
      keep("powersync.reconnect", { hidden: false, cause: "tab_connect", planned: true }),
    ).toEqual({
      hidden: false,
      cause: "tab_connect",
      planned: true,
    });
    expect(keep("sync.initial", { ops: 40, buckets: 3, hidden: false })).toEqual({
      ops: 40,
      buckets: 3,
      hidden: false,
    });
    expect(keep("sync.catchup", { ops: 0, hidden: false })).toEqual({ ops: 0, hidden: false });
  });
});

describe("validateEvent", () => {
  it("accepts a valid event unchanged", () => {
    expect(validateEvent(valid())).toEqual(valid());
  });

  it("accepts a count event with no network, roles or attrs", () => {
    const event = validateEvent(valid({ network: null, roles: null, attrs: null }));
    expect(event).not.toBeNull();
    expect(event?.durationMs).toBeNull();
  });

  it("refuses a name outside the registry", () => {
    expect(validateEvent(valid({ name: "syncTime" }))).toBeNull();
    expect(validateEvent(valid({ name: "ui.first_data" }))).toBeNull();
    expect(validateEvent(valid({ name: 5 }))).toBeNull();
  });

  it("refuses a negative, non-finite or absurd duration", () => {
    expect(validateEvent(valid({ durationMs: -1 }))).toBeNull();
    expect(validateEvent(valid({ durationMs: Number.NaN }))).toBeNull();
    expect(validateEvent(valid({ durationMs: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(validateEvent(valid({ durationMs: MAX_DURATION_MS + 1 }))).toBeNull();
    expect(validateEvent(valid({ durationMs: "12" }))).toBeNull();
  });

  it("accepts the duration bounds", () => {
    expect(validateEvent(valid({ durationMs: 0 }))).not.toBeNull();
    expect(validateEvent(valid({ durationMs: MAX_DURATION_MS }))).not.toBeNull();
  });

  it("refuses values outside their sets", () => {
    expect(validateEvent(valid({ outcome: "slow" }))).toBeNull();
    expect(validateEvent(valid({ tabRole: "first" }))).toBeNull();
    expect(validateEvent(valid({ env: "staging" }))).toBeNull();
    expect(validateEvent(valid({ deviceClass: "tv" }))).toBeNull();
  });

  it("accepts all three tab roles", () => {
    for (const tabRole of ["leader", "follower", "unknown"]) {
      expect(validateEvent(valid({ tabRole }))).not.toBeNull();
    }
  });

  it("refuses a session id that is not a uuid", () => {
    expect(validateEvent(valid({ sessionId: "user_2abc" }))).toBeNull();
  });

  it("strips an attrs key that is off the allow-list and keeps the event", () => {
    const event = validateEvent(valid({ attrs: { dropped: 3, email: "a@b.c", sql: "select 1" } }));
    expect(event?.attrs).toEqual({ dropped: 3 });
  });

  it("turns an attrs object left empty into null", () => {
    expect(validateEvent(valid({ attrs: { email: "a@b.c" } }))?.attrs).toBeNull();
  });

  it("refuses an attrs string longer than the cap", () => {
    const long = "x".repeat(MAX_ATTR_STRING + 1);
    expect(validateEvent(valid({ attrs: { dropped: long } }))).toBeNull();
  });

  it("refuses an attrs value that is not a number, string or boolean", () => {
    expect(validateEvent(valid({ attrs: { dropped: { a: 1 } } }))).toBeNull();
    expect(validateEvent(valid({ attrs: { dropped: Number.NaN } }))).toBeNull();
  });

  it("accepts only WebRole values as roles", () => {
    expect(validateEvent(valid({ roles: ["admin", "accountant"] }))).not.toBeNull();
    expect(validateEvent(valid({ roles: ["superuser"] }))).toBeNull();
    expect(validateEvent(valid({ roles: "admin" }))).toBeNull();
  });

  it("accepts a classified error kind and refuses free text", () => {
    expect(validateEvent(valid({ outcome: "error", errorKind: "timeout" }))).not.toBeNull();
    expect(validateEvent(valid({ outcome: "error", errorKind: "pg:23505" }))).not.toBeNull();
    expect(
      validateEvent(valid({ outcome: "error", errorKind: "duplicate key: person@x.com" })),
    ).toBeNull();
  });

  it("refuses non-objects and a missing field", () => {
    expect(validateEvent(null)).toBeNull();
    expect(validateEvent("event")).toBeNull();
    const { appVersion: _omit, ...withoutVersion } = valid();
    expect(validateEvent(withoutVersion)).toBeNull();
  });

  it("refuses over-long browser, os and version strings", () => {
    expect(validateEvent(valid({ browser: "c".repeat(40) }))).toBeNull();
    expect(validateEvent(valid({ os: "o".repeat(40) }))).toBeNull();
    expect(validateEvent(valid({ appVersion: "v".repeat(40) }))).toBeNull();
  });

  it("drops fields it does not know about", () => {
    const event = validateEvent(valid({ userId: "user_123", email: "a@b.c" }));
    expect(event).not.toBeNull();
    expect(event as object).not.toHaveProperty("userId");
    expect(event as object).not.toHaveProperty("email");
  });
});

describe("validateBatch", () => {
  it("returns the valid events and counts the rest as dropped", () => {
    const batch = validateBatch({ events: [valid(), valid({ name: "nope" }), valid()] });
    expect(batch?.events).toHaveLength(2);
    expect(batch?.dropped).toBe(1);
    expect(batch?.total).toBe(3);
  });

  it("returns null when the body has no events array", () => {
    expect(validateBatch({})).toBeNull();
    expect(validateBatch({ events: "x" })).toBeNull();
    expect(validateBatch(null)).toBeNull();
  });
});

describe("eventToRow", () => {
  it("maps an event to the table's columns", () => {
    const row = eventToRow(validEvent());
    expect(row).toMatchObject({
      name: "app.telemetry_dropped",
      duration_ms: null,
      outcome: "ok",
      error_kind: null,
      session_id: "3f2b8c1e-5d4a-4b7e-9c1a-2f6d8e0a1b3c",
      tab_role: "leader",
      app_version: "1.16.0",
      env: "production",
      browser: "chrome 141",
      os: "macos",
      device_class: "desktop",
      network_type: "4g",
      rtt_ms: 50,
      roles: ["admin"],
      attrs: { dropped: 3 },
    });
    expect(row.event_at).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("writes null network columns when there is no connection info", () => {
    const row = eventToRow(validEvent({ network: null }));
    expect(row.network_type).toBeNull();
    expect(row.rtt_ms).toBeNull();
  });

  it("rounds the rtt to an integer column", () => {
    expect(eventToRow(validEvent({ network: { effectiveType: "4g", rttMs: 49.6 } })).rtt_ms).toBe(
      50,
    );
  });

  it("has no column that could carry a user id", () => {
    const keys = Object.keys(eventToRow(validEvent()));
    expect(keys.filter((k) => /user|email|clerk/i.test(k))).toEqual([]);
  });
});

function validEvent(over: Record<string, unknown> = {}) {
  const event = validateEvent(valid(over));
  if (!event) throw new Error("fixture is invalid");
  return event;
}
