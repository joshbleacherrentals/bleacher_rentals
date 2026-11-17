import { MAX_ROWS, STATEMENT_TIMEOUT } from "../constants";
import type { RawQueryResult } from "../types";

// The few pieces of node-pg this file uses, so a test can fake them.
export type QueryConfig = { text: string; queryMode?: "extended" };
export type PgClientLike = {
  query(
    config: string | QueryConfig,
  ): Promise<{ rows: Record<string, unknown>[]; fields?: { name: string }[] }>;
  release(err?: Error): void;
};
export type PoolLike = { connect(): Promise<PgClientLike> };

const CURSOR = "mcp_cursor";

/**
 * Runs one user-written statement, read-only (docs/specs/analytics-mcp.md §3):
 *  - BEGIN READ ONLY: a function that writes fails, and the mode cannot be switched back;
 *  - queryMode "extended": Postgres refuses more than one statement, so nothing rides along;
 *  - DECLARE ... CURSOR: only a SELECT-like statement is accepted, and FETCH caps the rows;
 *  - ROLLBACK at the end, always.
 */
export async function runReadOnlyQuery(
  pool: PoolLike,
  sql: string,
  opts: { maxRows?: number } = {},
): Promise<RawQueryResult> {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const client = await pool.connect();
  let releaseError: Error | undefined;

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    await client.query({
      text: `DECLARE ${CURSOR} NO SCROLL CURSOR FOR ${sql}`,
      queryMode: "extended",
    });
    // One more than the cap, to know whether anything was cut.
    const res = await client.query(`FETCH ${maxRows + 1} FROM ${CURSOR}`);

    return {
      columns: (res.fields ?? []).map((f) => f.name),
      rows: res.rows.slice(0, maxRows),
      truncated: res.rows.length > maxRows,
    };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // The connection is in an unknown state: hand it back as broken so the pool drops it.
      releaseError = e instanceof Error ? e : new Error(String(e));
    }
    client.release(releaseError);
  }
}
