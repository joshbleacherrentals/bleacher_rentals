import { db } from "@/components/providers/SystemProvider";
import { typedWriteTransaction } from "@/lib/powersync/typedQuery";

type TableName = Parameters<typeof db.updateTable>[0];

/** One row a block writes to: which table, which row, and which columns the block's value fills. */
export type BlockWrite<T> = {
  table: TableName;
  id: string;
  columns: (value: T) => Record<string, unknown>;
};

/** What was saved to one row: every column as it was, and every column as it is now. */
export type SavedChange = {
  table: TableName;
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const sameValue = (a: unknown, b: unknown) =>
  a === b || (a == null && b == null) || JSON.stringify(a) === JSON.stringify(b);

/** The columns of `after` whose value differs from `before`. */
export function changedColumns(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (!sameValue(before[key], after[key])) changed[key] = after[key];
  }
  return changed;
}

/**
 * Writes what differs between `before` and `after`, and only that, in one local transaction.
 * A row with no difference is not touched. Returns what changed, for logging.
 */
export async function saveBlockChanges<T>(
  writes: BlockWrite<T>[],
  before: T,
  after: T,
): Promise<SavedChange[]> {
  const saved: SavedChange[] = [];
  const updates: { write: BlockWrite<T>; changed: Record<string, unknown> }[] = [];

  for (const write of writes) {
    const beforeColumns = write.columns(before);
    const afterColumns = write.columns(after);
    const changed = changedColumns(beforeColumns, afterColumns);
    if (Object.keys(changed).length === 0) continue;
    updates.push({ write, changed });
    saved.push({ table: write.table, id: write.id, before: beforeColumns, after: afterColumns });
  }

  if (updates.length === 0) return [];

  await typedWriteTransaction(async (tx) => {
    for (const { write, changed } of updates) {
      // The table and column names are chosen by the block, so the typed builder cannot check them.
      const update = (db.updateTable(write.table) as any)
        .set(changed)
        .where("id", "=", write.id)
        .compile();
      await tx.execute(update.sql, update.parameters as any[]);
    }
  });

  return saved;
}
