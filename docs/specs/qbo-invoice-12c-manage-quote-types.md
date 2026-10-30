# QuickBooks invoice — adding, renaming and deleting quote types

Status: **Implemented 2026-10-26 (approved in chat).** 0 open decisions; five readings to confirm
(§1, last paragraph). Added after [12a](qbo-invoice-12a-quote-types-page.md) was implemented, at the
user's request. Implementation order: **12c**, after 12a. Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [12a](qbo-invoice-12a-quote-types-page.md) (the page). **Amends 12a**, which left the types
themselves out (its §0, §4 matrix row and §10).

## 0. The request, and what it is not

On the Quote Types page an administrator can also **create**, **rename** and **delete** quote types
(the `EventTypes` rows), not only assign each one its Product/Service. Until now the three types
(City, Corporate, Rural) existed only because a migration inserted them, and the only way to add
Sale was by hand in the database.

**Not part of this spec:** the Product/Service assignment (12a, 12b); the prices of a type (set in the
Pricing Matrix as today); restoring a deleted type; reordering types; any change to the database.

## 1. Decisions (all taken by the user)

**Question — who may create, rename and delete quote types**

- **Option A — admin only** (what the database allows today). **Option B — admin and accountant**
  (needs a migration that widens the `EventTypes` write policies).
- **User's answer: A — admin only.** The accountant still assigns Products/Services (12a) but does not
  see the controls of this spec.

**Question — what "delete" does**

- **Option A — soft delete (`deleted = true`), no restore.** **Option B — soft delete, with Show
  deleted and Restore.** **Option C — refuse to delete a type that is in use; soft delete the rest,
  no restore.**
- **User's answer: C — a type that is already used cannot be deleted.**

**Question — renaming a type that quotes already use**

- **Option A — any type.** **Option B — only a type no quote uses.**
- **User's answer: A — any type.**

**Question — a name that equals another type's name**

- **Option A — refuse it in the app.** **Option B — do not check.**
- **User's answer: B — do not check** (the table has no unique name; the local database already holds
  City, Corporate and Rural twice).

**From the user's own words (not options):**

- The Quote Types page gets create, edit and delete of event types.

**Readings to confirm at review.**

- **"Used" means** at least one `Events` row (deleted or not: a deleted quote can be restored and still
  holds the type) or at least one `Prices` row that is not deleted, with that `event_type_uuid`. The
  check reads the device's local database, so it is a guard for the person pressing Delete, not for the
  data: a soft-deleted type breaks no reference (quotes and prices keep pointing at it), so a stale
  answer does no harm.
- **The writes go through PowerSync** (`db` and `typedExecute`), as the rest of the app's data does:
  `EventTypes` is already in `AppSchema.ts` and synced to the admin. The controls are drawn only for an
  admin, because a write the database refuses (`42501`) is dropped from PowerSync's upload queue in
  silence.
- **The accountant's level on the Quote Types matrix row becomes `custom`** (it was `full`): they assign
  Products/Services but cannot add, rename or delete a type.
- **The controls are:** an **Add quote type** button in the page header that opens a name field on the
  page; a **Rename** and a **Delete** button on each card; Delete asks for confirmation first. Names are
  trimmed and must not be blank.
- **A new type starts with no prices and no assignments.** It is offered in the quote form at once, shows
  as an empty row in the Pricing Matrix, and cannot be invoiced until it is assigned a Product/Service
  (12b).

## 2. Research findings

- **The table.** `EventTypes`: `id`, `name`, `deleted`, `created_by_user_uuid` (database default
  `get_current_user_uuid()`), `created_at`. No unique name, no trigger. Policies: select for admin,
  account manager, viewer and accountant; insert, update and delete for admin only.
- **The references.** `Events.event_type_uuid` and `Prices.event_type_uuid` (no cascade, so a row cannot
  be hard-deleted while they point at it); `EventTypeQboServices.event_type_uuid` (cascade). Every
  seeded type has 40 prices.
