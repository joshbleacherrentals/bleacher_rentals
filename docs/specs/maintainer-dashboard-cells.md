# Maintainer: dashboard cells (Blocks)

Status: **APPROVED** — 2026-10-01 (D1 = A; legacy `NULL`-author blocks and one-note-per-cell accepted).
Branch: `q4-sprint1-finance-role`.
Precedent: [maintainer-damage-and-maintenance.md](maintainer-damage-and-maintenance.md), which
said "Maintainers do not get the Dashboard". This spec reverses that, for one purpose.

v2 replaces the first draft, which said "any cell, any block". You asked for the opposite:
a maintainer changes **only the notes they wrote themselves**. That needs a new column.

## 1. What this changes

The maintainer gets create / read / update / delete on **`Blocks`** — the free-text note in a
dashboard cell (one bleacher, one date) — and the **Dashboard page** to use it from.

- **Read:** every block, whoever wrote it.
- **Create:** a block in any empty cell.
- **Update / delete:** only a block whose author is that maintainer.
- **New column** `Blocks.created_by_user_uuid` records the author.
- **Nothing else on the dashboard becomes editable.** Events, work trackers, maintenance and
  sub-rentals stay out of reach, exactly as they are for a Viewer today.
- **Admin and account manager rules do not change.**

## 2. Decision (settled)

**D1 — what the maintainer sees on the grid: Option A.** The same read-only data a Viewer
sees — events, work trackers, drivers, sub-rentals. The grid renders exactly as it does for
every other role. Cost accepted: a maintainer can read customer event names and addresses,
driver names and work tracker details, as a Viewer already can.

Sections below marked **A only** are the part of this change that exists because of D1.

## 3. Changes

### 3.1 Migration

**New column.**

- `Blocks.created_by_user_uuid uuid references "Users"(id)`, nullable, same shape as
  `Events.created_by_user_uuid`.
- **Default `public.get_current_user_uuid()`.** The client never sends the field, so no caller
  can forget it. The old dashboard's block insert is covered too. Admin and account manager
  inserts also record their author from now on.
- **No backfill.** Existing blocks have no known author and stay `NULL`. A maintainer cannot
  edit or delete a `NULL` block (an admin or account manager still can).

**`Blocks` policies.** The four `rbac_*` policies (`20260513153019`) stay as they are, so
admin / account manager / viewer behave exactly as before. Permissive policies are OR-ed, so
the maintainer rules are added beside them, not inside them.

- `rbac_select`: add `maintainer` to the role list (`ALTER POLICY`).
- `blocks_maintainer_insert` — `WITH CHECK`: maintainer **and**
  `created_by_user_uuid = get_current_user_uuid()`.
- `blocks_maintainer_update` — `USING` and `WITH CHECK`: maintainer **and**
  `created_by_user_uuid = get_current_user_uuid()`. `WITH CHECK` stops a maintainer handing
  their note to another user.
- `blocks_maintainer_delete` — `USING`: maintainer **and**
  `created_by_user_uuid = get_current_user_uuid()`.
- A `NULL` author never equals the caller, so `NULL` blocks are refused for the maintainer.

**`DashboardFilterSettings`:** three policies for `maintainer`, all limited to the user's own
row (`user_uuid = get_current_user_uuid()`): select, insert and update. The viewer's
(`20260602200000`) are insert and update only, because `rbac_select` already lists the viewer;
it does not list the maintainer, and the PowerSync upload is an upsert, which has to see the
row. Without them the dashboard's first-visit insert is refused, PowerSync drops the row on the
next pull, and the client re-inserts in a loop.

**Reads (A only):** add `maintainer` to the `select` policy of `Events`, `BleacherEvents`,
`WorkTrackers`, `Drivers`, `HomeBases`, `StorageLocations`, `SubrentalEvents`,
`DriverUnavailability`. PowerSync reads do not go through RLS, but the dashboard also reads
some of these with the Supabase client (`events.ts`, `db.ts`, `loadSubrentalEventById.ts`),
and an RLS refusal there is an empty result, not an error. Policy names are taken from the
latest definition in `supabase/migrations`, not from the local database, which lags.
`DriverUnavailability` gets `maintainer` only (`{admin,account_manager,maintainer}`): a viewer
cannot read it through the database today, and this change does not widen that.
Writes to those tables stay admin / account manager.

### 3.2 PowerSync

- **`AppSchema.ts`:** add `created_by_user_uuid: column.text` to `BlocksCols`. After
  `npm run gtl` the existing `satisfies PowerSyncColsFor<"Blocks">` fails to compile without it.
- **`usePsBlocks.ts`:** select the new column.
- **`database.types.ts`:** the `Blocks` row, insert, update and foreign key, as `npm run gtl`
  would write them. `gtl` was not run: the local database is behind the repo's migrations
  (it has no `Accountants` table), so a regeneration would delete the Accountant types.
