# Accountant — the Team page: sees every user, edits a driver's payment info and vendor

Status: **IMPLEMENTED 2026-10-07, awaiting review** (approved the same day) — 0 open decisions
(D1–D9 answered by the user). Not checked by hand in a browser (Clerk sign-in is unavailable here);
Playwright specs written, not run; the migration and the sync rules are applied to no database but the
local one, and the migration only inside a rolled-back transaction. What differs from the text below
is in §13; the types, the schema and the contracts are as approved.
Original request (user, 2026-10-06): "for users with the accountant role give access to the
`/team` page. They can see all users. They cannot edit or create anyone, but they can edit
drivers — that is, profiles / payment info / vendors and stuff."
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md) (the role),
[accountant-work-trackers.md](accountant-work-trackers.md) (it reads Drivers, Vendors, Users and
Addresses; its D1 hid the "Edit Profile" button because there was no `/team`; its D4 limits direct
reads of `Users` to drivers), [accountant-address-book.md](accountant-address-book.md) (the latest
grant, same shape as this one).

## 0. The request, and what it is not

**The accountant** gets `/team` and a **Team** entry in the sidebar.

- **Sees every user** in the lists (Admins, Account Managers, Drivers, Developers, Maintainers,
  Accountants, Viewers, the "incomplete" alert), with the search box and "Show Inactive".
- **Opens only a driver.** Rows of every other user are not clickable (D5).
- **On a driver** it edits, and nothing else (D1, D2, D3, D6):
  - **payment info:** currency, per-unit, tax, rate and its tiers, deadhead, setup, teardown;
  - **vendor:** the vendor company of the driver, and the Employee / Contractor switch that goes
    with it.
- **It sees, without changing:** the driver's first and last name, email, zones, phone, home
  address, vehicle and documents with their expiry dates.
- **Vendor companies** (D4): it can pick, create, edit and delete (hide) one, **and** set a vendor's
  QuickBooks connection and QuickBooks vendor.
- A deactivated driver (shown with "Show Inactive") is edited like an active one (D8).

**The accountant can NOT — a rule, not an omission:**

- add, edit or deactivate any team member, or change anyone's roles (no "+ Add Team Member", no
  "+ Add Role", no role "×", no Active / Inactive buttons);
- change a driver's name, email, zones, phone, address, vehicle or documents;
- open the profile page of anyone who is not a driver.

**Roles are additive.** An admin keeps everything. An account manager keeps what the role gives.
Someone who is **both account manager and accountant** gets both sets on a driver outside the zones
of their account-manager role: add the driver to their zones **and** edit payment info and vendor
(D9).

**Not part of this spec, so not changed:**

- what any other role can do on the Team page or on any table;
- `/team/new`: it behaves for the accountant exactly as it does for a viewer today — the form
  opens, there is no Save button, the database refuses the insert (D7). No code;
- `users_accountant_select` (direct reads of `Users` stay "drivers only") and what is synced for
  `Users` — see §2;
- `AppSchema.ts`, `database.types.ts`: no table or column is added or changed.

**To confirm at review (my reading of your words):**

- **C1.** "Not clickable for a user who is not a driver" is read as **rows of the Drivers list only**
  are clickable. A person who is both an admin and a driver is opened from the Drivers list; their row
  in the Admins list is not clickable. (The Admin and Viewer rows know `isDriver`, the other lists do
  not, so reading it per user would mean changing four more queries.)
- **C2.** "Payment info" is the pay block of the "Manager Setup" section: currency, per-unit, tax, the
  rate with its tiers, deadhead, setup and teardown. The Employee / Contractor switch is part of
  "vendor".
- **C3.** "Profiles", in the original request, is the "Driver Setup" section (phone, home address,
  vehicle, documents). D1 left it out of what is editable; D6 shows it read-only.
- **C4.** "They can see all users" is satisfied by what is already synced; nothing is added for it
  (§2).
