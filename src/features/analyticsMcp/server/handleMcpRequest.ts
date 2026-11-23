import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { MAX_RESULT_CHARS, MAX_ROWS } from "../constants";
import { capResult } from "../logic/capResult";
import { isUserAllowed } from "../logic/isUserAllowed";
import { prepareSql } from "../logic/prepareSql";
import type { McpQueryLogEntry } from "../types";
import { describeSchema } from "./describeSchema";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

export type McpDeps = {
  /** The signed-in person, from the OAuth token Clerk verified; null when there is none. */
  getIdentity: () => Promise<{ clerkUserId: string } | null>;
  findUser: (clerkUserId: string) => Promise<{ id: string; status_uuid: string | null } | null>;
  /** null when ANALYTICS_DATABASE_URL is not set. */
  pool: PoolLike | null;
  writeLog: (entry: McpQueryLogEntry) => Promise<void>;
  resourceMetadataUrl: string;
};

const NOT_CONFIGURED = "The analytics database is not configured.";
const UNAVAILABLE = "The analytics database is unavailable right now. Try again in a minute.";

const INSTRUCTIONS = [
  "Read-only access to the Bleacher Rentals database (Postgres).",
  "Call describe_schema first to see the tables, columns and foreign keys.",
  `Table names are PascalCase and must be double-quoted, e.g. select count(*) from "Events".`,
  `A query returns at most ${MAX_ROWS} rows and runs for at most 15 seconds: aggregate in SQL (count, sum, group by) instead of fetching rows.`,
  "Only one SELECT statement per call. Nothing can be changed.",
].join(" ");

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  ...(isError ? { isError: true } : {}),
});

// A Postgres error carries a 5-character SQLSTATE and is the query's own fault (bad column,
// timeout): Claude should see it. A connection problem (no code, or class 08/28/53/57P) should not
// leak host names, so it gets a plain message and the real one goes to the log.
function describeError(e: unknown): { shown: string; logged: string } {
  const message = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown } | null)?.code;
  const isQueryError =
    typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && !/^(08|28|53|57P)/.test(code);
  return { shown: isQueryError ? message : UNAVAILABLE, logged: message };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * The MCP endpoint (docs/specs/analytics-mcp.md §6): sign-in, then the access rule, then the two
 * tools. Stateless: a new server and transport per request.
 */
export async function handleMcpRequest(req: Request, deps: McpDeps): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { allow: "POST" });
  }

  const identity = await deps.getIdentity();
  if (!identity) {
    return json({ error: "Sign in required" }, 401, {
      "www-authenticate": `Bearer resource_metadata="${deps.resourceMetadataUrl}"`,
    });
  }

  // Logging never blocks an answer.
  const log = async (entry: McpQueryLogEntry) => {
    try {
      await deps.writeLog(entry);
    } catch (e) {
      console.error("McpQueryLog write failed", e);
    }
  };

  const user = await deps.findUser(identity.clerkUserId);
  const decision = isUserAllowed(user);
  if (!decision.allowed) {
    await log({
      user_id: user?.id ?? null,
      clerk_user_id: identity.clerkUserId,
      tool: "access",
      sql: null,
      row_count: null,
      truncated: false,
      duration_ms: null,
      error: decision.reason,
    });
    return json({ error: "Your account is not allowed to use this connector." }, 403);
  }

  const entry = (over: Partial<McpQueryLogEntry>): McpQueryLogEntry => ({
    user_id: decision.userId,
    clerk_user_id: identity.clerkUserId,
    tool: "query",
    sql: null,
    row_count: null,
    truncated: false,
    duration_ms: null,
    error: null,
    ...over,
  });

  const server = new McpServer(
    { name: "bleacher-analytics", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "describe_schema",
    {
      description:
        "Lists every table, its columns with types, and the foreign keys. Call this first, before writing a query.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const started = Date.now();
      if (!deps.pool) {
        await log(entry({ tool: "describe_schema", error: NOT_CONFIGURED }));
        return text(NOT_CONFIGURED, true);
      }
      try {
        const { text: schema, columnCount } = await describeSchema(deps.pool);
        await log(
          entry({
            tool: "describe_schema",
            row_count: columnCount,
            duration_ms: Date.now() - started,
          }),
        );
        return text(schema);
      } catch (e) {
        const { shown, logged } = describeError(e);
        await log(
          entry({ tool: "describe_schema", error: logged, duration_ms: Date.now() - started }),
        );
        return text(shown, true);
      }
    },
  );

  server.registerTool(
    "query",
    {
      description: `Runs one read-only SQL SELECT and returns { columns, rows, rowCount, truncated } as JSON. At most ${MAX_ROWS} rows.`,
      inputSchema: { sql: z.string().describe("One SELECT (or WITH ... SELECT) statement.") },
      annotations: { readOnlyHint: true },
    },
    async ({ sql }) => {
      const started = Date.now();
      const prepared = prepareSql(sql);
      if (!prepared.ok) {
        await log(entry({ sql, error: prepared.error }));
        return text(prepared.error, true);
      }
      if (!deps.pool) {
        await log(entry({ sql: prepared.sql, error: NOT_CONFIGURED }));
        return text(NOT_CONFIGURED, true);
      }
      try {
        const result = capResult(await runReadOnlyQuery(deps.pool, prepared.sql), MAX_RESULT_CHARS);
        await log(
          entry({
            sql: prepared.sql,
            row_count: result.rowCount,
            truncated: result.truncated,
            duration_ms: Date.now() - started,
          }),
        );
        return text(JSON.stringify(result));
      } catch (e) {
        const { shown, logged } = describeError(e);
        await log(entry({ sql: prepared.sql, error: logged, duration_ms: Date.now() - started }));
        return text(shown, true);
      }
    },
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
