# Maintainer role

Status: **DRAFT — awaiting approval**
Builds on [bleacher-annual-inspections.md](bleacher-annual-inspections.md), which
shipped as `fd25837` with the role question deliberately deferred.

## 1. What this changes

A sixth web role, `maintainer`, whose entire job today is the Annual
Inspections queue. It gets its own table, the same shape as `Developers` — a
role someone is granted, not a flag on a role they already have.

Who ends up seeing `/annual-inspections`:

| Role              | Page                | Record / correct an inspection        |
| ----------------- | ------------------- | ------------------------------------- |
| admin             | yes                 | yes                                   |
| **maintainer**    | **yes**             | **yes**                               |
| viewer            | yes                 | no                                    |
| account_manager   | **no — redirected** | yes, but only from the bleacher modal |
| developer, driver | no                  | no                                    |

The account manager is the one that moves: they lose the page, keep the
inspection block inside `/assets/bleachers?edit=N`, and keep the ability to
record from there. That is deliberate (decision below), not an oversight.

### Decisions locked before writing this

| #   | Question                                 | Answer                                                                                     |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | New role or a flag on `AccountManagers`? | New role, own `Maintainers` table — "almost a mirror of `Developers`".                     |
| 2   | Viewer                                   | Keeps read access to the page, exactly as today.                                           |
| 3   | The block in the bleacher modal          | Not hidden from anyone. `canEdit` stays `isAdmin \|\| isAccountManager \|\| isMaintainer`. |
| 4   | What a maintainer-only user may open     | `/annual-inspections`, `/permissions`, `/changelog`.                                       |
| 5   | RLS                                      | Teach the **existing** rules the new role. No new rules authored.                          |
| 6   | Clerk test user                          | Comes later; the e2e must not fail in the meantime.                                        |

## 2. Database

### 2.1 New table

Almost `Developers`: same four columns, without
`auto_subscribe_to_new_tickets`, which is a roadmap-notification setting with
no counterpart here.

```sql
create table public."Maintainers" (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_uuid  uuid        not null references public."Users" (id) on delete cascade,
  is_active  boolean     not null default true,
  constraint maintainers_pkey primary key (id)
);
create index "Maintainers_user_uuid_idx" on public."Maintainers" (user_uuid);
```

RLS: the four `rbac_*` policies copied from `Developers` verbatim — `{admin}`
for select, insert, update and delete. Granting a role is an administrator's
job, and nobody else has any reason to read the list.

### 2.2 `get_user_roles()` learns the role

Re-created from its current definition in
`20260525120000_inactive_user_lockout.sql` — the inactive-user short circuit
(`status_uuid = '7b65d5a1…'` → `'{}'`) stays exactly as it is — with one arm
added:

```sql
union all
select 'maintainer'
  where exists (
    select 1 from "Maintainers" m
    where m.user_uuid = u.id and m.is_active = true
  )
```

This is the single most important line in the spec. Everything else in the
codebase that gates on a role reads this function or the TypeScript mirror of
it, so the role is either known here or it does not exist.

### 2.3 The four existing policies learn the role

On `BleacherAnnualInspections` only, `'maintainer'` is added to the role arrays
of the policies written in `20260908120000`:

- `select` → `{admin, account_manager, viewer, maintainer}`
- `insert` / `update` / `delete` → `{admin, account_manager, maintainer}`

**Why this cannot be deferred.** PowerSync classifies an RLS refusal (42501) as
FATAL and drops the operation from its upload queue without telling anyone. A
maintainer who is not also an admin would see the form, get an "Inspection
recorded" toast, and lose the record silently — the worst failure this feature
can have. Nothing else in the database changes.

**Known debt, accepted:** `account_manager` stays in the write arrays even
though the page is gone for them, because they still record inspections from
the bleacher modal (decision 3). An account manager can therefore still write
through the API in ways the UI no longer offers. Narrowing that is a separate
change.

## 3. PowerSync

### 3.1 Schema

- `AppSchema.ts`: `Maintainers` table (`created_at`, `user_uuid`, `is_active`
  as `column.integer` — booleans arrive as 0/1), index on `user_uuid`, exported
  `MaintainersRecord`, added to the table list.
- `src/lib/zustandRegistery.ts`: `Maintainers: () => {}`.
- `npm run gtl` after the migration.

### 3.2 Sync rules (`br_powersync/config/sync_rules.yaml`)

Two additions to the `web` bucket:

