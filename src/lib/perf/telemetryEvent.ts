import type { WebRole } from "@/features/userAccess/logic/determineAccess";
import { isErrorKind } from "./classifyError";

/**
 * The telemetry event, shared by the client (which builds it) and the route (which refuses
 * anything that does not match). Spec: docs/specs/perf-telemetry-pipeline.md.
 */

/**
 * The registry. Names are `domain.thing`, lowercase. This spec adds `app.telemetry_dropped`;
 * the other specs add theirs here, so a name outside this list neither compiles nor is
 * accepted by the route.
 */
export const METRIC_NAMES = [
  "app.telemetry_dropped",
  // spec 2 — docs/specs/perf-powersync-lifecycle.md
  "app.start",
  "sqlite.open",
  "powersync.connect",
  "powersync.disconnect",
  "powersync.reconnect",
  "sync.initial",
  "sync.catchup",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

/** Per metric, the `attrs` keys the route keeps. Anything else is dropped. */
export const ATTR_ALLOWLIST: Record<MetricName, readonly string[]> = {
  "app.telemetry_dropped": ["dropped"],
  "app.start": ["navType"],
  "sqlite.open": ["hidden"],
  "powersync.connect": ["hidden"],
  "powersync.disconnect": ["n", "hadError"],
  "powersync.reconnect": ["hidden", "cause", "planned"],
  "sync.initial": ["ops", "buckets", "hidden"],
  "sync.catchup": ["ops", "hidden"],
};

export type Outcome = "ok" | "error";
export type TabRole = "leader" | "follower" | "unknown";
export type DeviceClass = "desktop" | "tablet" | "mobile";
export type Env = "development" | "production";
export type AttrValue = number | string | boolean;
export type Attrs = Record<string, AttrValue>;

export type PerfEvent = {
  name: MetricName;
  /** `performance.now()` difference; null for a pure count event. */
  durationMs: number | null;
  outcome: Outcome;
  /** Classified, never `error.message`. */
  errorKind: string | null;
  /** `Date.now()` at the end of the span — ordering only, never a duration. */
  at: number;
  /** Random per page load (one per tab); never a Clerk id. */
  sessionId: string;
  tabRole: TabRole;
  appVersion: string;
  env: Env;
  browser: string;
  os: string;
  deviceClass: DeviceClass;
  /** `navigator.connection`, Chromium only. A channel hint, not PowerSync latency. */
  network: { effectiveType: string | null; rttMs: number | null } | null;
  /** Null until access is resolved. */
  roles: WebRole[] | null;
  attrs: Attrs | null;
};

export const MAX_BATCH_EVENTS = 100;
export const MAX_BATCH_BYTES = 64 * 1024;
export const MAX_DURATION_MS = 3_600_000;
export const MAX_ATTR_STRING = 64;
const MAX_SHORT_STRING = 32;

export const WEB_ROLES = [
  "admin",
  "account_manager",
  "developer",
  "viewer",
  "driver",
  "maintainer",
  "accountant",
] as const satisfies readonly WebRole[];

// Fails to compile when a role is added to `WebRole` and not to the list above.
type MissingRoles = Exclude<WebRole, (typeof WEB_ROLES)[number]>;
const _everyRoleListed: [MissingRoles] extends [never] ? true : never = true;
void _everyRoleListed;

const OUTCOMES: readonly string[] = ["ok", "error"];
const TAB_ROLES: readonly string[] = ["leader", "follower", "unknown"];
const DEVICE_CLASSES: readonly string[] = ["desktop", "tablet", "mobile"];
const ENVS: readonly string[] = ["development", "production"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SHORT_STRING;
}

function isMetricName(value: unknown): value is MetricName {
  return typeof value === "string" && (METRIC_NAMES as readonly string[]).includes(value);
}

/** `undefined` means the whole attrs object is invalid; `null` means nothing to keep. */
function sanitizeAttrs(name: MetricName, raw: unknown): Attrs | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;

  const allowed = ATTR_ALLOWLIST[name];
  const kept: Attrs = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) continue;

    if (typeof value === "number") {
      if (!Number.isFinite(value)) return undefined;
    } else if (typeof value === "string") {
      if (value.length > MAX_ATTR_STRING) return undefined;
    } else if (typeof value !== "boolean") {
      return undefined;
    }
    kept[key] = value;
  }

  return Object.keys(kept).length > 0 ? kept : null;
}

