# Quotes & Bookings — capabilities ("can I do X?")

Status: **IMPLEMENTED 2026-10-03, awaiting review** — not checked by hand in a browser (Clerk
sign-in is unavailable here); Playwright specs written, not run. 0 open decisions (D1–D10 answered
2026-10-03).
Original request: №3. Implementation order: **03 of 11**. Needs [02](accountant-quotes-02-accountant-page.md)
(both specs edit `src/app/quotes-bookings/page.tsx`). Ships in one release with 02 and 04.
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md).

## 0. The request, and what it is not

The quote card (`/quotes-bookings/{id}`) and the list (`/quotes-bookings`) decide what to show
by asking who the user is (`isAdmin`, `isAccountManager`, `isViewer = !admin && !AM`). Every new
role would add more of those questions. This spec replaces them with **one place that answers
"can this user do X?"**, and the components read only the answers.

- **One intentional behaviour change** (D1): a role that is neither admin nor account manager no
  longer sees **Edit**, **Delete** (card) or **+ Create Quote** (list). Today only a viewer reaches
  these pages, so in practice: **viewers lose three buttons they could press but the database
  refused.** Everything else behaves as today for every role.
- The accountant is **not** given access here (spec 04). The table has an accountant column that is
  all "no"; later specs fill in single cells — the QuickBooks flag (05), recording payments (10), the
  internal chat (11). Spec 04 opens the pages read-only and changes nothing in this column.

**Not part of this spec, so not changed:**

- `/quotes-bookings/new`, `/quotes-bookings/{id}/edit`, `/quotes-bookings/{id}/preview` and the
  quote form (`CreateQuoteForm`, `QuoteDetailsSection`) — D2;
- who may open a path (`accessConfig.ts`), RLS, sync rules;
- the Contract, Files and Log tabs (they hold no role conditions);
- `canEditOwnedEntity` itself, which the dashboard forms also use.

## 1. Decisions (all taken by the user)

**D1 — Edit, Delete and Create for a viewer**

- **Question:** by the code (not observed in a browser) a viewer sees **Edit** and **Delete** on
  the card and **+ Create Quote** on the list, and the database refuses the write. What does this
  spec do about it?
- **Option A — keep it as it is:** the table records today's behaviour, including those buttons
  for a viewer; the rows contradict the permissions matrix and wait for a later fix.
- **Option B — fix it here:** the capabilities follow the matrix; a viewer loses the three
  buttons. A visible change for viewers.
- **User's answer: B — fix it here.**

**D2 — which parts are refactored**

- **Option A — the card, the list and their tabs.** **Option B — also the quote form** on `/new`
  and `/{id}/edit` (`canSendDirectly`, an `isAdmin` check in `QuoteDetailsSection`).
- **User's answer: A — the card, the list and their tabs.**

**D3 — how fine the capabilities are**

- **Option A — one per action** (about eight names, one per button or control).
  **Option B — one per area** (fewer names; one capability governs several controls).
- **User's answer: B — by area.** Record Payment, the QuickBooks flag and the internal chat are
  **three separate capabilities**, because later specs treat them differently. (The grouping of
  Send To Client was settled by D4.)

**D4 — `manageQuote` and Send To Client**

- **Question:** Edit and Delete follow the **owner rule** (admin; lead AM; junior AM only their
  own or assigned quotes — enforced in the UI only, RLS lets any AM write). Send To Client is open
  to **any admin or AM** (the code says review-gating was disabled per boss feedback). One
  capability, or two?
- **Option A — Send To Client is its own capability.** **Option B — all three under the owner
  rule** (a junior AM could no longer send a quote they did not create). **Option C — all three
  for any admin or AM** (a junior AM would see Edit and Delete on quotes they did not create).
- **User's answer: A — Send To Client is its own capability.**

**D5 — Record Payment's three states**

