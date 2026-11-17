export type SchemaColumn = { table_name: string; column_name: string; data_type: string };
export type SchemaForeignKey = { table_name: string; definition: string };

const SHORT_TYPES: Record<string, string> = {
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "character varying": "varchar",
  "double precision": "float8",
  boolean: "bool",
};

/** The text describe_schema returns (docs/specs/analytics-mcp.md §5): tables, columns, foreign keys. */
export function formatSchema(columns: SchemaColumn[], foreignKeys: SchemaForeignKey[]): string {
  if (columns.length === 0) return "No tables are visible to this connection.";

  const byTable = new Map<string, string[]>();
  for (const c of columns) {
    const list = byTable.get(c.table_name) ?? [];
    list.push(`${c.column_name} ${SHORT_TYPES[c.data_type] ?? c.data_type}`);
    byTable.set(c.table_name, list);
  }

  const lines = [
    'Tables in the public schema, as "Table"(column type, ...). Names are case-sensitive: double-quote them.',
    ...[...byTable].map(([table, cols]) => `"${table}"(${cols.join(", ")})`),
  ];

  if (foreignKeys.length > 0) {
    lines.push("", "Foreign keys (use these to join):");
    for (const fk of foreignKeys) lines.push(`"${fk.table_name}": ${fk.definition}`);
  }

  return lines.join("\n");
}
