import { SCHEMA_MAX_ROWS } from "../constants";
import { formatSchema, type SchemaColumn, type SchemaForeignKey } from "./formatSchema";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

// information_schema only lists what the role may read, so QboConnections never shows up.
const COLUMNS_SQL = `select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position`;

const FOREIGN_KEYS_SQL = `select cl.relname as table_name, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
order by 1, 2`;

/** The text describe_schema returns, and how many columns it listed (docs/specs/analytics-mcp.md §5). */
export async function describeSchema(
  pool: PoolLike,
): Promise<{ text: string; columnCount: number }> {
  const columns = await runReadOnlyQuery(pool, COLUMNS_SQL, { maxRows: SCHEMA_MAX_ROWS });
  const foreignKeys = await runReadOnlyQuery(pool, FOREIGN_KEYS_SQL, { maxRows: SCHEMA_MAX_ROWS });
  return {
    text: formatSchema(columns.rows as SchemaColumn[], foreignKeys.rows as SchemaForeignKey[]),
    columnCount: columns.rows.length,
  };
}