- **C5.** The accountant's own row in `Drivers`, if it is also a driver, is not fenced by the column
  guard of §3 (the driver's own policy governs it, unchanged).
- **C6.** The "Edit Profile" button in the Work Tracker Group modal, which
  [accountant-work-trackers.md](accountant-work-trackers.md) D1 decided to hide, appears for the
  accountant by itself, because it is shown whenever the roles can reach `/team` (§2). It opens the
  driver page of §6.
- **C7.** The matrix gets no new "Vendors" row: the vendor rights of the accountant are written in
  the "Edit Team Members" row and in the role description, so nothing is claimed about what other
  roles can do with vendors (§6).

## 1. Decisions (all answered)

**D1 — what the accountant edits on a driver page** (several could be picked)

- **Payment info:** currency, unit, tax, rate and tiers, deadhead, setup, teardown. Needs write on
  `Drivers` (those columns) and on `DriverPayRanges`.
- **Vendor and driver type:** the vendor company of the driver. Needs write on `Drivers.vendor_uuid`.
- **Profile:** phone, home address, vehicle. Needs write on `Drivers` and `Vehicles`; `Addresses`
  is already writable.
- **Documents:** license, insurance and medical card files and their expiry dates. The files go to a
  storage bucket any signed-in user can already write to.
- **User's answer: Payment info and Vendor and driver type.**

**D2 — the first and last name of a driver (Basic User Info)**

- **Read only:** the fields stay locked and `Users` is not touched. The email is locked for everyone.
- **Editable:** a new `UPDATE` policy on `Users` for the accountant, limited to driver rows and to
  `first_name` / `last_name`. That is more than an account manager has, because `users_update` lets
  only the user themself or an admin write, so an account manager's name edit does not take effect.
- **User's answer: read only.**

**D3 — the zones of a driver**

- **Hidden:** the Zones field is not shown to the accountant. No database or sync change.
- **Visible, not editable:** the accountant sees the zones of the driver. Needs `Zones` and
  `DriverZones` synced to the accountant (a change in `br_powersync`) and `SELECT` on `DriverZones`.
- **Editable:** the accountant adds and removes any zone of any driver. Needs a write policy on
  `DriverZones`, the same sync, and a new zone selector (today it offers only the zones of the
  signed-in account manager). The zones decide whose Work Trackers lists a driver appears in.
- **User's answer: visible, not editable.**

**D4 — vendor companies**

- **Pick only:** choose an existing vendor for a driver; the create and edit buttons are hidden.
  No change to `Vendors`.
- **Pick, create, edit, delete:** as the vendor modal works today (name, EIN, HST, logo, soft
  delete). Needs `INSERT` and `UPDATE` on `Vendors`. The QuickBooks Connection list of the modal
  stays empty, because `GET /api/quickbooks/connections` is admin-only.
- **The same, plus the QuickBooks link:** also the QuickBooks connection and QuickBooks vendor of a
  vendor. Needs `GET /api/quickbooks/connections` opened to the accountant (the other methods of
  that route stay admin-only).
- **User's answer: the same, plus the QuickBooks link.**

**D5 — a click on a user who is not a driver**

- **The row is not clickable:** only the list is visible. The profile page opens for drivers only.
  `users_accountant_select` stays "drivers only".
- **Basic User Info, read-only, as a viewer has it:** needs `users_accountant_select` widened to the
  whole table (it undoes the D4 decision of
  [accountant-work-trackers.md](accountant-work-trackers.md)).
- **The full role page, read-only:** also needs `SELECT` on `AccountManagers`, `AccountManagerZones`,
  `Developers`, `Maintainers` and `Accountants`.
- **User's answer: the row is not clickable.**

**D6 — the "Driver Setup" block (phone, address, vehicle, documents)**

- **Shown, read-only:** needs `SELECT` on `Vehicles` (today only admin and account manager have it;
  without it the vehicle fields would show empty).
- **Hidden:** the block is not shown to the accountant. `Vehicles` is not changed.
- **User's answer: shown, read-only.**

**D7 — `/team/new` for the accountant**

- **Redirect to `/team`:** a new check in the layout, which also changes the viewer.
- **Leave it as the viewer has it:** the form opens, there is no Save button, the database blocks
  `Users` inserts for anyone but an admin or an account manager (`users_insert`). No code.
- **User's answer: leave it as the viewer has it.**

**D8 — a deactivated driver (`Users.status` = Inactive, shown with "Show Inactive")**

- **Editable without restriction:** edited the same way as an active driver. No extra logic.
- **Read-only:** a status check in the UI and in the column guard.
- **User's answer: editable without restriction.**

**D9 — a person who is both account manager and accountant, on a driver outside their zones**

The account-manager rule gives them only "add the driver to my zones"; the accountant rule gives
them the payment info and the vendor.

- **Both sets of rights:** a combined access level; the form saves through the same function an
  account manager uses. Roles add, nothing is taken away.
- **Only the account-manager rule:** they edit zones only; a plain accountant would edit more than
  they do.
- **Only the accountant rule:** they edit payment info and vendor but cannot add a zone; a plain
  account manager would edit more than they do.
- **User's answer: both sets of rights.**

## 2. Research findings

**Access today.** `accountant.allowedPaths` is `/accountant, /quotes-bookings, /work-trackers,
/messages, /companies-contacts, /permissions, /changelog` (`accessConfig.ts`). The path check is a
prefix match, so `"/team"` also opens `/team/new` and `/team/<uuid>/edit/...`. The sidebar entry is
`team`, in `ALL_ITEMS` between Quotes & Bookings and Assets; the accountant has no `team` key
(`ROLE_SIDEBAR_KEYS`).

**The lists read through PowerSync, and the accountant already has the data.** `sync_rules.yaml`
gives the accountant the whole `Users` table (comment: "as for account managers, viewers and
maintainers"; D4 of the work-trackers spec), `Drivers`, `Vendors` and `Addresses`; and gives **every**
active web user the whole `AccountManagers`, `Developers`, `Maintainers` and `Accountants` tables
(lines 23–26: the `JOIN "Users"` there only keys the bucket to the signed-in user). The Admin,
Account Manager, Developer, Maintainer, Accountant, Viewer and Drivers lists read only those tables,
so they should work for the accountant **with no sync change**. (Read from the YAML; not run in a
browser.) Not synced to the accountant, on purpose until now: `Zones`, `DriverZones`,
`AccountManagerZones` ("an accountant has no zones"), `DriverPayRanges`, `Vehicles`.

**The driver page reads and writes directly through Supabase (online), not PowerSync.**
`fetchUserById` reads `Users`, `Drivers` (+ `Addresses`, `Vehicles`), `DriverZones`,
`DriverPayRanges` and the role tables under row-level security. `updateUser` writes `Users`,
`Drivers`, `DriverPayRanges`, `DriverZones`, `Addresses`, `Vehicles` and every role table in one
function. The vendor modal, in contrast, writes `Vendors` through PowerSync (`typedExecute`); its
"delete" is `UPDATE Vendors SET is_active = 0`.

**What the database gives the accountant today** (local DB, 2026-10-06, `pg_policies`):

- **`Drivers`:** `SELECT` (`drivers_select`); no `UPDATE`, `INSERT` or `DELETE`.
- **`Users`:** `SELECT` of driver rows plus its own (`users_accountant_select`); `UPDATE` only its own
  row (`users_update`: the user themself or an admin).
- **`Vendors`:** `SELECT`; no write. **`Addresses`:** read and write (address book spec).
- **`Vehicles`, `DriverPayRanges`, `DriverZones`:** nothing (`driverzones_select` is admin, account
  manager, viewer). `Zones` and `QboConnections`: `SELECT` (work-trackers spec).
- **Storage:** the buckets `driver-documents` and `vendor-logos` take reads and writes from any
  signed-in user ("Allow All for Auth"; the vendor logos bucket also has its own policies).

**RLS decides on rows, not columns.** `Drivers` has, beside the pay and vendor columns, `user_uuid`,
`account_manager_uuid`, `is_active`, phone, address, vehicle, the document columns and the app's
telemetry (`app_version`, `app_platform`, `bucket_count`, `sync_version`, …). A grant on the table
would let the accountant write all of them through the API, so the grant comes with a column guard,
the pattern of `guard_events_accountant_columns` (`20261004140000`). The `sync_driver_tax` trigger
(`BEFORE INSERT OR UPDATE`, not `SECURITY DEFINER`) writes `tax` from `tax_dec` in the same
statement, so `tax` must be on the allowed list. The two document triggers on `Drivers` are
`SECURITY DEFINER`.

**A refusal is silent for an `UPDATE`.** An update that a policy filters out raises nothing: it
matches no row. The driver page therefore must not take "no error" for "saved" (§6, §8).

**The QuickBooks routes.** `GET /api/quickbooks/connections` returns `id`, `display_name`,
`realm_id`, `qbo_tax_code_id`, `currency` — no tokens — and is guarded by `requireAdmin`; it reads
through RLS with the caller's JWT, and `QboConnections` already allows the accountant to read.
`GET /api/quickbooks/vendors` is guarded by `requireAuth` only, so the accountant can already call it.

**The "Edit Profile" button.** `WorkTrackerGroupModal` shows it when
`canAccessPath(roles, "/team")`; it goes to `/team/<uuid>/edit/driver`.

**Tests that assert the opposite today** (turned red, edited on purpose, §7): `accessConfig.test.ts`
(the exact accountant path list; "nothing else operational" lists `/team`; "keeps an accountant away
from the driver profile"), `useSidebarItems.test.ts` (the accountant's keys),
`permissionPageData.test.ts` (the exact list of rows the accountant is granted),
`roleAccess.accountant.spec.ts` (Team in the "not offered" list and `/team` in "kept out of").
`useTeamPermissions.test.ts` builds `TeamPermissions` objects by hand and gains two fields.

## 3. Database — `supabase/migrations/20261006130000_accountant_team.sql`

(After `20261006120000`; renumber if `develop` has moved.)

**`Drivers` — update, behind a column guard**

- **`ALTER POLICY drivers_update`:** `USING` and `WITH CHECK` keep the expression they have
  (admin, or account manager with the owner / null / shared-zone clauses) and gain
  `OR 'accountant' = ANY (public.get_user_roles())`.
- **New function `public.guard_drivers_accountant_columns()`** and a `BEFORE UPDATE` trigger of the
  same name on `Drivers` (every column, not `UPDATE OF …`). It returns `NEW` unchanged when:
  - `current_user <> 'authenticated'` (service role, migrations, `SECURITY DEFINER` functions);
  - the caller holds `admin` or `account_manager` (roles add; they are not fenced);
  - the caller does not hold `accountant` (every other role is decided by RLS already);
  - `OLD.user_uuid = public.get_current_user_uuid()`: the caller's own driver row, which the
    driver's own policy governs (C5; it also keeps the mobile app's updates of a driver who is also
    an accountant working).
    Otherwise it compares `to_jsonb(NEW) - allowed` with `to_jsonb(OLD) - allowed` and, if they
    differ, raises `42501` with a plain message ("An accountant can only change a driver's payment
    info, vendor and driver type"), so the PowerSync upload connector and the Supabase client both
    see a refusal.
- **`allowed`** = `tax_dec`, `tax`, `pay_rate_cents`, `pay_currency`, `pay_per_unit`,
  `deadhead_cents`, `setup_cents`, `teardown_cents`, `vendor_uuid`. Everything else — `user_uuid`,
  `account_manager_uuid`, `is_active`, `phone_number`, `address_uuid`, `vehicle_uuid`, the three
  document paths and expiry dates, the app telemetry — is refused. A column added to `Drivers`
  later is refused until someone lists it.
- **Not granted:** `drivers_insert` and `drivers_delete` stay `{admin, account_manager}`.

**`DriverPayRanges` — read and write**

- **`ALTER POLICY driver_pay_ranges_select | _insert | _update | _delete`:** each keeps its
  expression and gains `accountant` (the role list becomes `{admin, account_manager, accountant}`).
  The overlap and range check constraints of the table apply to the accountant as to anyone.

**`Vendors` — create and edit**

- **`ALTER POLICY rbac_insert`** (`WITH CHECK`) **and `rbac_update`** (`USING`) gain `accountant`.
  A delete in the app is an `UPDATE` of `is_active`, so no `DELETE` policy is touched
  (`rbac_delete` stays `{admin, account_manager}`).

**Reads only, for the driver page**

- **`ALTER POLICY rbac_select ON public."Vehicles"`** gains `accountant` (D6).
- **`ALTER POLICY driverzones_select`** gains `accountant` (D3).

**Deliberately not changed:** `Users` (`users_accountant_select`, `users_update`), `Addresses`,
`AccountManagers`, `AccountManagerZones`, `Developers`, `Maintainers`, `Accountants`, every write
policy of `DriverZones`, `Vehicles` and `Zones`, the maintainer's and the driver's policies, the
triggers on `Drivers` other than the new one.

**Deploy order: this migration → sync rules (+ PowerSync restart) → the app.** See §8.

## 4. PowerSync

- **`../br_powersync/config/sync_rules.yaml`, the accountant block:** add two queries, `Zones` and
  `DriverZones`, in the exact template of their neighbours
  (`SELECT "Zones".* FROM "Zones" JOIN "Accountants" ON "Accountants"."is_active" = true JOIN "Users"
ON "Accountants"."user_uuid" = "Users"."id" WHERE connection.parameter('app') = 'web' AND
"Users"."clerk_user_id" = auth.user_id() AND "Users"."status_uuid" != '7b65d5…'`). Whole rows, `*`,
  and **no join to the returned row**, so they merge into the existing shared bucket. The comment
  "Deliberately not synced: Zones, DriverZones, AccountManagerZones" is reworded: `AccountManagerZones`
  stays unsynced.
- **Gate:** compile the file with the service's own library and count the parameterised web buckets
  (baseline 2: the own `Users` row and the own `DashboardFilterSettings`); the count must still be 2.
- **Client:** `AppSchema.ts` already has both tables (viewers and account managers use them). No
  change.
- **Vendors:** already synced to the accountant (the whole table). Its writes go through the same
  upload connector as every other write.
- `br_powersync` is a separate repository: its change is its own commit, deployed with a service
  restart.

## 5. Server — the QuickBooks connections route

- **`src/app/api/quickbooks/connections/route.ts`:** `GET` calls a new `requireAdminOrAccountant()`
  instead of `requireAdmin()`. `POST`, `PATCH` and `DELETE` keep `requireAdmin()` (the route has no `PUT`).
- **`src/features/userAccess/logic/requireAdminOrAccountant.ts`** (new): the shape of
  `requireAdminOrAccountManager.ts` — 401 without a Clerk user, 403 unless
  `access.status === "active"` and the roles pass the check below.
- **`src/features/userAccess/logic/hasAdminOrAccountantRole.ts`** (new): a pure function
  `hasAdminOrAccountantRole(roles: WebRole[]): boolean`, `true` for `admin` or `accountant`, tested the
  way `hasAdminOrAccountManagerRole.test.ts` is.
- The data returned is unchanged (no tokens). The other consumers of this route are admin pages the
  accountant cannot open.

## 6. App changes

**Access and navigation**

- **`src/features/userAccess/accessConfig.ts`:** add `"/team"` to `accountant.allowedPaths`, after
  `"/companies-contacts"` and before `"/permissions"`; `"/accountant"` stays first, because it is the
  `defaultRedirect`. The comment above the list names this spec.
- **`src/components/sidebar/useSidebarItems.ts`:** add `"team"` to `ROLE_SIDEBAR_KEYS.accountant`. The
  item exists in `ALL_ITEMS`, so for the accountant the order becomes `quotes-bookings`, `team`,
  `accountant`, `work-trackers`, `messages`, `companies-contacts`, `documentation`.

**Types and rules — `src/features/manageTeam/hooks/useTeamPermissions.ts`**

```ts
export type TeamPermissions = {
  isAdmin: boolean;
  isAccountManager: boolean; // unchanged: holds the role and is not an admin
  isAccountant: boolean; // new: holds the role and is not an admin
  canOpenAnyProfile: boolean; // new: admin, account manager or viewer
  isMaintainer: boolean;
  userId: string | null;
  accountManagerId: string | null;
  canCreateUser: boolean; // unchanged: admin or account manager
};

export type EditAccess =
  | "full"
  | "zones-only" // account manager, driver outside their zones
  | "driver-only" // new: accountant — payment info, vendor, driver type
  | "zones-and-driver" // new: account manager and accountant, driver outside their zones (D9)
  | "read-only";
```

- **`getEditAccess`** computes what it does today (admin → `full`; account manager → `full` /
  `zones-only` / `read-only`), then, **only if the result is not `full`** and the actor
  `isAccountant` and the target `isDriver`: `zones-only` becomes `zones-and-driver`, anything else
  becomes `driver-only`. A target that is not an active driver (or is not a driver at all) stays
  `read-only` for an accountant (D5). The inactive status of the account is not looked at (D8).
- **`useTeamPermissions`** fills the two new fields from the roles; `canCreateUser` is unchanged, so
  the "+ Add Team Member" button stays hidden for an accountant.

**`src/app/team/page.tsx`** — when `!canOpenAnyProfile` (an accountant, with no admin, account manager
or viewer role), every list **except `DriverList`** (the six role lists and `IncompleteList`) is
rendered inside a small wrapper that swallows the click before a row's handler sees it
(`onClickCapture` with `stopPropagation`) and neutralises the pointer cursor and the row hover
(`[&_tbody_tr]:…` classes). Text stays selectable, so an email can be copied. The lists themselves are
not edited. This is a convenience, not a gate: the gate is `users_accountant_select` (a non-driver
row cannot be read directly) and `getEditAccess`.

**`src/features/manageTeam/components/UserFormLayout.tsx`**

- `canSave` is true for `driver-only` and `zones-and-driver` (it is `!isReadOnly` today).
- The form wrapper locks with `pointer-events-none` for `zones-only` **and** for the two new levels;
  the pages re-enable what is editable (`DriverPageContent`, below). Basic User Info and every other
  role page therefore stay locked, as they are for `zones-only`.
- Banner (the blue one of `zones-only`, same style):
  - `driver-only`: "You can edit this driver's payment info, vendor and driver type. Everything else
    is read-only."
  - `zones-and-driver`: "You can add this driver to your zones and edit their payment info, vendor
    and driver type. Everything else is read-only."
- `handleSubmit` is called with the access level: `handleSubmit(editAccess)`.
- `RoleNavigation` receives `editAccess`.

**`src/features/manageTeam/components/RoleNavigation.tsx`** — new optional prop
`editAccess?: EditAccess` (absent means `"full"`). For `driver-only` it shows exactly two tabs, "Basic User
Info" and "Driver" (a driver's other roles are not offered), with **no "×" on a tab and no "+ Add
Role"**. For every other level it renders as it does today.

**`src/features/manageTeam/components/pages/DriverPageContent.tsx`** — per block, by `useEditAccess()`
(the wrapper already blocks the pointer):

- **Zones block:** editable (`pointer-events-auto`, as `zones-only` has it) for `zones-only` and
  `zones-and-driver`; for `driver-only`, dimmed and passed `readOnly` (below).
- **Vendor, Driver Type, currency, per-unit, tax, pay track, deadhead, setup, teardown:** editable
  (`pointer-events-auto`, not dimmed) for `driver-only` and `zones-and-driver`; unchanged for the
  other levels.
- **"Driver Setup" section** (phone, home address, vehicle, documents): dimmed, and each
  `DriverDocumentCard` gets `disabled`, for `driver-only` and `zones-and-driver`.
- The vendor modal, its dropdowns and its dialogs render in portals, outside the locked wrapper, so
  they need nothing.

**`src/features/manageTeam/components/inputs/SelectDriverZones.tsx`** — new optional prop
`readOnly?: boolean`. When set, the selector offers **every** zone and shows **every** zone the driver
is in (today it filters both to the zones the signed-in account manager manages, which for an
accountant is none), and the control is `disabled`. Without the prop it behaves as today.

**`src/features/manageTeam/db/userOperations.ts`**

- **New `updateDriverPayment(supabase, state)`** →
  `Promise<{ success: boolean; error?: string }>`. It requires `state.existingUserUuid` and
  `state.isDriver`; reads the driver's `id` by `user_uuid`; updates `Drivers` with
  `driverPayFields(state)` and `vendor_uuid` **and no other column**, filtered by `user_uuid`, and
  asks for the updated row back; **zero rows back is an error** ("not saved — you may not be allowed
  to change this driver"), because a filtered update raises nothing; then calls the existing
  `syncDriverPayRanges`. It writes nothing to `Users`, `Addresses`, `Vehicles`, `DriverZones` or any
  role table.
- **`currentUserCanEditDriverRow`** (the check inside `updateUser`) also returns `true` when the
  caller holds the `accountant` role. Without it, a person who is both account manager and
  accountant on a driver outside their zones would have the pay and vendor edits skipped, because
  the check is a mirror of the old account-manager policy (D9). `updateUser` is otherwise unchanged.

**`src/features/manageTeam/hooks/useUserFormSubmit.ts`** — `handleSubmit(access?: EditAccess)`:
`driver-only` calls `updateDriverPayment`; every other level calls `updateUser`, as today (this
includes `zones-and-driver`, whose Drivers write goes through `updateUser` with the widened check).
Validation (`validateForm`: name, email, pay tiers) and the success path (toast, back to `/team`) are
unchanged.

**`src/features/userAccess/permissionPageData.ts`** (draft wording, for review):

- **Edit Team Members, accountant:** `none` → `custom`: "Sees every team member in the list but opens
  only drivers. On a driver they can change the payment info (currency, unit, tax, rates and tiers,
  deadhead, setup, teardown), the vendor company and the driver type, and can read the zones, phone,
  home address, vehicle and documents without changing them. They can also create, edit and delete
  vendor companies (a deleted vendor is hidden, not removed), including the QuickBooks connection and
  QuickBooks vendor it is linked to. They cannot change a driver's name, zones or roles, and cannot
  open anyone who is not a driver. Roles add up: someone who is also an account manager can also add
  a driver to their own zones."
- **Invite Team Members, accountant:** stays `none`; the note becomes "Can open the Team page but
  cannot add anyone."
- **Deactivate Team Members, accountant:** stays `none`; the note becomes "Can open the Team page but
  cannot deactivate anyone."
- **`ROLE_DESCRIPTIONS.accountant`:** gains "Also has the Team page: sees every team member, and edits
  a driver's payment info and vendor, and the vendor companies."
- **`ACCOUNTANT_NO_ACCESS_NOTE` and the comment above it:** the list of what the role covers gains
  "the Team page, where it edits a driver's payment info and vendor".

## 7. Behaviour scenarios (for Playwright — written, not run)

Each asserts on the **server row**, read with the service-role helper, not on the screen alone: a
refused write looks done locally. Project `accountant` (needs `E2E_ACCOUNTANT_EMAIL`).

- **S1** The sidebar offers Team; `/team` opens with its tabs; there is no "+ Add Team Member"; the
  Dashboard and Assets are still not offered.
- **S2** Every tab lists its users (Admins shows the seeded admin); search and "Show Inactive" work.
- **S3** A click on an admin's row keeps the URL on `/team`. A click on a driver's row opens
  `/team/<uuid>/edit/basic-user-info`: name and email cannot be edited, exactly two tabs are shown
  (Basic User Info, Driver), there is no "+ Add Role" and no "×".
- **S4** On the Driver tab the accountant changes the tax, the rate, the deadhead and the vendor and
  saves: those columns change in `Drivers`; every other column of the row is unchanged.
- **S5** The accountant adds a pay tier and saves: the `DriverPayRanges` row exists; removing it
  removes the row.
- **S6** The Zones field shows the driver's zones and cannot be changed; the phone, address, vehicle
  and document fields cannot be changed.
- **S7** A vendor is created, renamed and deleted from the vendor picker: the `Vendors` row exists,
  changes, and ends with `is_active = 0`. As the accountant, `GET /api/quickbooks/connections` is 200
  and `POST` is 403.
- **S8** From Work Trackers, the payment modal's "Edit Profile" opens the driver page.
- **S9** With "Show Inactive" on, a deactivated driver is edited the same way (D8).
- **S10** Account manager, admin and viewer: unchanged (the existing specs keep covering them).
- The things a browser cannot drive here — a refused column, a role combination — are asserted in the
  SQL test and in unit tests instead.

## 8. Files

**Counted — 15 files** (the limit of 10 is exceeded on purpose: the user asked for one spec, and each
file below is one part of one logic — the database, the sync rules, the route and the screens that
make a driver editable by the accountant would not work, or would show a button that does nothing,
if any were missing):

1. `supabase/migrations/20261006130000_accountant_team.sql` — new
2. `src/features/userAccess/accessConfig.ts` — changed
3. `src/components/sidebar/useSidebarItems.ts` — changed
4. `src/features/manageTeam/hooks/useTeamPermissions.ts` — changed
5. `src/app/team/page.tsx` — changed
6. `src/features/manageTeam/components/UserFormLayout.tsx` — changed
7. `src/features/manageTeam/components/RoleNavigation.tsx` — changed
8. `src/features/manageTeam/components/pages/DriverPageContent.tsx` — changed
9. `src/features/manageTeam/components/inputs/SelectDriverZones.tsx` — changed
10. `src/features/manageTeam/db/userOperations.ts` — changed
11. `src/features/manageTeam/hooks/useUserFormSubmit.ts` — changed
12. `src/app/api/quickbooks/connections/route.ts` — changed
13. `src/features/userAccess/logic/requireAdminOrAccountant.ts` — new
14. `src/features/userAccess/logic/hasAdminOrAccountantRole.ts` — new
15. `package.json` — changed: `test:db:accountantteam`, added to `test:db:all`

**Not counted:** this spec; `src/features/userAccess/permissionPageData.ts`; tests — new
`supabase/tests/accountant_team.test.sql`, `hasAdminOrAccountantRole.test.ts`, a Playwright spec
`manageTeam/e2e/team.accountant.spec.ts`; edited `accessConfig.test.ts`, `useSidebarItems.test.ts`,
`permissionPageData.test.ts`, `useTeamPermissions.test.ts`, `userOperations.test.ts`,
`roleAccess.accountant.spec.ts`; `../br_powersync/config/sync_rules.yaml` (its own repository). No
`AppSchema.ts`, no `database.types.ts`.

**Tests this spec turns red, edited on purpose:**

- `accessConfig.test.ts`: the exact accountant path list gains `/team` (after `/companies-contacts`);
  the "nothing else operational" list loses it; "keeps an accountant away from the driver profile"
  becomes "lets an accountant open the driver profile".
- `useSidebarItems.test.ts`: the accountant's keys gain `team`; every index after Quotes & Bookings
  moves by one.
- `permissionPageData.test.ts`: the exact list of rows the accountant is granted gains "Edit Team
  Members"; a new check on its note.
- `useTeamPermissions.test.ts`: the hand-built `TeamPermissions` fixtures gain `isAccountant` and
  `canOpenAnyProfile`.
- `roleAccess.accountant.spec.ts`: Team moves from the "not offered" to the "offered" list; `/team`
  leaves the "kept out of" list (Playwright, not run).
- A grep of `supabase/tests` found no assertion that the accountant cannot write `Drivers`,
  `Vendors` or `DriverPayRanges` or read `Vehicles` or `DriverZones`; the dry-run of §9.1 decides.

## 9. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run** (not run locally, by
instruction; its project exists only when `E2E_ACCOUNTANT_EMAIL` is configured). Prettier only on the
touched files.

**9.1 Database**

- **Work:** the migration; `accountant_team.test.sql`; the npm script.
- **Test asserts, each its own assertion** (an accountant-only user unless stated):
  - updates each allowed column of a `Drivers` row (including `tax_dec`, with `tax` derived), and the
    row changes;
  - each column outside the allowed list — `phone_number`, `address_uuid`, `vehicle_uuid`, a document
    path, an expiry date, `account_manager_uuid`, `is_active`, `user_uuid`, `app_version`,
    `bucket_count` — raises `42501` and the row is unchanged;
  - cannot insert or delete a `Drivers` row;
  - **own row:** an accountant who is also a driver changes their own `phone_number` (C5);
  - **account manager and accountant** on a driver outside their zones: changes pay and, being an
    account manager, other columns too; **admin** and **account manager** unchanged;
  - `DriverPayRanges`: selects, inserts (plain and in the upsert form), updates and deletes a row;
  - `Vendors`: inserts (plain and upsert), renames, sets the QuickBooks columns, soft-deletes;
    a hard `DELETE` removes nothing;
  - `Vehicles` and `DriverZones`: selects; cannot insert, update or delete;
  - `Users`: still reads drivers only; an update of another user's name changes nothing (D2);
  - **a viewer, a maintainer, a developer, an inactive accountant and a user with no role** still
    cannot update `Drivers` or write `Vendors` or `DriverPayRanges`; the rows are unchanged.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container,
  applying the pending migrations in the same pipe; the new test, `driver_rls`,
  `driver_pay_ranges_rls`, `driver_tax_dec`, `rls_multi_role` and every `accountant_*` test pass. One
  mutation run — an `ALTER POLICY … USING (true)` between the migration and the test — goes red;
  a second removes the guard trigger and the "outside the allowed list" assertions go red.

**9.2 Sync rules**

- **Work:** the two queries and the reworded comment.
- **Gate:** compile and count (§4): 2 parameterised web buckets; the accountant's bucket contains
  `Zones` and `DriverZones`; nothing else changed.

**9.3 Server guard**

- **Test first:** `hasAdminOrAccountantRole.test.ts` — admin yes, accountant yes, account manager no,
  viewer, maintainer, developer, driver no, empty no.
- **Work:** the two files and the route; a route test in the style of the neighbouring
  `route.test.ts` files if one can be written without Clerk (`GET` 200 for an accountant, 403 for a
  viewer; `POST` 403 for an accountant).
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files.

**9.4 Access config and sidebar**

- **Test first:** `accessConfig.test.ts` and `useSidebarItems.test.ts` (§8).
- **Gate:** as 9.3.

**9.5 Edit-access rules**

- **Test first:** `useTeamPermissions.test.ts`, new cases for `getEditAccess`:
  - accountant only, driver target → `driver-only`; non-driver target → `read-only`;
  - account manager and accountant, driver in their zones → `full`; outside → `zones-and-driver`;
    non-driver → `read-only`; their own profile → `full`;
  - admin → `full` (an admin who is an accountant too); viewer → `read-only`;
  - `canOpenAnyProfile` and `isAccountant` from the roles, `canCreateUser` still false for an
    accountant.
- **Gate:** as 9.3.

**9.6 Save path**

- **Test first:** `userOperations.test.ts` — `updateDriverPayment` sends exactly the allowed columns
  and no other; treats zero updated rows as an error; syncs the pay tiers; touches no other table;
  `currentUserCanEditDriverRow` returns true for an accountant.
- **Gate:** as 9.3.

**9.7 Screens**

- **Work:** `page.tsx`, `UserFormLayout`, `RoleNavigation`, `DriverPageContent`, `SelectDriverZones`,
  `useUserFormSubmit`.
- **Test first, where the component can be rendered in jsdom as `DriverDocumentCard.test.tsx` does:**
  `RoleNavigation` for `driver-only` (two tabs, no "×", no "+ Add Role") and for other levels (as
  today); `SelectDriverZones` with `readOnly` (every zone offered and shown, disabled) and without;
  the click wrapper of `page.tsx` (a non-driver row does not navigate, the Drivers list does).
- **Gate:** as 9.3.

**9.8 Permission matrix**

- **Test first:** `permissionPageData.test.ts` — the granted list, the accountant's notes on "Edit
  Team Members", "Invite Team Members" and "Deactivate Team Members", the role description.
- **Gate:** as 9.3.

**9.9 Playwright:** S1–S10, written, not run. Reported as SKIPPED with the reason.

**9.10 Final report (CLAUDE.md):** `npm run tc`, `npm run test`, the SQL dry-run, each with the tail of
its real output; E2E marked SKIPPED, not passed.

## 10. Edge cases and error handling

- **Offline.** The lists come from the local PowerSync database and work offline. The driver page
  reads and writes Supabase directly, as it does for every role, so it needs a connection: the load
  fails and the save shows an error toast. A vendor write is local and uploads later; a refusal
  (`42501`) discards the transaction and shows the existing toast.
- **A refused `UPDATE` is silent** (§2). `updateDriverPayment` treats "no row updated" as a failure,
  so a Drivers write before the migration is shown as an error instead of vanishing. A vendor
  `UPDATE` filtered out by RLS is not detectable on the client: that is what the deploy order protects.
- **Two writers.** An accountant and an admin or account manager editing the same driver: last write
  wins, as for two account managers today. The save writes the pay columns only, so it does not
  overwrite a phone number an account manager changed meanwhile.
- **A partial save.** `Drivers` and `DriverPayRanges` are two requests, not one transaction (as in
  `updateUser`). If the second fails the first stays; the toast names the error and the page can be
  saved again.
- **The role removed while signed in.** `useAccessRedirect` sends the user away on the next render; a
  save in flight is refused by RLS (`Drivers`) or discarded (`Vendors`).
- **A driver whose role was removed** (`Drivers.is_active = false`) is not in the Drivers list. By a
  direct link the page loads, `isDriver` is false, the target is not a driver, and the access is
  `read-only`.
- **A vendor deleted while a driver points at it.** Unchanged from today: the driver keeps its
  `vendor_uuid`; the picker shows it as the vendor list of `useVendors` does.
- **A contractor without a vendor.** The existing validation messages apply.
- **Pay tiers.** `validateDriverPayRanges` runs on save; the table's constraints refuse overlaps.
- **A person who is an accountant and a driver.** Their own `Drivers` row is not fenced (C5), and the
  mobile app's updates keep working.
- **Clerk.** Nothing new: no route is added, no token or webhook touched. The page gate is
  `useAccessRedirect`; the only route change is `GET /api/quickbooks/connections` (§5), which a
  signed-out request still gets 401 on.

## 11. Risks, and found on the way

**Risks**

- **R1 — a deploy in the wrong order.** App before migration: the driver page now reports the refused
  write, but a vendor edit is filtered silently and comes back as the old value on the next sync. App
  before the sync rules: the Zones field is empty for the accountant. Order: migration → sync rules
  and restart → app.
- **R2 — the accountant changes what drivers are paid.** Rates, tiers, tax and the vendor feed driver
  payments and QuickBooks bills. Whether a week already created is recomputed from the driver's
  current rates was not examined for this spec; it is the same for an admin and an account manager.
- **R3 — the QuickBooks link of a vendor decides which QuickBooks vendor a driver's bill goes to.**
  Today the connection list is admin-only, so the link is in practice an admin's; the accountant now
  sets it too (D4).
- **R4 — new synced data.** `Zones` and `DriverZones` reach every accountant device. Work-tracker
  scoping by zones only applies to an account manager (`resolveDriverScope`), so an accountant's lists
  should not change; to be seen in the walkthrough.
- **R5 — "read-only" is a mouse lock.** The form wrapper blocks the pointer, not the keyboard: a locked
  input can still be focused and typed into. For the accountant nothing typed there is saved
  (`updateDriverPayment` sends only the allowed columns, and the guard refuses the rest), but the
  screen can look edited. Same as `zones-only` and the viewer today.
- **R6 — a wider read than the page uses.** `Vehicles` and `DriverZones` `SELECT` is for the whole
  table, as for the account manager (`Vehicles`) and the viewer (`DriverZones`).

**Found on the way — reported, not fixed**

1. **`driver_self_update` has no column limit.** Its `USING` and `WITH CHECK` are only `id =
get_current_driver_id()`, and no trigger on `Drivers` limits columns, so by the policies a driver
   can change their own pay through the API. Not part of this request.
2. **An account manager's edit of a driver's name does not take effect.** `users_update` allows only
   the user themself or an admin, so the first `Users` update of `updateUser` matches no row and
   raises nothing. Read from the policy; not observed in a browser.
3. **`RoleNavigation` sits outside the locked wrapper.** For `zones-only` it is shown unchanged, so
   "+ Add Role" and the role "×" appear usable. Not changed here, except that `driver-only` removes
   them.
4. **`useTeamPermissions` carries `isMaintainer`, which nothing in the Team code reads.**

## 12. Order of work, and what is left to the user

After "Approved": 9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 9.6 → 9.7 → 9.8 → 9.9 → 9.10. The migration and the
sync rules are not applied to any database but the local one, and only inside a rolled-back
transaction. A walkthrough in a browser needs a Clerk accountant user and a driver, which is not
available here: S1–S10 are left to you.

## 13. Implementation notes (2026-10-07)

Differences from the approved text. None changes a locked type, schema or contract.

- **The route has no `PUT`.** `GET /api/quickbooks/connections` is the only method opened; `POST`,
  `PATCH` and `DELETE` keep `requireAdmin()` (§5 is corrected above). A route test asserts it.
- **`team/page.tsx`.** The wrapper of §6 stops only a click that lands on a table row
  (`closest("tbody tr")`), so the "view deactivated users" button of the incomplete-users alert and the
  buttons of its dialog keep working. It is used around each of the seven non-driver lists
  individually (13 places: one tab each, and the "All" tab), not around the page, so the Drivers list
  needs no opt-out. The click itself is judged in Playwright S3; it cannot be rendered in the
  Vitest setup (no DOM), so no unit test covers it.
- **Two exports were added** to files already on the counted list, for testing and for the three
  partial levels: `toTeamPermissions(access)` (the pure part of `useTeamPermissions`) and
  `getEditCapabilities(access)` (which block of the driver page a level leaves editable) in
  `useTeamPermissions.ts`; `currentUserCanEditDriverRow` is exported from `userOperations.ts`.
- **`DriverPageContent`** takes its classes from `getEditCapabilities`, not from three ad-hoc
  conditions: a block that stays editable opts back in with `pointer-events-auto`, every other block of
  a partial level is faded, and the document cards are `disabled`. For `zones-only` the result is the
  same as before.
- **Not counted, added:** `RoleNavigation.test.tsx`, `SelectDriverZones.test.tsx`,
  `quickbooks/connections/route.test.ts`, `manageTeam/e2e/helpers/teamTestData.ts`. Edited, because
  the change turns them red or stale on purpose: `workTrackers.accountant.spec.ts` (S4 now expects the
  "Edit Profile" button, C6) and a comment in `WorkTrackerGroupModal.tsx` that said the accountant has
  no Team page.
- **Playwright, what is not driven:** S8 is `test.skip` (it needs a seeded week with a released
  driver). S5 (adding a pay tier) and S7 (creating a vendor from the driver page) use selectors read
  from the components, not observed in a browser, and are the likeliest to need a fix on the first run.
  The rename and delete of a vendor, and the QuickBooks connection picker, are asserted in the SQL
  test and through the API, not through the screen.
- **The sync rules** (`../br_powersync/config/sync_rules.yaml`) are edited, not committed and not
  deployed. Compiled with the service's own library: 25 sources before and after, 2 parameterised web
  buckets before and after, and one more source reads `Zones` and `DriverZones` (the accountant's).
- **The SQL test** has 94 assertions. Mutation runs: `drivers_update … USING (true)` turns 5 red, no
  guard trigger turns 19 red, `Vendors … rbac_insert WITH CHECK (true)` turns 6 red. The related
  suites pass with the migration (driver*rls, driver_pay_ranges_rls, driver_tax_dec, rls_multi_role,
  every `accountant*\*`, work_tracker_group_is_paid, manual_payment_entry,
  payment_history_edit_soft_delete, the maintainer and driver_sync_health ones).
- **Documents can be opened, not changed (2026-10-07, the user's request).** In the locked Driver Setup
  block the preview and the file name of a document were dead links, because the form wrapper blocks
  the pointer. `DriverDocumentCard` now takes the pointer back when it is `disabled`
  (`pointer-events-auto`), so the photo or the PDF opens in a new tab as it does for an admin; there is
  still no upload, replace or remove control and the expiry date stays disabled. This covers every
  role that sees a disabled card (an account manager on `zones-only`, a viewer), not only the
  accountant, because "disabled" now means "cannot be changed", not "cannot be seen". The bucket
  `driver-documents` is public, so no storage policy changed. Locally, the seeded documents do not
  open at all (the storage service answers 500: the seed has the object rows but not their bytes), so
  a thumbnail shows the paperclip there whichever role is signed in.
- **A document is not faded either (2026-10-07, the user's request).** The Driver Setup block of a
  read-only form was faded as a whole (`opacity-60`), and a child cannot undo its parent's opacity, so
  the photo stayed faded. The fade now sits on the pieces of the block (its heading, the phone, the
  address, the vehicle, the "Document Uploads" heading, the "not required" placeholder) and not on
  the section; `DriverDocumentCard`, when `disabled`, fades its own label with the status badge and its
  expiry row, and leaves the preview and the file name at full strength (and the icon that stands in
  for the preview of an uploaded document, a PDF or a file that did not load). A disabled card with
  no file fades entirely. The look for `zones-only` is the same as before apart from the documents.
  Not changed: a viewer's form, which fades as a whole in the form wrapper itself.
