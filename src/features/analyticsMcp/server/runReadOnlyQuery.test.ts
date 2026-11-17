import { describe, it, expect, vi } from "vitest";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

type Call = { text: string; queryMode?: string };

function makePool(opts?: {
  fetchRows?: Record<string, unknown>[];
  fields?: { name: string }[];
  failOn?: string;
  rollbackFails?: boolean;
}) {
  const calls: Call[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (config: string | Call) => {
      const text = typeof config === "string" ? config : config.text;
      calls.push(typeof config === "string" ? { text } : config);
      if (opts?.failOn && text.startsWith(opts.failOn)) throw new Error("boom: " + opts.failOn);
      if (opts?.rollbackFails && text === "ROLLBACK") throw new Error("rollback failed");
      if (text.startsWith("FETCH")) {
        return { rows: opts?.fetchRows ?? [], fields: opts?.fields ?? [] };
      }
      return { rows: [], fields: [] };
    }),
    release,
  };
  const pool: PoolLike = { connect: vi.fn(async () => client) };
  return { pool, calls, release, client };
}

// docs/specs/analytics-mcp.md §3: the four layers that keep the connection from writing.
describe("runReadOnlyQuery", () => {
  it("runs the statements in a read-only transaction, in this order, then rolls back", async () => {
    const { pool, calls } = makePool();
    await runReadOnlyQuery(pool, "select 1");
    expect(calls.map((c) => c.text)).toEqual([
      "BEGIN READ ONLY",
      "SET LOCAL statement_timeout = '15s'",
      "DECLARE mcp_cursor NO SCROLL CURSOR FOR select 1",
      "FETCH 501 FROM mcp_cursor",
      "ROLLBACK",
    ]);
  });

  it("sends the user's SQL in extended mode, so a second statement cannot ride along", async () => {
    const { pool, calls } = makePool();
    await runReadOnlyQuery(pool, "select 1; commit; begin read write; select writer()");
    const declare = calls.find((c) => c.text.startsWith("DECLARE"));
    expect(declare?.queryMode).toBe("extended");
  });

  it("fetches one row more than the cap, to know whether it cut anything", async () => {
    const { pool, calls } = makePool();
    await runReadOnlyQuery(pool, "select 1", { maxRows: 3 });
    expect(calls.some((c) => c.text === "FETCH 4 FROM mcp_cursor")).toBe(true);
  });

  it("returns the columns and rows, and is not truncated under the cap", async () => {
    const { pool } = makePool({
      fetchRows: [{ a: 1 }, { a: 2 }],
      fields: [{ name: "a" }],
    });
    expect(await runReadOnlyQuery(pool, "select a", { maxRows: 3 })).toEqual({
      columns: ["a"],
      rows: [{ a: 1 }, { a: 2 }],
      truncated: false,
    });
  });

  it("cuts to the cap and says so when there are more rows", async () => {
    const { pool } = makePool({
      fetchRows: [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }],
      fields: [{ name: "a" }],
    });
    const r = await runReadOnlyQuery(pool, "select a", { maxRows: 3 });
    expect(r.rows).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(r.truncated).toBe(true);
  });

  it("releases the connection after a good run", async () => {
    const { pool, release } = makePool();
    await runReadOnlyQuery(pool, "select 1");
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back, releases and rethrows when the query fails", async () => {
    const { pool, calls, release } = makePool({ failOn: "DECLARE" });
    await expect(runReadOnlyQuery(pool, "select nope")).rejects.toThrow(/boom: DECLARE/);
    expect(calls.at(-1)?.text).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("destroys the connection (release with an error) when the rollback itself fails", async () => {
    const { pool, release } = makePool({ rollbackFails: true });
    await runReadOnlyQuery(pool, "select 1");
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("does not run anything when it cannot get a connection", async () => {
    const pool: PoolLike = {
      connect: vi.fn(async () => {
        throw new Error("no connection");
      }),
    };
    await expect(runReadOnlyQuery(pool, "select 1")).rejects.toThrow("no connection");
  });
});
