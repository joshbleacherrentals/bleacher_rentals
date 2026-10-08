# Performance telemetry — SQLite calls: query, write, batch

Status: **AWAITING APPROVAL** — 0 open decisions (D1–D3 answered by the user).
Spec 4 of 5. Builds on [perf-telemetry-pipeline.md](perf-telemetry-pipeline.md).
Independent of specs 2 and 3.
Request (user, 2026-10-08): measure query, insert, update, delete, transaction and batch
duration; detailed in development, sampled or aggregated in production; never log every
query in production by default.
Branch: `q4-sprint1-finance-role`.

## 0. The request, and what it is not

**Measured by this spec:** the calls the application makes to the local database through
`typedGetAll`, `typedExecute` and `typedExecuteBatch` in
[typedQuery.ts](../../src/lib/powersync/typedQuery.ts), plus the four direct
`powerSyncDb.getAll` calls found outside it (§3).

- `sqlite.query`: a read. `sqlite.write`: one statement. `sqlite.batch`: one write
  transaction carrying several statements.
- `attrs.op` (`select` | `insert` | `update` | `delete` | `other`) is the first keyword of
  the SQL, not a separate metric name. There is no `sqlite.tx` name: the only write
  transaction in the code base is `typedExecuteBatch`, so a "transaction" metric would be
  the same thing as `sqlite.batch`.

**What the figure is, and is not.** It is the time the _caller_ waited: the message to the
database worker, the wait for a free connection or the IndexedDB lock, the execution, and
the reply. The local database runs on `IDBBatchAtomicVFS`, where a transaction costs an
IndexedDB round trip (recorded elsewhere at 20–100 ms). The name `sqlite.*` is the
operation, not the SQLite engine's CPU time, and the dashboard text says so.

**Not measured, because it is invisible from outside the library:** the queries that
`useQuery` (`@powersync/react`) re-runs on every table change. They execute inside the
library on the real instance, not through the `powerSyncDb` proxy. What the code already
counts for them is the number of emissions (`perfTrace.ts`); this spec does not add their
duration. Saying "SQLite is slow" from `sqlite.query` alone would ignore them.

**Not part of this spec:** `perfTrace.ts` counters (kept as they are, they feed the
existing traces), SQL text in production, query parameters anywhere.

## 1. Where it starts and ends

_Starts_ on entry to the helper, _ends_ when the returned promise settles. For
`typedExecuteBatch`, the whole `writeTransaction`, with `attrs.statements` set to the
number of statements. A rejected promise records `outcome: "error"` with `classifyError`
(a SQLite constraint error becomes `unknown` unless it carries a classifiable code) and
the promise still rejects with the original error, unchanged.

`attrs`: `op`, `tables` (names only, parsed with the existing `tablesInSql`, truncated to
64 characters), `rows` for a read (the length of the result array, a number, never the
rows) and `statements` for a batch.

## 2. Development and production

**Development.** Every call is recorded and printed with `console.debug`, with the
normalised SQL (`watcherKeyFromSql`) and **without parameters**. No aggregation.

**Production (D1, D2).** The SQL text is never sent; `attrs` carry `op` and `tables`
only. Two kinds of event:

- **Slow or failed call, individual:** a call that takes **more than 50 ms**, and every
  call that fails (`outcome: "error"`), is one event with its own `durationMs`.
- **Everything else, aggregated:** the calls of 50 ms or less are counted in memory per
  `(name, op, tables)` and flushed as **one event per key per 10 seconds** (and on
  `pagehide`). Its `durationMs` is null; its `attrs` are `count`, `sumMs`, `maxMs`, and
  `b1` to `b6`, the number of calls with a duration up to 1, 2, 5, 10, 20 and 50 ms
  (cumulative edges, each call is counted once in the first bucket that holds it).
  The bucket edges are mine: **to confirm at review.**
- A call is in exactly one of the two kinds, never both.

