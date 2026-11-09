import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("python (FastAPI) health endpoint", () => {
  it("exposes a FastAPI `app` with the health route under /api/py", () => {
    const src = read("api/index.py");
    expect(src).toMatch(/^app = FastAPI\(/m);
    expect(src).toContain('@app.get("/api/py/health")');
  });

  it("pins fastapi in requirements.txt so Vercel installs it", () => {
    expect(read("requirements.txt")).toMatch(/^fastapi==/m);
  });

  it("routes /api/py to the Python dev server locally and the function on Vercel", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toContain("/api/py/:path*");
    expect(cfg).toContain("http://127.0.0.1:8000/api/py/:path*");
    expect(cfg).toContain('"/api/index"');
  });

  it("is not on the public route list, so Clerk protects it", () => {
    expect(read("src/proxy.ts")).not.toMatch(/api\/py/);
  });

  it("the page calls the endpoint the Python app serves", () => {
    expect(read("src/app/dev-tools/python-health/page.tsx")).toContain('fetch("/api/py/health"');
  });
});
