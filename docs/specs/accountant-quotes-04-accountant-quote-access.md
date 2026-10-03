# Accountant — access to `/quotes-bookings` and `/quotes-bookings/{id}`

Status: **DRAFT — awaiting "Approved"** — 0 open decisions (D1–D9 answered 2026-10-03).
Original request: №2. Implementation order: **04 of 11**. Needs
[02](accountant-quotes-02-accountant-page.md) and [03](accountant-quotes-03-capabilities.md).
Ships in one release with 02 and 03.
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md).
Sync rules live in the separate repo `br_powersync` (`config/sync_rules.yaml`).

## 0. The request, and what it is not

The accountant opens the Quotes & Bookings list and the quote card, **read-only**, plus the Files
tab, where they can add and delete files.

- **List** `/quotes-bookings`: All Events, without "+ Create Quote" (spec 03's `createQuote` is "no"
  for the accountant). A "Quotes & Bookings" entry appears in their sidebar.
- **Card** `/quotes-bookings/{id}`:
  - **Contract**, **Billing** and **Log** tabs: read-only;
  - **Files** tab: read, add, delete;
  - **Messages** tab: visible, with today's text for roles without the chat (the full chat comes
    with spec 11);
  - no Edit, Delete, Send To Client, Open in Dashboard; on Billing no Record Payment and a
    disabled QuickBooks checkbox — all of this is the accountant's column of spec 03's table, which
    is **all "no"** and does not change here.
- The data the card reads: a sync-rules addition and SELECT policies for the tables it needs
  (part of the request).

**Not part of this spec, so not changed:**

- the capability table (spec 03) — nothing is added to it; the QuickBooks flag comes in spec 05,
  payments in specs 06–10, the chat in spec 11;
- writes of any kind except files (§5);
- `/quotes-bookings/{id}/preview` (a read-only PDF viewer; the accountant can open it as a side
  effect of the path prefix);
- the AR page and the sidebar entry "Accountant" (spec 02).

## 1. Decisions (all taken by the user)

**D1 — what the accountant sees on `/quotes-bookings`**

- **Option A — the list and a sidebar entry** "Quotes & Bookings". **Option B — the list, no
  sidebar entry** (reached by URL or by a Back link). **Option C — a redirect to `/accountant`;**
  only the card opens.
- **User's answer: A — the list and a sidebar entry.**

**D2 — closing `/new` and `/{id}/edit`**

- **Question:** the path prefix `/quotes-bookings` opens them too. Today a viewer who types the URL
  gets the form and the save is refused by RLS.
- **Option A — a check on each page,** by capability, for every role without it. **Option B —
  exceptions in `accessConfig`** (sub-paths forbidden per role). **Option C — leave it,** the save is
  refused by RLS.
- **User's answer: A — a check on each page.** It applies to **every role without the capability**:
  the accountant and the viewer, and also a **junior account manager on a quote they did not
  create** (today that form opens and the save succeeds — RLS lets any account manager write).

**D3 — where "Quotes & Bookings" in the card's breadcrumb leads**

- **Option A — a value from the capabilities** (`/accountant` for the accountant,
  `/quotes-bookings` for the rest). **Option B — always `/quotes-bookings`.**
  **Option C — `router.back()` for everyone.**
- **User's answer: C — `router.back()` for everyone.** It covers the breadcrumb, the Back button on
  "Quote not found" and the move after Delete.

**D4 — which tabs the accountant sees**

- **Option set:** Contract, Billing, Log — each read-only; Files and Messages decided separately.
- **User's answer: Contract, Billing and Log, read-only.**

**D5 — the Files tab**

- **Option A — hidden.** **Option B — read-only** (Upload and Delete hidden; needs a new capability).
  **Option C — as it is:** Upload and Delete shown.
- **User's answer:** "the accountant must be able to read, add and delete files" — the tab as it is.

**D6 — the Messages tab until spec 11**

- **Option A — hidden.** **Option B — visible with today's text**
  ("Internal chat is available to admins and account managers only.").
- **User's answer: B — visible with today's text.**

**D7 — `router.back()` when the card was opened directly**

- **Question:** a new tab or a forwarded link has no in-app history.
- **Option A — plain `back()`:** no fallback; it leaves the app or does nothing.
  **Option B — `back()` with a fallback list:** with no history, go to `/quotes-bookings`.
- **User's answer: B — `back()` with a fallback to the list.**

**D8 — where `/new` and `/{id}/edit` lead without the capability**

- **Option A — `/new` to the list, `/{id}/edit` to the card.** **Option B — to the role's landing
  page.**