- **Question:** today the button is hidden (viewer), disabled with a hint (junior AM on someone
  else's quote) or enabled. After spec 06 an account manager records no payments and the disabled
  state disappears.
- **Option A — two booleans:** one for "can press it", one for "is visible".
  **Option B — a three-state value** (`allowed` / `disabled` / `hidden`, with a reason for
  `disabled`). **Option C — the UI combines two capabilities:** visibility from `recordPayment`,
  enabled state from `manageQuote`.
- **User's answer: A — two booleans.**

**D6 — where the function reads the user's roles**

- **Option A — a `roles` list in `usePermissionsStore`**, filled by `SignedInComponents` from
  `access.roles`. **Option B — more boolean flags** (`isViewer`, `isAccountant`) next to the
  existing ones.
- **User's answer: A — a `roles` list in the store.**

**D7 — how components receive the capabilities**

- **Option A — a prop from the top:** the page computes them once and passes one `can` down.
  **Option B — a hook in every component.** **Option C — a context provider** and `useCan("…")`.
- **User's answer: A — a prop from the top.**

**D8 — keeping role names out of the components**

- **Option A — an agreement,** written here and checked in review. **Option B — an automated test**
  that scans the files and fails on `isAdmin` / `isAccountManager`.
- **User's answer: A — an agreement only.**

**D9 — `openInDashboard` in this spec**

- **Option A — yes:** the capability exists now; it is true for every role that has the
  `/dashboard` path, so nothing changes; spec 04 adds nothing for the accountant here.
  **Option B — no:** the button stays unconditional here and spec 04 adds the capability.
- **User's answer: A — yes, in this spec.**

**D10 — the card's buttons**

- **Option A — extract them into a component** (`QuoteActionBar`) that takes `can` and is tested
  by a static render. **Option B — leave them in `QuoteDetailView`,** with no automated test of
  their wiring.
- **User's answer: A — extract them into a component.**

## 2. Research findings

**Every role question the two pages ask today** (read from the code):

- `QuoteDetailView.tsx`
  - `canSend = isAdmin || isAccountManager` → **Send To Client**;
  - `canEditQuote = canEditOwnedEntity({ isAdmin, isNew: false, isAccountManager, leadZoneIds,
accountManagerZoneIds, createdByUserId, assignedUserId, userId })` → **Edit**, **Delete**, and
    the `canEdit` prop of `BillingTab`. `canCreate` is **not passed**, so for a caller who is
    neither admin nor AM the function falls to its last branch, "non-AM callers (backwards
    compat)", and returns **true** — the source of D1;
  - **Open in Dashboard** has no condition.
- `BillingTab.tsx`
  - `isViewer = !isAdmin && !isAccountManager`: the **QuickBooks Invoice** checkbox is disabled
    for it; **+ Record Payment** is hidden for it; for everyone else it is visible and
    `disabled={!canEdit}` with the hint "You can only record a payment on quotes you created";
  - `perms.userId` is used for `currentUserUuid` and `recordedByUserUuid` — not a role question.
- `MessagesTab.tsx`: `canUseInternalChat = isAdmin || isAccountManager`; others see "Internal chat
  is available to admins and account managers only."
- `src/app/quotes-bookings/page.tsx`: **+ Create Quote** has no condition.
- `ContractTab`, `FilesTab`, `LogTab`: no role conditions.

**The database.** `events_insert`, `events_update` and `events_delete` allow `{admin,
account_manager}` by role only (since `20260617200000_amz_lead_and_relax_rls.sql`). The owner rule
for a junior account manager exists **only in the UI**.

**The store.** `usePermissionsStore` holds `isAdmin`, `isAccountManager`, `isMaintainer`,
`accountManagerId`, `accountManagerZoneIds`, `leadZoneIds`, `userId` — no viewer, no accountant, no
role list. `SignedInComponents.tsx` (lines 49–63) fills it from `access.roles`. 33 files import
the store; they keep working unchanged.

**Existing tests.** `BillingTab.test.tsx` mocks `usePermissionsStore` and pins the Record Payment
states (S13 lead AM enabled, S8 junior AM disabled with the hint, S9 viewer hidden, plus an admin
case). `canEditOwnedEntity.test.ts` already pins "viewer cannot edit existing (canCreate=false)".
`page.test.tsx` for `/quotes-bookings` does not mock permissions.

**The matrix.** The _Events_ row already says a viewer cannot create, edit or delete; the
_QuickBooks Invoice Flag_ and _Record a Payment_ rows describe today's behaviour. No row says who
may **send a quote to the client** (found on the way, §12).

## 3. The capabilities

Names are indicative. Roles are additive: a user holding several roles gets what any of them gives,
as `isAdmin || isAccountManager` does today.

- **`createQuote`** — the list's "+ Create Quote". admin: yes. account manager: yes. any other
  role: **no** (D1).
- **`manageQuote`** — the card's **Edit** and **Delete**, for one quote. admin: yes. account
  manager: the owner rule (lead AM: any quote; junior AM: created by or assigned to them; a quote
  with a bleacher in a zone they cannot access: the creator only — all as `canEditOwnedEntity`
  decides today). any other role: **no** (D1).
- **`sendToClient`** — **Send To Client**. admin: yes. account manager: yes, on any quote (D4).
  any other role: no.
- **`showRecordPayment`** — whether **+ Record Payment** is drawn at all. admin: yes. account
  manager: yes. any other role: no (D5).
