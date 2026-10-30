# QuickBooks invoice — the Quote Types page

Status: **Implemented 2026-10-26 (approved in chat).** **Amended 2026-10-26 by [12c](qbo-invoice-12c-manage-quote-types.md) (approved and implemented):** the page also creates, renames and deletes the types, for an admin. The URL became `/qbo-quote-types` while implementing (§1). 0 open decisions; three readings to confirm
(§1, last paragraph). Implementation order: [12](qbo-invoice-12-event-type-services.md), then
**12a**, then [12b](qbo-invoice-12b-use-the-mapping.md). Plan:
[qbo-invoice-plan.md](qbo-invoice-plan.md). Branch: `q4-sprint1-finance-role`.
Builds on: [12](qbo-invoice-12-event-type-services.md) (the table, the Items list and the picker).

## 0. The request, and what it is not

A new page, **Quote Types**, under Configuration. For each quote type (the `EventTypes` rows:
City, Corporate, Rural, and Sale when it is added) and each QuickBooks connection, a person
assigns the QuickBooks Product/Service the invoice line is sold as. This spec adds the page, who
may open it and the sidebar entry.

**Not part of this spec:** the table, the Items route and the picker (12); using the assignment on
the invoice (12b); ~~creating, renaming or deleting quote types~~ (**amended 2026-10-26 by
[12c](qbo-invoice-12c-manage-quote-types.md):** an admin does that on this page too).

## 1. Decisions (all taken by the user)

**Question — who may open the page and change the assignment**

- **Option A — admin only. Option B — admin and accountant.**
- **User's answer: B — admin and accountant.**

**Question — how a change is saved**

- **Option A — each select saves at once.** **Option B — one Save button.**
- **User's answer: A — each select saves at once.**

**Question — where an accountant finds the page**

- **Option A — the Configuration section, with the page as its only entry for them.**
  **Option B — a button of its own in their sidebar.**
- **User's answer: A — the Configuration section with one entry** (the user confirmed this twice,
  after asking to add the accountant to Configuration: the other Configuration pages stay hidden from
  the accountant).

**From the user's own words (not options):**

- The page is called **Quote Types** and sits under Configuration.

**Readings to confirm at review.**

- **The URL is `/qbo-quote-types`** (user's answer, 2026-10-26, during implementation: `/quote-types`
  would start with `/quote`, an allowed path of admin and account manager, and `allowedPaths` is
  matched by prefix, so an account manager could have opened it); the sidebar entry sits after Work
  Tracker Types and uses the `Tags` icon.
- **Clearing is possible:** choosing the selected Product/Service again (or "no selection" in the
  picker) removes the row, so a type can be returned to "not assigned". An unassigned type refuses
  an invoice (12b).
- **The page lists every connection,** the Canadian and the US one alike, healthy or not; one that
  cannot load its Items shows the connection error in its row.

## 2. Research findings

- **The Work Tracker Types page** (`app/work-tracker-types/page.tsx`) is the nearest page: a card per
  type, a row per connection, react-query for the table, `useClerkSupabaseClient` for reads and
  writes, `fetchQboConnections` for the connections. It saves with one button; this page saves at
  once, as the province section of 03a does.
- **The quote types in the app** come from `useEventTypes()` (`quotesAndBookings/hooks`): PowerSync,
  not deleted, ordered by name. `EventTypes` is synced for admin and accountant in
  `br_powersync/config/sync_rules.yaml`.
- **Page access** is `accessConfig.ts`: `allowedPaths` per role, prefix-matched by
  `useAccessRedirect`. The accountant's list has no Configuration page today.
- **The sidebar.** `Configuration` is a `section` whose children are shown to every role that sees
  the section; only a `dropdown` filters its children by role (`SidebarDropdownChild.roles`). The
  accountant's key list (`ROLE_SIDEBAR_KEYS`) has no `configuration`.
- **The matrix.** `permissionPageData.ts` has a row per Configuration page (Work Tracker Types,
  Quickbooks Connections, …) and a one-paragraph description of the accountant role.

## 3. Database

None (12 added the table).

## 4. App changes

- **`app/qbo-quote-types/layout.tsx`** (new): `<div className="p-4">{children}</div>`, as the other
  Configuration pages.
- **`app/qbo-quote-types/page.tsx`** (new, client component): `PageHeader` "Quote Types" with the
  subtitle "Choose the QuickBooks Product/Service each quote type is invoiced as, for each
  QuickBooks company." For each type from `useEventTypes()` a card with the type's name and, for each
  connection from `fetchQboConnections()`, a row: the connection's `display_name` and a
  `SelectQboItemSimple` (12). The assignments are read with react-query, key
  `["event-type-qbo-services"]`, from `EventTypeQboServices` (`event_type_uuid`,
  `qbo_connection_uuid`, `qbo_service_id`) through the signed-in client.
  - Picking an Item **upserts** the row on `(event_type_uuid, qbo_connection_uuid)`; clearing
    **deletes** it. The select shows the new value at once; a failure shows an error toast with the
    message and puts the old value back.
  - Empty states: "Loading quote types..." while the types load; "No quote types." for none; the
    italic "No QuickBooks connections" when there are none.
- **`accessConfig.ts`** (changed): `/qbo-quote-types` is added to the `allowedPaths` of `admin` and
  `accountant`. The accountant's comment gains a pointer to this spec. No other role changes.