- **User's answer: A — `/new` to `/quotes-bookings`, `/{id}/edit` to `/quotes-bookings/{id}`.**

**D9 — the matrix row for files**

- **Option A — a new row "Quote Files", as it is today** (admin, account manager, viewer and
  accountant can all add and delete). **Option B — a new row** where a viewer only reads.
  **Option C — only a note in the _Events_ row.**
- **User's answer: A — a new row, as it is.**

## 2. Research findings

**What the card reads — locally (PowerSync), except where noted:**

- `fetchQuoteDetail`: `Events`, `Addresses`, `Venues`, `Contacts`, `Users`;
- the card and `ContractTab`: `EventLineItems` and `BleacherTypes` (`useEventLineItems` joins it),
  `BleacherEvents` and `Bleachers` (the zone lookup), `EventChangeLog` (the deletion banner);
- `BillingTab`: `PaymentInstallments`, `PaymentHistory`, `Events`, `Users`; the currency reads
  `QboConnections` online (the accountant has had that SELECT since Stage 2);
- `LogTab`: `EventChangeLog`, `EventEmailLog`, `Users`, `Events`;
- `FilesTab`: the list from `EventFiles` locally; **Upload, Delete and Open go directly to
  Supabase** (`supabase.storage` and `EventFiles` insert/delete);
- the history sheets (`fetchContactEvents`, `fetchVenueEvents`): `Events`;
- `ContractTab` fetches `/api/contracts/{id}`, which uses the service role (no RLS).

**On the accountant's device after specs 01–03:** `Events`, `BleacherEvents`, `Addresses`, `Users`,
`Drivers`, `Bleachers`, `Contacts`, `Companies`, `EventLineItems`, `PaymentInstallments`,
`PaymentHistory`, `SalesOffices`. **Missing for the card:** `Venues`, `BleacherTypes`,
`EventFiles`, `EventChangeLog`, `EventEmailLog`.

**RLS for those:** `venues_select`, `bleacher_types_select`, `event_change_log_select` and
`EventEmailLog` `rbac_select` are `{admin,account_manager,viewer}`.

**Files.** `EventFiles` policies (select, insert, delete) are `true` for **every authenticated
user**, and the `event-files` bucket's storage policies are `bucket_id = 'event-files'` for every
authenticated user (`20260615110000_event_files.sql`). So the accountant can already read, add and
delete files through the API: **no policy change is needed for D5**; only the sync of `EventFiles`.
The `contracts` bucket (signed contract PDFs appear in the Files list with a `contracts/` path) has
no policy in the migrations; whether the accountant can open one is checked in the SQL/E2E gate.

**The edit page.** `loadQuoteIntoStore` puts the quote's creator in the store as `ownerUserUuid`;
the edit page can feed it to the capability hook once the quote has loaded.

**Back navigation today:** three places hard-code `/quotes-bookings` — the breadcrumb button, the
"Back to Quotes & Bookings" button on "Quote not found", and `router.push` after Delete.

**Tests that touch this change:** `accessConfig.test.ts`, `useSidebarItems.test.ts`,
`permissionPageData.test.ts`, `roleAccess.accountant.spec.ts` (it asserts the sidebar has no
"Quotes & Bookings" and that `/quotes-bookings` bounces), the accountant SQL sweeps.

## 3. What changes in the app

**Access layer**

- `accessConfig.ts`: the accountant's list becomes `/accountant`, `/quotes-bookings`,
  `/work-trackers`, `/permissions`, `/changelog` — `/accountant` stays first, so it stays the
  landing page (spec 02, D4).
- Sidebar: `ROLE_SIDEBAR_KEYS.accountant` gains `quotes-bookings`. The order comes from `ALL_ITEMS`:
  **Quotes & Bookings, Accountant, Work Trackers, Documentation.**

**Pages**

- `/quotes-bookings/new`: reads `can.createQuote`; without it, `router.replace("/quotes-bookings")`
  and nothing of the form is drawn.
- `/quotes-bookings/{id}/edit`: after `loadQuoteIntoStore` finishes, reads `can.manageQuote` for the
  quote (creator = `ownerUserUuid`); without it, `router.replace("/quotes-bookings/{id}")`. The
  loading state stays on screen until the answer is known, so the form never flashes.
- Both use `useQuotesBookingsCapabilities` (spec 03). Neither reads a role flag.

**Back navigation (all roles)**

