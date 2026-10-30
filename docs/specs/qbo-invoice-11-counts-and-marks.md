# QuickBooks invoice — the sidebar count, the Need attention count and row marks

Status: **Implemented 2026-10-26; AMENDED the same day (user's request, after the first run):
no count on the Quotes & Bookings sidebar item, and none on the AR and AR Deposits tab labels.**
0 open decisions; three readings to confirm (§1, last paragraph). The amendment of 2026-10-23
follows spec 09: one signal, the mismatch flag, with its stored reasons; no hashes.
Implementation order: **11** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [09](qbo-invoice-09-banner.md) (the rule and `seeInvoiceAlerts`),
[10](qbo-invoice-10-need-attention-tab.md) (the third tab).

## 0. The request, and what it is not

The accountant is told, in the places they already work, that invoices need attention — the
way `/work-trackers` tells account managers. This spec adds three signals, all for
accountants only:

- a **count on the sidebar** item Accountant (not on Quotes & Bookings);
- a **count on the label of the Need attention tab** of `/accountant` (not on AR or AR
  Deposits);
- a **red mark with the reason** on each affected row of `/quotes-bookings` and of the AR and
  AR Deposits tabs.

**Not part of this spec:** the banner (spec 09); the Need attention tab (spec 10); the rule
itself.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **The places** (the user ticked all four): sidebar counts, tab counts, a row mark and the
  card banner. This spec is the first three; after the first run the user took the count off
  the Quotes & Bookings sidebar item and off the AR and AR Deposits tab labels (2026-10-26).
- **Like `/work-trackers`:** a count in the sidebar, a count on a list's headings, a mark on
  the row the count is about.
- **Accountants only.** An admin who is not an accountant sees none of them.
- **Whatever the status:** an invoice that exists keeps its signals (plan: "Keep everything").
- **What counts** is spec 09's rule: the mismatch flag is set.

**Readings to confirm at review.**

- The **sidebar** count (on the Accountant item only) is the number of quotes that need
  attention among **all** non-deleted quotes, whatever the page's filters.
- The **Need attention** number follows the page's list: it counts the quotes **in that tab**,
  after the Filter Panel and Show Deleted but not the search box.
- The sidebar count, the tab number and the mark are all red: the sidebar count like the one
  beside Work Trackers (`SideNavButton` draws every button's count red), the tab number and the
  mark like the counts and dots in the `/work-trackers` lists. (Amber was the first reading; the
  user chose red on 2026-10-26.)

## 2. Research findings

- **The pattern.** `attentionTrackers.ts` keeps every count and mark in one reactive query
  and derives them with pure functions, so a count and the marks it points at cannot
  disagree. `useAttentionCount()` feeds the sidebar and answers 0 to anyone it is not for.
- **The sidebar.** `Sidebar.tsx` hands a `badge` (count, label, test id) to the item whose key
  is `work-trackers`; the item here has the key `accountant`.
- **The pill.** `CountBadge` draws a count in amber or red.
- **The mark.** `AttentionMark` is a red dot with the reason on hover; the new mark is its
  sibling.
- **Name cell.** `EventNameCell` draws an event's name on `/quotes-bookings` and on the AR
  tabs.
- **The AR tabs' data.** `AccountsReceivableTabs` calls `useAccountsReceivableData` itself and
  keeps doing so: with no number on the AR labels the page needs none of its result.
- **The tab-label count** needs to be on a `TabsTrigger` that the page draws.

## 3. The data — `useInvoiceAlerts.ts` (new, `quotesAndBookings/hooks/`)

One reactive query on `Events`: `id`, `qbo_invoice_id`, `qbo_invoice_mismatch`,
`qbo_invoice_mismatch_reasons`, for non-deleted events that have an invoice and whose flag is
set. No join.

It returns `{ reasonsByEvent, count }`: a map from an event's id to its reasons (spec 09's
rule; an event with none is absent) and the number of events in it.

For a user who is not an accountant (`seeInvoiceAlerts`, spec 09) the query is built with a
condition that matches no row, so the sidebar does not watch the table for roles that never
see the count; the map is empty and `count` is 0.

## 4. The signals

**Sidebar — `Sidebar.tsx` (changed).** The item `accountant` gets a badge when `count` is above
0: the count, the label "{count} QuickBooks invoices need your attention", the test id
`sidebar-invoice-attention-badge`. The item `quotes-bookings` gets none.

**Tab label — `accountant/page.tsx` (changed).** The `TabsTrigger` of Need attention shows a
red `CountBadge` when its number is above 0: the number of rows `needAttentionRows` (spec 10)
returns for the page's events, restricted to the non-deleted-or-shown-deleted list the tab
shows. The AR and AR Deposits labels carry no number. An accountant only; for an admin the
label carries no number.

**Marks — `InvoiceAttentionMark.tsx` (new), `eventListCells.tsx` (changed).**
`InvoiceAttentionMark` takes the reasons and draws a red dot with `role="img"`, an
`aria-label` and a hover title made of the short texts of spec 09, one per reason; it draws
nothing for no reasons. `EventNameCell` gains an optional `attention` prop and draws the mark
before the name. `/quotes-bookings/page.tsx` (changed) and the AR tabs pass
`reasonsByEvent.get(event.id)` (the page hands the map to `AccountsReceivableTabs.tsx` as a
prop; that component keeps calling `useAccountsReceivableData` itself). The Need attention tab
does not need a mark (it has the Reason column).

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

- **QuickBooks Invoice Alerts** — the description now reads: "The red notice on a quote whose
  QuickBooks invoice needs attention, the red count on the Accountant entry of the sidebar and
  on the Need attention tab of the Accountant page, and the red mark on the quote's row in
  the lists. A quote needs attention when its invoice in QuickBooks no longer
  matches the quote." The accountant's
  note gains "and in the counts and marks". The administrator's note (spec 10) is unchanged.
- `permissionPageData.test.ts` — the changed texts.

## 6. Behaviour scenarios

Playwright, written, **not run**; the data is seeded by writing the columns of `Events`.

- **S1** an accountant with three quotes whose flag is set (two with `["dates"]`, one with
  `["totals"]`): the sidebar item Accountant shows 3; Quotes & Bookings shows no count.
- **S2** the same quotes for an admin who is not an accountant: no sidebar count, no tab
  number, no mark.
- **S3** a deleted quote that needs attention is not in the sidebar count.
- **S4** `/accountant`: Need attention shows the count of its rows and AR and AR Deposits show
  no number; a Filter Panel filter changes the Need attention number and not the sidebar's.
- **S5** the marks: a quote that needs attention has the red dot on `/quotes-bookings` and on
  its AR row; hovering shows the short text of each of its reasons ("Dates do not match", "Totals
  do not match", …).
- **S6** after **Update invoice** (a fake route that clears the flag) the count, the
  tab number and the mark fall without a reload.
- **S7** a quote with no invoice: no mark, no count.
- **S8** the AR tabs still show the same rows and balances as before.

## 7. Files

**Counted — 8 files** (limit 10):

1. `src/features/quotesAndBookings/hooks/useInvoiceAlerts.ts` — new
2. `src/features/quotesAndBookings/components/InvoiceAttentionMark.tsx` — new
3. `src/features/quotesAndBookings/components/eventListCells.tsx` — changed
4. `src/components/sidebar/Sidebar.tsx` — changed
5. `src/app/accountant/page.tsx` — changed
6. `src/features/quotesAndBookings/components/AccountsReceivableTabs.tsx` — changed
7. `src/app/quotes-bookings/page.tsx` — changed
8. `src/features/userAccess/permissionPageData.ts` — changed (§5)

**Not counted:** `eventListCells` tests, `AccountsReceivableTabs` tests, both pages' tests,
`Sidebar` tests, `permissionPageData.test.ts` (edited); the hook and mark tests (new); the
Playwright spec of §6. No migration, no `AppSchema.ts`, no `database.types.ts`, no
`sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`useInvoiceAlerts` test:** the query reads the four columns, filters on the invoice id, the
  flag and `deleted = 0`, has no join; the map and the count agree; for a role without
  `seeInvoiceAlerts` the map is empty and the count 0 and the query matches no row.
- **Mark tests:** none for no reasons; each reason's short text; all the texts, one per reason,
  when there are several.
- **`eventListCells` tests:** the name cell is unchanged without `attention`.
- **Sidebar tests:** the badge on the Accountant item with the right label and none on Quotes &
  Bookings; absent at 0; absent for a user who is not an accountant.
- **Accountant page and AR tests:** the page asks for the AR balances once (through the AR
  tabs); the Need attention label's number; no number on the AR and AR Deposits labels; the AR
  tables' rows, balances and sorting are exactly as before; the label carries no number for an
  admin.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **An admin who is also an accountant** sees all three signals.
- **Sync lag.** The numbers and marks follow the synced columns.
- **The sidebar count and the Need attention tab** can differ: the tab follows the filters and
  Show Deleted, the sidebar does not (§1).
- **A mark without a number.** An AR or AR Deposits row has its mark though its tab label has no
  number; the Accountant item's count and the Need attention number point at it.
- **Offline.** Everything reads the local database.
- **A role added or removed while signed in.** `seeInvoiceAlerts` follows the permissions
  store; the query is rebuilt.
- **Clerk.** Nothing new.

## 10. Risks

- **R1 — the shell watches one more table.** The sidebar subscribes to `Events` (one narrow
  query) for accountants only; every other role watches nothing.
- **R2 — numbers that differ by place** (§1, §9) may surprise a reader.

## 11. Out of scope

- Any signal for an admin who is not an accountant.
- Email, push or any notification outside the app.
- A way to dismiss a signal, or to filter any list by "needs attention".
- A count on the Quotes & Bookings sidebar item, on the AR and AR Deposits tab labels, on the
  other tabs or pages, and a mark on the Need attention tab.
