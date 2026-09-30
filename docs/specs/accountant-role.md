# Accountant role

Status: **DRAFT — awaiting approval** — 2026-09-30.
Branch: `q4-sprint1-finance-role`.
Precedent: [maintainer-role.md](maintainer-role.md) (the last role added; this spec follows
the same shape, and its `git show 4e7168ca --stat` is the checklist of places a role touches).

## 0. What this is, and what it is not

A seventh web role, `accountant`, for the people who handle finances. Today `account_manager`
does both operations and finance; the plan is to later **restrict** the finance part of
`account_manager` and **give** it to `accountant`.

That is a multi-stage feature. **This spec locks Stage 1 only:**

> Stage 1 — the role exists, can be granted from `/team`, is stored in its own `Accountants`
> table, is synced to the client, and has **no permissions and no access to any data**.

| Stage | Scope                                                                                                                                                                                     | Spec                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **1** | **Role plumbing: DB table, `get_user_roles()`, TS role, `/team`, sync identity**                                                                                                          | **this document**                    |
| 2     | Inventory of finance features today owned by `account_manager` (Payment History, Record a Payment, QuickBooks Invoice Flag, AR tabs, QuickBooks/Stripe connections…) and the target split | new spec, not started                |
| 3     | Grant `accountant` finance access **one capability at a time** (RLS arrays + sync rules + UI gate + matrix row)                                                                           | one spec per capability, not started |
| 4     | Restrict `account_manager` — the only stage that changes someone else's behaviour, so it comes last                                                                                       | new spec, not started                |

Nothing in Stage 1 may change what `admin`, `account_manager`, `developer`, `viewer`,
`maintainer` or `driver` can see or do.

## 1. Decisions to lock before implementation

Two need your answer; the rest are defaults I will take unless you object.