1. **Identity**, beside the existing `AccountManagers` / `Developers` lines:
   the user's own `Maintainers` rows, blocked for inactive users. Without this
   `useUserAccess` cannot see the role at all and the user is bounced to
   "no roles assigned".
2. **Maintainer tables**, joined on `Maintainers.is_active = true`, mirroring
   the "Developer tables" section: `Bleachers`, `BleacherAnnualInspections`,
   `ChangeLog`. The queue joins `Bleachers`, so a maintainer with only the
   inspections table would see an empty page.

The `AccountManagers` bucket keeps `BleacherAnnualInspections` — they still
render the block in the bleacher modal.

## 4. TypeScript contract

```ts
// src/features/userAccess/logic/determineAccess.ts
export type WebRole =
  | "admin"
  | "account_manager"
  | "developer"
  | "viewer"
  | "driver"
  | "maintainer";
```

```ts
// src/features/userAccess/types.ts — UserAccessData
maintainer_id: string | null;
```

`determineUserAccess` pushes `"maintainer"` when `maintainer_id` is set, in the
same block as the others, **before** the `roles.length === 0` check — a
maintainer-only user must not be treated as having no roles.

`useUserAccess` adds a `leftJoin` on `Maintainers` with `is_active = 1`, exactly
like the existing `Developers` join.

```ts
// src/features/manageTeam/hooks/useTeamPermissions.ts
isMaintainer: boolean;
```

Adding a member to `WebRole` breaks every `Record<WebRole, …>` at compile time.
That is the point: `accessConfig.ts`, `permissionPageData.ts`,
`useSidebarItems.ts` and `RoleNavigation.tsx` all stop compiling until they
answer for the new role, and the compiler is a better checklist than this
document.

## 5. Access and navigation

### 5.1 `accessConfig.ts`

- New `maintainer` entry: `allowedPaths: ["/annual-inspections", "/permissions", "/changelog"]`, `showSidebar: true`.
- `account_manager` **loses** `"/annual-inspections"`.

`mergeRoleConfigs` unions paths across roles, so an admin who is also a
maintainer is unaffected, and an account manager who is also a maintainer gets
the page. `defaultRedirect` falls back to the first allowed path when
`/dashboard` is absent, so a maintainer-only user lands on
`/annual-inspections` — which is the whole of their job.

### 5.2 Sidebar — dropdown children need per-role filtering

`ROLE_SIDEBAR_KEYS` gains `maintainer: ["quality-assurance", "documentation"]`.

That alone is not enough, and this is the one piece of new machinery here.
Quality Assurance is a dropdown whose children are a flat
`{label, href}[]` with no role information, so today it is all-or-nothing:

- an **account manager** would keep seeing "Annual Inspections" and be bounced
  on click;
- a **maintainer** would see "Damage Reports", "Inspections" and "Repairs" and
  be bounced on all three.

So `DropdownChild` gains an optional `roles?: WebRole[]` (absent = everyone who
can see the parent), and `useSidebarItems` filters children against the user's
roles, dropping a dropdown that ends up empty. "Annual Inspections" is then
marked `roles: ["admin", "viewer", "maintainer"]` and the other three
`["admin", "account_manager", "viewer"]`.

### 5.3 The unread badge

`Sidebar.tsx` computes `useUnseenInspectionCount()` for everybody. Account
managers still sync the table (§3.2), so they would carry a badge for a page
they cannot open. The count is gated on the same rule as the sidebar entry —
admin, viewer or maintainer — and is otherwise unchanged.

### 5.4 `/permissions`

`ROLE_LABELS`, `ROLE_DESCRIPTIONS` and `ROLE_ORDER` gain the role;
`ROLE_ORDER` places it after `account_manager`, since that is who it reads
next to. Every existing `PERMISSIONS` entry gains a `maintainer` value —
`none()` for all of them, with one shared note explaining that the role covers
annual inspections and nothing else — except:

- **Annual Inspections** → `full()`.
- **Bleachers** → `read()`, since they open the bleacher modal to reach the
  inspection block.

The Annual Inspections entry's `account_manager` note is rewritten: they no
longer have the page, only the block inside the bleacher modal.

## 6. Granting the role

The Team module is per-role by construction: a tab, a route, a page component,
a list, and a branch in `userOperations`. Maintainer follows `developer`
exactly:

- `TeamRoleTab` gains `"maintainer"`; `RoleNavigation` gains its label and
  entry in `ALL_ROLES`; `useUserFormPaths` gains `maintainer`.
