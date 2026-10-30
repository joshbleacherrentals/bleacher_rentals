import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppBaseUrl } from "./util";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppBaseUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");

    expect(getAppBaseUrl()).toBe("https://app.example.com");
  });

  it("falls back to the Vercel deployment URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "my-app-abc.vercel.app");

    expect(getAppBaseUrl()).toBe("https://my-app-abc.vercel.app");
  });

  it("falls back to localhost with neither set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");

    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });
});
