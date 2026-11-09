import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

describe("python health endpoint", () => {
  const src = readFileSync(path.join(root, "api/python-health.py"), "utf8");

  it("defines the handler class Vercel's Python runtime looks for", () => {
    expect(src).toMatch(/class handler\(BaseHTTPRequestHandler\)/);
    expect(src).toMatch(/def do_GET\(self\)/);
  });

  it("is not on the public route list, so Clerk protects it", () => {
    const proxy = readFileSync(path.join(root, "src/proxy.ts"), "utf8");
    expect(proxy).not.toContain("python-health");
  });
});
