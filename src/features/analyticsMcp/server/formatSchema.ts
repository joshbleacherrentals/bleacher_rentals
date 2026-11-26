export type SchemaColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  /** "a, b, c" for an enum column (from pg_enum), else null (§11 D10). */
  enum_labels?: string | null;
};
export type SchemaForeignKey = { table_name: string; definition: string };

/** A loose view of dataDictionary.ts, so the formatter can be tested with any tables. */
export type DictionaryLike = Record<
  string,
  { purpose: string; columns?: Partial<Record<string, string>> }
>;
export type RuleLike = { topic: string; rule: string; source: string };

const SHORT_TYPES: Record<string, string> = {
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "character varying": "varchar",
  "double precision": "float8",
  boolean: "bool",
};

function typeOf(c: SchemaColumn): string {
  if (c.enum_labels) return `enum(${c.enum_labels.split(", ").join("|")})`;
  return SHORT_TYPES[c.data_type] ?? c.data_type;
}

/**
 * The text describe_schema returns (docs/specs/analytics-mcp.md §5 and §11): the business rules, then
 * each table with its columns, purpose and column notes, then the foreign keys. Only live tables and
 * columns are printed: a dictionary note on something the database does not have is skipped.
 */
export function formatSchema(
  columns: SchemaColumn[],
  foreignKeys: SchemaForeignKey[],
  dictionary: DictionaryLike = {},
  rules: RuleLike[] = [],
): string {
  if (columns.length === 0) return "No tables are visible to this connection.";

  const byTable = new Map<string, SchemaColumn[]>();
  for (const c of columns) {
    const list = byTable.get(c.table_name) ?? [];
    list.push(c);
    byTable.set(c.table_name, list);
  }

  const lines: string[] = [];

  if (rules.length > 0) {
    lines.push(
      "HOW THE APP READS THIS DATA — follow these rules so your numbers match the app (each names the app file it comes from):",
      ...rules.map((r) => `- ${r.topic}: ${r.rule} [${r.source}]`),
      "",
    );
  }

  lines.push(
    'Tables in the public schema, as "Table"(column type, ...). Names are case-sensitive: double-quote them.',
  );
  for (const [table, cols] of byTable) {
    const doc = dictionary[table];
    lines.push(`"${table}"(${cols.map((c) => `${c.column_name} ${typeOf(c)}`).join(", ")})`);
    if (!doc) continue;
    lines.push(`  ${doc.purpose}`);
    for (const c of cols) {
      const note = doc.columns?.[c.column_name];
      if (note) lines.push(`  ${c.column_name}: ${note}`);
    }
  }

  if (foreignKeys.length > 0) {
    lines.push("", "Foreign keys (use these to join):");
    for (const fk of foreignKeys) lines.push(`"${fk.table_name}": ${fk.definition}`);
  }

  return lines.join("\n");
}