- **Sync rules** (`br_powersync/config/sync_rules.yaml`, web stream — a separate repo):
  - `Blocks` for maintainers, always. The query is `SELECT "Blocks".*`, so the new column
    syncs with no further change.
  - **A only:** `Events`, `BleacherEvents`, `WorkTrackers`, `Drivers`, `HomeBases`, `Zones`,
    `StorageLocations`, `SubrentalEvents`, `DriverUnavailability`.
  - Already synced to a maintainer, so unchanged: `Bleachers`, `Addresses`, `Users`,
    `MaintenanceEvents`, `BleacherMaintEvents`, `DamageReports`. `DashboardFilterSettings` is
    already synced to everyone (own row). The implementation re-checks this list against the
    `usePs*` hooks the grid mounts.

### 3.3 App

**Carrying the author to the editor.**

- `BleacherBlock` (the type the grid's `blocks` uses) and `DashboardBlock` get
  `createdByUserUuid: string | null`, filled in `useDashboardPowerSync.ts`.
- `MainGridCellRenderer.handleLoadBlock` copies it into `useSelectedBlockStore`.
- `SelectedBlockState` gets `createdByUserUuid: string | null` (reset to `null`).

**Access.**

- `accessConfig.ts`: add `/dashboard` to the maintainer's `allowedPaths`. A maintainer-only
  user now lands on `/dashboard`, because `defaultRedirect` prefers it — the same rule every
  other role follows.
- `useSidebarItems.ts`: add `dashboard` to the maintainer's `ROLE_SIDEBAR_KEYS`.
- `usePermissionsStore.ts`: add `isMaintainer`; `SignedInComponents.tsx` sets it from the
  roles, next to `isAdmin` and `isAccountManager`. `userId` (`Users.id`) is already there.

**`canEditCell.ts`.** Three new optional params (defaults keep existing callers compiling).
A user holding several roles gets the union of the rules.

- Admin: true, as before.
- Account manager: zone rule, as before.
- Maintainer: true when the cell has a bleacher **and** either the cell has no block, or the
  block's author equals `currentUserUuid`. Never limited to a zone. A `NULL` author is false.

**`CellEditor.tsx`.** Passes `isMaintainer`, `currentUserUuid` (`perms.userId`) and the open
block's author to `canEditCell`. The textarea and the Save / Delete buttons already follow
`canEditCell`.

- The Work Tracker, Create Event, Maintenance and Sub-Rental toolbar stays hidden:
  `isViewer = !isAdmin && !isAccountManager` still holds for a maintainer.
- A maintainer on a block they do not own sees the text read-only, no Save, no Delete — the
  same view a Viewer has. No new message is added.

**`saveBlock` / `deleteBlock`: not touched.** They write straight through the Supabase client,
so a refused write shows an error toast at once instead of vanishing in the PowerSync upload
queue. `saveBlock` does not send `created_by_user_uuid`; the column default fills it.

### 3.4 Permissions page (`permissionPageData.ts`, same commit)

- **Dashboard Cells** → maintainer becomes `custom`: can add a note to any empty cell, and
  edit or delete only the notes they wrote themselves; notes written by anyone else, or before
  this rule existed, are read-only; cannot create events, work trackers, maintenance or
  sub-rentals from a cell.
- `ROLE_DESCRIPTIONS.maintainer`: drop "Sees nothing else on the dashboard".
- **A only:** **Events** and **Work Trackers** become `read` for the maintainer, with a note
  that it is what the Dashboard shows — they still have no Quotes & Bookings or Work Trackers
  page.
- Every other entry keeps `none`; the shared "Maintainers work on annual inspections and
  nothing else…" note is reworded where it now says something untrue.

## 4. Types that are locked

```ts
// Supabase: Blocks
created_by_user_uuid uuid null references "Users"(id) default public.get_current_user_uuid()

// AppSchema.ts — BlocksCols
created_by_user_uuid: column.text,

// features/dashboard/types.ts
BleacherBlock.createdByUserUuid: string | null;
DashboardBlock.createdByUserUuid: string | null;

// useSelectedBlock.ts — SelectedBlockState
createdByUserUuid: string | null;

// usePermissionsStore.ts — PermissionsState
isMaintainer: boolean;

// canEditCell.ts — new optional params
isMaintainer?: boolean;                                   // default false
currentUserUuid?: string | null;                          // default null
block?: { createdByUserUuid: string | null } | null;      // null = the cell is empty
```

No new table, no new `WebRole`. `EditBlock`, `saveBlock` and `deleteBlock` signatures are
unchanged.

## 5. Scenarios (what the maintainer must be able to do; see Tests for how each is checked)

- A maintainer opens `/dashboard`, clicks an empty cell, types, presses Save → the note is on
  the cell, and an account manager in a second browser sees it.
- The same maintainer reopens that cell, edits the text, saves → the new text shows. Deletes
  it → the cell is empty.
- A maintainer opens a cell holding a note written by an account manager (or by another
  maintainer): the textarea is read-only, with no Save and no Delete.
- A maintainer opens a cell holding an old note (no author): read-only, no Save, no Delete.
- A maintainer opens a cell: the toolbar shows no Work Tracker / Create Event / Maintenance /
  Sub-Rental buttons.
- An admin edits a maintainer's note → saved; the maintainer can still edit it afterwards
  (the author does not change).
- A viewer opens the same cell: textarea read-only, no Save, no Delete (unchanged).
- A maintainer opens an event on the grid: the form is read-only, as for a Viewer
  (`canEdit` there requires `canCreateUser`, which stays admin / account manager only). **A only.**

## 6. Edge cases and errors

- **The UI is a convenience, the database is the rule.** A maintainer who bypasses the UI and
  calls the API on someone else's block gets an RLS refusal: an update or delete matches zero
  rows. The toast path in `saveBlock` / `deleteBlock` stays as it is.
- **Offline:** `Blocks` writes are online-only (Supabase client). Offline, Save shows the
  existing "Failed to insert/update block" toast; nothing is lost silently.
- **Clerk / session expiry:** unchanged — the Supabase client's JWT refresh and the existing
  error toast apply.
- **Role revoked or user deactivated while the page is open:** `get_user_roles()` returns no
  maintainer, RLS refuses the next write, the toast shows the database message. Sync stops
  for the user on the next reconnect. Their old notes stay and become read-only for them.
- **Admin or account manager who is also a maintainer:** the policies are permissive, so the
  union of rights applies; nothing narrows.
- **One note per cell.** The grid shows the first block it finds for a cell, and the database
  has no `unique (bleacher_uuid, date)`. So if another person's note is already in a cell, a
  maintainer cannot add a second one there — they see the existing note read-only. Two people
  saving into an empty cell at the same moment can still create two blocks. Accepted; not made
  worse by this change.
- **Author column in a stale client:** a client that has not synced the new column yet reads
  `createdByUserUuid` as `undefined`, which `canEditCell` treats as "not mine" (read-only).
- **"Only show my events":** defaults to on for every new settings row, so a maintainer sees
  no events until they switch it off — the same as a Viewer (A only).
- **Alert badges** on the grid are not synced to maintainers today and stay empty.

## 7. Tests

- **SQL** (`supabase/tests/maintainer_dashboard_cells.test.sql`, via docker psql in a
  rollback): as a maintainer — can read every block; can insert a block (author is filled in
  as themselves); **cannot** insert with another user as author; can update and delete their
  own block; **cannot** update or delete another user's block or a `NULL`-author block;
  **cannot** update their block to a different author; can insert / update only their own
  `DashboardFilterSettings` row; **cannot** insert, update or delete `Events`, `WorkTrackers`,
  `Drivers`. As admin and account manager: the existing write rights are intact. Mutation run:
  loosen a policy and confirm the test goes red.
- **Vitest:** `canEditCell` (maintainer: empty cell true; own block true; other's block false;
  `NULL` author false; no user uuid false; any zone; admin and AM unchanged; maintainer + AM
  union; Viewer still false), `accessConfig.test.ts` (maintainer allows `/dashboard`, lands
  there), `useSidebarItems.test.ts` (maintainer sees `dashboard`; the old "no dashboard" case
  is rewritten), `permissionPageData.test.ts`.
- **Playwright:** the `maintainer` project exists but only joins the run once
  `E2E_MAINTAINER_EMAIL` is configured, and you asked me not to run e2e locally — so it is
  reported as SKIPPED. The one stale assertion is fixed: `damage-repairs.maintainer.spec.ts`
  said a maintainer cannot open `/dashboard`; it now says they can, and that `/quotes-bookings`
  sends them back to `/dashboard`. The cell scenarios in section 5 are **not** automated in a
  browser: the grid is a PixiJS canvas with no click hook, and a test aimed at pixel
  coordinates would be brittle and could not be run here. The rule is covered where it lives —
  the SQL test (database) and the `canEditCell` unit tests (the editor).

## 8. Deploy order

Migration and sync rules first, together, then the app.

- A maintainer shown the dashboard before the sync rules reach them sees an empty grid.
- One shown Save before the policies exist gets an error toast.
- The app reads `created_by_user_uuid`, so the migration must also precede it.

## 9. Not part of this change

- The cell toolbar for maintainers (e.g. a Maintenance shortcut) — not asked for.
- Moving `saveBlock` / `deleteBlock` onto PowerSync. They are online-only today; changing that
  would turn a visible RLS error into a silent drop.
- Treating a maintainer's bleachers as "accessible" on the grid. That flag only dims the
  rendering for roles without zone ownership, and a maintainer is dimmed like a Viewer.
- Restricting admins or account managers to their own blocks. Their rules do not change.
- Guessing the author of existing blocks. They stay `NULL`.
