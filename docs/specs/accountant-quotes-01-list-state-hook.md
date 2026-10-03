# Quotes & Bookings list — shared list-state hook (no behaviour change)

Status: **DRAFT — awaiting "Approved"** — 0 open decisions (D1, D2 answered 2026-10-03).
Original request: №1 (preparation). Implementation order: **01 of 11** — the next spec is
[02](accountant-quotes-02-accountant-page.md), which moves AR / AR Deposits to `/accountant`.
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md).

## 0. The request, and what it is not

`src/app/quotes-bookings/page.tsx` (526 lines) holds, in one component, the whole state of the
list: filters, search, page, page size, sort, the active tab, "Show Deleted" and the code that
mirrors all of it into the URL. Spec 02 needs the same state on a second page (`/accountant`).

This spec moves that state — and only that — out of the page into one hook that both pages can
use. **Nothing a user can see or do changes.** `/quotes-bookings` keeps its three tabs, its
filters, its URL and its pagination exactly as they are.

**Not part of this spec, so not changed:**

- moving AR / AR Deposits, the new page, access, sidebar, sync rules, RLS (spec 02);
- the tab model (`listTabs.ts`, `filterUrlSync.ts`, `narrowingKey.ts`, `activeFilters.ts`) — they
  are called exactly as today (spec 02 changes them);
- what any role can see or do — **no permissions change**, so `permissionPageData.ts` is not
  touched.

## 1. Decisions (all taken by the user)

**D1 — what goes into the hook**

- **Question:** which layers of `page.tsx` move into the hook?
- **Option A — state and URL only:** filters, search, page, page size, sort, tab, Show Deleted,
  the URL read and write, the page reset. Data loading, sidebar height, `goToPage` and the
  office currencies stay in each page. Consequence: a small hook about state only; about 25
  lines (data hook call, sidebar-height measurement, `goToPage`, currencies) are written again
  on the second page.
- **Option B — state, URL and data wiring:** everything in A plus `useQuotesAndBookingsData`,
  the office currencies, the sidebar-height measurement and `goToPage`. Consequence: the second
  page is almost empty, but the hook mixes URL state, data and DOM measurement and is harder to
  review. Page slicing is not in the hook in either option: the AR tables slice their own page.
- **User's answer: A — state and URL only.**

**D2 — how the hook's effects are covered by tests**

- **Question:** `vitest` runs in the `node` environment with no DOM library; a static render does
  not run effects, so the URL write and the page reset have no automated test today.
- **Option A — add DOM tests:** add `@testing-library/react` and `jsdom` and change
  `vitest.config.ts`. Consequence: the effects are tested directly; two more files and a new
  dependency.
- **Option B — pure functions plus tests:** the decisions made inside the effects move into pure
  functions with unit tests; the hook is thin wiring that the tests do not run. Consequence: one
  more source file; the wiring itself stays untested.
- **Option C — no new tests:** the existing `page.test.tsx` plus a manual walkthrough.
  Consequence: the effects stay without automated tests, as now.
- **User's answer: B — pure functions plus tests.**

## 2. Research findings

What `page.tsx` does today, by layer (line numbers of the current file):

- **State and URL (moves):**
  - 98–99 — the URL is read **once, on mount** (`searchParamsToFilters`, `hasUrlSyncedFilterParams`);
  - 123–136 — `useQuotesAndBookingsFilters(initialOverrides, urlFilters)`;
  - 151–157 — `showDeleted`, `searchQuery`, `page`, `pageSize`, `sort`, `activeTab`;
  - 166–171 — `switchTab`: sets the tab, resets the sort to the tab's own starting sort, drops a
    status filter the new tab does not offer;
  - 175–184 — `removeFilter`, `clearAllFilters`;
  - 191–197 — page reset to 1 when `narrowingKey` changes (not when the sidebar opens or closes);
  - 202–218 — URL write: `router.replace`, no history entry, 300 ms debounce except the first
    sync (0 ms), other query parameters preserved, skipped when the query string is unchanged.
- **Stays in the page:**
  - 101–121 — the scorecard deep-link parameters (`template`, `timeRange`, `accountManager`,
    `periodStart`) and the filters built from them; passed to the hook as `initialOverrides`;
  - 138–149 — sidebar height; 152 — `useQuotesAndBookingsData`; 220–242 — search, sort,
    slicing, `goToPage`; 246–250 — office currencies; 160 — `receivablesOpened` (lazy mount of
    the AR tabs); everything from 259 down (columns, header, tabs, table).
- **Already pure and tested, reused as they are:** `filtersToSearchParams`, `searchParamsToFilters`,
  `narrowingKey`, `defaultSortForTab`, `tabUsesStatusFilter`, `withoutFilter`.
- **Tests that touch this page:** `src/app/quotes-bookings/page.test.tsx` (static render, hooks
  mocked, `next/navigation` mocked). It must pass **unchanged**.

## 3. The hook — contract

Name and location are indicative: `src/features/quotesAndBookings/hooks/useListPageState.ts`.

**Input**

- `initialOverrides` (optional) — filters built by the page from scorecard parameters.

**Output** — everything the page reads or sets today, with the same names where there is one:

