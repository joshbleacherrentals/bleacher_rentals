import type { DatabaseSync, SQLInputValue } from "node:sqlite";

/**
 * A stand-in for `powerSyncDb` on Node's built-in SQLite, for tests of code that calls
 * `typedGetAll`, `typedExecute` and `typedWriteTransaction`. It keeps the one behaviour those
 * tests need to see: what each call costs.
 *
 * - `reads`: `getAll` calls made outside a transaction.
 * - `writeTransactions`: a bare `execute` is one write transaction, and so is each
 *   `writeTransaction`, however many statements it holds.
 * - `statements`: every statement of every write, reads made inside a transaction included.
 *
 * Test support only: nothing in the app imports this file.
 */
export type FakeStats = { reads: number; writeTransactions: number; statements: number };

type Params = SQLInputValue[] | undefined;

export function createFakePowerSyncDb(sqlite: DatabaseSync) {
  const stats: FakeStats = { reads: 0, writeTransactions: 0, statements: 0 };

  const all = (sql: string, params: Params) =>
    sqlite
      .prepare(sql)
      .all(...(params ?? []))
      .map((row) => ({ ...(row as object) }));
  const run = (sql: string, params: Params) => {
    const result = sqlite.prepare(sql).run(...(params ?? []));
    return { rowsAffected: Number(result.changes) };
  };

  const transaction = {
    async execute(sql: string, params?: Params) {
      stats.statements++;
      return run(sql, params);
    },
    async getAll<T>(sql: string, params?: Params): Promise<T[]> {
      stats.statements++;
      return all(sql, params) as T[];
    },
    async getOptional<T>(sql: string, params?: Params): Promise<T | null> {
      stats.statements++;
      return (all(sql, params)[0] as T | undefined) ?? null;
    },
    async get<T>(sql: string, params?: Params): Promise<T> {
      stats.statements++;
      return all(sql, params)[0] as T;
    },
  };

  return {
    stats,

    async getAll<T>(sql: string, params?: Params): Promise<T[]> {
      stats.reads++;
      return all(sql, params) as T[];
    },

    async execute(sql: string, params?: Params) {
      stats.writeTransactions++;
      stats.statements++;
      return run(sql, params);
    },

    async writeTransaction<T>(work: (tx: typeof transaction) => Promise<T>): Promise<T> {
      stats.writeTransactions++;
      sqlite.exec("begin");
      try {
        const result = await work(transaction);
        sqlite.exec("commit");
        return result;
      } catch (error) {
        sqlite.exec("rollback");
        throw error;
      }
    },
  };
}

export type FakePowerSyncDb = ReturnType<typeof createFakePowerSyncDb>;
