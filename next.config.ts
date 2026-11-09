import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Telemetry stamps every event with the app version (docs/specs/perf-telemetry-pipeline.md D7).
// Read from the file, not from `npm_package_version`, which only exists under an npm script.
const { version } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  images: {
    disableStaticImages: true,
  },
  // /changelog reads versions/*.md off disk at request time; the path is built at
  // runtime so tracing can't see it. Without this the files are missing in deploys.
  outputFileTracingIncludes: {
    "/changelog": ["./versions/**/*.md"],
  },
  turbopack: {},
  allowedDevOrigins: ["192.168.1.3"],
  // Companies & Contacts is now two pages, /contacts and /companies. Keeps old bookmarks working.
  async redirects() {
    return [{ source: "/companies-contacts", destination: "/contacts", permanent: false }];
  },
  // Python endpoints live under /api/py (FastAPI app in api/index.py).
  // Locally `next dev` can't run Python, so proxy to the dev server (npm run dev:py).
  // On Vercel, send them to the Python function.
  async rewrites() {
    const destination =
      process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/index";
    return [{ source: "/api/py/:path*", destination }];
  },
};

export default nextConfig;