- **`recordPayment`** — whether it can be pressed. Equal to `manageQuote` for the same quote, as
  today's `canEdit` is. A visible-but-not-pressable button keeps its hint (D5).
- **`setQuickBooksFlag`** — the **QuickBooks Invoice** checkbox. admin: yes. account manager: yes,
  on any quote. any other role: no.
- **`useInternalChat`** — the Messages tab's internal chat. admin: yes. account manager: yes. any
  other role: no.
- **`openInDashboard`** — **Open in Dashboard**. Yes for a role that has the `/dashboard` path
  (`canAccessPath`): today admin, account manager, viewer and maintainer; no for developer, driver
  and accountant.

**The accountant's column in this spec:** every capability above is **no** (the accountant has no
access to the page yet). Spec 04 gives the accountant the pages read-only and **changes no cell**; the
cells change one at a time later — `setQuickBooksFlag` in spec 05, `recordPayment` in spec 10,
`useInternalChat` in spec 11.

## 4. Contract

**The function** — `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts`, pure.

- **Input:** the user's `roles` (`WebRole[]`), `userId`, `leadZoneIds`, `accountManagerZoneIds`,
  and, for the card, the quote (`createdByUserId`, and `eventBleacherZoneIds` only if the card
  passes them today — it does not).
- **Output:** the capabilities of §3. On the list only `createQuote` is read.
- It calls `canEditOwnedEntity` for the owner rule and passes `canCreate` as "the roles include
  admin or account manager", so the shared function's last branch is never reached for a viewer;
  `canEditOwnedEntity` itself is not changed.

**The hook** — `src/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities.ts`: the one
place that reads the store (`roles`, `userId`, zones) and calls the function.

**The store** — `usePermissionsStore` gains `roles: WebRole[]` (starts empty);
`SignedInComponents` sets `roles: access.roles` next to the existing fields. The boolean flags
stay for the 33 other files.

**The flow (D7):** `QuoteDetailView` calls the hook once with the loaded quote and passes `can`
down to `QuoteActionBar`, `BillingTab` and `MessagesTab`. The list page calls it once for
`createQuote`.

**The agreement (D8):** in `quoteDetail/`, in `QuoteDetailView`, and in the two pages, no
component reads `isAdmin`, `isAccountManager`, `roles`, `leadZoneIds` or `accountManagerZoneIds`
from the store. Reading `userId` is allowed. It is checked in review.

## 5. Component changes

- **`QuoteActionBar`** (new, `components/quoteDetail/QuoteActionBar.tsx`): the button group of the
  tab bar — Open in Dashboard, Edit, Delete, Send To Client. Props: `can`, `isDeleted`,
  `deleting`, and the four handlers. Draws nothing for a deleted quote, as today. The contract
  total and the tabs stay in `QuoteDetailView`.
- **`QuoteDetailView`:** the role logic and the buttons leave; it computes `can` and passes it
  down. The commented-out review-request block and its unused imports are left as they are.
- **`BillingTab`:** the `canEdit` prop becomes `can` (`showRecordPayment`, `recordPayment`,
  `setQuickBooksFlag`); `isViewer` is deleted; `perms.userId` stays.
- **`MessagesTab`:** takes `can.useInternalChat` instead of reading the store.
- **`/quotes-bookings` page:** draws **+ Create Quote** only when `can.createQuote`.

## 6. Behaviour that must not change, and the one that does

**Must not change (for admin, account manager — lead and junior — maintainer, developer, driver):**

- who sees Send To Client, Edit, Delete, Record Payment, the QuickBooks checkbox, the internal chat
  and Open in Dashboard, including the owner rule and the disabled Record Payment with its hint;
- every label, hint and layout; the deleted-quote banner hides the action buttons as today.

**Changes (D1):** a viewer no longer sees Edit, Delete or + Create Quote. Nothing else about a
viewer changes: Record Payment stays hidden, the QuickBooks checkbox stays disabled, the chat
message stays, Open in Dashboard stays.

## 7. Matrix — `src/features/userAccess/permissionPageData.ts`

**No change.** The _Events_ row already describes a viewer as unable to create, edit or delete, so
this spec brings the screen in line with the matrix, not the other way round.

## 8. Behaviour scenarios (for Playwright — written, not run)

- **S1** admin on a quote: Open in Dashboard, Edit, Delete, Send To Client, Record Payment all
  visible and enabled; the QuickBooks checkbox is enabled.
- **S2** lead account manager on a quote they did not create: Edit and Delete visible; Record
  Payment enabled.
- **S3** junior account manager on someone else's quote: no Edit or Delete; Send To Client
  visible; Record Payment visible, disabled, with the hint; the QuickBooks checkbox enabled.
