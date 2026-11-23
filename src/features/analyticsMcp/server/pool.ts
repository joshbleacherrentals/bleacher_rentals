import { Pool } from "pg";
import type { PoolLike } from "./runReadOnlyQuery";

let pool: Pool | null | undefined;

/**
 * The connection pool for the read-only role (docs/specs/analytics-mcp.md §2 and §7), or null when
 * ANALYTICS_DATABASE_URL is not set. Do not put `sslmode` in the URL: node-pg lets the URL override
 * the `ssl` option below, and Supabase's pooler certificate does not verify with `sslmode=require`.
 */
export function getAnalyticsPool(): PoolLike | null {
  if (pool !== undefined) return pool as unknown as PoolLike | null;

  const url = process.env.ANALYTICS_DATABASE_URL;
  if (!url) {
    pool = null;
    return null;
  }

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    application_name: "analytics-mcp",
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  // An idle connection that the server drops would otherwise crash the process.
  pool.on("error", (err) => console.error("analytics pool error", err.message));
  return pool as unknown as PoolLike;
}
