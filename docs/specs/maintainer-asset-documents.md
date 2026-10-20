# Maintainer: Assets — fix bleacher saving, open the Documents tab

Status: **written 2026-10-20; implemented in the same session on your instruction** ("write the spec and implement it"). The one scope decision was yours: Documents = view + edit + create, no delete.
Builds on [maintainer-role.md](maintainer-role.md) and the commit `358b9800` (maintainer adds and edits bleachers).

## 1. What this changes

The maintainer keeps the driver-app documentation up to date. Two things stop them today:

1. **Saving a bleacher fails.** Opening `/assets/bleachers?edit=624` and saving shows two errors:
   `PUT on BleacherTypes … 42501 new row violates row-level security policy` and then
   `PATCH on Bleachers … 23503 violates foreign key "Bleachers_bleacher_type_uuid_fkey"`.
   Creating a bleacher fails the same way.
2. **The Documents tab (`/assets/documents`) is empty for them.** The table behind it, `BlueBook`, is neither synced to a maintainer nor readable by one under RLS, and the Add button is admin-only.

After this change:

| Where                 | Maintainer can                                                |
| --------------------- | ------------------------------------------------------------- |
| Assets › Bleachers    | add, edit, soft-delete, restore (unchanged intent, now works) |
| Assets › Documents    | see all, edit any, add new. **Not delete.**                   |
| Assets › Other Assets | unchanged (admin-only controls)                               |

## 2. Root cause of the bleacher failure

Two separate defects; the second hides behind the first.

**A. `BleacherTypes` is not synced to a maintainer.** Saving a bleacher calls `findOrCreateBleacherType(rows)` (`src/app/assets/bleachers/_lib/db.ts`), which looks the type up in the **local** database. A maintainer has no local `BleacherTypes`, so it never finds "4 Row" and tries to create a duplicate every time.

**B. The create is refused.** `BackendConnector` uploads a PowerSync `PUT` as `table.upsert(...)`, i.e. `INSERT … ON CONFLICT DO UPDATE`. Postgres requires the **SELECT** policy to pass for such a row as well as INSERT. `bleacher_types_select` does not list `maintainer`, so the insert is rejected with 42501. PowerSync classifies that as fatal and drops the upload, and the bleacher `PATCH` that points at the never-created type then fails the foreign key.

Verified on the local database, in a rolled-back transaction, as a maintainer-only user:

| Policies on `BleacherTypes` | `INSERT … ON CONFLICT DO UPDATE` |
| --------------------------- | -------------------------------- |
| today (insert only)         | **refused, 42501**               |
| insert + select             | allowed                          |
| insert + select + update    | allowed                          |
| insert + update, no select  | refused                          |

So `select` is the missing piece and `update` is **not** needed: renaming or removing a type stays admin-only.

**Why the existing test did not catch it.** `maintainer_edit_bleachers.test.sql` inserts with a plain `INSERT`, not the upsert the app really sends. The new test below uses the upsert.

## 3. Changes

### 3.1 Migration — `supabase/migrations/20261020120000_maintainer_asset_documents.sql`

```sql
-- BleacherTypes: let a maintainer read it (needed for the upsert the sync connector sends).
ALTER POLICY bleacher_types_select ON public."BleacherTypes"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant,maintainer}'::text[]);

-- BlueBook: read, add, edit. NOT delete (rbac_delete is left exactly as it is).
ALTER POLICY rbac_select ON public."BlueBook"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."BlueBook"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."BlueBook"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
```

Storage is already open: the `documents` bucket's select/insert policies allow any authenticated user, so a maintainer can upload the PDF with no change. Same for `bleacher-nvis`.

### 3.2 Sync rules — `../br_powersync/config/sync_rules.yaml`, web stream

Two queries added to the maintainer block, copied from the neighbouring ones:

- `BleacherTypes` — fixes defect A.
- `BlueBook` — the Documents tab.

`StorageLocations`, `Zones` and `Bleachers` are already synced to a maintainer, so the bleacher form needs nothing else. Bucket check per the PowerSync bucket-check note: both are plain `JOIN "Maintainers"` rows like the existing ones, one bucket each.

### 3.3 App

New `src/features/userAccess/logic/canEditDocuments.ts`:

```ts
canAddDocuments({ isAdmin, isMaintainer }): boolean          // admin || maintainer
canDeleteDocuments({ isAdmin, isAccountManager }): boolean   // admin || account_manager
```

- `src/app/assets/layout.tsx` — the Documents tab shows `SheetAddDocumentEntry` when `canAddDocuments`.
- `src/app/assets/documents/page.tsx` — the **Delete** button shows only when `canDeleteDocuments`. Edit stays visible to everyone who reaches the page, as today.
- `canDeleteDocuments` lists `account_manager` on purpose: the database already lets them delete (`rbac_delete`), the button is already shown to them, and this change must not take it away. A maintainer who is also an account manager keeps it; a maintainer-only user does not see it.

### 3.4 `/permissions` — `permissionPageData.ts`

- New entry **"Driver App Documents"** (category Configuration): admin full; account manager custom (can edit and delete existing documents, no Add button); maintainer custom (view, add, edit, no delete); viewer, developer, driver, accountant none.
- The maintainer note on the existing **Bleachers** entry says Documents "stay Administrator-only"; rewritten to point at the new entry.
- The maintainer role description gains "and keep the driver-app documents up to date".

## 4. Tests

Written first (red), then the migration (green).

- **SQL** `supabase/tests/maintainer_asset_documents.test.sql`, run via docker psql in a rollback:
  - a maintainer's `INSERT … ON CONFLICT DO UPDATE` into `BleacherTypes` is accepted;
  - a maintainer still cannot rename or delete a bleacher type;
  - a maintainer can select, insert (plain and upsert) and update `BlueBook`;
  - a maintainer cannot delete a `BlueBook` row (row still there afterwards);
  - a viewer can neither read nor write `BlueBook`.
- **Vitest** `canEditDocuments.test.ts`: all role combinations for both helpers; `permissionPageData.test.ts` keeps passing with the new entry.
- **Playwright** `src/features/manageTeam/e2e/asset-documents.maintainer.spec.ts`: written, **not run** (you asked me not to run e2e locally).

## 5. Edge cases

- **Deploy order:** migration first, then sync rules, then the app. If the app goes first, a maintainer sees buttons the database refuses and the write is silently dropped with an error toast.
- **Already-signed-in maintainer:** PowerSync streams the two new tables on the next sync; the Documents tab fills in without a reload. Until then it shows the existing "No entries yet" message.
- **A new row count:** if a maintainer saves a bleacher with a row count nobody has used, the type is created by upsert — now permitted by `select` + `insert`.
- **Offline:** unchanged; writes queue locally and upload later. A refused write is still dropped by PowerSync, which is why the policies must be in place first.
- **Deleted/inactive user:** `get_user_roles()` already returns `{}`; nothing changes.

## 6. Found on the way, not part of this change

- An **account manager** can already edit and delete documents (RLS and UI), although the permissions page calls the Assets area "view only" for them. Not touched; the new entry states what is true today.
- Any table a maintainer can insert into but not read fails the same way, because every PowerSync `PUT` is an upsert. I checked only the bleacher form, not every maintainer write path.

## 7. Out of scope

- Soft-delete for `BlueBook`; a maintainer deleting documents.
- The Other Assets tab.
- Any change to what an account manager can do.
