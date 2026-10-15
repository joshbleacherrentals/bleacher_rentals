"use client";
import { useEffect, useRef } from "react";
import type { CompiledQuery } from "kysely";
import { useQuery } from "@powersync/react";
import type { Transaction } from "@powersync/web";
import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import {
  countDbBatch,
  countDbRead,
  countDbWrite,
  countWatcherEmission,
  countWatcherMount,
  countWatcherUnmount,
} from "@/lib/perf/perfTrace";
import { timed } from "@/lib/perf/sqliteTiming";

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

export type CompiledResultOf<C> = C extends CompiledQuery<infer R> ? R : never;

type EnsureExact<Actual, Expected> =
  Equal<Actual, Expected> extends true
    ? {}
    : { __TYPE_MISMATCH__: { actual: Actual; expected: Expected } };

// phantom helper (runtime = undefined, compile-time = T)
export const expect = <T>() => undefined as unknown as T;

/**
 * Counts what `@powersync/react` does that no other counter can see.
 *
 * Without a `rowComparator` the hook re-runs its SQL and returns a *new array*
 * on every change to any table the query reads, identical rows or not. A new
 * `data` reference is therefore exactly one emission, and one commit produces
 * one per mounted watcher on each table it touched.
 *
 * The first non-loading result is the initial load, not a re-run after a
 * commit, so it seeds the comparison rather than being counted — the number the
 * report is after is emissions *per commit*.
 *
 * Cost is a ref compare in an effect that React has already scheduled, so this
 * stays as cheap as the read/write counters and stays on.
 */
function useWatcherEmissionCount(sql: string, data: unknown, isLoading: boolean): void {
  const seen = useRef<unknown>(undefined);

  useEffect(() => {
    countWatcherMount(sql);
    return () => countWatcherUnmount(sql);
  }, [sql]);

  useEffect(() => {
    if (isLoading) return;
    if (seen.current === data) return;

    const isInitialLoad = seen.current === undefined;
    seen.current = data;
    if (!isInitialLoad) countWatcherEmission(sql);
  }, [sql, data, isLoading]);
}

export function useTypedQuery<C extends CompiledQuery<any>, TExpected>(
  compiled: C & EnsureExact<CompiledResultOf<C>, TExpected>,
  _expected: TExpected, // required so you can't forget the check
) {
  const result = useQuery<TExpected>(compiled.sql, compiled.parameters as any[]);
  useWatcherEmissionCount(compiled.sql, result.data, result.isLoading);
  return result;
}

export function typedGetAll<C extends CompiledQuery<any>, TExpected>(
  compiled: C & EnsureExact<CompiledResultOf<C>, TExpected>,
  _expected: TExpected, // required so you can't forget the check
) {
  // Counted so a trace can report how many sequential worker round-trips a save
  // actually costs — that number, not any single query, is what makes it slow.
  countDbRead();
  return timed("sqlite.query", compiled.sql, () =>
    powerSyncDb.getAll<TExpected>(compiled.sql, compiled.parameters as any[]),
  );
}

/**
 * Execute a compiled Kysely query (INSERT/UPDATE/DELETE).
 *
 * Note: `execute()` returns a driver-specific result shape, so this helper
 * focuses on making sure the SQL was built via the typed `db` instance.
 */
export function typedExecute(compiled: CompiledQuery<any>) {
  // Each call is its own transaction, and each one wakes every watched query on
  // the tables it touches — see `countDbRead` above.
  countDbWrite();
  return timed("sqlite.write", compiled.sql, () =>
    powerSyncDb.execute(compiled.sql, compiled.parameters as any[]),
  );
}

/**
 * Applies several compiled statements inside a single write transaction.
 *
 * The local DB runs on `IDBBatchAtomicVFS` (see `SystemProvider`), so every
 * transaction is an IndexedDB round-trip of 20-100ms, and every commit wakes
 * every watched query on the tables it touched. An alert cascade used to issue
 * around a hundred of them; as one transaction it costs one round-trip and one
 * re-render storm instead of a hundred of each — and it becomes atomic, so a
 * failure part-way through can no longer leave half the cascade's alerts
 * written.
 */
const TRACKED_TRANSACTION_METHODS = new Set([
  "execute",
  "executeRaw",
  "getAll",
  "get",
  "getOptional",
]);

/** The transaction, with the SQL of each statement it runs added to `statements`. */
function trackStatements(transaction: Transaction, statements: string[]): Transaction {
  return new Proxy(transaction, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!TRACKED_TRANSACTION_METHODS.has(property as string)) return value.bind(target);
      return (sql: string, ...rest: unknown[]) => {
        statements.push(sql);
        return value.call(target, sql, ...rest);
      };
    },
  });
}

/**
 * Runs `work` in a single write transaction, for an action that reads and writes: its reads and
 * its writes share one transaction, one commit, and one wake-up of the watchers.
 *
 * `typedExecuteBatch` takes statements known in advance; this takes a function, because a later
 * statement often depends on what an earlier read returned. Like the batch it is atomic: if
 * `work` throws, everything it wrote is rolled back and the same error reaches the caller.
 *
 * It is timed as `sqlite.batch` and counted as one write transaction with the number of
 * statements that ran in it. Use the `tx` it passes, not `powerSyncDb`, inside `work`.
 */
export function typedWriteTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  // Filled while `work` runs and read when the call settles (see `timed`).
  const statements: string[] = [];

  return timed("sqlite.batch", statements, () =>
    powerSyncDb.writeTransaction(async (tx) => {
      try {
        return await work(trackStatements(tx, statements));
      } finally {
        countDbBatch(statements.length);
      }
    }),
  );
}

export function typedExecuteBatch(statements: CompiledQuery<any>[]): Promise<void> {
  if (statements.length === 0) return Promise.resolve();

  // One transaction, `statements.length` statements — counted separately so a
  // trace shows work being batched rather than appearing to vanish.
  countDbBatch(statements.length);
  return timed(
    "sqlite.batch",
    statements.map((statement) => statement.sql),
    () =>
      powerSyncDb.writeTransaction(async (tx) => {
        for (const statement of statements) {
          await tx.execute(statement.sql, statement.parameters as any[]);
        }
      }),
  );
}
