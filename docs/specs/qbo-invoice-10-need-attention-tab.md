# QuickBooks invoice — the Need attention tab on /accountant

Status: **DRAFT 2026-10-22; AMENDED 2026-10-23 — awaiting "Approved".** 0 open decisions; one
reading to confirm (§1, last paragraph). The amendment follows spec 09: with the hashes gone there
is one signal, the mismatch flag, and the **Reason** column shows its real reasons.
Implementation order: **10** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [09](qbo-invoice-09-banner.md) (the attention rule),
[accountant-quotes-02-accountant-page.md](accountant-quotes-02-accountant-page.md) (the page
and its two tabs).

## 0. The request, and what it is not

A third tab on `/accountant`, **Need attention**, lists every quote whose QuickBooks invoice
needs attention: the invoice in QuickBooks no longer matches the quote.

**Not part of this spec:** the sidebar counts, the numbers on the tab labels and the row
marks (spec 11); the banner (spec 09); any change to the AR and AR Deposits tabs.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **A third tab** on `/accountant`, named "Need attention", with all the quotes that need
  attention.
- **It opens newest event first** (event start, descending) — the user's answer.
- **Who sees it:** the page is admin and accountant. An admin who is not an accountant sees
  the tab and its list; the signals of specs 09 and 11 are accountants' only (user's answer).
- **Whatever the status:** a quote with an invoice stays in the list whatever its status
  (plan: "Keep everything").
