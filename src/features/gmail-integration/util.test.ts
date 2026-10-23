import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleAuthUrl,
  createGoogleOAuthClient,
  getGoogleRedirectUri,
  GOOGLE_SCOPES,
  isSameEmail,
} from "./util";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "/api/google/callback");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-123");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-456");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildGoogleAuthUrl", () => {
  it("builds a consent URL that asks for an offline refresh token", () => {
    const url = new URL(buildGoogleAuthUrl(createGoogleOAuthClient(), "abc"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("createGoogleOAuthClient", () => {
  it("throws when the client secret is missing", () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    expect(() => createGoogleOAuthClient()).toThrow("GOOGLE_CLIENT_SECRET is not set");
  });
});

describe("getGoogleRedirectUri", () => {
  it("resolves the GOOGLE_REDIRECT_URI path against the app URL", () => {
    expect(getGoogleRedirectUri()).toBe("https://app.example.com/api/google/callback");
  });

  it("throws when GOOGLE_REDIRECT_URI is missing", () => {
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");

    expect(() => getGoogleRedirectUri()).toThrow("GOOGLE_REDIRECT_URI is not set");
  });
});

describe("isSameEmail", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(isSameEmail("Pat@Example.com", " pat@example.com ")).toBe(true);
  });

  it("tells different addresses apart", () => {
    expect(isSameEmail("pat@example.com", "pat@gmail.com")).toBe(false);
  });
});