- A small hook, `useGoBackOrTo(fallback)` (name indicative): calls `router.back()` when the browser
  has in-app history, otherwise `router.push(fallback)` with `fallback = "/quotes-bookings"`. "Has
  history" is `window.history.length > 1`.
- Used for the breadcrumb "Quotes & Bookings", the "Back to Quotes & Bookings" button and the move
  after Delete in `QuoteDetailView`.

**Database** — `supabase/migrations/20261004130000_accountant_quote_card.sql` (after spec 02's
`20261004120000`; renumber if `develop` has moved): `ALTER POLICY` adds `accountant` to
`venues_select`, `bleacher_types_select`, `event_change_log_select` and `EventEmailLog`
`rbac_select`, keeping the rest of each expression. **Not changed:** every INSERT, UPDATE and DELETE
policy; `EventFiles` and the storage policies (already open, §2).

**Sync rules** — `br_powersync/config/sync_rules.yaml` (separate PR; not counted): whole-table
queries for the accountant, in the shape used in specs 02: `Venues`, `BleacherTypes`, `EventFiles`,
`EventChangeLog`, `EventEmailLog`. The bucket count is compared before and after (it must not grow;
spec 02 §6). **The PowerSync service must be restarted.** Deployment order: migration → sync rules
and restart → app.

## 4. Matrix — `src/features/userAccess/permissionPageData.ts` (draft wording, for review)

- **Events:** accountant `none` → `read`: "Opens the Quotes & Bookings list and any quote or
  booking and reads it — the Contract, Billing and Log tabs. Cannot create, edit, delete or send
  one."
- **QuickBooks Invoice Flag:** accountant `none` → `read`: "Can see whether the flag is set, but the
  checkbox is disabled." (Spec 05 changes it.)
- **Payment History:** accountant `none` → `read`: "Can see payments and balances, and open any
  payment to read it in full, but cannot change anything." (Specs 07–10 change it.)
- **New row "Quote Files"**, category Day to Day Operations: "The Files tab of a quote or booking —
  documents and photos attached to it. The app does not check the role on this tab, and neither
  does the database for a signed-in user."
  - admin `full`, account manager `full`, accountant `full`: "Can open, add and delete files on any
    quote or booking.";
  - viewer `custom`: "Can open, add and delete files, although the rest of the quote is read-only
    for a viewer — the Files tab does not check the role.";
  - developer `none`, driver `none`, maintainer `none`: the notes those roles use on the
    neighbouring rows.
- **Record a Payment** and **Internal chat:** accountant stays `none` (specs 10 and 11).
- **Accountant texts:** the role description and `ACCOUNTANT_NO_ACCESS_NOTE` gain "and Quotes &
  Bookings, read-only".
- `permissionPageData.test.ts`: the guard that lists the rows an accountant is not `none` on adds
  Events, QuickBooks Invoice Flag, Payment History and Quote Files.

## 5. Behaviour scenarios (for Playwright — written, not run)

- **S1** accountant: the sidebar shows Quotes & Bookings, Accountant, Work Trackers, Documentation;
  `/quotes-bookings` lists events without "+ Create Quote"; a row opens its card.
- **S2** accountant on a card: tabs Contract, Billing, Files, Log, Messages; no Edit, Delete,
  Send To Client or Open in Dashboard; on Billing no "+ Record Payment" and a disabled QuickBooks
  checkbox; Contract, Billing and Log change nothing.
- **S3** accountant, Files: adds a file, opens it, deletes it.
- **S4** accountant, Messages: "Internal chat is available to admins and account managers only."
- **S5** `/quotes-bookings/new` as the accountant and as a viewer → `/quotes-bookings`; as an admin
  or an account manager the form opens.
- **S6** `/quotes-bookings/{id}/edit` as the accountant and as a viewer → the card; as a junior
  account manager on someone else's quote → the card; as the owner, a lead account manager or an
  admin the form opens.
- **S7** Back: a card opened from the list returns to that list with its filters; opened from
  `/accountant`, it returns there with tab, filters and page; opened directly in a new tab, the
  breadcrumb goes to `/quotes-bookings`.
- **S8** deleting a quote (as an admin) → back to the previous page.

## 6. Files

**Counted — 8 files** (limit 10):

1. `src/features/userAccess/accessConfig.ts` — changed
2. `src/components/sidebar/useSidebarItems.ts` — changed
3. `src/app/quotes-bookings/new/page.tsx` — changed
4. `src/app/quotes-bookings/[id]/edit/page.tsx` — changed
5. `src/features/quotesAndBookings/components/quoteDetail/QuoteDetailView.tsx` — changed: back
   navigation
