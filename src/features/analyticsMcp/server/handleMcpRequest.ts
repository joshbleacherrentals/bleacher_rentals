import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { MAX_RESULT_CHARS, MAX_ROWS } from "../constants";
import { capResult } from "../logic/capResult";
import { isUserAllowed } from "../logic/isUserAllowed";
import { prepareSql } from "../logic/prepareSql";
import type { McpQueryLogEntry } from "../types";
import { MAX_HISTORY_BLEACHERS, MAX_HISTORY_DAYS } from "../logic/bleacherLocations";
import { describeSchema } from "./describeSchema";
import { LinxupError, type LinxupClient } from "./linxup";
import { currentLocationsTool, locationHistoryTool, type ToolOutcome } from "./locationTools";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

export type McpDeps = {
  /** The signed-in person, from the OAuth token Clerk verified; null when there is none. */
  getIdentity: () => Promise<{ clerkUserId: string } | null>;
  findUser: (clerkUserId: string) => Promise<{ id: string; status_uuid: string | null } | null>;
  /** null when ANALYTICS_DATABASE_URL is not set. */
  pool: PoolLike | null;
  /** The Linxup GPS API (§12); null when LINXUP_API_HOST or LINXUP_API_TOKEN is not set. */
  linxup: LinxupClient | null;
  writeLog: (entry: McpQueryLogEntry) => Promise<void>;
  resourceMetadataUrl: string;
};

const NOT_CONFIGURED = "The analytics database is not configured.";
const UNAVAILABLE = "The analytics database is unavailable right now. Try again in a minute.";
const LINXUP_NOT_CONFIGURED = "The Linxup GPS connection is not configured.";

const INSTRUCTIONS = [
  "Read-only access to the Bleacher Rentals database (Postgres).",
  "Call describe_schema first: it gives the rules for reading the data the way the app does, then the tables, columns and foreign keys.",
  `Table names are PascalCase and must be double-quoted, e.g. select count(*) from "Events".`,
  `A query returns at most ${MAX_ROWS} rows and runs for at most 15 seconds: aggregate in SQL (count, sum, group by) instead of fetching rows.`,
  "Only one SELECT statement per call. Nothing can be changed.",
  "For where bleachers are now or were on a past date, use bleacher_locations and bleacher_location_history (live GPS from Linxup), not SQL.",
  // docs/specs/analytics-mcp.md §11 D9: the rules most often got wrong, in context before any call.
  "Key rules: money columns ending in _cents are cents, and Events.contract_revenue_cents includes tax;",
  "never add CAD and USD amounts together (an event's currency is on EventLineItems.currency);",
  "exclude soft-deleted rows (deleted = false, or deleted_at is null);",
  "timestamps are UTC, and the app counts days in America/Toronto;",
  "driver pay is WorkTrackers.pay_cents.",
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
        "Explains how the app reads the data (status meanings, revenue, pay, currency, dates), then lists every table with its purpose, its columns with types and notes, and the foreign keys. Call this first, before writing a query.",
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

  // §12: both location tools need the database (bleachers) and Linxup (positions). The arguments
  // go in the log's sql column, so the log shows which bleachers and when.
  const runLocationTool = async (
    tool: "bleacher_locations" | "bleacher_location_history",
    args: unknown,
    run: (pool: PoolLike, linxup: LinxupClient) => Promise<ToolOutcome>,
  ) => {
    const started = Date.now();
    const argsText = JSON.stringify(args ?? {});
    const missing = !deps.pool ? NOT_CONFIGURED : !deps.linxup ? LINXUP_NOT_CONFIGURED : null;
    if (missing) {
      await log(entry({ tool, sql: argsText, error: missing }));
      return text(missing, true);
    }
    try {
      const outcome = await run(deps.pool!, deps.linxup!);
      if (!outcome.ok) {
        await log(entry({ tool, sql: argsText, error: outcome.error }));
        return text(outcome.error, true);
      }
      await log(
        entry({ tool, sql: argsText, row_count: outcome.count, duration_ms: Date.now() - started }),
      );
      return text(JSON.stringify(outcome.body));
    } catch (e) {
      // A Linxup message names no host or token, so Claude may see it.
      const { shown, logged } =
        e instanceof LinxupError ? { shown: e.message, logged: e.message } : describeError(e);
      await log(entry({ tool, sql: argsText, error: logged, duration_ms: Date.now() - started }));
      return text(shown, true);
    }
  };

  const bleacherNumbers = z.array(z.number().int().positive());

  server.registerTool(
    "bleacher_locations",
    {
      description:
        "Where bleachers are right now, from their Linxup GPS trackers: latitude, longitude, when the tracker last reported, and speed. Leave bleacher_numbers out for the whole fleet. To say which event, venue or yard a bleacher is at, compare with Addresses.latitude / longitude (e.g. of the events running today).",
      inputSchema: {
        bleacher_numbers: bleacherNumbers
          .optional()
          .describe("Bleachers.bleacher_number values; omit for every bleacher."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runLocationTool("bleacher_locations", args, (pool, linxup) =>
        currentLocationsTool(pool, linxup, args),
      ),
  );

  server.registerTool(
    "bleacher_location_history",
    {
      description: `Where bleachers were over a past window (at most ${MAX_HISTORY_DAYS} days), from their Linxup GPS trackers: the places each one stood still, with times and street address, plus its current position. For "where was #42 on July 4" ask for that day.`,
      inputSchema: {
        bleacher_numbers: bleacherNumbers
          .min(1)
          .max(MAX_HISTORY_BLEACHERS)
          .describe(`1 to ${MAX_HISTORY_BLEACHERS} Bleachers.bleacher_number values.`),
        from: z.string().describe("Start, ISO 8601 with offset, e.g. 2026-07-04T00:00:00-04:00."),
        to: z.string().describe("End, ISO 8601 with offset."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runLocationTool("bleacher_location_history", args, (pool, linxup) =>
        locationHistoryTool(pool, linxup, args),
      ),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
