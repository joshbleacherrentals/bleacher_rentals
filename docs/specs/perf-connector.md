# Performance telemetry — the connector: credentials and upload

Status: **AWAITING APPROVAL** — 0 open decisions (D1, D2 answered by the user).
Spec 3 of 5. Builds on [perf-telemetry-pipeline.md](perf-telemetry-pipeline.md) (the
`metrics` API and `classifyError`). Independent of spec 2, except one optional link (§3).
Request (user, 2026-10-08): connect duration must be attributable; upload must be measured
and linked to errors; no personal or row data in telemetry.
Branch: `q4-sprint1-finance-role`.

## 0. The request, and what it is not

**Measured by this spec:**

- `powersync.credentials`: obtaining the PowerSync token (Clerk and the Next.js route).
- `sync.upload`: one run of `uploadData`, the path of a local write to Supabase.

Both are **per tab**: every tab records its own (spec 2 §1a).

**Why `powersync.credentials` exists.** `powersync.connect` (spec 2) includes the
credentials fetch. Without this metric a slow connect cannot be assigned to Clerk and
Next.js or to the WebSocket handshake. It is the only way to separate those two.

**Not part of this spec:** the toast that tells the user a change was discarded (it stays
as it is), retry behaviour of the upload queue, the Supabase request time of each single
operation, bytes uploaded (D1), and the time between a local write and its confirmation
arriving back through the sync stream (not measurable from the client, see spec 1 §9).

## 1. Where each metric starts and ends

**`powersync.credentials`.** _Starts_ at the entry of `BackendConnector.fetchCredentials`.
_Ends_ when it returns (from the cache, from a request already in flight, or from a new
request). `attrs.source`: `cache` | `shared` | `network`. A `cache` hit is a few
microseconds and is recorded anyway so the share of cache hits is visible. On a thrown
error: `outcome: "error"` with `classifyError`. Includes the `fetch` to
`/api/powersync/credentials`, the Clerk token inside it and the JWT decode.

**`sync.upload`.** _Starts_ at the entry of `uploadData` after `getNextCrudTransaction()`
returned a transaction (an empty queue returns early and is **not** recorded: it is not an
upload). _Ends_ after `transaction.complete()`, or in the discard branch after the
discarded transaction is completed. `attrs`: `ops` (number of CRUD entries in the
transaction) and `tables` (distinct table names, joined, truncated to 64 characters).
Outcomes:

- success: `outcome: "ok"`;
- discarded (a fatal Postgres code): `outcome: "error"`, `errorKind: "pg:<sqlstate>"`,
  `attrs.discarded: true`;
- thrown for a retry: `outcome: "error"`, `errorKind` from `classifyError`. The SDK
  retries after a delay and calls `uploadData` again, which produces a new event; the
  event count therefore equals the attempt count (D2).

## 2. What is never recorded

- `error.message`, `error.details`, the JSON of the failed result, `lastOp.opData`, row ids.
  The existing `console.error` / `console.debug` lines and the toast are not touched, and
  nothing they print is copied into an event.
- The Supabase URL, the token, the JWT payload and its expiry.
- The size of the uploaded data (D1): no byte count or estimate is recorded.

## 3. Design

Edit `src/lib/powersync/BackendConnector.ts` only:

- wrap the body of `fetchCredentials` in `metrics.start("powersync.credentials")`, with
  the three exits (`cache`, `shared`, `network`) each calling `end({ source })`;
- wrap `uploadData` after the transaction is obtained; call `end` / `fail` in the three
  outcomes above; `finally` is not used so a path never records twice.

`classifyError` (spec 1) derives the kind from the Supabase error's `code` and `status`
and from `fetch` failures; for Supabase errors with a Postgres `code` the kind is
`pg:<code>` and nothing else is read from the object.

**Optional link to spec 2 (D1 of that spec).** When a fetch goes to the network the
connector writes `lastCredentialsFetchAt` (a `performance.now()` value) to a tiny
module-level variable. Spec 2 reads it to set `attrs.planned` on a reconnect. If spec 2 is
not built, the variable is written and never read; it holds no data beyond one number.

## 4. Edge cases

- **Two callers asking for credentials at once:** the second gets the in-flight promise;
  recorded as `shared` with its own (shorter) wait.
- **Token expired between cache check and use:** not detectable here; the SDK asks again.
- **`uploadData` called during sign-out:** the thrown error is classified `auth` or
  `network`; no Clerk text is kept.
- **A transaction with hundreds of operations:** one event, `ops` large; the 64 KB batch
  cap of spec 1 is unaffected because one event is small.
- **Offline:** the fetch fails, `errorKind: "network"`; the queue stays and retries.
- **Several tabs:** the shared worker asks one tab's connector at a time; the event is
  recorded by whichever tab ran the code, with that tab's `tabRole`.

## 5. Tests

- **Vitest, credentials:** a cache hit records `source: "cache"`; a second concurrent call
  records `shared`; a fetch that returns non-OK records an error with the classified kind
  and never the response text; a returned token never appears in any recorded event.
- **Vitest, upload:** an empty queue records nothing; a successful transaction records
  `ok` with `ops`; a fatal code (`23505`, `42501`) records `pg:<code>` with
  `discarded: true` and the existing toast is still raised; a network error records
  `network`; a Supabase error whose message contains a row never reaches an event; no
  byte count appears in any event.
- **Playwright:** none; reported SKIPPED, as the standing rule says.

## 6. Files

- **Edited:** `src/lib/powersync/BackendConnector.ts`, `src/lib/perf/telemetryEvent.ts`
  (registry names and `attrs` allow-lists).
- **Tests (not counted):** `BackendConnector.test.ts` (new).
- **Counted: 2.**

## 7. Decisions

- **D1.** _Bytes uploaded._ The browser does not report the size of a `fetch` body made by
  the Supabase client. Options were: not recorded, or an estimate from the length of each
  entry's `opData`. **User's answer:** not recorded.
- **D2.** _Is every upload attempt an event?_ Options were: every attempt, or only when
  `ops` reaches a number the user names. **User's answer:** every attempt.
