import { SCHEMA_MAX_ROWS } from "../constants";
import { BUSINESS_RULES, DATA_DICTIONARY } from "../dataDictionary";
import { formatSchema, type SchemaColumn, type SchemaForeignKey } from "./formatSchema";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

// information_schema only lists what the role may read, so QboConnections never shows up.
// enum_labels: an enum's values, read live so they never drift (§11 D10).
const COLUMNS_SQL = `select c.table_name, c.column_name, c.data_type,
  (select string_agg(e.enumlabel, ', ' order by e.enumsortorder)
     from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = c.udt_name and t.typnamespace = 'public'::regnamespace) as enum_labels
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position`;

const FOREIGN_KEYS_SQL = `select cl.relname as table_name, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
order by 1, 2`;

/** The text describe_schema returns, and how many columns it listed (docs/specs/analytics-mcp.md §5, §11). */
export async function describeSchema(
  pool: PoolLike,
): Promise<{ text: string; columnCount: number }> {
  const columns = await runReadOnlyQuery(pool, COLUMNS_SQL, { maxRows: SCHEMA_MAX_ROWS });
  const foreignKeys = await runReadOnlyQuery(pool, FOREIGN_KEYS_SQL, { maxRows: SCHEMA_MAX_ROWS });
  return {
    text: formatSchema(
      columns.rows as SchemaColumn[],
      foreignKeys.rows as SchemaForeignKey[],
      DATA_DICTIONARY,
      BUSINESS_RULES,
    ),
    columnCount: columns.rows.length,
  };
}