**What this does to the percentiles (said plainly).** The total number of calls is
`count` of the aggregates plus the number of individual events. A percentile that lands
above 50 ms is exact, taken from the individual events. A percentile that lands at or
below 50 ms is known only to the width of a bucket (for example "between 5 and 10 ms").
The queries in `docs/PERFORMANCE_QUERIES.md` return the bucket, not an invented number.

## 3. Design

- Wrap the three helpers in `typedQuery.ts`. Existing `countDbRead` / `countDbWrite` /
  `countDbBatch` calls stay exactly where they are.
- A small `timed(kind, sql, run)` helper in `src/lib/perf/sqliteTiming.ts` holds the
  common code, including the production aggregator, so the three helpers stay three
  lines each.
- **The four direct `powerSyncDb.getAll` calls (D3)** move to `typedGetAll`:
  `termsAndConditionsDb.ts` (2), `fetchQuoteDetail.ts` and `loadQuoteIntoStore.ts`. All four
  already build a compiled Kysely query, so the call is the only change.
  - **Risk:** `typedGetAll` enforces that the row type equals the Kysely result exactly
    (`expect<T>()`). `TermsAndConditionsRow`, `Row` in `fetchQuoteDetail.ts` and the inline
    `{ id: string }` may differ in nullability; the type check then fails and the row type
    is corrected to the real one. `npm run tc` shows this; no behaviour changes.
  - **Side effect:** these calls now increment the read counter of `perfTrace.ts`. Any
    existing trace that covers them reports a higher `reads` than before; that is the
    counter becoming correct, not a regression.

## 4. Edge cases

- **A query that never resolves** (a stuck lock): no event until it settles; the open
  count is not tracked. The existing `startTrace` traces cover a stuck save.
- **Re-entrancy:** a batch calls `tx.execute` inside `writeTransaction`; those inner
  calls are **not** wrapped (they are not `typedExecute`), so a batch is one event, not
  one plus N.
- **Very frequent calls** (alert cascade, work tracker save): see D1; the volume is the
  reason D1 exists.
- **A failing SQL error message:** never recorded (spec 1 §7).
- **SSR:** `db` compiles queries on the server but `powerSyncDb` is browser-only; the
  helpers run only in the browser.

## 5. Tests

- **Vitest, `timed`:** records a duration for a resolved promise; records `error` for a
  rejected one and re-throws the original error; `op` is parsed from `SELECT`, `INSERT`,
  `UPDATE`, `DELETE`, a CTE and an unknown statement; parameters never appear in an event.
- **Vitest, `typedQuery`:** each helper still returns what it returned before (the
  existing tests keep passing); a batch records one event with `statements`; a read
  records `rows` as a number.
- **Vitest, production mode:** no SQL text in any event; a 50 ms call is aggregated, a
  51 ms call is individual; a failed call is individual whatever its duration; a call is
  never in both kinds; the aggregate carries `count`, `sumMs`, `maxMs` and buckets whose
  sum equals `count`; it flushes after 10 s and on `pagehide`; an empty window emits
  nothing.
- **Playwright:** none; SKIPPED as the standing rule says.

## 6. Files

- **Created:** `src/lib/perf/sqliteTiming.ts`.
- **Edited:** `src/lib/powersync/typedQuery.ts`, `src/lib/perf/telemetryEvent.ts`,
  `termsAndConditionsDb.ts`, `fetchQuoteDetail.ts`, `loadQuoteIntoStore.ts`,
  `docs/PERFORMANCE_QUERIES.md` (the bucket-aware percentile query).
- **Tests (not counted):** `sqliteTiming.test.ts`, additions to the `typedQuery` tests.
- **Counted: 7** (the cap is 10).

## 7. Decisions

- **D1.** _How often production produces an event for a SQLite call._ Options were: one
  event per call; one aggregate per key per 10 s; slow calls individually plus an
  aggregate for the rest. **User's answer:** slow calls individually plus an aggregate.
- **D2.** _What "slow" means._ **User's answer:** 50 ms (strictly more than 50 ms is
  individual).
- **D3.** _The four direct `getAll` calls._ Options were: leave them; route them through
  `typedGetAll`; wrap them in place. **User's answer:** route them through `typedGetAll`.
