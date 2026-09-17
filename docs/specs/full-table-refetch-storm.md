# Full-table refetch storm — Pusher, Zustand stores, and silent 1000-row truncation

Status: **approved and implemented.**

Implementation notes, added after approval:

- **`nextReconnectState` lives in `src/lib/pusher/reconnectState.ts`**, not inside
  the hook. Importing the hook pulls in the Pusher client and every Zustand
  store; the reducer is the part worth testing and it now imports nothing.
- **A drop before the first successful connect counts as a reconnect.** The
  initial fetches never completed in that case, so the refetch is redundant
  rather than wrong, and the simpler rule is easier to reason about. Covered by
  a test that states the reasoning.
- **The ten-second reload watchdog still treats `connecting` as a possible
  drop**, while the reducer does not. They answer different questions: the
  watchdog asks "is this session wedged?", the reducer asks "did we miss
  publications?". Left deliberately out of step.
- **`fetchTableSetStoreAndCache` returns `true` when only the cache write
  failed.** A quota error leaves the in-memory store complete and correct;
  returning `false` would mark the table stale and refetch it forever.

Round three of the work tracker performance effort, item 2. Items 1
(watched-query instrumentation) and 3 (one-transaction save) are local changes
and proceed without a spec; this one changes app-wide data loading and carries a
correctness fix, so it is written down first.

## Problem

`SignedInComponents` mounts `useSupabaseSubscriptions`, which sets up ten
Zustand-backed tables: `Bleachers`, `Blocks`, `Users`, `WorkTrackers`,
`HomeBases`, `UserStatuses`, `UserHomeBases`, `Events`, `Addresses`,
`BleacherEvents`. Each one goes through `useSetupTable` → `useFetchTable` →
`fetchTableSetStoreAndCache`, which issues a bare `select("*")`, replaces the
store, and `JSON.stringify`s the whole table into `localStorage` on the main
thread.

Measured on one page load: **20 full-table fetches for 10 tables.** Cold build,
slowest 12.59s, app unusable for roughly the first 13 seconds; warm build
384ms–2.27s each.

### 1. Correctness — silent truncation at 1000 rows

`fetchTableSetStoreAndCache` issues `supabaseClient.from(tableName).select("*")`
with no `.range()`, no pagination, and no check on the returned length.
`supabase/config.toml` sets `max_rows = 1000`. PostgREST enforces `max_rows` as a
hard cap and returns the truncated page **without an error** — `error` is null,
`data.length` is 1000, and the store is replaced with a partial table.

The instrumented page load reported exactly 1000 rows for `Blocks`,
`BleacherEvents`, `Addresses` and `Events`, and fewer than 1000 for
`WorkTrackers` (859) and `Bleachers` (194). Four tables sitting on exactly the
cap is the cap, not a coincidence.

Everything that reads those four Zustand stores is therefore working from a
partial table. That includes `fetchBleachers` and `fetchDashboardEvents` in
`src/features/dashboard/db/client/db.ts`, which build the PixiJS dashboard's
bleachers and events out of `useEventsStore`, `useAddressesStore`,
`useBleacherEventsStore` and `useBlocksStore`. A dashboard event whose
`BleacherEvents` row fell past row 1000 simply does not render; an event whose
`Addresses` row fell past row 1000 renders with `addressData: null`.

This outranks the performance work.

### 2. Duplication — every table fetched twice

Every store starts at `stale: true`, so the ten initial fetches are expected.
The second ten come from `handleStateChange` in
`src/hooks/useSubscribeToDbChanges.ts`: on connection state `connected` it runs

```ts
Object.values(setStaleByTable).forEach((setStale) => setStale());
```

Pusher reaches `connected` while the first ten fetches are still in flight, so
every table is marked stale again and re-fetched the moment the first fetch
resolves and clears the flag.

The comment on that line records a real hazard — Pusher can miss publications
while disconnected, and something has to recover from it. The intent is kept;
the price is not.

### 3. Fan-out — one save, ten clients, two whole tables each

`saveWorkTracker` calls `updateDataBase(["WorkTrackers", "Addresses"])`, which
broadcasts to every connected client. Each client re-downloads both tables in
full and re-serializes them to `localStorage`.

## Scope

In scope:

- Paginated, non-truncating reads for every table fetched through
  `fetchTableSetStoreAndCache`.
- Removing the duplicate load on the first `connected` transition, without
  losing recovery after a real reconnect.

Out of scope, explicitly:

- Migrating these stores to PowerSync. They pre-date the PowerSync-first rule and
  several are read by non-reactive code; that is its own piece of work.
- Changing `updateDataBase`'s broadcast payload or the Pusher channel shape.
- Narrowing `select("*")` to column lists. Considered and rejected for this
  round: the stores are typed as whole `Tables<...>` rows and consumers reach for
  arbitrary columns, so a column list would be a large, separately-testable
  change with its own regression surface. Pagination fixes the correctness bug
  and the cost driver (row count) without it.

## Design

### 3.1 Pagination — `fetchAllRows`

A new module, `src/lib/supabase/fetchAllRows.ts`, holding the paging loop as a
pure-ish function over an injectable page fetcher, so it is unit-testable with no
Supabase client:

