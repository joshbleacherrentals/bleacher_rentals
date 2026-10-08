# Performance telemetry — SQLite calls: query, write, batch

Status: **BLOCKED** — 3 open decisions (D1–D3).
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
normalised SQL (`watcherKeyFromSql`) and **without parameters**.

**Production.** The SQL text is never sent. Only `op` and `tables` go in `attrs`.
How often an event is produced is decision D1.

## 3. Design

- Wrap the three helpers in `typedQuery.ts`. Existing `countDbRead` / `countDbWrite` /
  `countDbBatch` calls stay exactly where they are.
- The four direct `powerSyncDb.getAll` calls are in
  `termsAndConditionsDb.ts` (2), `fetchQuoteDetail.ts` and `loadQuoteIntoStore.ts`.
  Decision D3 says what to do with them.
- A small `timed(kind, sql, run)` helper in `src/lib/perf/sqliteTiming.ts` holds the
  common code so the three helpers stay three lines each.

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
- **Vitest, production mode:** no SQL text in any event.
- **Playwright:** none; SKIPPED as the standing rule says.

## 6. Files

- **Created:** `src/lib/perf/sqliteTiming.ts`.
- **Edited:** `src/lib/powersync/typedQuery.ts`, `src/lib/perf/telemetryEvent.ts`; plus
  the four call sites if D3 chooses to route them: `termsAndConditionsDb.ts`,
  `fetchQuoteDetail.ts`, `loadQuoteIntoStore.ts`.
- **Tests (not counted):** `sqliteTiming.test.ts`, additions to the `typedQuery` tests.
- **Counted: 3 without the call sites, 6 with them.**

## 7. Decisions

- **D1.** _How often production produces an event for a SQLite call._ The user decided
  100% of events and that slow ones are never removed from percentiles, and also asked not
  to log every query in production by default. These pull in opposite directions for the
  highest-volume metric. Options: (a) one event per call, 100%; exact percentiles, the
  largest table growth; (b) one aggregate event per `(op, tables)` per 10 seconds with
  `count`, `sumMs`, `maxMs` and a small fixed set of duration buckets; the volume is a
  few events per window, percentiles are read from the buckets and are approximate, and
  single slow calls are only visible as `maxMs`; (c) one event per call only above a
  threshold the user names, plus (b) for the rest. **User's answer:** _unanswered._
- **D2.** _What "slow" means for any threshold in D1._ Only needed if D1 is (c). The user
  names the number of milliseconds, or says to derive it from the first weeks of data.
  **User's answer:** _unanswered._
- **D3.** _The four direct `getAll` calls._ Options: (a) leave them, so they are not
  measured; (b) route them through `typedGetAll` (a behaviour-neutral change to three
  more files, and they gain the compile-time `expect<T>()` check); (c) wrap them in place
  with `timed`. **User's answer:** _unanswered._
