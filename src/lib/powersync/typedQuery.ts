"use client";
import { useEffect, useRef } from "react";
import type { CompiledQuery } from "kysely";
import { useQuery } from "@powersync/react";
import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import {
  countDbBatch,
  countDbRead,
  countDbWrite,
  countWatcherEmission,
  countWatcherMount,
  countWatcherUnmount,
} from "@/lib/perf/perfTrace";

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
  return powerSyncDb.getAll<TExpected>(compiled.sql, compiled.parameters as any[]);
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
  return powerSyncDb.execute(compiled.sql, compiled.parameters as any[]);
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
export function typedExecuteBatch(statements: CompiledQuery<any>[]): Promise<void> {
  if (statements.length === 0) return Promise.resolve();

  // One transaction, `statements.length` statements — counted separately so a
  // trace shows work being batched rather than appearing to vanish.
  countDbBatch(statements.length);
  return powerSyncDb.writeTransaction(async (tx) => {
    for (const statement of statements) {
      await tx.execute(statement.sql, statement.parameters as any[]);
    }
  });
}
