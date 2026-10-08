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
};

export default nextConfig;
