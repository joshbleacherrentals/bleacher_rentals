# Quote detail 01: the quote itself, reactive

Status: **IMPLEMENTED 2026-10-14, uncommitted, awaiting review** (approved the same day).
0 open decisions (D2 answered). Spec 1 of
[quote-detail-reactive-plan.md](quote-detail-reactive-plan.md). Request (user, 2026-10-14): the
title, line items and other elements of an open `/quotes-bookings/[id]` did not change when
the quote was edited in another tab.

## 0. The request, and what it is not

**In scope:** the `quote` object the page builds from `fetchQuoteDetail`: title and
breadcrumb, status, contacts, address and venue, dates, notes, account manager, the deleted
flag, tax and the owner id the capabilities need.

**Not in scope:** the signature (spec 02), the history panels (spec 03), the line item
writes (spec 04), the edit page's loader, and any write.

## 1. Decisions taken

**D2 — the shape of the query.** Options: one query with the five JOINs that
`fetchQuoteDetail` has (one watcher, re-runs on a commit to any of five tables); small queries
merged in JS, as in step 1 of the slow-database plan (six watchers, each re-runs only for its
own table, more code and tests).
User's answer: **small queries and a merge in JS.**

## 2. What the code does today

- `QuoteDetailView.tsx:193` calls `fetchQuoteDetail(eventId)` inside `useEffect([eventId])`:
  one `typedGetAll` with five JOINs (Events, Addresses, Venues, Contacts twice, Users). The
  result `quote` feeds the header and breadcrumb, `useQuotesBookingsCapabilities`
  (`createdByUserUuid`), the Contract tab (every field), the Billing tab (status badge), the
  deleted banner, the send recipients and the Edit link.
- `setLoading(true)` runs on every `eventId` change and replaces the page with "Loading
  quote..." until that one read gets its turn on the single database connection.
- Nothing watches the row, so an edit made in another tab, or by sync, never shows.
- `fetchQuoteDetail` is also called by `loadQuoteIntoStore` (the edit page).

## 3. The change

New `db/quoteDetailData.ts`. Pure: the builders take the Kysely instance as a parameter, as
the step 1 modules do, so tests need no `SystemProvider`.

- `buildQuoteDetailQueries(db, eventId)` returns six compiled queries:
  - **event:** the `Events` columns `fetchQuoteDetail` reads, `where id = ?`.
  - **address:** street, city, state_province, zip_postal from `Addresses` where `id in
(select address_uuid from Events where id = ?)`.
  - **venue:** id, name from `Venues`, the same `in (select venue_uuid …)` form.
  - **contact** and **finance contact:** id, first_name, last_name, email, phone from
    `Contacts`, `in (select contact_uuid …)` and `in (select finance_contact_uuid …)`.
  - **account manager:** first_name, last_name from `Users`, `in (select
created_by_user_uuid …)`.
- `mergeQuoteDetail(parts)` returns the `QuoteDetail` that `fetchQuoteDetail` returns, or
  `null` when there is no event row. Same rules as today: no address when `street` is empty;
  `isTaxOverridden` and `deleted` are `=== 1`; the account manager is null when both names
  are empty; a missing contact first name is an empty string.

New `hooks/useQuoteDetail.ts`: six `useTypedQuery` calls and one `useMemo` merge.

- `isLoading` is true until all six queries have answered once for this `eventId`.
- If any query errors, `quote` is null and `error` is set; the page shows "Quote not found",
  which is what a rejected `fetchQuoteDetail` produces today.
- **Stable reference:** a re-run that returns the same data returns the same `quote` object.
  PowerSync tells a watcher that a TABLE changed, not which row, so the event query re-runs
  on every edit of any event; without this the whole page would re-render each time.
- **No stale quote:** when `eventId` changes while the component stays mounted, the hook
  returns the loading state, never the previous quote; the merge also returns null when the
  event row's id differs from `eventId`.

`QuoteDetailView.tsx`: the `quote` and `loading` state and the `useEffect` go; the view reads
`useQuoteDetail(eventId)`. `fetchQuoteDetail` is not touched: the edit loader keeps its one
call, and a differential test keeps the old JOIN and the new queries equal.

## 4. Locked contracts

```ts
// db/quoteDetailData.ts
export function buildQuoteDetailQueries(db: Kysely<DB>, eventId: string): QuoteDetailQueries;
export function mergeQuoteDetail(parts: QuoteDetailParts): QuoteDetail | null;
// hooks/useQuoteDetail.ts
export function useQuoteDetail(eventId: string): {
  quote: QuoteDetail | null;
  isLoading: boolean;
  error: Error | null;
};
```