- **`useSidebarItems.ts`** (changed):
  - `SidebarButtonItem` gains `roles?: WebRole[]`. In `useSidebarItems`, a **section's** button
    children are filtered by it as a dropdown's are (a button with no `roles` stays visible to every
    role that sees the section).
  - Every existing button in the `configuration` section gets `roles: ["admin"]`; the new button
    `{ key: "quote-types", label: "Quote Types", href: "/qbo-quote-types", icon: Tags }`, after
    `work-tracker-types`, gets `roles: ["admin", "accountant"]`.
  - `ROLE_SIDEBAR_KEYS.accountant` gains `configuration`, between `companies-contacts` and
    `documentation`.
- **`permissionPageData.ts`** (changed):
  - A new row **Quote Types**, category Configuration, description: "This applies to the Quote Types
    page under Configuration, where each quote type (City, Corporate, Rural …) is assigned the
    QuickBooks Product/Service its invoice line is sold as, per QuickBooks connection. The types
    themselves cannot be added, renamed or removed here." Administrator: full ("Can assign, change or
    clear the Product/Service of any quote type, per QuickBooks connection."). Accountant: full (the
    same). Account manager, developer, viewer, driver, maintainer: none, in the wording of the
    neighbouring rows.
  - `ROLE_DESCRIPTIONS.accountant` gains a sentence before "Everything else …": "Also has the Quote
    Types page under Configuration, where they choose the QuickBooks Product/Service of each quote
    type."

## 5. Behaviour scenarios

Playwright, written, **not run**; the Items list is replaced by a fake route and a page's saves go
to the real local table. Specs `qbo-quote-types.admin.spec.ts`, `.accountant.spec.ts`, `.am.spec.ts`,
`.viewer.spec.ts` in `src/features/quickbooks-integration/e2e/`.

- **S1** admin: Configuration lists Quote Types; the page shows a card per type and a row per
  connection.
- **S2** admin picks an Item for City: it survives a reload; picking it again clears it and a
  reload shows it cleared.
- **S3** a failed save (the write is blocked): the error toast, the old value back.
- **S4** accountant: the sidebar has a Configuration section whose only entry is Quote Types; the
  page opens and saves like S2.
- **S5** accountant opens `/quickbooks`, `/work-tracker-types` and `/zones` by URL: redirected to the
  Accountant page.
- **S6** account manager and viewer: no Quote Types entry; `/qbo-quote-types` redirects them.

## 6. Files

**Counted — 5 files** (limit 10):

1. `src/app/qbo-quote-types/layout.tsx` — new
2. `src/app/qbo-quote-types/page.tsx` — new
3. `src/features/userAccess/accessConfig.ts` — changed
4. `src/components/sidebar/useSidebarItems.ts` — changed
5. `src/features/userAccess/permissionPageData.ts` — changed

**Not counted:** `page.test.tsx`; `accessConfig.test.ts`, `useSidebarItems.test.ts`,
`permissionPageData.test.ts` (edited); the four Playwright files of §5. No migration, no
`database.types.ts`, no `AppSchema.ts`, no `package.json`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`page.test.tsx`** (the picker, the types hook and the Supabase client replaced by fakes): a card
  per type and a row per connection; the stored assignments are shown; choosing an Item upserts with
  the type, the connection and the id; choosing the selected one deletes the row; a failed write shows
  the toast and restores the value; the empty states; no write happens before a choice.
- **`accessConfig.test.ts`:** `admin` and `accountant` may open `/qbo-quote-types`; `account_manager`,
  `viewer`, `maintainer` and `driver` may not; the accountant still may not open `/quickbooks`,
  `/work-tracker-types`, `/zones`, `/pricing-matrix`.
- **`useSidebarItems.test.ts`:** the accountant has `configuration` and its children are exactly
  `quote-types`; the admin's `configuration` still lists every earlier child plus `quote-types`; a
  user with both roles sees the union; the viewer, account manager and maintainer have no
  `configuration`; **every button in the `configuration` section declares `roles`** (a new Configuration
  button without them would appear for the accountant).
- **`permissionPageData.test.ts`:** the Quote Types row has an entry for every role with the levels
  above; the accountant description names the page.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **A quote type added later (Sale).** It appears on the page by itself, unassigned.
- **A quote type deleted (soft) later.** It disappears from the page; its rows stay and keep
  working for invoices that use them (12b).
- **A connection that cannot load its Items** shows the connection error in its row; the other rows
  work.
- **No connections / no types.** The empty states of §4.
- **A write refused by the database** (a role without a policy, a lost session): the error toast
  and the old value back.
- **Two people change the same cell.** The last write wins.
- **Offline / PowerSync.** The types come from the local database; the assignments and the Items need
  the network. Offline the page shows its loading or error state and writes nothing.
- **Clerk.** Page access is `accessConfig.ts`; the database policies of 12 are the lock.

## 9. Risks

- **R1 — the accountant's stream for `EventTypes`.** The page lists types from the device's local
  database. The rule exists in `br_powersync/config/sync_rules.yaml` (accountant), but if it is
  not deployed the accountant sees "No quote types." until it is.
- **R2 — the sidebar `roles` rule.** A new Configuration button added without `roles` would appear
  for the accountant (the page itself would still redirect); the test of §7 guards it.
- **R3 — a type deleted before it was assigned** cannot be assigned on this page, and an old quote
  of that type is refused an invoice (12b).

## 10. Out of scope

- ~~Adding, renaming, reordering or deleting quote types.~~ **Amended by 12c:** adding, renaming and
  deleting are done there; reordering stays out.
- A warning on the page, or anywhere else, for a type with no assignment.
- Giving the accountant any other Configuration page.
- Showing the Item's Description or price on the page.