- **Who reads the types.** The quote form (`useEventTypes`, not deleted), the Pricing Matrix
  (`useEventTypesActive`, not deleted, one row per type and currency), `useEventTypeName` (also
  deleted ones, so an old quote still shows its type) and the invoice loader. All read the local
  PowerSync table or the type's id.
- **The page** (`app/qbo-quote-types/page.tsx`, 12a) lists `useEventTypes()` and keeps its state in
  `useState`; the controls of this spec are added to it.
- **The permissions store** (`usePermissionsStore`) holds `roles` and the signed-in user's `userId`
  (the `Users.id`); the page reads both.
- **Other PowerSync writes** (`typedExecute`, `db.insertInto(...)` with `crypto.randomUUID()` and an ISO
  `created_at`) are in `app/roadmap/_lib/db`. The Pricing Matrix saves its prices through the Supabase
  client instead; this spec follows the rule of `CLAUDE.md`, not that precedent.

## 3. Database

None.

## 4. App changes

- **`quotesAndBookings/db/eventTypes.ts`** (new): four functions, all through `db` and
  `typedExecute` / `typedGetAll`.
  - `createEventType(name, createdByUserUuid)` — trims the name and throws "Enter a name for the quote
    type." when it is blank; inserts `{ id: crypto.randomUUID(), name, deleted: 0, created_at: <ISO now>,