`quoteDetailData.ts` also exports two pure functions and two types that are not in the contract
above, because the hook's two rules had to be testable without a client renderer (this repo
has none): `resolveQuoteDetail({ answeredFor, parts, statuses })` decides when the page may
show a quote (section 3), and `reuseQuote(previous, next)` keeps the previous object when the
data is equal; `PartStatus` and `QuoteDetailParts` are their types. The hook only wires them to
`useTypedQuery`. The locked signatures above are unchanged.

`QuoteDetail` and `fetchQuoteDetail` keep their types and behaviour. No migration; no change
to `AppSchema.ts`, `database.types.ts`, `sync_rules.yaml` or `permissionPageData.ts`.

## 5. Behaviour that must not change

- The page looks the same for a quote that is not being edited elsewhere.
- Not found: "Quote not found" with the Back link.
- A deleted quote shows the red banner and the rest of the page.
- Capabilities, the Edit link, the send recipients and the Billing badge read the same
  fields as before.
- The edit page is untouched, so a remote change never overwrites a draft being typed.

## 6. Edge cases and error handling

- The row is not in the local database yet (a link from a chat notification to a quote made
  a second ago): the page says "Quote not found" and fills in when the row syncs; today it
  stays "not found" until a reload.
- The row is removed on the server while the page is open: the page changes to "Quote not
  found". A soft delete shows the red banner, live.
- Only part of the data has arrived (the event is there, its contact is not): the contact is
  absent until it arrives, as a LEFT JOIN with a missing row gives today.
- Offline: every read is local, so the page works offline.
- The Clerk token expires or the connection drops: reads are unaffected; sync pauses and
  the page shows what it has.
- Opening another quote through the same route: no flash of the previous quote's data.
- PowerSync is not ready yet: the hook stays in the loading state, as the other
  `useTypedQuery` pages do.

## 7. Tests (TDD: red first, then code)

1. `quoteDetailData.test.ts`: the merge, every rule in section 3 (no event row, no address,
   empty names, `=== 1` flags, a contact with a null last name).
2. `quoteDetailData.differential.test.ts`: the old JOIN from `fetchQuoteDetail` (verbatim)
   against the six queries plus the merge, on at least 200 seeded datasets in in-memory
   `node:sqlite`, as in step 1; mutation-checked (three deliberate bugs, all caught).
3. `useQuoteDetail.test.tsx`: loading until six answers; an error gives a null quote; the
   same data gives the same object; an `eventId` change never returns the old quote. As built:
   the hook is rendered on the server with `useTypedQuery` replaced, which shows one render
   at a time; what happens across renders (a re-run after a commit, a new id, the same object
   for equal data) is tested in `quoteDetailData.test.ts` on `resolveQuoteDetail` and
   `reuseQuote`.
4. `QuoteDetailView` test: renders loading, not found, a quote, and shows whatever title the
   hook holds. As built: a server render never runs effects, so "the page does not read the
   quote itself" is a check on the source (no `fetchQuoteDetail`), and the live follow of a
   rename is the Playwright scenario below.
5. Playwright, written per CLAUDE.md and **not run locally**:
   `src/features/quotesAndBookings/e2e/quoteDetailReactive.admin.spec.ts` (as an admin, who
   may edit any quote): open a quote in tab A; in tab B edit the title and save; tab A's
   heading changes with no reload.

## 8. Measurement

`perfLog.report()` on the detail page, before and after: six more live watchers, expected;
reported, not a gate.

## 9. Rollback and commits

One commit, `reactive(quote-detail): read the quote through PowerSync`. Rollback is
`git revert`.

## 10. Permissions

None changes. Who may open a quote and what they may do is decided as before.

## 11. Files

3 counted files under `src/features/quotesAndBookings/`: `db/quoteDetailData.ts`,
`hooks/useQuoteDetail.ts`, `components/quoteDetail/QuoteDetailView.tsx`.

## 12. Definition of done

As in the plan, section 6. Result (2026-10-14):

- `npm run tc`: the same 4 errors as before the change, none in these files. They come from an
  uncommitted regeneration of `database.types.ts` that is not part of this spec (it drops
  `EventLineItems.is_price_overridden`).
- `npx vitest run`: 317 files, 3709 of 3710 tests pass. The one failure is
  `eventChat/db/readReceipts.differential.test.ts`, which times out at 5 s when the suite runs
  in parallel and passes alone in 3.2 s; it fails the same way with these files left out.
- Prettier: clean on the 7 touched files. E2E: SKIPPED, not run locally.
- Not checked in a browser: the page is behind a Clerk sign-in.

## 13. To confirm at review

- The six queries return exactly what `fetchQuoteDetail` returns for a deleted quote and for
  a quote whose creator row is missing (covered by the differential test; confirm that is
  the wanted behaviour).
