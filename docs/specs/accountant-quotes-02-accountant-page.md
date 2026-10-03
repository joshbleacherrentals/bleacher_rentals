# Accountant page — AR and AR Deposits move to `/accountant`

Status: **IMPLEMENTED 2026-10-03, awaiting review** — not checked by hand in a browser (Clerk
sign-in is unavailable here); Playwright specs written, not run; the `br_powersync` sync-rules diff
is uncommitted and not deployed. 0 open decisions (D1–D16 answered 2026-10-03).
Original request: №1. Implementation order: **02 of 11**. Needs [01](accountant-quotes-01-list-state-hook.md)
(the shared list-state hook) first.
Ships in one release with specs 03 and 04 (the capability refactor and the accountant's access to
`/quotes-bookings`) — the user's decision, D2. In the first numbering of the request this was
"specs 01–03"; in this numbering it is 02–04.
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md).
Sync rules live in the separate repo `br_powersync` (`config/sync_rules.yaml`).

## 0. The request, and what it is not

- A new page **`/accountant`**, titled **Accountant**, with two tabs, **AR** and **AR Deposits**,
  taken out of `/quotes-bookings`.
- The tabs bring with them what they have today: the filter sidebar, the search bar, sorting,
  pagination, Show Deleted, the applied-filter chips and the URL state (tab, filters, search,
  page, page size, sort).
- `/quotes-bookings` keeps All Events only, without a tab bar.
- Who opens `/accountant`: **accountant and admin** (D1). Account managers and viewers no longer
  see AR anywhere except a booking's own Billing tab.
- A plain **sidebar entry** "Accountant" for those two roles, and `/accountant` becomes the
  accountant's landing page.

**Not part of this spec, so not changed:**

- the accountant opening `/quotes-bookings` or `/quotes-bookings/{id}` (spec 04); the capability
  refactor of those pages (spec 03);
- payments, the Billing tab, Record Payment (specs 05–10);
- the scorecard deep link to `/quotes-bookings?template=…`: it stays on `/quotes-bookings`;
- what AM, developer, viewer, maintainer or driver can do, apart from AM and viewer losing the AR
  tabs (D1).

## 1. Decisions (all taken by the user)

**D1 — who opens `/accountant`**

- **Question:** besides the accountant, who opens the page? The AR tabs leave `/quotes-bookings`.
- **Option A — accountant only:** admin, AM and viewer lose AR (they have it today).
- **Option B — accountant and admin:** admin keeps AR on the new URL; AM and viewer lose it.
- **Option C — accountant, admin, AM and viewer:** nobody loses AR, but the page is no longer
  "for accountants only".
- **User's answer: B — accountant and admin.**

**D2 — a row click before the accountant can open a booking**

- **Question:** where does a click on an AR row go for a role that cannot yet open
  `/quotes-bookings/{id}`?
- **Option A:** the row is not clickable for the accountant until spec 04 (a temporary role check
  in the code).
- **Option B:** the link is as today and the accountant is sent back to their landing page until
  spec 04 is merged (a broken click between commits).
- **Option C:** the link is as today and specs 02–04 are released together (the bounce exists only
  between commits, never in production).
- **User's answer: C — the link is as today; specs 02–04 are released together.**

**D3 — old addresses `/quotes-bookings?tab=ar` and `?tab=ar_deposits`**

- **Question:** what happens to bookmarks and forwarded URLs? (No link in the code builds them.)
- **Option A — open All Events:** `tab` is not recognised; the page shows All Events and keeps the
  other parameters.
- **Option B — redirect to `/accountant`** with the same parameters; a role without access to
  `/accountant` gets the usual bounce to its landing page.
- **User's answer: A — open All Events.**

**D4 — the accountant's landing page**

- **Question:** the first path in the accountant's allowed paths is the landing page; today it is
  `/work-trackers`.
- **Option A — `/accountant` first:** the landing page becomes `/accountant`; the tests and the E2E
  spec that assert a landing on `/work-trackers` change.
- **Option B — `/work-trackers` stays first:** the landing page does not change.
- **User's answer: A — `/accountant` first.**

**D5 — how the page code is shared between the two pages**

- **Question:** the page-level glue (URL, page reset, state) exists once in `page.tsx`.
- **Option A:** copy it into `/accountant`.
- **Option B:** extract a hook, in the same spec as the new page.
- **Option C:** extract a hook in its own spec first, without a behaviour change.
- **User's answer: C — a shared hook, two specs** (spec 01).

