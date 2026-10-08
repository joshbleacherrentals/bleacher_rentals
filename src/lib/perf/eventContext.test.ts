import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  getEventContext,
  getTabRole,
  parseUserAgent,
  resetEventContextForTests,
  setTabRole,
} from "./eventContext";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SAFARI_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const CHROME_ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("parseUserAgent", () => {
  it("reads Chrome on macOS", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({
      browser: "chrome 141",
      os: "macos",
      deviceClass: "desktop",
    });
  });

  it("reads Chrome on Windows", () => {
    expect(parseUserAgent(CHROME_WIN)).toEqual({
      browser: "chrome 140",
      os: "windows",
      deviceClass: "desktop",
    });
  });

  it("tells Edge from Chrome", () => {
    expect(parseUserAgent(EDGE).browser).toBe("edge 141");
  });

  it("reads Firefox on Linux", () => {
    expect(parseUserAgent(FIREFOX)).toEqual({
      browser: "firefox 130",
      os: "linux",
      deviceClass: "desktop",
    });
  });

  it("reads Safari on macOS", () => {
    expect(parseUserAgent(SAFARI_MAC).browser).toBe("safari 18");
  });

  it("classes a phone and a tablet", () => {
    expect(parseUserAgent(SAFARI_IPHONE)).toMatchObject({ os: "ios", deviceClass: "mobile" });
    expect(parseUserAgent(SAFARI_IPAD)).toMatchObject({ os: "ios", deviceClass: "tablet" });
    expect(parseUserAgent(CHROME_ANDROID_PHONE)).toMatchObject({
      os: "android",
      deviceClass: "mobile",
    });
    expect(parseUserAgent(CHROME_ANDROID_TABLET)).toMatchObject({
      os: "android",
      deviceClass: "tablet",
    });
  });

  it("treats a touch-screen Mac as an iPad", () => {
    expect(parseUserAgent(SAFARI_MAC, 5)).toMatchObject({ os: "ios", deviceClass: "tablet" });
    expect(parseUserAgent(SAFARI_MAC, 0)).toMatchObject({ os: "macos", deviceClass: "desktop" });
  });

  it("falls back to unknown values", () => {
    expect(parseUserAgent("")).toEqual({ browser: "unknown", os: "other", deviceClass: "desktop" });
  });

  it("keeps every field under the length cap", () => {
    const parsed = parseUserAgent(CHROME_MAC);
    expect(parsed.browser.length).toBeLessThanOrEqual(32);
    expect(parsed.os.length).toBeLessThanOrEqual(32);
  });
});

describe("getEventContext", () => {
  beforeEach(() => {
    resetEventContextForTests();
    usePermissionsStore.setState({ roles: [] });
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC, maxTouchPoints: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps one session id for the page load", () => {
    const a = getEventContext().sessionId;
    const b = getEventContext().sessionId;
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("starts a new session id after a reset", () => {
    const a = getEventContext().sessionId;
    resetEventContextForTests();
    expect(getEventContext().sessionId).not.toBe(a);
  });

  it("reports the environment from NODE_ENV at call time", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getEventContext().env).toBe("production");
    vi.stubEnv("NODE_ENV", "development");
    expect(getEventContext().env).toBe("development");
    vi.stubEnv("NODE_ENV", "test");
    expect(getEventContext().env).toBe("development");
  });

  it("reads the app version from the build variable", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.16.0");
    expect(getEventContext().appVersion).toBe("1.16.0");
  });

  it("uses a placeholder when the version is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    expect(getEventContext().appVersion).toBe("unknown");
  });

  it("has null roles until access is resolved and the role array afterwards", () => {
    expect(getEventContext().roles).toBeNull();
    usePermissionsStore.setState({ roles: ["admin", "account_manager"] });
    expect(getEventContext().roles).toEqual(["admin", "account_manager"]);
  });

  it("carries no user id in any field", () => {
    usePermissionsStore.setState({ roles: ["admin"], userId: "user_2abcDEF" });
    expect(JSON.stringify(getEventContext())).not.toContain("user_2abcDEF");
  });

  it("reads the connection hint when the browser has one", () => {
    vi.stubGlobal("navigator", {
      userAgent: CHROME_MAC,
      maxTouchPoints: 0,
      connection: { effectiveType: "4g", rtt: 75, downlink: 10 },
    });
    expect(getEventContext().network).toEqual({ effectiveType: "4g", rttMs: 75 });
  });

  it("has null network where navigator.connection does not exist", () => {
    expect(getEventContext().network).toBeNull();
  });

  it("works with no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);
    const context = getEventContext();
    expect(context.browser).toBe("unknown");
    expect(context.network).toBeNull();
  });
});

describe("tab role", () => {
  beforeEach(() => resetEventContextForTests());

  it("is unknown until a role is set", () => {
    expect(getTabRole()).toBe("unknown");
    expect(getEventContext().tabRole).toBe("unknown");
  });

  it("is read at the moment of the call, because a leader can change", () => {
    setTabRole("follower");
    expect(getEventContext().tabRole).toBe("follower");
    setTabRole("leader");
    expect(getEventContext().tabRole).toBe("leader");
  });
});