function sanitizeNetwork(raw: unknown): PerfEvent["network"] | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;

  const { effectiveType, rttMs } = raw;
  if (
    effectiveType !== null &&
    !(typeof effectiveType === "string" && effectiveType.length <= 16)
  ) {
    return undefined;
  }
  if (rttMs !== null && !(typeof rttMs === "number" && Number.isFinite(rttMs) && rttMs >= 0)) {
    return undefined;
  }
  return { effectiveType: effectiveType as string | null, rttMs: rttMs as number | null };
}

function sanitizeRoles(raw: unknown): WebRole[] | null | undefined {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length > WEB_ROLES.length) return undefined;
  if (!raw.every((role) => (WEB_ROLES as readonly unknown[]).includes(role))) return undefined;
  return raw as WebRole[];
}

/**
 * Returns the event rebuilt from known fields only (an unknown field never survives), or
 * null when it must be refused. An `attrs` key off the allow-list is dropped and the event
 * is kept; an attrs *value* that is the wrong type or too long refuses the event.
 */
export function validateEvent(raw: unknown): PerfEvent | null {
  if (!isRecord(raw)) return null;

  const { name, durationMs, outcome, errorKind, at, sessionId, tabRole } = raw;
  const { appVersion, env, browser, os, deviceClass } = raw;

  if (!isMetricName(name)) return null;

  if (durationMs !== null) {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return null;
    if (durationMs < 0 || durationMs > MAX_DURATION_MS) return null;
  }

  if (typeof outcome !== "string" || !OUTCOMES.includes(outcome)) return null;
  if (errorKind !== null && !(typeof errorKind === "string" && isErrorKind(errorKind))) return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return null;
  if (typeof tabRole !== "string" || !TAB_ROLES.includes(tabRole)) return null;
  if (!isShortString(appVersion)) return null;
  if (typeof env !== "string" || !ENVS.includes(env)) return null;
  if (!isShortString(browser) || !isShortString(os)) return null;
  if (typeof deviceClass !== "string" || !DEVICE_CLASSES.includes(deviceClass)) return null;

  const network = sanitizeNetwork(raw.network);
  const roles = sanitizeRoles(raw.roles);
  const attrs = sanitizeAttrs(name, raw.attrs);
  if (network === undefined || roles === undefined || attrs === undefined) return null;

  return {
    name,
    durationMs: durationMs as number | null,
    outcome: outcome as Outcome,
    errorKind: errorKind as string | null,
    at,
    sessionId,
    tabRole: tabRole as TabRole,
    appVersion,
    env: env as Env,
    browser,
    os,
    deviceClass: deviceClass as DeviceClass,
    network,
    roles,
    attrs,
  };
}

export type ValidBatch = { events: PerfEvent[]; dropped: number; total: number };

/** Null when the body is not `{ events: [...] }`. One bad event does not sink the batch. */
export function validateBatch(raw: unknown): ValidBatch | null {
  if (!isRecord(raw) || !Array.isArray(raw.events)) return null;

  const events: PerfEvent[] = [];
  for (const candidate of raw.events) {
    const event = validateEvent(candidate);
    if (event) events.push(event);
  }

  return { events, dropped: raw.events.length - events.length, total: raw.events.length };
}

/** The `PerfEvents` row for an event. There is deliberately no user column. */
export function eventToRow(event: PerfEvent) {
  return {
    event_at: new Date(event.at).toISOString(),
    name: event.name,
    duration_ms: event.durationMs,
    outcome: event.outcome,
    error_kind: event.errorKind,
    session_id: event.sessionId,
    tab_role: event.tabRole,
    app_version: event.appVersion,
    env: event.env,
    browser: event.browser,
    os: event.os,
    device_class: event.deviceClass,
    network_type: event.network?.effectiveType ?? null,
    rtt_ms: event.network?.rttMs == null ? null : Math.round(event.network.rttMs),
    roles: event.roles,
    attrs: event.attrs,
  };
}