**D6 — what `/quotes-bookings` looks like without AR**

- **Option A — no tab bar:** the table directly; `?tab` is no longer read or written there.
- **Option B — a tab bar with one tab:** a smaller diff, a bar with nothing to choose.
- **User's answer: A — no tab bar.**

**D7 — the URL state on `/accountant`**

- **Question:** every other key (`statuses`, `createdFrom`, …, `q`, `page`, `pageSize`, `sort`,
  `showDeleted`) keeps its name; the question is about `tab`.
- **Option A:** the opening tab is left out of the URL.
- **Option B:** `tab` is always in the URL (`tab=ar`, `tab=ar_deposits`).
- **User's answer: B — the same keys, `tab` always written.**

**D8 — Show Deleted on `/accountant`**

- **Option A — it comes along:** the switch, the "Deleted only" chip and `showDeleted` in the URL
  work as today; the AR tabs are then built from deleted events only.
- **Option B — it does not come along:** AR is always built from events that are not deleted.
- **User's answer: A — it comes along.**

**D9 — how the hook learns about the tabs of each page**

- **Option A — the page declares its tabs** (list, opening tab, starting sort per tab, whether the
  Status filter is offered, whether `tab` is written): the hook knows nothing about AR.
- **Option B — the existing `ListTab` type stays:** `/quotes-bookings` always uses `all`,
  `/accountant` allows `ar` and `ar_deposits`; fewer files, a value each page never uses.
- **User's answer: A — the page declares its tabs.**

**D10 — SELECT policies in this spec**

- **Question:** the page reads everything locally, where RLS is not consulted; one direct read
  (`QboConnections`) the accountant has had since Stage 2. Does this spec add the accountant to the
  SELECT policies of the AR tables?
- **Option A — yes, in this spec:** a migration; the accountant can also read these tables through
  the API.
- **Option B — no, sync only:** no migration here; the policies come with the booking page (spec 04).
- **User's answer: A — yes, in this spec.**

**D11 — the tab opened when `?tab` is missing or unknown**

- **Option A — AR.** **Option B — AR Deposits.**
- **User's answer: A — AR.** The URL is then rewritten with `tab=ar`.

**D12 — the sidebar entry and the page title**

- **Option A — "Accountant" for both.** **Option B — "Accounts Receivable" for both.**
  **Option C — "Accountant" in the sidebar, "Accounts Receivable" as the title.**
- **User's answer: A — "Accountant" for both.**

**D13 — the subtitle under the title**

- **Option A — none.** **Option B — "Click a column header to sort".**
  **Option C — "View receivables — click a column header to sort".**
- **User's answer: A — no subtitle.**

**D14 — the entry's place in the sidebar**

- **Option A — after Quotes & Bookings.** **Option B — before Work Trackers.**
  **Option C — after Work Trackers.**
- **User's answer: B — before Work Trackers.**

**D15 — the entry's icon**

- **Option A — `DollarSign`** (already imported; also the Pricing Matrix icon).
  **Option B — `Receipt`** (new import). **Option C — `Calculator`** (new import).
- **User's answer: B — `Receipt`.**

**D16 — the file limit**

- **Question:** counting honestly, this spec touches more than 10 files. Cut it, or keep one unit
  of logic in one spec?
- **Option A — cut:** tab model with spec 01, access with another spec.
- **Option B — keep the logic together and exceed 10.**
- **User's answer: B — "I do not want one logic in two specs, so you may use more files."**
  This spec has **13 counted files** (§9).

## 2. Research findings

**Where AR lives today.** `src/app/quotes-bookings/page.tsx` renders three tabs (`all`, `ar`,
`ar_deposits`). The same filter state, search, sort, page and page size feed all three. The page
loads one list (`useQuotesAndBookingsData(filters, showDeleted)`) and hands it to
`AccountsReceivableTabs`, which runs `useAccountsReceivableData` and renders both AR tables; each
AR table searches, sorts and slices its own page. `?tab=` is part of the URL state
(`filterUrlSync.ts`). The AR tabs are mounted lazily (`receivablesOpened`) so All Events never
queries payments.

**What the AR path reads — all locally (PowerSync), except one line:**

- `useQuotesAndBookingsData`: `Events`, `Users`, `Addresses`, `Contacts`, `Companies`
  (left joins: a missing `Contacts`/`Companies` does not fail — contact and company columns and
  their search silently come back empty);