- the filter state and its setters, exactly as `useQuotesAndBookingsFilters` returns them
  (`filters`, `toggleOpen`, `setStatuses`, `setCreatedRange`, `setEventRange`, `setBookedRange`,
  `setAccountManagerUserUuid`, `setInGoodShuffle`, `setInQuickBooks`, `setSalesOfficeUuid`,
  `clearFilter`, `clearFilters`);
- `showDeleted` / `setShowDeleted`, `searchQuery` / `setSearchQuery`, `page` / `setPage`,
  `pageSize` / `setPageSize`, `sort` / `setSort`;
- `activeTab` and `switchTab(next)`;
- `removeFilter(key)` and `clearAllFilters()`.

**Inside the hook:** the one-time URL read, the first-sync flag, the last narrowing key, the
debounced URL write, the page reset. It reads `useRouter`, `usePathname` and `useSearchParams`
itself.

**What the page keeps doing:** `receivablesOpened` (initial value `activeTab !== "all"`, set to
true when the page switches to an AR tab) and everything listed as "stays" in §2.

**Pure functions** (new, `src/features/quotesAndBookings/utils/listPageEffects.ts`, name
indicative) — the decisions that today live inside the effects:

- the URL-write decision: from the current state and the current query string, either "write this
  query string" or "nothing to write" (the unchanged case);
- the URL-write delay: 0 for the first sync, 300 ms after;
- the page after a change: 1 when the narrowing key changed, otherwise the page as it is;
- the tab-switch outcome: the tab's starting sort, whether a status filter is dropped.

## 4. Files

**Counted — 3 files** (limit 10):

1. `src/features/quotesAndBookings/hooks/useListPageState.ts` — new: the hook.
2. `src/features/quotesAndBookings/utils/listPageEffects.ts` — new: the pure decisions of §3.
3. `src/app/quotes-bookings/page.tsx` — changed: uses the hook; the moved code is removed.

**Not counted:**

- tests: `src/features/quotesAndBookings/utils/listPageEffects.test.ts` (new);
  `src/app/quotes-bookings/page.test.tsx` (unchanged); the Playwright spec of §6;
- no migration, no `sync_rules.yaml`, no `database.types.ts`, no `AppSchema.ts`, no
  `permissionPageData.ts`.

## 5. Behaviour that must not change

- The URL is read once on mount; later edits are written out, not read back.
- A URL with any synced parameter wins over the scorecard overrides; the scorecard overrides apply
  only when the URL carries none.
- Writes use `replace` (no history entry), wait 300 ms (0 ms for the first sync), keep unrelated
  query parameters, and are skipped when nothing changed.
- A new filter, search, Show Deleted, sort or tab sends the list back to page 1; opening or
  closing the filter sidebar does not.
- Switching a tab starts that tab's own sort and drops a status filter the tab does not offer.
- A status carried in the URL into an AR tab is ignored.
- "Clear all filters" clears every filter, the search box and Show Deleted; a chip clears only its
  own filter.

## 6. Behaviour scenarios (for Playwright — written, not run)

- **S1** apply a filter and a search on All Events → the URL carries them; reload → the same
  state; browser Back from a quote → the state returns.
- **S2** go to page 3, then change a filter → the list is on page 1.
- **S3** open the filter sidebar and close it on page 3 → still page 3.
- **S4** All Events → AR → AR Deposits → All Events: each tab starts on its own sort; a status
  chosen on All Events is gone on the AR tabs.
- **S5** open `/quotes-bookings?template=…&timeRange=…` from the scorecard → the scorecard banner
  and its filters are applied; a manual filter edit then replaces them in the URL.

## 7. Edge cases and error handling

- **Offline.** The list reads the local PowerSync database; nothing here touches the network.
  Unchanged.
- **Clerk / auth errors.** No route, token or request is touched. Unchanged.
- **Invalid URL parameters** (unknown tab, non-numeric page, unknown sort): the existing parsers
  fall back as they do today; the hook adds no parsing.
- **Fast typing.** The 300 ms debounce still applies to the search box; the first sync is
  immediate.

## 8. Tests and implementation sequence

Red first. Playwright is **written, not run** (standing instruction); Prettier only on touched
files.

1. **Pure functions.** Write `listPageEffects.test.ts` first, one case per bullet of §3: the
   unchanged query string writes nothing; a changed one writes the new string and keeps unrelated
   parameters; the first sync waits 0 ms and later ones 300 ms; a changed narrowing key gives
   page 1, an unchanged one keeps the page; a tab switch gives the tab's starting sort and drops
   statuses only when the tab does not offer them. Then the functions.
2. **Hook and page.** Move the code; the page uses the hook.
3. **Gate:** `npm run tc`, `npx vitest run` (with `page.test.tsx` unchanged and green),
   `prettier --check` on the touched files. E2E: SKIPPED (not run locally, by instruction).

## 9. Risks

- **R1 — the effects are not run by any test.** The pure functions pin the decisions; the wiring
  between them and `router.replace` is checked by reading the diff and by the scenarios S1–S5.
- **R2 — the one-time URL read.** Moving it into a hook must keep it a single read on mount
  (a read on every render would fight the write effect). The diff review checks this.
