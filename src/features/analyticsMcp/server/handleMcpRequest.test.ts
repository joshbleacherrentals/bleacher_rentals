import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { handleMcpRequest, type McpDeps } from "./handleMcpRequest";
import { STATUSES } from "@/features/manageTeam/constants";
import type { PoolLike } from "./runReadOnlyQuery";
import type { McpQueryLogEntry } from "../types";

const METADATA = "https://app.test/.well-known/oauth-protected-resource";

let fetchRows: Record<string, unknown>[] = [];
let fields: { name: string }[] = [];
let failWith: string | null = null;
let failCode = "42P01";
let connect: ReturnType<typeof vi.fn>;
let writeLog: Mock<(entry: McpQueryLogEntry) => Promise<void>>;

function makeDeps(over: Partial<McpDeps> = {}): McpDeps {
  connect = vi.fn(async () => ({
    query: vi.fn(async (config: string | { text: string }) => {
      const text = typeof config === "string" ? config : config.text;
      if (failWith && text.startsWith("DECLARE")) {
        // A Postgres error carries a 5-character SQLSTATE; a connection problem does not.
        throw Object.assign(new Error(failWith), { code: failCode });
      }
      if (text.startsWith("FETCH")) return { rows: fetchRows, fields };
      return { rows: [], fields: [] };
    }),
    release: vi.fn(),
  }));
  writeLog = vi.fn(async (_entry: McpQueryLogEntry) => {});
  return {
    getIdentity: async () => ({ clerkUserId: "clerk_1" }),
    findUser: async () => ({ id: "u1", status_uuid: STATUSES.active }),
    pool: { connect } as unknown as PoolLike,
    writeLog,
    resourceMetadataUrl: METADATA,
    ...over,
  };
}

function rpc(method: string, params?: unknown, init?: RequestInit) {
  return new Request("https://app.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    ...init,
  });
}

async function callTool(deps: McpDeps, name: string, args: unknown) {
  const res = await handleMcpRequest(rpc("tools/call", { name, arguments: args }), deps);
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.result as { content: { type: string; text: string }[]; isError?: boolean };
}

beforeEach(() => {
  fetchRows = [];
  fields = [];
  failWith = null;
  failCode = "42P01";
});

// docs/specs/analytics-mcp.md §6: the order of the checks.
describe("handleMcpRequest — who gets in", () => {
  it("answers 401 with the metadata address when there is no signed-in identity", async () => {
    const deps = makeDeps({ getIdentity: async () => null });
    const res = await handleMcpRequest(rpc("tools/list"), deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${METADATA}"`);
    expect(connect).not.toHaveBeenCalled();
  });

  it("answers 405 to GET and DELETE: the server is stateless", async () => {
    const deps = makeDeps();
    for (const method of ["GET", "DELETE"]) {
      const res = await handleMcpRequest(new Request("https://app.test/api/mcp", { method }), deps);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });

  it("answers 403 to a Clerk user with no Users row, and logs the refusal", async () => {
    const deps = makeDeps({ findUser: async () => null });
    const res = await handleMcpRequest(rpc("tools/list"), deps);
    expect(res.status).toBe(403);
    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writeLog.mock.calls[0][0]).toMatchObject({
      user_id: null,
      clerk_user_id: "clerk_1",
      tool: "access",
      error: "no-account",
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("answers 403 to a deactivated account, and logs the refusal", async () => {
    const deps = makeDeps({
      findUser: async () => ({ id: "u9", status_uuid: STATUSES.inactive }),
    });
    const res = await handleMcpRequest(
      rpc("tools/call", { name: "query", arguments: { sql: "select 1" } }),
      deps,
    );
    expect(res.status).toBe(403);
    expect(writeLog.mock.calls[0][0]).toMatchObject({
      user_id: "u9",
      tool: "access",
      error: "account-deactivated",
    });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("handleMcpRequest — the tools", () => {
  it("lists describe_schema and query, both marked read-only", async () => {
    const res = await handleMcpRequest(rpc("tools/list"), makeDeps());
    expect(res.status).toBe(200);
    const { result } = await res.json();
    const names = result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["describe_schema", "query"]);
    for (const t of result.tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("query returns columns, rows, count and truncated, and logs the call", async () => {
    fetchRows = [{ n: 7 }];
    fields = [{ name: "n" }];
    const deps = makeDeps();
    const result = await callTool(deps, "query", { sql: "select 7 as n;" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({
      columns: ["n"],
      rows: [{ n: 7 }],
      rowCount: 1,
      truncated: false,
    });
    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writeLog.mock.calls[0][0]).toMatchObject({
      user_id: "u1",
      clerk_user_id: "clerk_1",
      tool: "query",
      sql: "select 7 as n",
      row_count: 1,
      truncated: false,
      error: null,
    });
    expect(typeof writeLog.mock.calls[0][0].duration_ms).toBe("number");
  });

  it("refuses a write before it reaches the database, and still logs it", async () => {
    const deps = makeDeps();
    const result = await callTool(deps, "query", { sql: 'delete from "Events"' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/only select/i);
    expect(connect).not.toHaveBeenCalled();
    expect(writeLog.mock.calls[0][0]).toMatchObject({
      tool: "query",
      sql: 'delete from "Events"',
      row_count: null,
    });
    expect(writeLog.mock.calls[0][0].error).toMatch(/only select/i);
  });

  it("returns the database's message as an error Claude can act on, never a stack", async () => {
    failWith = 'relation "Nope" does not exist';
    const result = await callTool(makeDeps(), "query", { sql: 'select * from "Nope"' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('relation "Nope" does not exist');
    expect(result.content[0].text).not.toMatch(/\n\s+at /);
    expect(writeLog.mock.calls[0][0].error).toContain('relation "Nope" does not exist');
  });

  it("shows a timeout as the database's own message: Claude can narrow the query", async () => {
    failWith = "canceling statement due to statement timeout";
    failCode = "57014";
    const result = await callTool(makeDeps(), "query", { sql: "select pg_sleep(60)" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("statement timeout");
  });

  it("hides a connection problem behind a plain message, and keeps the real one in the log", async () => {
    failWith = "connect ECONNREFUSED 10.0.0.1:6543";
    failCode = "ECONNREFUSED";
    const result = await callTool(makeDeps(), "query", { sql: "select 1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unavailable/i);
    expect(result.content[0].text).not.toContain("10.0.0.1");
    expect(writeLog.mock.calls[0][0].error).toContain("ECONNREFUSED");
  });

  it("says the database is not configured when there is no pool, and logs it", async () => {
    const result = await callTool(makeDeps({ pool: null }), "query", { sql: "select 1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not configured/i);
    expect(writeLog.mock.calls[0][0].error).toMatch(/not configured/i);
  });

  it("describe_schema returns the tables and logs the call without SQL", async () => {
    const deps = makeDeps();
    // First read is the columns, the second the foreign keys: both go through FETCH.
    fetchRows = [{ table_name: "Events", column_name: "id", data_type: "uuid", definition: "x" }];
    fields = [{ name: "table_name" }];
    const result = await callTool(deps, "describe_schema", {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('"Events"(id uuid)');
    expect(writeLog.mock.calls[0][0]).toMatchObject({ tool: "describe_schema", sql: null });
  });

  it("still answers when writing the log fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchRows = [{ n: 1 }];
    fields = [{ name: "n" }];
    const deps = makeDeps();
    deps.writeLog = vi.fn(async () => {
      throw new Error("log down");
    });
    const result = await callTool(deps, "query", { sql: "select 1 as n" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text).rowCount).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