```ts
export const SUPABASE_MAX_ROWS = 1000;

export type PageFetcher<T> = (
  from: number,
  to: number,
) => Promise<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export type FetchAllRowsResult<T> =
  | { ok: true; rows: T[]; pages: number }
  | { ok: false; error: string; pages: number };

export async function fetchAllRows<T>(
  fetchPage: PageFetcher<T>,
  options?: { pageSize?: number; maxPages?: number },
): Promise<FetchAllRowsResult<T>>;
```

Rules:

- `pageSize` defaults to `SUPABASE_MAX_ROWS`. Requesting a page larger than the
  server cap is pointless — the server truncates it anyway — so the page size is
  the cap, and a short page means the end of the table.
- Stop when a page returns fewer than `pageSize` rows. A full last page costs one
  extra empty request; that is the only reliable end-of-table signal PostgREST
  gives us without a `count`.
- `maxPages` (default 200, i.e. 200k rows) is a guard against an infinite loop if
  a server ever ignores `range`. Hitting it is an error, not a silent stop —
  silently stopping is the bug this module exists to fix.
- Any page error aborts and returns `ok: false`. A partial table is never handed
  to a store; the caller keeps `stale: true` and retries, which is the existing
  failure behaviour.

`fetchTableSetStoreAndCache` becomes a caller:

```ts
const result = await fetchAllRows<T>((from, to) =>
  supabaseClient.from(tableName).select("*").range(from, to),
);
```

`perfNote` grows a `pages` figure so the next captured log shows how many
round-trips each table now costs.

### 3.2 Reconnect — recover, don't reload

`handleStateChange` stops marking every table stale on every `connected`
transition. Instead `useSubscribeToDbChanges` keeps a ref of whether the
connection has ever been lost:

- First `connected` of the session: do nothing. Every store already starts
  `stale: true`; the initial fetches are already running.
- `disconnected` / `unavailable` / `failed`: set `hasDisconnected = true`.
- A later `connected` while `hasDisconnected` is true: mark every table stale
  once, then clear the flag. This is the case the original comment is about —
  publications missed while offline — and it still refetches everything.

The existing ten-second "still disconnected → `window.location.reload()`"
watchdog is untouched.

The decision is extracted as a pure reducer so it can be unit-tested without
Pusher:

```ts
export type ConnectionPhase = "initial" | "online" | "offline";

export type ReconnectDecision = {
  phase: ConnectionPhase;
  refetchAll: boolean;
};

export function nextReconnectState(phase: ConnectionPhase, current: string): ReconnectDecision;
```

`refetchAll` is true only on `offline → online`.

## Types

No database types change. No PowerSync (`AppSchema.ts`) tables change. New
TypeScript types are the four above; no existing exported type changes shape.

## Behaviour scenarios

1. **Cold load, table under 1000 rows.** One request per table, `pages: 1`.
   Identical to today apart from the `range` header.
2. **Cold load, table over 1000 rows.** Requests continue until a short page.
   The store receives every row. Today it receives the first 1000.
3. **Cold load, exactly 1000 rows.** Two requests: 1000 rows then an empty page.
   Store receives 1000 rows, correctly this time rather than by luck.
4. **A page errors mid-table.** No `setStore` call, store stays stale, retried on
   the next client/session change. Same as today's error path.
5. **First `connected` after page load.** No extra fetches. Total fetches for
   ten tables: ten, not twenty.
6. **Drop and reconnect.** Every table marked stale once and refetched — the
   behaviour the original comment asks for.
7. **Flapping (`connected → connecting → connected`) without a disconnect.**
   `connecting` is not a disconnect; no refetch storm.
8. **A work tracker is saved elsewhere.** `updateDataBase` still broadcasts,
   `WorkTrackers` and `Addresses` are still refetched — now paginated and
   complete. Unchanged in shape.

## Edge cases and error handling

- **Clerk session not ready.** Unchanged: the first page errors, `ok: false`,
  `stale` stays true, the effect retries when `supabaseClient` changes.
- **Offline.** Unchanged: fetch rejects, error path, store keeps its cached
  `localStorage` copy from `useCachedTable`.
- **`localStorage` quota.** Not addressed here. A complete table is larger than a
  truncated one, so a table that previously fit at 1000 rows may now throw
  `QuotaExceededError` on `setItem`. The `setItem` call is wrapped so a quota
  failure logs and leaves the in-memory store correct — a missing cache is a slow
  next load, a truncated store is wrong data.
- **PowerSync offline state.** Untouched; these stores do not go through
  PowerSync.

## Testing

Unit (Vitest), no browser:

- `fetchAllRows`: single short page; exact-multiple-of-page-size table; multi-page
  table; error on page 1; error on page 3; `maxPages` guard; page size is passed
  through to `range` as `(0, 999)`, `(1000, 1999)`, ….
- `nextReconnectState`: the transition table from scenarios 5–7.

E2E: none added this round. Playwright is out of scope for this round by
agreement; the behaviour is covered by the unit tests above and by the existing
dashboard specs continuing to pass in a later round.

## Permissions

No role's capabilities change. This alters how many rows a client downloads, not
who may download them; RLS is unchanged and every request still carries the same
Clerk-derived identity. `src/features/userAccess/permissionPageData.ts` is
re-checked rather than assumed, and is expected to need no edit.

## Definition of Done

`npm run tc` and `npx vitest run` green, output shown. Playwright skipped for
this round with the reason stated. Only files touched by this change are
formatted.