- `useAccountsReceivableData`: `EventLineItems`, `PaymentInstallments`, `PaymentHistory`;
- `useOfficeCurrencies`, `useSalesOffices`, `useSalesOfficeNames`: `SalesOffices`, `Addresses`;
- the account-manager filter (`useAccountManagers`): `AccountManagers` + `Users` + `Drivers`;
- **one direct read:** `useOfficeCurrencies` reads `QboConnections` with the caller's token; the
  accountant has had that SELECT since Stage 2.

**What the accountant has on the device today** (`sync_rules.yaml`, accountant block): `Events`,
`BleacherEvents`, `Addresses`, `Users` (whole table), `Drivers`, and the Work Trackers tables.
`AccountManagers` reaches every active web user through the identity query (line 23). **Missing
for AR:** `Contacts`, `Companies`, `EventLineItems`, `PaymentInstallments`, `PaymentHistory`,
`SalesOffices`.

**RLS today.** `events_select` is `{admin,account_manager,viewer,maintainer}`; `payment_history_select`,
`payment_installments_select`, `event_line_items_select`, `contacts_select`, `companies_select`,
`sales_offices_select` are `{admin,account_manager,viewer}`. The accountant is in none of them, and
the SQL tests `accountant_role.test.sql` (lines 194, 198) and `accountant_work_trackers.test.sql`
(lines 198, 200, 204) assert exactly that — these assertions change on purpose.

**Access layer.** `accessConfig.ts` matches a path by prefix (`startsWith`); the accountant's
allowed paths are `/work-trackers`, `/permissions`, `/changelog`, and the landing page is the
first one. The sidebar is `ALL_ITEMS` (display order) filtered by `ROLE_SIDEBAR_KEYS`. Roles are
additive (`mergeRoleConfigs`).

**Links.** No code builds `/quotes-bookings?tab=ar`; the only inbound link with parameters is the
scorecard's `?template=…&timeRange=…`.

**Tests that touch this change:** `page.test.tsx` (AR cases), `listTabs.test.ts`,
`filterUrlSync.test.ts`, `narrowingKey.test.ts`, `activeFilters.test.ts`, `accessConfig.test.ts`,
`useSidebarItems.test.ts`, `permissionPageData.test.ts`, `roleAccess.accountant.spec.ts`, and the
two accountant SQL tests above.

## 3. The tab model (D9)

Each page declares its tabs; the hook and the URL code read the declaration and know nothing
about AR. The declaration holds:

- the tab ids (none, or a list);
- the opening tab, used when `tab` is missing or unknown;
- the starting sort of each tab;
- whether the Status filter is offered on each tab;
- whether `tab` is written to the URL.

**The shape (approved 2026-10-03).** A page with no tabs is declared as one tab that is not
written to the URL, so the hook and the URL code never branch on "no declaration":

```ts
type ListTabDeclaration = {
  tabs: readonly { id: string; startingSort: EventSort; offersStatus: boolean }[];
  /** Used when `?tab` is missing or unknown. */
  openingTab: string;
  writeTabToUrl: boolean;
};
```

**`/quotes-bookings` declares:** one tab, `all` (no tab bar is drawn); the Status filter offered;
the starting sort All Events has today (newest created first); `writeTabToUrl: false`. `tab` is
never read or written there — a stale `tab=ar` is ignored and the first URL write removes it (D3).

**`/accountant` declares:** tabs `ar` and `ar_deposits`; opening tab `ar` (D11); starting sorts as
today — AR by start date descending, AR Deposits by start date ascending; the Status filter not
offered on either; `tab` always written (D7). A `statuses` parameter in the URL is ignored there.

**What changes in the code:** the fixed `ListTab` type and its three functions in `listTabs.ts`
become declaration-driven; `filterUrlSync.ts`, `narrowingKey.ts` and `activeFilters.ts` take the
declaration (or the tab id and the "Status offered" flag derived from it) instead of `ListTab`;
`useListPageState` (spec 01) takes the declaration as input; `listPageEffects.ts` follows. The
type `ReceivablesTab` stays, because `accountsReceivable.ts`, `AccountsReceivableTabs.tsx` and
`useAccountsReceivableData.ts` import it.

## 4. The pages

**`/accountant`** (`src/app/accountant/page.tsx`, layout `src/app/accountant/layout.tsx` with the
same page padding as `quotes-bookings/layout.tsx`, because the page's sidebar sits flush against
the app sidebar):

