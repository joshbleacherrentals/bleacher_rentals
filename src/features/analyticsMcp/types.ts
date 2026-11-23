// docs/specs/analytics-mcp.md §4.
export type PrepareSqlResult = { ok: true; sql: string } | { ok: false; error: string };

/** What the database returned, before the size cap on the serialized result. */
export type RawQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number; // rows returned, after the caps
  truncated: boolean; // true if either cap cut the result
};

export type AccessDecision =
  | { allowed: true; userId: string }
  | { allowed: false; reason: "no-account" | "account-deactivated" };

export type McpQueryLogEntry = {
  user_id: string | null;
  clerk_user_id: string;
  tool: "query" | "describe_schema" | "access";
  sql: string | null;
  row_count: number | null;
  truncated: boolean;
  duration_ms: number | null;
  error: string | null;
};
