// docs/specs/analytics-mcp.md §4.
export const MAX_ROWS = 500;
export const MAX_SQL_CHARS = 20_000;
export const MAX_RESULT_CHARS = 200_000;
export const STATEMENT_TIMEOUT = "15s";
// describe_schema reads the catalog, which has many more rows than a normal question.
export const SCHEMA_MAX_ROWS = 20_000;