| #   | Question                                                                                                                                                             | My recommendation                                                                                                                                                                                                                                                                                                                            | Needs you? |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Column name. The request says `usersUuid`; every role table in the repo uses snake_case **`user_uuid`** (`AccountManagers`, `Developers`, `Maintainers`, `Drivers`). | **`user_uuid`**, FK named `accountants_user_uuid_fkey`. A camelCase column would be the only one in the schema and would not match the PostgREST embed hints, `AppSchema.ts` or `determineAccess.ts` conventions.                                                                                                                            | **yes**    |
| D2  | Who may grant the Accountant role? `canCreateUser` is `admin \|\| account_manager`, and `RoleNavigation` only hides "Administrator" from AMs.                        | **Admin only.** RLS on `Accountants` is admin-only (D3) and the role is finance-sensitive, so `RoleNavigation` hides it from non-admins the way it hides Administrator. See §9 "found on the way" for why not showing it matters: today an AM who picks Developer/Maintainer gets an RLS error _after_ the `Users` row was already inserted. | **yes**    |
| D3  | RLS on `Accountants`.                                                                                                                                                | Four `rbac_*` policies, `{admin}` only — verbatim `Maintainers`/`Developers`. No self-read policy (none of the role tables has one; the client learns its own role from PowerSync). Known side effect in R6.                                                                                                                                 | no         |
| D4  | What does an accountant-only user see in Stage 1?                                                                                                                    | Signs in (is **not** shown "No roles assigned"), sidebar shows only **Documentation** (Role Permissions, What's New), lands on `/permissions`. Nothing else.                                                                                                                                                                                 | no         |
| D5  | Sync rules in Stage 1.                                                                                                                                               | Identity row (`Accountants`) + `ChangeLog` (What's New needs it). No operational tables.                                                                                                                                                                                                                                                     | no         |
| D6  | `/permissions` placement.                                                                                                                                            | `ROLE_ORDER`: after `account_manager` (the role it will take work from). Card colour `teal`.                                                                                                                                                                                                                                                 | no         |
| D7  | `TeamPermissions.isAccountant`.                                                                                                                                      | **Not added** — no consumer in Stage 1. Only `canAssignAccountant` (= `isAdmin`) is added, for D2.                                                                                                                                                                                                                                           | no         |
| D8  | E2E.                                                                                                                                                                 | Specs are written, **not run locally** (you asked not to run Playwright; there is no Clerk accountant user yet). The accountant Playwright project is registered only when `E2E_ACCOUNTANT_EMAIL` exists, as for `maintainer`.                                                                                                               | no         |

## 2. How roles work today (research findings)

**There is no role enum in the database.** A role is one of:

| Role              | Stored as                                                        |
| ----------------- | ---------------------------------------------------------------- |
| `admin`           | `Users.is_admin`                                                 |
| `viewer`          | `Users.is_viewer`                                                |
| `account_manager` | active row in `AccountManagers`                                  |
| `developer`       | active row in `Developers`                                       |
| `maintainer`      | active row in `Maintainers`                                      |
| `driver`          | active row in `Drivers` (web-blocked unless another role exists) |

`Users.role` / `UserRoles` are legacy and not consulted for access (see `CLAUDE.md`).
Roles are **additive**: access is the union of everything a user holds.

The same fact lives in four mirrored places, and a role missing from any of them "does not
exist" there:

1. **Postgres** — `public.get_user_roles()` (`SECURITY DEFINER`, latest definition in
   `20260910130000_maintainer_role.sql`). Every RLS policy reads it; it returns `{}` for a
   deactivated user.
2. **Client, local** — `useUserAccess` (Kysely `leftJoin` per role table on the PowerSync DB) →
   `determineUserAccess` → `WebRole[]`. If local state is `no-roles-assigned` /
   `cannot-find-account` it re-checks online through PostgREST (nested embed, so **RLS applies
   to the role table**).
3. **Server** — `resolveUserAccessForRequest` (same embed, used by `requireAdminOrAccountManager`
   on API routes).
4. **PowerSync** — `sync_rules.yaml` (separate repo `br_powersync`): identity block + per-role
   bucket queries joined on `<RoleTable>.is_active = true`.

**Gating on the client:** `accessConfig.ROLE_CONFIG` (allowed path prefixes; `defaultRedirect`
is `/dashboard` if allowed, else the **first** allowed path, else `/`) →
`SignedInComponents` + `useAccessRedirect`; `useSidebarItems.ROLE_SIDEBAR_KEYS`; the matrix in
`permissionPageData.ts` renders `/permissions`.

**Inviting from `/team`:** `createUser` inserts `Users` (status `invited`) and then one insert
per role table → `sendUserInvite` → `POST /api/invite` → Clerk `invitations.createInvitation`
with **only the email** (guard: admin or AM). When the invitee accepts, the Clerk `user.created`
webhook upserts `Users` by email and flips status to `active`. **Clerk never learns a role**, so
"unknown role" errors cannot originate from Clerk or the invite route; the only places an
unknown role can break things are the TypeScript unions and the database — both covered below.

**Zero-trust RLS:** policies are `get_user_roles() && '{…}'`. A new role name intersects none of
the existing arrays, so an `accountant`-only user gets **no rows** from any role-gated table the
moment the function learns the role. Exception by design: `ChangeLog` (`using (true)`).

**DB conventions to copy** (from `Maintainers`): quoted PascalCase plural table;
`id uuid default gen_random_uuid()` PK named `<table>_pkey`; `created_at timestamptz not null
default now()`; `is_active boolean not null default true`; `user_uuid uuid not null` FK to
`"Users"(id) on delete cascade`; index on `user_uuid`; `comment on table`; four `rbac_*`
policies; a `supabase/tests/<name>.test.sql` with an npm script and an entry in `test:db:all`.
PowerSync side: `AppSchema.ts` table (`column.integer` for booleans), `PowerSyncColsFor<>`,
exported `*Record`; `npm run gtl` for `database.types.ts`. (`docs/POWERSYNC_ARCHITECTURE.md`
still lists `zustandRegistery.ts` — that file is gone; nothing to do there.)

## 3. Architecture changes

No new layer. The role joins the existing pattern as one more parallel role-table:

```
Users ──< Accountants (is_active)             new table, admin-managed
   │
   ├─ get_user_roles()  + 'accountant' arm     SQL source of truth  (RLS)
   ├─ useUserAccess / resolveUserAccessForRequest  + accountant_id  (TS mirror)
   ├─ WebRole | "accountant"                   → accessConfig, sidebar, permissions matrix
   ├─ /team (tab, routes, list, create/update/fetch)   granting UI
   └─ sync_rules.yaml web stream               identity + ChangeLog
```

Explicitly **not** done: a shared "role registry" refactor, changing how other roles are
stored, changing `Users.role`, touching any existing RLS policy, touching the mobile stream.

## 4. Database changes

### 4.1 Migration `supabase/migrations/20260930130000_accountant_role.sql`

(Timestamp is after the newest migration, `20260930120000`. If `develop` has moved by the time
this ships, renumber — there is precedent in `1b55bf3d`.)

```sql
create table if not exists public."Accountants" (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  is_active  boolean     not null default true,
  user_uuid  uuid        not null,                         -- D1
  constraint accountants_pkey primary key (id),
  constraint accountants_user_uuid_fkey
    foreign key (user_uuid) references public."Users" (id) on delete cascade
);

create index if not exists "Accountants_user_uuid_idx" on public."Accountants" (user_uuid);

comment on table public."Accountants" is
  'Grants the accountant web role. Mirrors "Maintainers": an inactive row leaves the role '
  'ungranted rather than deleting the history of it.';
```

Only the four columns you listed (plus `user_uuid` being the FK you called `usersUuid`). No other
columns; later stages may add some.

RLS — copied from `Maintainers`, `{admin}` for select / insert / update / delete (`rbac_select`,
`rbac_insert`, `rbac_update`, `rbac_delete`).

### 4.2 `get_user_roles()` learns the role

`create or replace` from the **current** definition in `20260910130000_maintainer_role.sql` —
not from the older `20260525120000` or `20260513153019` copies, which have no `maintainer` arm
and would silently revoke that role — with one arm appended:

```sql
union all
select 'accountant'
  where exists (
    select 1 from "Accountants" a
    where a.user_uuid = u.id and a.is_active = true
  )
```

The deactivated-user short-circuit (`status_uuid = '7b65d5a1-…'` → `'{}'`) stays first and
untouched. This is the single most important statement in Stage 1.

### 4.3 What is deliberately **not** in the migration

No existing policy is edited and no helper (`is_current_user_*`, the driver-update fence
trigger) is touched: an `accountant` has no writes anywhere, so there is nothing to allow-list.
Adding `accountant` to any policy array is a Stage 3 act, per capability.

### 4.4 Seed

No `supabase/seed.sql` change in Stage 1 (an empty table emits no seed rows; the E2E accountant
user needs a Clerk account first — D8).

## 5. Roles and authorization (TypeScript contract — locked once approved)

```ts
// src/features/userAccess/logic/determineAccess.ts
export type WebRole =
  | "admin"
  | "account_manager"
  | "developer"
  | "viewer"
  | "driver"
  | "maintainer"
  | "accountant";

// src/features/userAccess/types.ts — UserAccessData
accountant_id: string | null;
```

- `determineUserAccess` pushes `"accountant"` when `accountant_id` is set, in the same block as
  `maintainer`, **before** the `roles.length === 0` check — otherwise an accountant-only user is
  reported as "no roles assigned". `driver` stays last.
- `useUserAccess`: `leftJoin("Accountants as acct", …is_active = 1)`, select `acct.id as
accountant_id`; the online fallback embeds `Accountants!accountants_user_uuid_fkey(id,
is_active)` and maps `accountant_id: activeId(row.Accountants)`.
- `resolveUserAccessForRequest`: same embed + mapping.
- `accessConfig.ts`:
  ```ts
  accountant: {
    // Stage 1: nothing but the two pages every role may read. With no /dashboard, defaultRedirect
    // falls to the first path — the page that tells them what they may do. allowedPaths must NOT
    // be empty: useAccessRedirect would bounce forever on "/" (the driver's [] is safe only
    // because drivers are blocked before this config is read).
    allowedPaths: ["/permissions", "/changelog"],
    showSidebar: true,
  },
  ```
- `useSidebarItems.ts`: `ROLE_SIDEBAR_KEYS.accountant = ["documentation"]`.
- `permissionPageData.ts` (CLAUDE.md: same commit as the role):
  - `ROLE_LABELS.accountant = "Accountant"`; `ROLE_DESCRIPTIONS.accountant` — "Reserved for the
    people who handle finances. In this release the role has no permissions yet: an Accountant
    can sign in and read this page and What's New, and nothing else. Finance access will be
    added in later releases."
  - `ROLE_ORDER` — add `"accountant"` after `"account_manager"` (**not** compile-enforced).
  - Every one of the 31 `PERMISSIONS` entries gets `accountant: none(ACCOUNTANT_NO_ACCESS_NOTE)`
    (one shared constant: "The Accountant role has no permissions yet. Finance access is being
    added in stages; until then everything on the web dashboard is hidden from it.").
  - Account Manager's **Invite Team Members** note: "…cannot assign them the Admin **or
    Accountant** role" (D2).
- `RoleCard.tsx` `COLOR_MAP.accountant = "border-l-teal-500"`.

`npm run tc` is the checklist for everything marked ✓ in §7: adding a member to `WebRole` breaks
every `Record<WebRole, …>` (`ROLE_CONFIG`, `ROLE_SIDEBAR_KEYS`, `COLOR_MAP`, `ROLE_LABELS`,
`ROLE_DESCRIPTIONS`, every `PERMISSIONS[].roles`) until it answers for the role. The spots marked
✎ are **not** compiler-checked and are where the maintainer role was once missed.

## 6. `/team` changes

Follows `maintainer` exactly; the role has no settings of its own, so its page is a
confirmation panel.

- **Store** (`useCurrentUserStore.ts`): `TeamRoleTab` += `"accountant"`; `CurrentUserState.isAccountant`
  (initial `false`); `addRoleTab` / `removeRoleTab` set/clear it.
- **Tabs/list:** `TabNavigation.tsx` `TeamTab` += `"accountants"`, tab label "Accountants" ✎;
  `src/app/team/page.tsx` renders `AccountantList` in its own tab **and** in "All" ✎;
  new `useAccountants.ts` (copy of `useMaintainers.ts` on `Accountants`) and
  `AccountantList.tsx`.
- **Routes/pages:** `src/app/team/new/accountant/page.tsx`,
  `src/app/team/[userUuid]/edit/accountant/page.tsx`, `AccountantPageContent.tsx` (redirects to
  basic info if the tab is absent, exactly as `MaintainerPageContent`; text: "This role has no
  permissions yet…"). `useUserFormPaths` += `accountant` ✓ (indexed by role tab).
- **Granting UI:** `RoleNavigation.tsx` — `ROLE_LABELS` ✓, `ALL_ROLES` ✎, and the availability
  filter becomes `(role !== "administrator" || canAssignAdmin) && (role !== "accountant" ||
canAssignAccountant)` (D2). `useTeamPermissions` gains `canAssignAccountant: isAdmin` (and its
  test fixtures).
- **`userOperations.ts`:**
  - `createUser`: after the maintainer block, `if (state.isAccountant) insert into "Accountants"
{ user_uuid, is_active: true }`.
  - `updateUser`: a block identical in shape to the maintainer one — insert if absent,
    reactivate if present, `is_active = false` (never delete) when the tab was removed.
  - `fetchUserById`: select `id, is_active` from `Accountants`; push the `accountant` tab and set
    `isAccountant` when active.
- **"Incomplete" users ✎ (easy to miss, compiler will not help):** `useIncomplete.ts` adds the
  `Accountants` `leftJoin` + `acct.id is null` (otherwise an accountant-only user shows up in
  the red "no role" banner — the exact regression its own docblock describes);
  `UserFormLayout.tsx` `hasNoRoles` adds `!isAccountant`; `IncompleteList.tsx` help text
  (line ~147) adds "Accountant".
- **Unchanged on purpose:** `/api/invite` and the Clerk webhook (role-agnostic), `validation.ts`
  (no accountant-specific fields), `useUserById.ts` (spreads `prev`, so it does not clobber
  `isAccountant`), `createUser`/`updateUser` for all other roles.

## 7. PowerSync

### 7.1 `src/lib/powersync/AppSchema.ts`

```ts
const AccountantsCols = {
  created_at: column.text,
  is_active: column.integer,
  user_uuid: column.text,
} satisfies PowerSyncColsFor<"Accountants">;
const Accountants = new Table(AccountantsCols, { indexes: { user_uuid: ["user_uuid"] } });
```

Plus `Accountants` in the `new Schema({…})` list and `export type AccountantsRecord =
PowerSyncDB["Accountants"]`. `database.types.ts` comes from `npm run gtl` after the migration.

### 7.2 `br_powersync/config/sync_rules.yaml` (separate repo — separate PR)

How the file works: one edition-3 stream per app. The **`web`** stream (client sends
`params: { app: "web" }`) is zero-trust: each query is `SELECT <Table>.* … JOIN <RoleTable> ON
<RoleTable>.is_active = true JOIN "Users" ON <RoleTable>.user_uuid = "Users".id WHERE
connection.parameter('app') = 'web' AND "Users".clerk_user_id = auth.user_id() AND
"Users".status_uuid != '<inactive>'`. Admin and viewer use `Users.is_admin` / `is_viewer`
instead of a role table. A leading **identity block** syncs each user's own `Users` row plus
their own `AccountManagers` / `Developers` / `Maintainers` rows (inactive users blocked) — that
is what lets `useUserAccess` see the role at all. The **`mobile`** stream is driver-scoped and
irrelevant here. **The file is not watched: the PowerSync service must be restarted.**

Stage 1 adds exactly two lines to `web`:

1. Identity, beside `Maintainers`:
   ```yaml
   - SELECT "Accountants".* FROM "Accountants" JOIN "Users" ON "Users"."clerk_user_id" = auth.user_id() AND "Users"."status_uuid" != '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5' WHERE connection.parameter('app') = 'web'
   ```
2. A new `# Accountant tables` section (before "Developer tables"), reference data only:
   ```yaml
   - SELECT "ChangeLog".* FROM "ChangeLog" JOIN "Accountants" ON "Accountants"."is_active" = true JOIN "Users" ON "Accountants"."user_uuid" = "Users"."id" WHERE connection.parameter('app') = 'web' AND "Users"."clerk_user_id" = auth.user_id() AND "Users"."status_uuid" != '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5'
   ```

**Why only those.** What an accountant-only user's shell reads in Stage 1: own `Users` row
(identity ✔, carries `changelog_last_read_at`), `UserStatuses` and `AppVersionPolicy` (already
synced to everyone), `Accountants` (new), `ChangeLog` (What's New page + sidebar dot — same as
the maintainer). Everything else the shell queries (`AccountManagerZones` for the zone store,
alert counts, the inspection badge) is empty-safe. Everything operational (Events,
PaymentHistory, Companies, Bleachers, Users-of-others…) is **not** synced — it is what Stage 3
adds, per capability, with a query built from the same template (`JOIN "Accountants"`).

**Deploy order (same as maintainer): migration → sync rules + PowerSync restart → app.**
Assumption to confirm at first deploy: PowerSync's Postgres publication covers new tables
automatically (the maintainer and sync-health migrations shipped without any `ALTER
PUBLICATION`).

## 8. Backend

Only the migration. No API route changes; no change to `/api/invite`, the webhook,
`requireAdminOrAccountManager`, or the PowerSync credentials route.

## 9. File-by-file change list

✓ = compile-enforced once `WebRole` / `TeamRoleTab` grow · ✎ = manual, compiler silent.

| Area      | File                                                                                                                                                                                                                     | Change                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| DB        | `supabase/migrations/20260930130000_accountant_role.sql`                                                                                                                                                                 | **new** — §4                                |
| DB        | `supabase/tests/accountant_role.test.sql`, `package.json` (`test:db:accountant`, append to `test:db:all`)                                                                                                                | **new**                                     |
| DB        | `database.types.ts`                                                                                                                                                                                                      | `npm run gtl`                               |
| PS        | `src/lib/powersync/AppSchema.ts`                                                                                                                                                                                         | table + schema list + `AccountantsRecord`   |
| PS        | `br_powersync/config/sync_rules.yaml`                                                                                                                                                                                    | 2 queries (§7.2)                            |
| Access    | `logic/determineAccess.ts`, `types.ts`, `hooks/useUserAccess.ts`, `logic/resolveUserAccessForRequest.ts`                                                                                                                 | §5                                          |
| Access    | `accessConfig.ts` ✓, `src/components/sidebar/useSidebarItems.ts` ✓ (+ `useSidebarItems.test.ts`)                                                                                                                         | §5                                          |
| Access    | `permissionPageData.ts` ✓ (+ `ROLE_ORDER` ✎, AM invite note ✎), `RoleCard.tsx` ✓                                                                                                                                         | §5                                          |
| Team      | `state/useCurrentUserStore.ts`, `db/userOperations.ts`                                                                                                                                                                   | §6                                          |
| Team      | `components/RoleNavigation.tsx` ✓/✎, `inputs/TabNavigation.tsx` ✎, `hooks/useUserFormPaths.ts` ✓, `hooks/useTeamPermissions.ts`                                                                                          | §6                                          |
| Team      | `hooks/useIncomplete.ts` ✎, `components/UserFormLayout.tsx` ✎, `lists/IncompleteList.tsx` ✎                                                                                                                              | §6                                          |
| Team      | `src/app/team/page.tsx` ✎; **new:** `hooks/useAccountants.ts`, `lists/AccountantList.tsx`, `pages/AccountantPageContent.tsx`, `src/app/team/new/accountant/page.tsx`, `src/app/team/[userUuid]/edit/accountant/page.tsx` | §6                                          |
| Tests/E2E | `playwright.config.ts` (`ROLES`, conditional project), `manageTeam/e2e/auth.setup.ts` (`ROLES`)                                                                                                                          | accountant, gated on `E2E_ACCOUNTANT_EMAIL` |

All paths under `src/features/…` unless shown in full; `manageTeam` and `userAccess` as in §5/§6.

**Found on the way — not changed by this feature:**

1. `RoleNavigation` offers Developer and Maintainer to account managers, but both tables are
   admin-only: the AM's save fails with an RLS error _after_ `Users` was inserted, leaving an
   orphan "incomplete" user and no invite. (D2 avoids this for Accountant only.)
2. `UserFormLayout.hasNoRoles` ignores `isMaintainer`, so an AM sees a maintainer-only user as
   "unclaimed" and may edit it.
3. `CLAUDE.md` ("all five roles") and `.claude/commands/preflight.md` (its role-by-role list) still
   describe five roles; the matrix has six, seven after this. Both should gain `maintainer` and
   `accountant`.
4. `useUserAccess`'s online fallback reads role tables through RLS, which is admin-only for
   `Developers`/`Maintainers`/`Accountants` — see R6.

## 10. Implementation sequence

Each step ends at a gate; do not start the next until it is green. Commands follow the
project's Definition of Done; per standing instruction, **Playwright is not run locally
(reported SKIPPED)** and Prettier is run only on touched files (repo-wide `lint` is red at
baseline).

| Step                    | Work                                                                                                                                                                   | Gate — what must be true before continuing                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1 Database**        | Migration + `accountant_role.test.sql`; `npm run gtl`                                                                                                                  | Migration applies (dry-run first inside `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container — host `psql` is absent and the local DB lags migrations — by piping the migration and then the test file, whose own `ROLLBACK` undoes both); the new test **and** `rls_multi_role.test.sql` pass (CI runs `supabase test db`, which picks up the whole `supabase/tests/` folder, so the new file needs no CI wiring); `database.types.ts` has `Accountants` and `git diff` of it is only that table. |
| **1.2 Access layer**    | `AppSchema`, `WebRole`, `UserAccessData`, `useUserAccess`, `resolveUserAccessForRequest`, `accessConfig`, sidebar keys, `permissionPageData`, `RoleCard` + their tests | `npm run tc` clean (every ✓ satisfied); `npx vitest run` green incl. new cases; no existing test expectation edited except adding `accountant_id: null` to `UserAccessData` literals.                                                                                                                                                                                                                                                                                                                                 |
| **1.3 `/team`**         | Store, tab, routes, pages, list, hook, `userOperations`, `useIncomplete`, `UserFormLayout`, `RoleNavigation` gating                                                    | tc + vitest green; **manual in the dev preview as an admin**: invite an accountant, see them in Accountants and All, edit, remove the role, re-add; create one user each of AM / driver / viewer / developer / maintainer and confirm nothing regressed.                                                                                                                                                                                                                                                              |
| **1.4 Sync rules**      | `br_powersync` PR: the 2 queries                                                                                                                                       | YAML loads; service restarted; with the local PowerSync stack, an accountant-only test user's client holds `Accountants` + `ChangeLog` + own `Users` row and **no other table**; `useUserAccess` → `active`.                                                                                                                                                                                                                                                                                                          |
| **1.5 E2E scaffolding** | Two specs + config (§11)                                                                                                                                               | Files type-check and lint; not executed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **1.6 Close-out**       | Matrix re-read against the code; final DoD report                                                                                                                      | Report with real tails of `npm run tc`, `npx vitest run`, `test:db:*`, `prettier --check <touched files>`; E2E marked SKIPPED with the reason.                                                                                                                                                                                                                                                                                                                                                                        |

Stages 2–4 are not started by anything above.

## 11. What to verify after each step, and tests

**Unit (Vitest)**

- `determineAccess.test.ts`: accountant-only → `active`, `["accountant"]` (not `no-roles-assigned`);
  admin + accountant; accountant + AM; accountant + driver → accountant, driver (web session
  kept); deactivated accountant → `account-deactivated`; driver-only unchanged by an absent row.
- `accessConfig.test.ts`: `mergeRoleConfigs(["accountant"])` allows exactly `/permissions` and
  `/changelog`, `defaultRedirect === "/permissions"`, `showSidebar`, does **not** allow
  `/dashboard`, `/quotes-bookings`, `/team`, `/assets`; `["account_manager","accountant"]`
  still redirects to `/dashboard`.
- `useSidebarItems.test.ts`: accountant sees only the Documentation section, no Quality
  Assurance dropdown.
- `useIncomplete.test.ts` (real SQLite harness already there): an accountant-only user is not
  incomplete; a user whose accountant row is inactive is.
- `useTeamPermissions.test.ts`: `canAssignAccountant` true only for admin.
- **new** `permissionPageData.test.ts`: `ROLE_ORDER` contains every `WebRole`; every entry has
  an `accountant` level of `none` in Stage 1 (guards the ✎ `ROLE_ORDER` gap and stops Stage 3
  from editing the matrix silently).

**SQL** — `supabase/tests/accountant_role.test.sql`

- shape: `is_active` defaults true, `user_uuid` not null, cascade on user delete;
- `get_user_roles()` = `{accountant}` for an accountant-only user; `{}` for an inactive row;
  `{}` for a deactivated user with an active row; and **still** correct for admin, AM, developer,
  viewer and maintainer users (guards R2);
- an accountant-only user sees **zero rows** in a representative sweep (`Events`, `Bleachers`,
  `PaymentHistory`, `Drivers`, `AccountManagers`, `WorkTrackers`, `DamageReports`, other users'
  `Users` rows), can read their own `Users` row and `ChangeLog`, and cannot select from or
  insert into `Accountants`.

**Playwright — written, not run (D8)**

- `src/features/manageTeam/e2e/accountant-invite.admin.spec.ts` (admin project): S1 invite flow
  end to end (Add Role → Accountant → confirmation panel → Save & Send Invite → "User created
  and invite sent" → appears under Accountants, absent from the Incomplete banner); S2 removing
  the role deactivates it.
- `src/features/manageTeam/e2e/accountant-invite.am.spec.ts` (AM project): S3 Accountant is not
  offered under + Add Role.
- `src/features/userAccess/e2e/roleAccess.accountant.spec.ts` (accountant project, needs the
  Clerk user): S4 lands on `/permissions`; sidebar shows only Documentation; `/dashboard`,
  `/quotes-bookings`, `/team` bounce back; the matrix shows an all-"none" Accountant column.

**Behaviour scenarios covered:** S1 admin invites an accountant · S2 admin removes the role ·
S3 AM cannot grant it · S4 accountant-only session · S5 accountant + AM = AM's access (unit) ·
S6 deactivated accountant sees "account deactivated" (unit) · S7 regression — creating every
other role is unchanged (manual in 1.3, existing unit tests).

## 12. Edge cases and error handling

- **Clerk.** Invite errors are unchanged (`clerkInviteErrorMessage`, duplicate-invite
  revoke-and-resend). The role is not sent to Clerk, so nothing new can fail there.
- **Duplicate email.** `isDuplicateUserEmailError` path unchanged; the `Accountants` insert is
  never reached.
- **`Accountants` insert fails** (non-admin via a stale UI, or a network drop after the `Users`
  insert): `toErrorMessage` toast, no navigation, and the existing "Incomplete" banner surfaces
  the half-created user — same behaviour as every other role; D2 removes the AM path for this
  role.
- **Deactivated user with an accountant row:** `get_user_roles()` → `{}` and
  `determineUserAccess` checks `status_uuid` first — the new role changes neither.
- **Role granted/removed while the user is signed in:** PowerSync streams the row,
  `useUserAccess` is reactive, sidebar and redirects update without a reload (as today).
- **PowerSync offline.** Access is computed from the local DB and keeps working offline.
  `createUser`/`updateUser` talk to Supabase directly and are online-only — unchanged, and
  acceptable (admin tooling, not local-first data).
- **Sync rules deployed before the migration:** the stream references a missing table; the order
  in §7.2 prevents it.
- **App deployed before the migration:** the fallback embed `Accountants!…` 4xx's in PostgREST
  and **every** user who reaches the fallback (notably driver-only users, who depend on it to
  see `DriverWelcome`) is shown "can't find account" — see R1.
- **Accountant-only user with nothing synced yet** sees a loading state, then `/permissions`
  (static) — no empty-data error, because no page they can open reads operational data.

## 13. Risks and dependencies

| #   | Risk                                                                                                                                               | Impact                                                                                          | Mitigation                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | App released before the migration                                                                                                                  | Fallback embed fails for all fallback users (driver-only users lose `DriverWelcome`)            | Order: migration → sync rules → app; called out in the PR description                                                                                                                                                                                      |
| R2  | `get_user_roles()` re-created from a stale definition                                                                                              | `maintainer` (or the lockout) silently revoked for everyone                                     | Copy from `20260910130000`; pgTAP asserts every existing role still resolves                                                                                                                                                                               |
| R3  | `sync_rules.yaml` is not watched                                                                                                                   | New role never syncs until restart                                                              | Restart is a named step in 1.4; verify with a real accountant-only client                                                                                                                                                                                  |
| R4  | A role enumeration missed (compiler silent)                                                                                                        | Accountant shows as "incomplete", or is claimable/editable by AMs (this happened to maintainer) | The ✎ list in §9; before closing 1.3, `grep -rn "Maintainers\|isMaintainer" src` and justify every hit                                                                                                                                                     |
| R5  | AM can reach the grant UI                                                                                                                          | Orphan half-created users                                                                       | D2                                                                                                                                                                                                                                                         |
| R6  | First-login flash of "No roles assigned": local DB empty → fallback → RLS hides `Accountants` (admin-only) → "no roles" until the first sync lands | Bad first impression for a brand-new role; shared by maintainer/developer today                 | Verify in 1.4. If it shows, the fix is a self-read `select` policy on `Accountants` (`user_uuid` = the caller) — one extra policy, deferred unless you want it now                                                                                         |
| R7  | "No access" holds only while no policy is blanket-permissive                                                                                       | A future `using (true)` leaks finance data to accountants                                       | Sweep test in §11; `ChangeLog` is the one intentional exception; bucket-level `storage.objects` policies are role-agnostic for **every** role and out of scope                                                                                             |
| R8  | Naming (`usersUuid` vs `user_uuid`)                                                                                                                | Schema inconsistency                                                                            | D1                                                                                                                                                                                                                                                         |
| R9  | PowerSync publication assumed to cover new tables                                                                                                  | Role row never reaches clients                                                                  | Confirm at first deploy (see §7.2)                                                                                                                                                                                                                         |
| R10 | Migration version collides with `develop`                                                                                                          | `supabase db push` refuses                                                                      | Renumber (precedent `1b55bf3d`)                                                                                                                                                                                                                            |
| R11 | No Clerk accountant user / E2E creds                                                                                                               | Accountant E2E cannot run                                                                       | Project registered conditionally on `E2E_ACCOUNTANT_EMAIL` (a project with no storageState **fails** rather than skips); needs, later: a Clerk user with a password, a seeded `Users` + `Accountants` row, the two `E2E_ACCOUNTANT_*` vars in `.env.local` |
| R12 | Stage 4 (restricting AM) changes existing behaviour                                                                                                | Regression for current AMs                                                                      | Out of scope here; its own spec, after Stage 3 proves the accountant can do the work                                                                                                                                                                       |

Dependencies: Supabase migration access (and the local DB catch-up before dry-running); write
access to the separate `br_powersync` repo and a way to restart that service; `npm run gtl`
needs the local Supabase running.

## 14. Out of scope

Any accountant permission or data access; restricting `account_manager`; moving finance pages or
RLS; the `Developers`/`Maintainers` AM-grant bug and the `hasNoRoles`-for-maintainer gap (§9,
reported not fixed); the stale role lists in `CLAUDE.md` and `preflight.md`; the
release-notes entry (written with the changelog workflow at PR time).