- **What "needs attention" means** is spec 09's rule: the mismatch flag is set.
- **The Reason column shows the real reasons** — "Dates do not match", "Totals do not match",
  "Service does not match" and so on, not one fixed text (user's answer, 2026-10-23).

**Reading to confirm at review.**

- The list has the **first four columns of the AR tabs** (Event Name, Account Manager, Start
  Date, Invoice #) and one more, **Reason**, which lists every reason of the row, comma-separated,
  in spec 06's order. It has no money columns.
- The Status filter is not offered on this tab (a quote here has an invoice, not a status
  to browse by), as on the AR tabs.
- The page's other controls apply as on the AR tabs: the Filter Panel, Show Deleted, search,
  sort, paging, and the row opens the quote.
- The tab opens only when chosen: the page still opens on AR.

## 2. Research findings

- **The tabs are declared** in `ACCOUNTANT_TABS` (`utils/listTabs.ts`): each with an id, a
  starting sort and whether it offers the Status filter; `openingTab` is `ar`; the URL
  carries `?tab=`. A stale or unknown id opens the opening tab.
- **The page** keeps the list state (`useListPageState(ACCOUNTANT_TABS)`), loads the events
  once (`useQuotesAndBookingsData(filters, showDeleted)`), and hands them to
  `AccountsReceivableTabs`, which draws the two AR tabs' content. A deleted event is in that
  list only while Show Deleted is on.
- **The AR table** is built from the same event rows: `DataTable`, `EventNameCell`, sort via
  `sortEvents`, search via `searchReceivables`, paging via `slicePage`.
- **Generic search and sort exist** for plain event rows: `searchEvents` and `sortEvents`.
- **The rule** of spec 09 (`invoiceAttentionReasons`) and its short texts.
- **One query per table.** The data hook reads the five columns from `Events` only; the
  event rows themselves come from the page's existing query.
- **The matrix** has a row **Accounts Receivable** that describes the page's two tabs.

## 3. Data

**`useNeedAttentionData.ts`** (new, `quotesAndBookings/hooks/`) runs one reactive query on
`Events`: `id`, `qbo_invoice_id`, `qbo_invoice_mismatch`, `qbo_invoice_mismatch_reasons`, for
events that have an invoice (`qbo_invoice_id` is not null) and whose flag is set. No join. It
returns the rows.

**`needAttentionRows.ts`** (new, `quotesAndBookings/utils/`) — pure:
`needAttentionRows(events, attentionRows)` returns the page's events that have an invoice
needing attention, each with its `reasons` (spec 09's rule, so `unspecified` where the flag has
none), in the order of `events`. An event
that is not in `events` (filtered out, or deleted while Show Deleted is off) is not in the
result.

## 4. The tab

- **`listTabs.ts`** (changed): `ACCOUNTANT_TABS` gains
  `{ id: "need_attention", startingSort: { key: "start_date", direction: "desc" },
offersStatus: false }`, after AR Deposits. `openingTab` stays `ar`.
- **`NeedAttentionTab.tsx`** (new): a `TabsContent` for `need_attention`. It takes the page's
  `events`, `searchQuery`, `sort`, paging and `onRowClick` as the AR content does; runs
  `needAttentionRows`; applies `searchEvents`, `sortEvents` and the paging; and draws a
  `DataTable` with the columns of §1. **Reason** shows the short text of each reason
  (spec 09), all of them comma-separated; it is not sortable. The header of the first column shows
  the row count, as on the AR tabs. Empty message: "No invoice needs attention".
- **`accountant/page.tsx`** (changed): a `TabsTrigger` **Need attention** after AR Deposits,
  and `NeedAttentionTab` mounted beside `AccountsReceivableTabs`. The row click opens
  `/quotes-bookings/{id}`.

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

- **Accounts Receivable** — the description gains: "A third tab, Need attention, lists the
  quotes whose QuickBooks invoice no longer matches the quote; it
  opens on the newest event." Roles' levels do not change; the roles that see the page see
  the tab.
- **QuickBooks Invoice Alerts** — the administrator's note becomes: "Does not see the invoice
  alerts on the quote or in the counts and marks. The Need attention tab on the Accountant
  page lists the same quotes, and they can open it."
- `permissionPageData.test.ts` — the changed note.

## 6. Behaviour scenarios

Playwright, written, **not run**; the data is seeded by writing the columns of `Events`.

- **S1** admin and accountant: the page has the tab **Need attention**; the page still opens on
  AR; `?tab=need_attention` opens it.
- **S2** a quote with an invoice whose flag is set with the reasons `["dates"]`: it is listed
  with **Dates do not match**; with `["dates","totals"]`: **Dates do not match, Totals do not
  match**; a set flag with no reasons: **Invoice does not match the quote**.
- **S3** a quote with an invoice and no flag: not listed. A quote with no invoice and a set flag:
  not listed.
- **S4** a quote with an invoice that is no longer `booked` and needs attention: listed.
- **S5** the tab opens newest event first; sorting by Event Name, Account Manager, Start Date
  and Invoice # works; **Reason** has no sort.
- **S6** search by event name and by invoice number narrows the list; the Filter Panel
  narrows it; Show Deleted adds a deleted quote that needs attention.
- **S7** clicking a row opens the quote; its banner (spec 09) shows for an accountant.
- **S8** nothing needs attention: "No invoice needs attention".
- **S9** an account manager and a viewer cannot open `/accountant` (unchanged).

## 7. Files

**Counted — 6 files** (limit 10):

1. `src/features/quotesAndBookings/utils/listTabs.ts` — changed: the tab
2. `src/features/quotesAndBookings/utils/needAttentionRows.ts` — new
3. `src/features/quotesAndBookings/hooks/useNeedAttentionData.ts` — new
4. `src/features/quotesAndBookings/components/NeedAttentionTab.tsx` — new
5. `src/app/accountant/page.tsx` — changed
6. `src/features/userAccess/permissionPageData.ts` — changed (§5)

**Not counted:** `listTabs.test.ts`, `page.test.tsx` of the accountant page,
`permissionPageData.test.ts` (edited); `needAttentionRows.test.ts`, the hook and component
tests (new); the Playwright spec of §6. No migration, no `AppSchema.ts`, no
`database.types.ts`, no `sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`needAttentionRows.test.ts`:** an event with an invoice and a set flag is returned with its
  reasons (several, in spec 06's order; none stored gives `unspecified`); none for a false flag;
  none for no invoice; an event missing from `events` is not returned; the order of `events` is
  kept; one result per event.
- **`listTabs.test.ts`:** the third tab's id, starting sort (event start, descending) and
  no Status filter; the opening tab is still `ar`; `?tab=need_attention` parses; an unknown
  tab opens `ar`.
- **Hook test:** the query reads the four columns, filters on the invoice id and the flag and
  has no join.
- **Component and page tests:** the columns; **Reason** texts; the empty message; the count in
  the header; the tab is present on the page; the AR tabs are unchanged.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **Sync lag.** The list follows the synced columns; a quote leaves it a few seconds after an
  Update, when its cleared flag arrives.
- **A quote hidden by the Filter Panel** is not in the list while the filter is on; the tab
  does not override the filters.
- **A deleted quote** appears only with Show Deleted, as on the AR tabs.
- **A quote with an invoice whose sales office was changed.** It is listed if it needs
  attention; Update on it is refused by the route (spec 05).
- **A very long list.** The rows are paged client-side like the AR tabs.
- **Offline.** The tab reads the local database and works offline.
- **Clerk.** Page access is unchanged (admin and accountant).

## 10. Out of scope

- Sidebar counts, tab-label numbers and row marks (spec 11).
- Bulk update, or any action from the list.
- A tab for any other role, or on `/quotes-bookings`.
- Money columns, or a filter by reason.