- **S4** junior account manager on their own quote: Edit and Delete visible.
- **S5** **viewer** on a quote: no Edit, no Delete, no Send To Client, no Record Payment, the
  QuickBooks checkbox disabled, the chat message in place of the chat, Open in Dashboard visible.
- **S6** viewer on the list: no "+ Create Quote"; admin and account manager see it.
- **S7** a deleted quote: no action buttons for any role.

## 9. Files

**Counted — 9 files** (limit 10):

1. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — new
2. `src/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities.ts` — new
3. `src/features/quotesAndBookings/components/quoteDetail/QuoteActionBar.tsx` — new
4. `src/features/userAccess/state/usePermissionsStore.ts` — changed: `roles`
5. `src/components/SignedInComponents.tsx` — changed: fills `roles`
6. `src/features/quotesAndBookings/components/quoteDetail/QuoteDetailView.tsx` — changed
7. `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx` — changed
8. `src/features/quotesAndBookings/components/quoteDetail/tabs/MessagesTab.tsx` — changed
9. `src/app/quotes-bookings/page.tsx` — changed

**Not counted:**

- tests: `getQuotesBookingsCapabilities.test.ts` (new), `QuoteActionBar.test.tsx` (new),
  `MessagesTab.test.tsx` (new), `BillingTab.test.tsx` and `src/app/quotes-bookings/page.test.tsx`
  (edited); the Playwright specs of §8;
- no migration, no `sync_rules.yaml`, no `AppSchema.ts`, no `database.types.ts`, no
  `permissionPageData.ts` (§7).

## 10. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run**; Prettier only on touched
files.

1. **The function.** Write `getQuotesBookingsCapabilities.test.ts` first, one block per role:
   admin; lead AM (own and other quotes); junior AM (own, assigned, someone else's, a quote with a
   bleacher in an inaccessible zone); AM with no zones; **viewer** (all "no" except
   `openInDashboard` — the D1 case, each of `createQuote`, `manageQuote`, `recordPayment` pinned
   as false); maintainer, developer, driver, **accountant** (all "no"); and combinations (admin +
   viewer → admin; AM + viewer → AM's rules). Then the function. **Gate:** the test is green.
2. **The store and the hook.** `roles` in the store; the hook reads it.
3. **The components.** `QuoteActionBar` with `QuoteActionBar.test.tsx` first (static render, one
   case per capability combination: each button present or absent, Delete hidden for a deleted
   quote); `BillingTab.test.tsx` edited to pass `can` instead of mocking the store's flags (the
   S8/S9/S13 cases stay, expressed through `can`; the QuickBooks checkbox state added);
   `MessagesTab.test.tsx` (chat or message by `can.useInternalChat`); the page test (button by
   `can.createQuote`).
4. **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
   SKIPPED (not run locally, by instruction).

## 11. Edge cases and error handling

- **The store before sign-in completes.** `roles` starts empty, so every capability is "no" until
  `SignedInComponents` fills it; the pages sit behind the same sign-in gate as today.
- **A quote that has not loaded.** The card shows its loading state before the hook has a quote;
  quote-dependent capabilities are computed once the quote exists.
- **Offline.** Nothing here touches the network. The capabilities depend on the local store.
- **Deactivated user, role removed while signed in.** The identity row updates the store through
  `SignedInComponents`; the next render recomputes `can`.
- **Clerk.** No route, token or webhook is touched.
- **A role the function does not know.** Treated as "no" for every capability.

## 12. Risks, and found on the way (not changed here)

**Risks**

- **R1 — the viewer change (D1).** A viewer stops seeing three buttons. The database already
  refused what they did; the user-visible difference is that the buttons disappear.
- **R2 — the agreement of D8 is not enforced.** A later change can bring a role question back into
  a component; only review catches it.
- **R3 — `QuoteDetailView` is not rendered by any test.** It loads its data in an effect, so a
  static render stops at "Loading quote…"; its wiring is covered by `QuoteActionBar`'s and the
  tabs' tests and by the scenarios of §8.

**Found on the way — reported, not fixed**

1. **The owner rule is UI-only.** RLS lets any account manager update or delete any event; the
   matrix says an account manager edits only their own.
2. **The matrix has no row for sending a quote to the client.** Anyone reading `/permissions`
   cannot learn who may do it.
3. **`/new`, `/{id}/edit` and `/{id}/preview` have no page-level role guard** (they are out of
   scope, D2); a viewer who types the URL opens the quote form and is refused on save.
4. **`QuoteDetailView` carries dead code** — a commented-out review-request flow, the unused
   `getAmRoleForZone` import and a zone query only that flow used.