created_by_user_uuid }`; returns the new id.
  - `renameEventType(id, name)` — the same trim and the same refusal; updates `name` of that id.
  - `isEventTypeInUse(id)` — true when `Events` has a row with that `event_type_uuid`, or `Prices` has a
    row with it and `deleted = 0` (two queries, each `limit 1`, neither a join).
  - `deleteEventType(id)` — throws "{name} is used by quotes or prices, so it cannot be deleted." when
    `isEventTypeInUse(id)` is true (the page passes the name in); otherwise sets `deleted = 1`. It never
    issues a `DELETE`.
- **`app/qbo-quote-types/page.tsx`** (changed): reads `roles` and `userId` from `usePermissionsStore`.
  For an admin only:
  - the header action **Add quote type**: a text field with **Add** and **Cancel** appears above the
    cards; Add calls `createEventType`, closes the field on success; a failure leaves it open and shows
    an error toast;
  - on each card a **Rename** button (the name becomes a text field with **Save** and **Cancel**) and a
    **Delete** button; Delete first asks `isEventTypeInUse`: in use → the error toast of
    `deleteEventType`, nothing else; free → a confirmation ("Delete quote type {name}? It disappears from
    the quote form and the Pricing Matrix.") whose **Delete** calls `deleteEventType`.
  - the empty state "No quote types." keeps the Add button for an admin.
    For everyone else the page is as 12a left it. Every failure shows `createErrorToastNoThrow` with the
    message and changes nothing on screen; the list is the reactive `useEventTypes()`, so a success
    shows by itself.
- **`permissionPageData.ts`** (changed): the **Quote Types** row —
  - description: its last sentence ("The types themselves cannot be added, renamed or removed here.")
    becomes "An administrator also adds, renames and deletes the types; a type that quotes or prices use
    cannot be deleted.";
  - administrator, still `full`: "Can add, rename and delete quote types (not one that quotes or prices
    use), and assign, change or clear the Product/Service of any quote type, per QuickBooks connection.";
  - accountant, now `custom`: "Can assign, change or clear the Product/Service of any quote type, per
    QuickBooks connection. Cannot add, rename or delete a quote type.".

## 5. Behaviour scenarios

Playwright, written, **not run**. Added to `qbo-quote-types.admin.spec.ts` and
`qbo-quote-types.accountant.spec.ts`. Types made by a scenario are removed with the service role.

- **S7** admin presses **Add quote type**, types a name and presses **Add**: the card appears; after a
  reload it is still there.
- **S8** admin renames it: the new name shows after a reload.
- **S9** admin deletes it (a type no quote or price uses): after confirming, the card is gone, also
  after a reload.
- **S10** admin presses Delete on a type that quotes and prices use (City): the error toast says it is
  used; the card stays and no confirmation is shown.
- **S11** admin adds a blank name: the error toast, nothing added.
- **S12** accountant: the page has no Add, Rename or Delete control; assigning a Product/Service works
  as in 12a.

## 6. Files

**Counted — 3 files** (limit 10):

1. `src/features/quotesAndBookings/db/eventTypes.ts` — new
2. `src/app/qbo-quote-types/page.tsx` — changed
3. `src/features/userAccess/permissionPageData.ts` — changed

**Not counted:** `eventTypes.test.ts` (new); `page.test.tsx`, `permissionPageData.test.ts` (edited); the
two Playwright files of §5 (edited). No migration, no `database.types.ts`, no `AppSchema.ts`, no
`sync_rules.yaml`, no `package.json`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`eventTypes.test.ts`** (`db` and the typed helpers replaced by fakes that record the compiled SQL and
  its parameters):
  - `createEventType` inserts one `EventTypes` row with a new uuid, the trimmed name, `deleted` 0, an ISO
    `created_at` and the given creator, and returns the id; a blank or whitespace-only name throws and
    inserts nothing.
  - `renameEventType` updates only `name`, only that id, with the trimmed name; a blank name throws and
    updates nothing.
  - `isEventTypeInUse` is true for a type an event uses (a deleted event too), true for one a
    non-deleted price uses, false for one only a deleted price uses, false for an unused one; it runs
    two `limit 1` queries and joins nothing.
  - `deleteEventType` on a type in use throws the message and writes nothing; on a free type sets
    `deleted` to 1 for that id only and issues no `DELETE`.
- **`page.test.tsx`:** an admin sees Add quote type and Rename and Delete on each card; an accountant
  (roles without `admin`) sees none of them and still sees the pickers; Add creates through
  `createEventType` with the typed name and the store's `userId` and closes the field; a failed create
  keeps the field open and shows the toast; Rename saves the new name; Delete on a used type shows the
  toast and no confirmation; Delete on a free type asks, then deletes only after the confirmation;
  Cancel does nothing.
- **`permissionPageData.test.ts`:** the Quote Types row's description, administrator note and
  accountant note are the texts of §4; the accountant's level is `custom`, every other role's level is
  as 12a; the granted-list test is unchanged.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED (not
  run locally, by instruction).

## 8. Edge cases and error handling

- **Offline.** A create, rename or delete is written to the local database and uploaded when the
  connection returns; the list shows it at once.
- **A write the database refuses** (a lost admin role): PowerSync drops it from the upload queue in
  silence (§1, second reading). The controls are drawn for an admin only, so this is not an expected
  path.
- **Two admins at once.** Rename: the last write wins. Delete races a quote created with the type
  moments earlier: the type stays on that quote, harmlessly.
- **A deleted type's assignments** stay in `EventTypeQboServices` and keep working for the quotes that
  still hold the type.
- **A type deleted before it was assigned** can have no quote (Delete refuses a used type), so 12a's R3
  no longer happens for types deleted from now on.
- **The duplicates already in the local database** are not touched, and a new duplicate name is allowed
  (§1).
- **Clerk.** Page access is `accessConfig.ts` (12a); the controls are drawn by role; the database's
  admin-only policies are the lock.

## 9. Risks

- **R1 — a new type is offered in the quote form before it has prices.** The Pricing Matrix shows it as
  an empty row; until prices are entered there, a quote of that type gets none from the matrix.
- **R2 — the "in use" check reads the device's data.** An admin whose device has not yet synced a quote
  made elsewhere can delete a type that quote holds; nothing breaks (§1, first reading).
- **R3 — renaming a type changes its name on every quote that holds it,** wherever the name is shown;
  the quotes' Log keeps the old names it recorded.
- **R4 — a name equal to another type's** (allowed) makes two cards that look the same on this page and
  two entries in the quote form.

## 10. Out of scope

- Restoring a deleted type; a Show deleted toggle.
- A check for duplicate names, or a unique index on `EventTypes.name`.
- Copying another type's prices to a new type.
- Reordering types, or any field of a type but its name.
- Letting the accountant add, rename or delete types.