- the filter sidebar (Status not offered) and the Filter button;
- the header: title **Accountant**, no subtitle (D13); actions: the Show Deleted switch and the
  Filter button — **no** "+ Create Quote";
- the search bar, with the placeholder the AR tabs have today ("Search by name, invoice #,
  manager, date, amount due, remaining balance, contact, company…");
- the tab bar: **AR** and **AR Deposits** with their info tooltips (`RECEIVABLES_HELP`);
- the applied-filter chips; `AccountsReceivableTabs`, always mounted (the lazy mount existed only
  to spare All Events and has no purpose here);
- a click on a row goes to `/quotes-bookings/{id}` (D2);
- no scorecard banner.

**`/quotes-bookings`:** the tab bar, `AccountsReceivableTabs`, `receivablesOpened`, the tooltips
and the AR placeholder are removed; the table follows the header directly; the Status filter is
always offered; "+ Create Quote" and the scorecard banner stay.

**Access.**

- `accessConfig.ts`: `/accountant` is added to **admin** and **accountant**. The accountant's list
  becomes `/accountant`, `/work-trackers`, `/permissions`, `/changelog` — `/accountant` first, so
  it is the landing page (D4). AM and viewer get nothing new.
- Sidebar: a new item, key `accountant`, label **Accountant**, `href` `/accountant`, icon
  `Receipt` (D15), placed in `ALL_ITEMS` immediately before `work-trackers` (D14). `admin` and
  `accountant` list the key. For the accountant the sidebar is Accountant, Work Trackers,
  Documentation.

## 5. Database — `supabase/migrations/20261004120000_accountant_receivables.sql`

(After the newest migration `20261003120000`. Renumber if `develop` has moved.)

Every statement adds `accountant` to an **existing** SELECT policy with `ALTER POLICY`, keeping
the rest of the expression:

- `Events` · `events_select` → `{admin,account_manager,viewer,maintainer,accountant}`
- `PaymentHistory` · `payment_history_select` → `{admin,account_manager,viewer,accountant}`
- `PaymentInstallments` · `payment_installments_select` → same
- `EventLineItems` · `event_line_items_select` → same
- `Contacts` · `contacts_select`, `Companies` · `companies_select`,
  `SalesOffices` · `sales_offices_select` → same

**Deliberately not changed:** every INSERT, UPDATE and DELETE policy on these tables — the
accountant reads and writes nothing here; `Users` (the accountant still reads only driver rows
directly; AR reads `Users` locally); `BleacherEvents`.

**Consequence of D10, stated so nobody reads more into it:** after this migration the accountant
can read **all** of these tables through the API as well, not only through the sync.

No new table or column: `AppSchema.ts` and `database.types.ts` do not change.

## 6. Sync rules — `br_powersync/config/sync_rules.yaml` (separate PR)

In the accountant block, add whole-table queries in the existing shape (`JOIN "Accountants" ON
"Accountants"."is_active" = true JOIN "Users" ON "Accountants"."user_uuid" = "Users"."id" WHERE …
clerk_user_id = auth.user_id() AND status_uuid != '<inactive>'`), as for account managers:
`Contacts`, `Companies`, `EventLineItems`, `PaymentInstallments`, `PaymentHistory`,
`SalesOffices`. Update the comment that lists `Contacts` under "Deliberately not synced".

**Bucket cost — to be measured, not assumed.** Compile the file with the service's own library
before and after and compare the parameterised bucket definitions; `accountant-work-trackers.md`
§4 measured 2 and the count must stay 2 (a query joined to the row it returns multiplies buckets).

The accountant's PowerSync client writes nothing in this scope; the upload queue stays empty.
**The file is not watched — the PowerSync service must be restarted.**

**Deployment order:** migration → sync rules and PowerSync restart → app. App before sync rules:
the AR tabs are empty. Sync rules before the migration: harmless (sync does not consult RLS).

## 7. Matrix — `src/features/userAccess/permissionPageData.ts` (draft wording, for review)

- **New row** "Accounts Receivable", category Day to Day Operations, after "Payment History".
  Description: "The Accountant page: the AR tab lists booked events with an amount due that should
  already have been paid, the AR Deposits tab lists those due later. Each shows the Amount Due and
  the Remaining Balance. Filters, search and sorting apply to both."
  - admin `read`: "Can open the Accountant page and see the balances of every booking."
  - accountant `read`: "Can open the Accountant page and see the balances of every booking."
  - account manager `none`: "The Accountant page is for accountants and administrators. An account
    manager still sees a booking's balance on the Billing tab of the quote."
  - viewer `none`: the same wording as the account manager's.
  - developer, driver, maintainer `none`: the notes those roles use on the neighbouring rows.
- **Payment History row:** the description loses "and the Amount Due and Remaining Balance of every
  booking on the AR and AR Deposits tabs of Quotes & Bookings".
- **Accountant texts:** the role description and `ACCOUNTANT_NO_ACCESS_NOTE` ("…covers the Work
  Trackers pages and driver payments only…") gain "and the Accountant page".
- `permissionPageData.test.ts`: the guard that lists the rows an accountant is not `none` on adds
  the new row.

## 8. Behaviour scenarios (for Playwright — written, not run)

- **S1** an accountant signs in → lands on `/accountant`, the URL becomes `?tab=ar`; the sidebar
  shows Accountant, Work Trackers, Documentation.
- **S2** AR Deposits → the URL carries `tab=ar_deposits`; each tab starts on its own sort; there is
  no Status filter on either.
- **S3** a filter, a search, a page size and page 2 → all in the URL; reload and Back keep them.
- **S4** Show Deleted → only deleted events' balances; the "Deleted only" chip; `showDeleted=1`.
- **S5** an admin opens `/accountant` → the same page; the admin's sidebar lists Accountant just
  before Work Trackers.
- **S6** an account manager and a viewer: `/accountant` sends them to their landing page;
  `/quotes-bookings` shows All Events with no tab bar; no Accountant in the sidebar.
- **S7** `/quotes-bookings?tab=ar` → All Events; the first write removes `tab` from the URL.
- **S8** an AR row click → `/quotes-bookings/{id}` (opens once spec 04 is in the same release).
- **S9** `/accountant?tab=all&statuses=quoted` → AR opens, `tab=ar`, the status is ignored.

## 9. Files

**Counted — 13 files** (over the limit of 10 by D16):

1. `src/app/accountant/page.tsx` — new
2. `src/app/accountant/layout.tsx` — new
3. `src/app/quotes-bookings/page.tsx` — changed: AR and tabs removed
4. `src/features/quotesAndBookings/hooks/useListPageState.ts` — changed: takes the declaration
5. `src/features/quotesAndBookings/utils/listPageEffects.ts` — changed: follows the declaration
6. `src/features/quotesAndBookings/utils/listTabs.ts` — changed: declaration-driven
7. `src/features/quotesAndBookings/utils/filterUrlSync.ts` — changed
8. `src/features/quotesAndBookings/utils/narrowingKey.ts` — changed
9. `src/features/quotesAndBookings/utils/activeFilters.ts` — changed
10. `src/features/userAccess/accessConfig.ts` — changed
11. `src/components/sidebar/useSidebarItems.ts` — changed
12. `supabase/migrations/20261004120000_accountant_receivables.sql` — new
13. `package.json` — changed: `test:db:accountantreceivables`, added to `test:db:all`

(The exact list is confirmed at implementation; `layout.tsx` is dropped if the page can carry its
own padding.)

**Not counted:**

- `br_powersync/config/sync_rules.yaml`; `src/features/userAccess/permissionPageData.ts`;
- tests: `supabase/tests/accountant_receivables.test.sql` (new); the edits to
  `accountant_role.test.sql` and `accountant_work_trackers.test.sql`;
  `src/app/accountant/page.test.tsx` (new); `src/app/quotes-bookings/page.test.tsx`;
  `listTabs.test.ts`, `filterUrlSync.test.ts`, `narrowingKey.test.ts`, `activeFilters.test.ts`,
  `listPageEffects.test.ts`, `accessConfig.test.ts`, `useSidebarItems.test.ts`,
  `permissionPageData.test.ts`; the Playwright specs of §10.

## 10. Tests and implementation sequence

Red first, each step ends at a gate. Playwright is **written, not run** (standing instruction);
Prettier only on touched files.

**10.1 Database**

- **Work:** the migration; `supabase/tests/accountant_receivables.test.sql`;
  `npm run test:db:accountantreceivables` (and `test:db:all`); the two accountant SQL tests edited on
  purpose (the "cannot read Events / PaymentHistory / Contacts" assertions).
- **Test asserts:** the accountant reads each table in §5, **one named assertion per table** (a
  refused read is an empty result, not an error); inserts, updates and deletes on them are refused
  and the row is unchanged afterwards; AM, viewer, admin and maintainer read exactly what they did
  before (`rls_multi_role.test.sql` stays green).
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container; the
  SQL tests pass.

**10.2 Tab model and hook**

- **Work:** `listTabs.ts`, `filterUrlSync.ts`, `narrowingKey.ts`, `activeFilters.ts`,
  `listPageEffects.ts`, `useListPageState.ts`.
- **Tests first:** `listTabs.test.ts` (both declarations: opening tab, starting sorts, Status
  offered or not, `tab` written or not); `filterUrlSync.test.ts` (`tab` always written on
  `/accountant`, never on `/quotes-bookings`; `statuses` ignored on `/accountant`; a stale `tab` on
  `/quotes-bookings` removed); `narrowingKey.test.ts`; `activeFilters.test.ts`;
  `listPageEffects.test.ts`.
- **Gate:** `npm run tc` and `npx vitest run` green.

**10.3 Pages**

- **Work:** `/accountant` page and layout; `/quotes-bookings` without AR.
- **Tests:** `src/app/accountant/page.test.tsx` (static render, hooks mocked like the existing
  page test): both tabs and their tooltips, the AR columns and no Subtotal, no Status filter, no
  "+ Create Quote", the Show Deleted switch, the search placeholder, AR computed once for both
  tabs. `src/app/quotes-bookings/page.test.tsx`: the AR cases are removed; added — no tab bar,
  `useAccountsReceivableData` is never called, Status is offered, `?tab=ar` shows All Events.
- **Gate:** tc and vitest green.

**10.4 Access layer**

- **Work:** `accessConfig.ts`, the sidebar, the matrix.
- **Tests edited on purpose:** `accessConfig.test.ts` (the accountant's list and landing page, the
  admin's list, AM and viewer without `/accountant`); `useSidebarItems.test.ts` (the accountant's
  and admin's items and their order, and the case "an account manager who is also an accountant
  sees what an account manager sees", which now also gets Accountant); `permissionPageData.test.ts`.
- **Gate:** tc and vitest green.

**10.5 Sync rules**

- **Work:** the `br_powersync` PR (§6); restart the service.
- **Gate:** the YAML loads; the parameterised bucket count is compared before and after; with the
  local stack an accountant-only client holds every table of §6; the upload queue stays empty; the
  AR tabs show rows.

**10.6 E2E and close-out**

- **Work:** `src/features/quotesAndBookings/e2e/accountantPage.accountant.spec.ts` (S1–S4, S9);
  `accountantPage.admin.spec.ts` (S5); AM and viewer cases (S6, S7); update
  `src/features/userAccess/e2e/roleAccess.accountant.spec.ts` (the landing page and the bounce
  list).
- **Gate:** the final report with real tails of `npm run tc`, `npx vitest run`, `test:db:*` and
  `prettier --check <touched files>`; E2E marked SKIPPED with the reason.

## 11. Edge cases and error handling

- **Offline.** The pages read the local database. Currency resolution reads `QboConnections`
  online; offline the amounts fall back to the office's province, as today.
- **Sync not caught up.** AR shows its loading state, then rows; if the sync rules are not
  deployed the tabs stay empty (§6, deployment order).
- **Silent-empty hazard.** A missing grant or a missing synced table does not fail loudly: AR
  shows fewer rows or empty contact columns. The SQL test names each grant; the sync check names
  each table.
- **Role granted while signed in.** The identity row streams in; the sidebar and redirects update
  without a reload; the data arrives after the next sync.
- **A user who is accountant and account manager.** Roles are additive: they get `/accountant` from
  the accountant role and keep what the account-manager role gives.
- **Deactivated accountant.** `get_user_roles()` returns nothing: RLS refuses, sync stops, the
  access layer shows "account deactivated" — unchanged.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 12. Risks

- **R1 — the silent-empty hazard** (§11). Mitigation: one named SQL assertion per table, and the
  sync check per table.
- **R2 — bucket multiplication.** A sync query joined to the row it returns multiplies buckets
  (≈90 per client was found and removed in Stage 2). Mitigation: compile and compare (§6).
- **R3 — wider direct access (D10).** The accountant can read every event, payment, contact and
  sales office through the API, not only through the sync.
- **R4 — AM and viewer lose AR (D1).** An account manager can no longer list receivables across
  bookings; the balance of one booking stays on its Billing tab.
- **R5 — 13 counted files (D16).** A larger diff to review in one commit.
- **R6 — released with specs 03 and 04 (D2).** Between their commits the accountant's row click
  bounces; in one release it never does.
