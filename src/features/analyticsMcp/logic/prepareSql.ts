import { MAX_SQL_CHARS } from "../constants";
import type { PrepareSqlResult } from "../types";

// Skips whitespace, `-- line` comments and `/* block */` comments at the start of the SQL.
function stripLeadingComments(sql: string): string {
  let rest = sql.trimStart();
  for (;;) {
    if (rest.startsWith("--")) {
      const end = rest.indexOf("\n");
      rest = end === -1 ? "" : rest.slice(end + 1).trimStart();
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      rest = end === -1 ? "" : rest.slice(end + 2).trimStart();
    } else {
      return rest;
    }
  }
}

/**
 * The friendly check in front of the database (docs/specs/analytics-mcp.md §3). It is not the
 * guarantee that nothing is written: the read-only transaction, the SELECT-only role and the
 * single-statement rule are. It exists so Claude gets a clear message instead of a syntax error.
 */
export function prepareSql(input: string): PrepareSqlResult {
  if (input.length > MAX_SQL_CHARS) {
    return {
      ok: false,
      error: `That query is too long (the limit is ${MAX_SQL_CHARS} characters).`,
    };
  }

  const sql = stripLeadingComments(input)
    .replace(/[;\s]+$/, "")
    .trim();

  if (!sql) return { ok: false, error: "Write an SQL query to run." };

  if (!/^\(*\s*(select|with|values|table)\b/i.test(sql)) {
    return {
      ok: false,
      error:
        "Only SELECT queries are allowed (SELECT, WITH, VALUES or TABLE). This connection is read-only.",
    };
  }

  return { ok: true, sql };
}
