import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import type { DeviceClass, Env, PerfEvent, TabRole } from "./telemetryEvent";

/**
 * The part of an event that is the same for every metric. Built once per record, so a call
 * site never assembles it. Technical context only: no user id, email, token or cookie.
 */
export type EventContext = Pick<
  PerfEvent,
  | "sessionId"
  | "tabRole"
  | "appVersion"
  | "env"
  | "browser"
  | "os"
  | "deviceClass"
  | "network"
  | "roles"
>;

let sessionId: string | null = null;
let tabRole: TabRole = "unknown";

/** A fresh random id per page load; never derived from the signed-in user. */
function getSessionId(): string {
  sessionId ??= crypto.randomUUID();
  return sessionId;
}

/** Set by the lifecycle observer (spec 2). Read when each event is recorded: a leader can change. */
export function setTabRole(role: TabRole): void {
  tabRole = role;
}

export function getTabRole(): TabRole {
  return tabRole;
}

/** Test seam. */
export function resetEventContextForTests(): void {
  sessionId = null;
  tabRole = "unknown";
}

type ParsedUserAgent = { browser: string; os: string; deviceClass: DeviceClass };

function major(ua: string, pattern: RegExp): string | null {
  return pattern.exec(ua)?.[1] ?? null;
}

function parseBrowser(ua: string): string {
  const checks: [string, RegExp][] = [
    ["edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["opera", /OPR\/(\d+)/],
    ["firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["chrome", /(?:Chrome|CriOS)\/(\d+)/],
    ["safari", /Version\/(\d+).*Safari\//],
  ];
  for (const [family, pattern] of checks) {
    const version = major(ua, pattern);
    if (version) return `${family} ${version}`;
  }
  return "unknown";
}

function parseOs(ua: string, touchPoints: number): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS Safari reports a Mac user agent; only a touch screen gives it away.
  if (/Macintosh/.test(ua)) return touchPoints > 1 ? "ios" : "macos";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Linux|X11/.test(ua)) return "linux";
  return "other";
}

function parseDeviceClass(ua: string, os: string, touchPoints: number): DeviceClass {
  if (/iPad/.test(ua) || (os === "ios" && /Macintosh/.test(ua) && touchPoints > 1)) return "tablet";
  if (/iPhone|iPod/.test(ua)) return "mobile";
  if (os === "android") return /Mobile/.test(ua) ? "mobile" : "tablet";
  return "desktop";
}

export function parseUserAgent(ua: string, touchPoints = 0): ParsedUserAgent {
  const os = parseOs(ua, touchPoints);
  return { browser: parseBrowser(ua), os, deviceClass: parseDeviceClass(ua, os, touchPoints) };
}

function readNetwork(): EventContext["network"] {
  if (typeof navigator === "undefined") return null;

  const connection = (
    navigator as unknown as { connection?: { effectiveType?: unknown; rtt?: unknown } }
  ).connection;
  if (!connection) return null;

  const effectiveType =
    typeof connection.effectiveType === "string" ? connection.effectiveType : null;
  const rttMs = typeof connection.rtt === "number" ? connection.rtt : null;
  return effectiveType === null && rttMs === null ? null : { effectiveType, rttMs };
}

function readEnv(): Env {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function readAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || "unknown";
}

export function getEventContext(): EventContext {
  const hasNavigator = typeof navigator !== "undefined" && navigator !== null;
  const parsed = hasNavigator
    ? parseUserAgent(navigator.userAgent ?? "", navigator.maxTouchPoints ?? 0)
    : { browser: "unknown", os: "other", deviceClass: "desktop" as const };

  const roles = usePermissionsStore.getState().roles;

  return {
    sessionId: getSessionId(),
    tabRole,
    appVersion: readAppVersion(),
    env: readEnv(),
    browser: parsed.browser,
    os: parsed.os,
    deviceClass: parsed.deviceClass,
    network: readNetwork(),
    roles: roles.length > 0 ? roles : null,
  };
}