6. `src/features/quotesAndBookings/hooks/useGoBackOrTo.ts` — new
7. `supabase/migrations/20261004130000_accountant_quote_card.sql` — new
8. `package.json` — changed: `test:db:accountantquotecard`, added to `test:db:all`

**Not counted:** `br_powersync/config/sync_rules.yaml`; `src/features/userAccess/permissionPageData.ts`;
tests — `supabase/tests/accountant_quote_card.test.sql` (new), `useGoBackOrTo.test.ts` (new),
`accessConfig.test.ts`, `useSidebarItems.test.ts`, `permissionPageData.test.ts`,
`roleAccess.accountant.spec.ts` (edited), the Playwright specs of §5.

## 7. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run**; Prettier only on touched
files.

**7.1 Database**

- **Work:** the migration; `supabase/tests/accountant_quote_card.test.sql`;
  `npm run test:db:accountantquotecard` (and `test:db:all`).
- **Test asserts:** the accountant reads each of the four tables — **one named assertion per
  table**; inserts, updates and deletes on them are refused and the row is unchanged afterwards;
  the other roles read what they did before (`rls_multi_role.test.sql` stays green); the
  `EventFiles` policies are asserted as they are (open to any authenticated user), so a future
  change shows up.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container; the
  SQL tests pass.

**7.2 Back navigation**

- **Test first:** `useGoBackOrTo.test.ts` — the decision as a pure function (history length 1 →
  fallback; more than 1 → back).
- **Work:** the hook; `QuoteDetailView` uses it in its three places.

**7.3 Pages**

- **Work:** the two page checks.
- **Tests:** where a static render can show it (the pages' loading and redirect decision as pure
  functions): `/new` — a role without `createQuote` is redirected, one with it is not;
  `/edit` — the same for `manageQuote`, including a junior account manager on someone else's quote.

**7.4 Access layer**

- **Work:** `accessConfig.ts`, the sidebar, the matrix.
- **Tests edited on purpose:** `accessConfig.test.ts` (the accountant's list and landing page);
  `useSidebarItems.test.ts` (the accountant's items and order); `permissionPageData.test.ts`.

**7.5 Sync rules and E2E**

- **Work:** the `br_powersync` PR; restart; the scenarios of §5; update `roleAccess.accountant.spec.ts`
  (it asserts the sidebar has no "Quotes & Bookings" and that `/quotes-bookings` bounces).
- **Gate:** the final report with real tails of `npm run tc`, `npx vitest run`, `test:db:*` and
  `prettier --check <touched files>`; E2E marked SKIPPED with the reason.

## 8. Edge cases and error handling

- **Offline.** The list and the card read the local database. Files Upload, Delete and Open need the
  network (they were direct calls already): an offline attempt shows the existing error toast.
- **Sync not caught up.** The card shows what has arrived: missing `Venues` or `BleacherTypes`
  appear as missing values, not as errors. Hence the deployment order of §3.
- **`router.back()` with a foreign history.** `window.history.length > 1` is true also when the
  previous entry is another site (a link followed in the same tab); Back then leaves the app. The
  fallback only covers "no history at all".
- **The edit page's loading state.** Until `loadQuoteIntoStore` finishes, the page cannot know the
  creator; it shows the loading state and decides afterwards. A quote that does not exist keeps
  today's redirect to the list.
- **A role granted while signed in.** The identity row streams in; the sidebar and redirects update
  without a reload; the card's data arrives after the next sync.
- **A user who is accountant and account manager.** Roles are additive: the capabilities of spec 03
  are the union.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks, and found on the way

**Risks**

- **R1 — a junior account manager loses a hole (D2).** Typing `/{id}/edit` of someone else's quote
  no longer opens the form; today it opens and the save succeeds. Anyone relying on that is
  affected.
- **R2 — Back changes for every role (D3).** The breadcrumb and the Back buttons now follow browser
  history instead of always going to the list.
- **R3 — the silent-empty hazard.** A missing grant or synced table shows as an empty tab or a
  missing value, not as an error; the SQL test names each grant and the sync check each table.
- **R4 — wider direct access.** The accountant can read every venue, bleacher type, change log and
  email log through the API, not only through the sync.

**Found on the way — reported, not fixed**

1. **`EventFiles` and the `event-files` bucket are open to every authenticated user** (a driver
   included) for read, add and delete.
2. **The `contracts` bucket has no policy in the migrations** — it was probably created by hand;
   its access rules are unknown to the repository.
3. **A viewer can add and delete files** (§4's row says so, as the user asked for the matrix to
   describe what is).
