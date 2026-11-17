import { describe, it, expect } from "vitest";
import { clerkFrontendApiUrl, protectedResourceMetadata, publicOrigin } from "./oauthMetadata";

// docs/specs/analytics-mcp.md §6: Claude checks that the resource address in the discovery page is the
// address it connected to. Behind a tunnel or proxy, Next reports its own host (localhost:3000) in
// req.url, so the public address has to come from the forwarded headers.
describe("publicOrigin", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it("uses the request URL when there is no proxy", () => {
    expect(publicOrigin(req("http://localhost:3000/api/mcp"))).toBe("http://localhost:3000");
  });

  it("uses the forwarded host and protocol behind a tunnel", () => {
    expect(
      publicOrigin(
        req("https://localhost:3000/api/mcp", {
          "x-forwarded-host": "demo.example-tunnel.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://demo.example-tunnel.com");
  });

  it("falls back to the Host header when there is no forwarded host", () => {
    expect(
      publicOrigin(
        req("http://localhost:3000/api/mcp", {
          host: "app.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://app.example.com");
  });

  it("takes the first value of a comma-separated forwarded list", () => {
    expect(
      publicOrigin(
        req("http://localhost:3000/", {
          "x-forwarded-host": "a.example.com, b.internal",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://a.example.com");
  });
});

// docs/specs/analytics-mcp.md §6: how Claude finds out that Clerk is the one to sign in with.
describe("clerkFrontendApiUrl", () => {
  it("decodes the Clerk frontend API host from a publishable key", () => {
    const key = "pk_test_" + Buffer.from("clerk.example.com$").toString("base64");
    expect(clerkFrontendApiUrl(key)).toBe("https://clerk.example.com");
  });

  it("works for a live key too", () => {
    const key = "pk_live_" + Buffer.from("clerk.bleacher.example$").toString("base64");
    expect(clerkFrontendApiUrl(key)).toBe("https://clerk.bleacher.example");
  });
});

describe("protectedResourceMetadata", () => {
  it("names the MCP endpoint as the resource and Clerk as the authorization server", () => {
    expect(protectedResourceMetadata("https://app.test", "https://clerk.example.com")).toEqual({
      resource: "https://app.test/api/mcp",
      authorization_servers: ["https://clerk.example.com"],
      bearer_methods_supported: ["header"],
      resource_name: "Bleacher Rentals analytics",
    });
  });
});
