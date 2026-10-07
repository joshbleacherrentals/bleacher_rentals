# Accountant — Work Trackers access

Status: **APPROVED** — 2026-10-02. D1 and D2 taken as recommended (hide _Edit Profile_;
grant the Zone / QuickBooks-class reads); D3–D9 as written.
Implemented 2026-10-02. Not yet done: the manual walkthrough S1–S8 (needs a Clerk
accountant user, R2) and the deploy (migration → sync rules + restart → app).
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md) (Stage 1: the role exists, no permissions).
Sync rules live in the separate repo `br_powersync` (`config/sync_rules.yaml`).

## 0. The request, and what it is not

The Accountant gets the Work Trackers area:

- opens `/work-trackers`, `/work-trackers/<week>` and `/work-trackers/<week>/<driver>`;
- sees **every week** and **every driver straight away** (no "See All Drivers" click);
- sees everything on the driver-week page (trip table, driver header, totals, PDF);
- has the buttons of the **Work Tracker Group** modal (the screenshot): _Mark as Ready for
  Payment_, _Create QuickBooks Bill_, _Close_ (plus the same modal's buttons in its other
  states — D3);
- opens the **Edit Work Tracker** modal **read-only**: sees all of it, changes nothing.

**The Accountant can NOT — a rule, not an omission:**

- create a work tracker;
- edit a work tracker (any field, line item, driver, status, bleacher or note);
- delete a work tracker;
- release a work tracker — neither one by one nor with the **Release All** button.

None of these is available to the role, at any layer: the controls are not shown, the
database refuses the write, and a test asserts both (§3, §8). The only things an Accountant
writes in this area are the payment status of a driver's week and its QuickBooks bill
(`WorkTrackerGroups`) — never a work tracker itself.

**Not part of this request, so not changed:**