- `src/app/team/new/maintainer/` and `src/app/team/[userUuid]/edit/maintainer/`
  routes, plus `MaintainerPageContent` and `MaintainerList`.
- `userOperations.ts`: insert on create, insert/deactivate on update, and
  `loadExistingUser` pushes the `maintainer` tab when an active row exists.

The page content is deliberately thin — the role has no settings of its own,
so it is a confirmation panel, not a form. Only an administrator can reach any
of this (`rbac_*` on the table, and the Team page's existing admin gate).

## 7. Tests

### 7.1 Unit — `determineAccess.test.ts` (existing file, new cases)

- a user with only an active `Maintainers` row is `active` with `["maintainer"]`, not blocked as "no roles assigned"
- an inactive `Maintainers` row does not grant the role
- a deactivated user with a maintainer row is still `blocked: account-deactivated`
- admin + maintainer yields both roles

### 7.2 Unit — `accessConfig.test.ts`

- `mergeRoleConfigs(["maintainer"])` allows `/annual-inspections` and redirects there by default
- `mergeRoleConfigs(["account_manager"])` no longer allows `/annual-inspections`
- `mergeRoleConfigs(["account_manager", "maintainer"])` allows it

### 7.3 Unit — `useSidebarItems.test.ts` (existing file, new cases)

- a maintainer sees Quality Assurance with **only** Annual Inspections under it
- an account manager sees Quality Assurance **without** Annual Inspections
- an admin sees all four children
- a role whose dropdown children are all filtered out does not see the dropdown

### 7.4 SQL — `supabase/tests/maintainer_role.test.sql`

- table shape: `is_active` defaults true, `user_uuid` not null, cascade on user delete
- `get_user_roles()` returns `{maintainer}` for a maintainer-only user
- an inactive maintainer row yields `{}`
- a deactivated user with an active maintainer row yields `{}` (the lockout still wins)
- a maintainer can insert and update a row in `BleacherAnnualInspections`
- a maintainer cannot select from `Maintainers` (admin-only table)

### 7.5 E2E — what can run today, and what waits

`annualInspections.am.spec.ts` — runs now, against the seeded account manager:

1. `/annual-inspections` redirects away, and the sidebar has no Annual
   Inspections entry while the other three Quality Assurance links remain.
2. Opening `/assets/bleachers?edit=N` still shows the inspection block, and
   recording an inspection from it still works.

`annualInspections.maintainer.spec.ts` — written now, runs when the Clerk user
exists:

3. The maintainer sees the queue, records an inspection, and it survives a
   reload — the proof that RLS accepted the write.
4. The sidebar shows Quality Assurance with only Annual Inspections.

The harness already skips a role whose credentials are missing
(`auth.setup.ts` calls `setup.skip`), but a **project** with no storageState
file fails rather than skips. So `maintainer` is added to the `ROLES` list in
both `auth.setup.ts` and `playwright.config.ts`, and the config registers the
maintainer project only when `E2E_MAINTAINER_EMAIL` is set. Nothing breaks
before the user exists; the spec starts running the day it does.

Still needed from you, later: a Clerk user with a password, a seeded `Users` +
`Maintainers` row in `supabase/seed.sql` (then `npx supabase db reset`), and
`E2E_MAINTAINER_EMAIL` / `E2E_MAINTAINER_PASSWORD` in `.env.local`.

## 8. Edge cases

- **Maintainer-only user, first login.** No `/dashboard`, so
  `defaultRedirect` is `/annual-inspections`. Verified by 7.2 rather than left
  to chance — the fallback is `allowedPaths[0]`, which depends on array order.
- **Deactivated user.** `get_user_roles()` returns `{}` before it looks at any
  role table, and `determineUserAccess` checks `status_uuid` first. The new
  role changes neither.
- **Someone who is both an account manager and a maintainer** gets the page
  (union of paths) and full write access. No conflict to resolve.
- **The role is granted while the user is signed in.** PowerSync streams the
  new `Maintainers` row, `useUserAccess` is reactive, and the sidebar updates
  without a reload — the same behaviour as the existing roles.
- **Sync rules deployed before the migration**, or the other way round. The
  YAML references a table that does not exist yet; deploy the migration first.
- **A maintainer with no synced bleachers** sees an empty queue rather than an
  error — the page already renders "Nothing here."

## 9. Out of scope

- Narrowing `account_manager` out of the `BleacherAnnualInspections` write
  policies (§2.3 debt).
- Any maintenance feature beyond annual inspections. If the role is meant to
  grow, its `/permissions` description is the thing to revisit first.
