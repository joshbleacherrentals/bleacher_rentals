# Quote detail 03: the history panels, reactive while open

Status: **IMPLEMENTED 2026-10-15, uncommitted, awaiting review** (approved the same day).
0 open decisions (D3 answered). Spec 3 of
[quote-detail-reactive-plan.md](quote-detail-reactive-plan.md). Request (user, 2026-10-14): the
page should be reactive; the Contact and Venue side panels read their events once, when
opened.

## 0. The request, and what it is not

**In scope:** the Contact history and Venue history panels opened from the Contract tab.

**Not in scope:** the content or look of the panels, the pure past/future bucketing and
sorting, and any other panel.

## 1. Decisions taken

**D3 — the history panels.** Options: leave them as they are (data is fresh when opened);
make them reactive while open (the list changes live; a watcher exists only while the panel
is open; the query code is rewritten as a hook).
User's answer: **reactive while open.**

## 2. What the code does today

- `EventHistorySheet.tsx` runs `fetchEvents()` in `useEffect([open])`, once per opening, and
  shows "Loading events..." until it returns.
- `ContactHistorySheet` calls `fetchContactEvents(contactId)` and `VenueHistorySheet` calls
  `fetchVenueEvents(venueId)`: one `typedGetAll` each, then `bucketAndSortContactEvents` /
  `bucketAndSortVenueEvents` (Past = `event_end` before now, most recent first; Future =
  the rest, soonest first). No other file calls the two `fetch…` functions.
- The sheet component is always mounted and returns null while closed.

## 3. The change

- `fetchContactEvents.ts` and `fetchVenueEvents.ts` keep their pure bucketing functions and
  their row and bucket types; the async `fetch…` functions are replaced by exported query
  builders (`contactEventsQuery(contactId)`, `venueEventsQuery(venueId)`) with the SQL they
  have now, so the SQL stays in one place.
- New `hooks/useContactEvents.ts` and `hooks/useVenueEvents.ts`: run the builder with
  `useTypedQuery`, bucket the rows with `useMemo`, return `{ buckets, isLoading }`.
- `ContactHistorySheet`, `VenueHistorySheet` and `EventHistorySheet` render nothing while
  closed and mount an inner component that calls the hook only while open, so the watcher
  exists only while the panel does. The `fetchEvents` prop, its `useEffect` and its loading
  and result state go; the sheet takes the buckets and `isLoading` as props.
- "Past" is decided against the time of the render that buckets the rows; an event does not
  move from Future to Past while the panel is open and nothing else changes.

## 4. Locked contracts

```ts
// db/fetchContactEvents.ts, db/fetchVenueEvents.ts
export function contactEventsQuery(contactId: string): CompiledQuery<ContactEventRow>;
export function venueEventsQuery(venueId: string): CompiledQuery<VenueEventRow>;
// hooks/useContactEvents.ts, hooks/useVenueEvents.ts
export function useContactEvents(contactId: string): {
  buckets: ContactEventBuckets | null;
  isLoading: boolean;
};
export function useVenueEvents(venueId: string): {
  buckets: VenueEventBuckets | null;
  isLoading: boolean;
};
```

`bucketAndSortContactEvents` and `bucketAndSortVenueEvents` keep their signatures.

## 5. Behaviour that must not change

- The same events, the same split into Future and Past, the same order, the same labels and
  counts.
- Deleted events are left out (`deleted = 0`), as now.
- A contact that is the finance contact of an event appears with the tag "finance".

## 6. Edge cases and error handling

- Closing and reopening: the watcher is removed on close and created on open; the list
  appears after the first answer.
- An event edited, created or deleted while the panel is open: the list changes live.
- A read error: the panel shows empty lists, as the old `catch` did.
- The contact or venue changes on the page while the panel is open: the panel starts over. As
  built, the open panel is keyed by the contact or venue id, so it remounts with a fresh watcher
  and shows "Loading events..." instead of the previous contact's events under the new name (a
  watcher keeps its old rows until the new query returns).
- An event with no `event_end` stays in Future.

## 7. Tests (TDD: red first, then code)

1. The builders: the SQL equals the old queries (differential on at least 200 seeded
   datasets in `node:sqlite`; mutation-checked).
2. The existing bucketing tests stay and pass unchanged.
3. The hooks: loading, buckets, empty lists on a failed read, the query each one watches. As
   built, rendered on the server with `useTypedQuery` replaced (`useEventHistory.test.tsx`),
   which shows one state at a time; a re-run after a row change only gives the memo new rows,
   and the live follow is the Playwright scenario below.
4. The sheet: nothing mounted while closed (no watcher), watcher while open
   (`HistorySheets.test.tsx`); the source of `EventHistorySheet` has no fetch left.
5. Playwright, written per CLAUDE.md and **not run locally**:
   `e2e/historyPanelReactive.admin.spec.ts` (as an admin): open the Contact panel of a quote;
   rename that quote's event in the database (new helper `renameEvent` in
   `e2e/helpers/quoteTestData.ts`); the panel's row changes with no reload.

## 8. Measurement

`perfLog.report()` with the panel closed and open: the watcher count rises by one while open
and returns after closing. Reported, not a gate.

## 9. Rollback and commits

One commit, `reactive(quote-detail): history panels read live while open`. Rollback is
`git revert`.

## 10. Permissions

None changes. The panels are shown to whoever sees the Contract tab, as now.

## 11. Files

7 counted files under `src/features/quotesAndBookings/`: `db/fetchContactEvents.ts`,
`db/fetchVenueEvents.ts`, `hooks/useContactEvents.ts`, `hooks/useVenueEvents.ts`,
`components/quoteDetail/tabs/ContactHistorySheet.tsx`, `VenueHistorySheet.tsx`,
`EventHistorySheet.tsx`.

## 12. Definition of done

As in the plan, section 6. Result (2026-10-15):

- `npm run tc`: the same errors as before the change (12 lines), none in these files; they come
  from an uncommitted regeneration of `database.types.ts` that is not part of this spec.
- `npx vitest run`: 322 files, 3746 of 3747 tests pass. The one failure is
  `eventChat/db/readReceipts.differential.test.ts`, which times out at 5 s when the suite runs
  in parallel and passes alone; it failed the same way before this spec.
- The old queries (verbatim) and the new builders compile to the same SQL and parameters and
  return the same rows on 200 seeded datasets (1400 comparisons); mutation-checked: deleted
  events included, the finance contact ignored and a wrong venue column are each caught.
- The existing bucketing tests (`fetchContactEvents.test.ts`, `fetchVenueEvents.test.ts`) pass
  unchanged.
- Prettier: clean on the 12 touched files. E2E: SKIPPED, not run locally.
- Not checked in a browser: the page is behind a Clerk sign-in.

## 13. To confirm at review

- The two `fetch…` functions are removed because nothing else calls them (checked by a
  search on 2026-10-14).