- `/all-work-trackers`, `/work-tracker-types`, `/team` (incl. the driver profile), `/dashboard`;
- anything `admin`, `account_manager`, `viewer`, `maintainer`, `developer` or `driver`
  can see or do. Roles are additive: an Accountant who is also an account manager keeps
  what the account-manager role gives (including a lead's **Release All**); the Accountant
  role itself adds none of the four rights above.

## 1. Decisions

**D1 — the "Edit Profile" button** (needs you)

- **Question:** the modal has an _Edit Profile_ link that opens `/team/<id>/edit/driver`.
  The Accountant has no `/team`, so the link would bounce them to the first allowed page.
- **Recommendation:** hide it for an Accountant. Giving them the driver profile means
  giving them `/team`, which was not asked for.

**D2 — QuickBooks class on the bills** (needs you)

- **Fact:** `create-bill` reads with the caller's own JWT. It puts a QuickBooks **Class** on
  a bill line from `ZoneQboClasses` → `Zones` → `ZoneStateProvinces`, which are
  **admin-only**. For anyone else the read returns no rows (no error), and the line is
  sent **without a Class**. By the policies, an account manager's bills already go out
  that way today (derived from RLS, not observed on a real bill).
- **Question:** should an Accountant's bills carry the Class like an admin's?
- **Recommendation:** yes — read-only `select` on those three tables for `accountant`.
  The accountant creates the bills; a silently missing Class is the wrong default. The
  account manager case is **not** touched here (§9).

**D3 — which modal buttons** (default, tell me if wrong)

All of the group modal's action buttons, in whichever state the week is in: _Mark as Ready
for Payment_, _Mark as Draft_, _Create QuickBooks Bill_, _Update Bill_, _Try Again_,
_Close_. The screenshot shows only the Draft state; an accountant who can mark a week
ready but not take it back would be stuck. The page buttons _Download PDF_ and the payment
status button are included.

**D4 — which Users rows** (changed 2026-10-02, after you asked about buckets)

- **Sync: the whole `Users` table**, as account managers, viewers and maintainers get it
  (you: the table will be needed later anyway).
- **RLS (direct reads): drivers only** — unchanged. Nothing in this scope reads another
  user's row from Supabase, and widening it later is one line in the policy.
- **Why not "drivers only" in sync too:** a `JOIN "Drivers" ON "Drivers"."user_uuid" =
"Users"."id"` correlates the query with the row, so the compiler parameterises the
  bucket by `Users.id`: one bucket per driver (≈90) for every accountant client, against
  one shared bucket for everything else. Measured by compiling the file with the
  service's own sync-rules library (§4).

**D5 — attention counts** (default)

None. The red counts (sidebar, per week, per driver) follow the signed-in account
manager's zones; an Accountant has none, so nothing is shown. Not widened to "all".

**D6 — "Release All"** (settled by you, 2026-10-01)

Unavailable to the Accountant, like creating, editing and deleting (§0). The button is
gated by `isAdmin || leadZoneIds.length > 0`, which an accountant-only user never
satisfies; the check moves into a tested function (§5) so it cannot drift, and the
database refuses the write underneath it (§3).

**D7 — landing page** (default)

An accountant-only user lands on `/work-trackers` (first entry in their allowed paths,
since they have no `/dashboard`) instead of `/permissions`.

**D8 — events in the read-only modal** (default)

The modal's "Previous / Next Event" cards read `Events` and `BleacherEvents`. They are
synced (same as the maintainer) so the modal shows everything. Say so if the Accountant
should not see events — the cards then simply do not render.

**D9 — matrix** (default)

`permissionPageData.ts` gets two edits: the **Work Trackers** row (accountant:
`none` → `custom`) and a **new row** "Driver Payments & QuickBooks Bills". There is no row
for that today, even though admins and account managers already do it.

## 2. Research findings

A page reads data on two paths, and each has its own gate:

- **Local (PowerSync/Kysely).** `sync_rules.yaml` decides what is on the device. RLS is not
  consulted.
- **Direct (Supabase client, and API routes that call it with the caller's Clerk JWT).**
  RLS decides. A refused read is usually an **empty result, not an error**.

**Who reads what today (local DB is on the latest migration `20261001120000`)**

- **Drivers:** admin, AM, viewer, maintainer (plus the driver themselves, developer)
- **Users:** admin, AM, viewer (plus each user their own row)
- **Addresses, WorkTrackers, Bleachers:** admin, AM, viewer, maintainer
- **Vendors, WorkTrackerTypes, QboConnections, WorkTrackerTypeQboAccounts:** admin, AM
- **WorkTrackerGroups:** read admin, AM, viewer; insert / update / delete admin, AM
- **ZoneQboClasses, Zones, ZoneStateProvinces:** admin only
- **Accountant:** nothing (Stage 1), apart from its own identity row and `ChangeLog`

**What each part of the area needs**

- **Week list** (`CurrentWeeksList`, `YearlyWeeksList`, `WeeksNav`) — local:
  `WorkTrackerGroups`, `WorkTrackers`, `Drivers`, `Addresses`.
- **Drivers of a week** (`DriverListForWeek`, `useDriversForWeek`) — local: `Users`,
  `Drivers`, `Addresses`, `Vendors`, `WorkTrackers`, `WorkTrackerGroups`. The `Users` join is
  an inner join: a driver whose `Users` row is not on the device **disappears from the list**.
  The component also gates on `isAdmin || isAccountManager`, so an Accountant would see
  "Access Denied" even with all the data.
- **Driver-week page** — local: `Drivers`, `Addresses`, `WorkTrackers`, `Bleachers`,
  `WorkTrackerTypes`. Direct: `Users` (page title), `Drivers` + `Addresses` + `Vendors` +
  `Users` (header block, status button), `WorkTrackers`, `WorkTrackerGroups`.
- **Group modal** — direct only: `Drivers` + `Vendors`, `WorkTrackers`, `WorkTrackerGroups`
  (read; **insert** when the week has no group row yet; **update** of `status`), then
  `POST /api/quickbooks/create-bill`.
- **`create-bill` and the PDF** — run with the caller's JWT: `Drivers`, `Vendors`, `Users`,
  `QboConnections` (default tax code — a missing read silently becomes `NON`),
  `WorkTrackers` + `Addresses` + `WorkTrackerTypes`, `WorkTrackerTypeQboAccounts`,
  `ZoneQboClasses` (D2), `Bleachers` (PDF). Writes `WorkTrackerGroups` only. QuickBooks
  tokens are read with the service role (no RLS).
- **Edit Work Tracker modal** — local: `WorkTrackers`, `Drivers`, `Users`, `Addresses`,
  `Bleachers`, `WorkTrackerTypes`, `WorkTrackerLineItems`, `BleacherEvents`, `Events`.
  It is **already read-only** for everyone who is not admin/AM (`canCreateUser` false →
  `canEdit` false: disabled fieldset, no Save / Delete, "You have read-only access"
  banner). The POC picker falls back to the stored `pickup_poc` text, so `Contacts` is not
  needed. The Accountant gets this mode without any change to the modal.

## 3. Database — `supabase/migrations/20261001130000_accountant_work_trackers.sql`

(After the newest migration `20261001120000`. Renumber if `develop` has moved.)

Every statement adds `accountant` to an **existing** policy (`ALTER POLICY`, the style of
the last migrations), keeping the rest of each expression as it is:

- `Drivers` · `drivers_select` → `{admin,account_manager,viewer,maintainer,accountant}`
- `WorkTrackers` · `worktrackers_select` → same list, **keeping** the "own driver rows"
  clause
- `Addresses` · `rbac_select`, `Bleachers` · `bleachers_select` → same list
- `Vendors`, `WorkTrackerTypes`, `QboConnections`, `WorkTrackerTypeQboAccounts` ·
  `rbac_select` → `{admin,account_manager,accountant}`
- `WorkTrackerGroups` · `rbac_select` → `{admin,account_manager,viewer,accountant}`;
  `rbac_insert`, `rbac_update` → `{admin,account_manager,accountant}`. **Delete is
  untouched.**
- **D2:** `ZoneQboClasses`, `Zones`, `ZoneStateProvinces` · `rbac_select` →
  `{admin,accountant}`

One new policy (D4):

```sql
create policy users_accountant_select on public."Users"
  as permissive for select to authenticated
  using (
    'accountant' = any(public.get_user_roles())
    and exists (select 1 from public."Drivers" d where d.user_uuid = "Users".id)
  );
```

No `Drivers.is_active` filter: an old week's pay still needs the driver's name.

**Deliberately not changed — this is how §0's "can NOT" is enforced in the database:**
`WorkTrackers` insert / update / delete get **no** `accountant` entry, so an Accountant
cannot create, edit, delete or release (a release is an `update` of `status`) a work
tracker, by any route: the page, the modal, or a hand-written request with their own token.
The same holds for `WorkTrackerLineItems` (a line item is part of a work tracker).
Also untouched: every other table, `get_user_roles()`. Still **zero rows** for an
Accountant: `Events`, `BleacherEvents`, `PaymentHistory`, `DamageReports`,
`AccountManagers`, `Contacts`, `Alerts`, `Notifications`, and the `Users` rows of
non-drivers.

Known limit: `WorkTrackerGroups` update is row-level, so an Accountant could change any
column of a group (not just `status`). Account managers can already; a column fence would
need a trigger and is out of scope.

## 4. Sync rules — `br_powersync/config/sync_rules.yaml` (separate PR)

Replace the Stage 1 comment under `# Accountant tables` ("No operational table belongs
here…") and add queries in the existing shape (`JOIN "Accountants" ON "Accountants"."is_active"
= true JOIN "Users" ON "Accountants"."user_uuid" = "Users"."id" WHERE … clerk_user_id =
auth.user_id() AND status_uuid != '<inactive>'`). Whole tables, as for account managers:

- `Drivers`, `Vendors`, `Addresses`, `Bleachers`
- `WorkTrackers`, `WorkTrackerGroups`, `WorkTrackerTypes`, `WorkTrackerLineItems`
- `Events`, `BleacherEvents` (D8)

`Users` is the same template as the rest (the whole table, D4). **Two things not to "improve"
in that query:** do not join `Drivers` to narrow it, and do not list columns instead of `*` —
the same `Users` row also arrives from the self-row bucket with `*`, and two column sets for
one client-side table overwrite each other.

**Bucket cost, measured.** Compiled with the service's own library
(`@powersync/service-sync-rules`, inside the PowerSync container): before this change the web
stream had 2 parameterised bucket definitions (own `Users` row, own `DashboardFilterSettings`);
after it still has exactly those 2. Every accountant query above lands in **one** shared
definition with no parameters, so an accountant client holds 1 bucket for all of it. Check this
again whenever a query is added here.

Not synced: `Zones`, `DriverZones`, `AccountManagerZones` (no zones, D5), `Contacts`,
`DriverUnavailability`, `Notifications`, `Alerts`, `UserAlerts`, `WorkTrackerInspections`.
The Accountant's PowerSync client **writes nothing** in this scope (every payment action
goes straight to Supabase); the gate checks that its upload queue stays empty.

**The file is not watched — the PowerSync service must be restarted.**

## 5. App changes

**Access layer**

- `accessConfig.ts` · `accountant.allowedPaths` → `["/work-trackers", "/permissions",
"/changelog"]` (the first entry is the landing page, D7). No `/all-work-trackers`.
- `useSidebarItems.ts` · `ROLE_SIDEBAR_KEYS.accountant` → `["work-trackers",
"documentation"]`.
- `permissionPageData.ts` · D9. Wording of the new row (all seven roles answered):
  admin `full`, account manager `full` ("any driver, not only their own zones"), viewer
  `none`, developer `none`, maintainer `none`, driver `none`, accountant `custom`. The
  Work Trackers row: accountant `custom` — "Opens the Work Trackers pages and sees every
  week, every driver and every trip in full. Cannot create, edit, delete or release work
  trackers. Has no Dashboard." Role description updated (it still says "no permissions").

**Work Tracker UI**

- `hooks/useDriversForWeek.ts` · `useWorkTrackerAccess` also reports `isAccountant`
  (`leftJoin Accountants … is_active = 1`, like the account manager one). The drivers query
  treats an Accountant as "See All Drivers" always on. `resolveDriverScope` is not touched.
- new `util/workTrackerPageAccess.ts` — two pure functions:
  - `canOpenWorkTrackerWeek({ isAdmin, isAccountManager, isAccountant })`, used by
    `DriverListForWeek` instead of the inline `isAdmin || isAccountManager`; the denial
    text names the Accountant too.
  - `canReleaseAllDrafts({ isAdmin, leadZoneIds })` — the existing
    `isAdmin || leadZoneIds.length > 0` rule, moved out of
    `src/app/work-trackers/[startDate]/[userUuid]/page.tsx` unchanged so a test can pin
    that an accountant-only user (no admin, no lead zones) never gets **Release All**.
    `isAccountant` is deliberately not an input: the role cannot grant it.
- `components/DriverListForWeek.tsx` · the "See All / My Drivers Only" toggle is not
  rendered for an Accountant (it would do nothing).
- `components/WorkTrackerGroupModal.tsx` · _Edit Profile_ is not rendered for an
  Accountant (D1). Nothing else in the modal changes.

**Unchanged on purpose:** `WorkTrackerModal.tsx` (already read-only), `TripList`,
`PaymentStatusButton`, `TotalsMatch`, the `create-bill` / `get-bill` / PDF routes, and
`useDrivers.db.ts` (the read-only modal already passes `showAll`).

## 6. Behaviour scenarios (for Playwright)

- **S1** accountant signs in → lands on `/work-trackers`; sidebar shows **Work Trackers**
  and **Documentation**.
- **S2** opens a week → sees all drivers with no click, and no "See All Drivers" button.
- **S3** opens a driver's week → sees the header (vendor, EIN, HST), every trip, the
  totals; **Download PDF** works; there is **no Release All** button, and no control to
  add a work tracker anywhere on the pages.
- **S4** payment button → the modal loads; _Mark as Ready for Payment_ moves the week to
  Ready for Payment and the list updates; _Mark as Draft_ moves it back; no _Edit Profile_.
- **S5** _Create QuickBooks Bill_ → status Bill Created, the bill carries its Class (D2).
- **S6** clicks a trip → Edit Work Tracker opens with the read-only banner, every field
  disabled, no Save / Delete / Edit types.
- **S7** `/all-work-trackers`, `/work-tracker-types`, `/team`, `/dashboard` bounce back to
  `/work-trackers`.
- **S8** a user who is accountant **and** account manager keeps AM's behaviour and gains
  the all-drivers list.
- **S9** (forbidden actions) as an accountant-only user, a work-tracker `insert`, `update`
  (any field, including `status` draft → released) and `delete` sent with the user's own
  token are refused by the database — the SQL test (§8.1) does this directly, the E2E
  spec asserts only what the UI shows.

## 7. Edge cases and error handling

- **Offline.** Pages read the local DB and keep working. Every payment action is a direct
  Supabase / API call and is online-only — unchanged, and shown as the existing error toast.
- **Week without a group row.** Opening the modal inserts one; this is why `insert` on
  `WorkTrackerGroups` is granted.
- **Driver without a vendor / not linked to QuickBooks.** The existing "Internal Driver" /
  "Vendor Not Linked" panels and the disabled Create Bill button — unchanged.
- **Deactivated accountant.** `get_user_roles()` → `{}`: RLS refuses, sync stops, the
  access layer shows "account deactivated" — all Stage 1, unchanged.
- **Role granted while signed in.** The identity row streams in; the sidebar and redirects
  update without a reload (as today). The data arrives after the next sync.
- **Clerk.** Nothing new: no route, token or webhook is touched.
- **The silent-empty hazard.** A missing grant on `QboConnections` or the Zone tables does
  not fail loudly — the bill goes out with tax code `NON` / no Class. The SQL test asserts
  each grant by name for this reason.
- **Sync rules deployed before the migration:** harmless (no new table is referenced).
  **App before sync rules:** the accountant sees empty pages ("No work tracker weeks found").
  Order: **migration → sync rules + PowerSync restart → app.**

## 8. Tests and implementation sequence

Red first, each step ends at a gate. Playwright is **written, not run** (standing
instruction); Prettier only on touched files.

**8.1 Database**

- **Work:** migration; `supabase/tests/accountant_work_trackers.test.sql`; `npm run
test:db:accountantworktrackers` (+ `test:db:all`); edit the Stage 1 sweep in
  `accountant_role.test.sql` (it asserts zero `Drivers` / `WorkTrackers` / driver `Users`
  rows — that changes on purpose).
- **Test asserts:** the accountant reads every table in §3 and nothing else in the sweep;
  updates and inserts `WorkTrackerGroups`; cannot delete one; sees driver `Users` rows but
  not an admin's; the other roles read exactly what they did before
  (`rls_multi_role.test.sql` stays green). **Forbidden actions (§0), each its own
  assertion:** cannot insert a `WorkTrackers` row; cannot update one — a field edit, a
  reassignment of `driver_uuid`, and the release (`status` draft → released); cannot
  delete one; cannot insert / update / delete a `WorkTrackerLineItems` row. Each refusal is
  checked as "0 rows affected / RLS error **and the row is unchanged afterwards**", since
  an update that RLS filters out does not raise.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals`
  container; both SQL tests pass.

**8.2 Access layer**

- **Work:** `accessConfig`, sidebar, matrix, role description.
- **Tests edited on purpose:** `accessConfig.test.ts`, `useSidebarItems.test.ts`,
  `permissionPageData.test.ts` (the Stage 1 "everything is none" guard becomes "exactly the
  Work Trackers rows are not none").
- **Gate:** `npm run tc` and `npx vitest run` green.

**8.3 Work Tracker UI**

- **Work:** `useWorkTrackerAccess`, `workTrackerPageAccess.ts`, `DriverListForWeek`,
  the driver-week page (`canReleaseAllDrafts`), `WorkTrackerGroupModal`.
- **Tests:** `workTrackerPageAccess.test.ts` (all eight role combinations for
  `canOpenWorkTrackerWeek`; for `canReleaseAllDrafts`: admin yes, lead AM yes, accountant-only
  **no**, non-lead AM no);
  `useWorkTrackerAccess` against the real SQLite harness used by `useIncomplete.test.ts`
  (active vs inactive `Accountants` row); the Accountant branch of the driver query.
- **Gate:** tc + vitest green.

**8.4 Sync rules**

- **Work:** the `br_powersync` PR (§4); restart the service.
- **Gate:** the YAML loads; with the local PowerSync stack an accountant-only client holds
  every table in §4 and none of the "not synced" ones; the upload queue stays empty; the
  driver list shows every driver. Then a manual pass of S1–S8 (needs a Clerk accountant
  user — see R2).

**8.5 E2E and close-out**

- **Work:** `src/features/workTrackers/e2e/workTrackers.accountant.spec.ts` (asserts S1–S7;
  S6 and S3 include "no Release All, no Save, no Delete, no way to add a work tracker");
  update
  `src/features/userAccess/e2e/roleAccess.accountant.spec.ts` (it asserts the sidebar has
  no Work Trackers and that `/` lands on `/permissions`); matrix re-read against the code.
- **Gate:** the final report with real tails of `npm run tc`, `npx vitest run`,
  `test:db:*`, `prettier --check <touched files>`; E2E marked SKIPPED with the reason.

## 9. Risks, and found on the way (not changed here)

**Risks**

- **R1** — a missing RLS grant fails silently (empty result): wrong tax code or no Class
  on a bill. Mitigation: one named assertion per grant (§7).
- **R2** — no Clerk accountant user yet, so S1–S8 cannot be run end to end by me.
  Mitigation: the project is registered only when `E2E_ACCOUNTANT_EMAIL` exists (Stage 1).
- **R3** — a sync-rules query that joins a table to the row it returns silently multiplies
  buckets (≈90 per client for a drivers-only `Users`, found and removed on 2026-10-02).
  Mitigation: compile the file and compare the parameterised definitions before and after
  (§4); the count must stay at 2.
- **R4** — `Events` / `BleacherEvents` in sync widen what the Accountant sees (D8).

**Found on the way — reported, not fixed**

1. **Account manager bills probably carry no Class** (D2): by the policies, the read that
   supplies it returns nothing for an AM.
2. `GET /api/quickbooks/get-bill` only calls `requireAuth()` and then reads the QuickBooks
   tokens with the **service role** for whatever `connectionId` it is given — any signed-in
   user (a driver included) can read any bill by guessing its ids. `create-bill` has the
   same `requireAuth()` only, but is fenced by RLS; `get-bill` is not.
3. A viewer gets "Access Denied" on a week's driver list (`isAdmin || isAccountManager`),
   while the matrix says a viewer sees all work trackers.
4. `fetchDriverPaymentData` upserts a `Drivers` row when none exists — a write that RLS
   would refuse for an Accountant; it can only trigger for a driver row that is missing.
