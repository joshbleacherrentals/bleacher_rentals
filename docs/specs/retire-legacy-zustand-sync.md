# Retire the legacy Zustand/REST/Pusher sync layer

Status: **approved · both phases implemented.**

Correction to the count used throughout this spec: the broadcast had **18** live
`updateDataBase(...)` call sites, not 23. The higher figure came from a grep that
counted five already-commented-out calls in `legacyDb.ts` and
`webhooks/route.ts`. The 18 are in `dashboard/db/client/db.ts` (8),
`app/team/_lib/db.ts` (4), `manageTeam/db/userStatusOperations.ts` (4),
`dashboard/db/client/updateEvent.ts` (1) and `swapBleacherEvents.ts` (1). None
was awaited, so removing them changed no control flow.

Implementation notes, added after approval:

- **§6 resolved before any code changed.** All six `Users` consumers live on
  `/dashboard` or `/repairs`, reachable only by admin, account manager and
  viewer — exactly the three roles the `web` sync stream gives the full `Users`
  table. A developer who needs `/team` is given the viewer role, so no
  sync-rule change was required and the permission matrix is unchanged.
- **`usePsUsers` was missing three columns the consumers rely on.**
  `filterOwnerOptions` types `status_uuid` as optional, so a row shape without
  it type-checks and silently stops filtering inactive users out of the owner
  dropdown. `email`, `is_admin` and `status_uuid` were added, with tests that
  fail if the columns go away again.
- **`usePsAddresses` was missing the geocoding columns** (`latitude`,
  `longitude`, `country`, `place_id`) that `getAddressFromUuid` returns. Added.
- **`getAddressFromUuid` became `useAddressFromUuid`.** Reading PowerSync
  reactively is a hook; there is no imperative equivalent, and the only caller
  was already a component.
- **A second, unrelated bug was found and fixed in `schedulingConflict`** — see
  below. It is a behaviour change beyond this spec's "no behaviour change"
  intent, called out rather than folded in silently.
- **Five further orphaned stores were deleted** beyond the four the audit
  named: `driversStore`, `tasksStore`, `taskStatusesStore`, `taskTypesStore`,
  `userRolesStore`, `dataRefreshTokenStore`. With the registry gone they had no
  importer at all, so `src/state/` is now empty and removed.

## The invalid-date bug in `schedulingConflict`

Found by a test written for the migration, not by the migration itself.

`evaluateInMemory` computed the occupied window as
`new Date(event.setupStart ?? event.eventStart)`. But "no setup" reaches the
form as an **empty string**, not null — `loadEventForModal` writes
`setup_start ?? ""` and the store defaults to `""` — so `??` does not fall
through, `new Date("")` is an Invalid Date, and every comparison against it is
false.

**The Scheduling Conflict alert therefore never fired for any event without an
explicit setup date**, independently of the 1000-row truncation. Two unrelated
faults were suppressing the same alert.

Fixed with an `occupiedBoundary` helper that treats blank as absent and returns
null when neither value parses, so the caller skips the event instead of
comparing against a date that cannot be ordered. The same helper now guards the
async `evaluate` path, where behaviour is unchanged (it already skipped rows
with null dates).

Follow-on from [full-table-refetch-storm.md](full-table-refetch-storm.md), which
paginated the legacy loader to stop it silently truncating tables at 1000 rows
and explicitly listed this migration as out of scope. Pagination was a stop-gap:
it made the layer correct while making it _heavier_ (2715 rows fetched where 1000
were fetched before). This spec removes the layer instead.

## Problem

The app has two independent ways of reading the same tables:

1. **PowerSync** — the local-first path `CLAUDE.md` mandates.
2. **The legacy layer** — `useSupabaseSubscriptions` → `useSetupTable` →
   `useFetchTable` → `fetchTableSetStoreAndCache`, filling ten Zustand stores
   from Supabase REST, cached in `localStorage`, invalidated over Pusher.

The legacy layer runs on **every signed-in page** (`SignedInComponents`), costs
16 HTTP requests and megabytes of main-thread `JSON.stringify` per load, and was
the source of the silent-truncation bug that made `schedulingConflict` evaluate
on 37% of `BleacherEvents`.

### The layer is far smaller than it looks

An audit of every consumer, excluding commented-out code:

| Store            | Rows | Live reader                                                             |
| ---------------- | ---- | ----------------------------------------------------------------------- |
| `Blocks`         | 1250 | **none** — only the dead `fetchBleachers`                               |
| `HomeBases`      | 15   | **none** — `getHomeBaseUuidByName`/`getHomeBaseOptions` have no callers |
| `UserStatuses`   | 3    | **none** — only `fetchUsers`, commented out at every call site          |
| `UserHomeBases`  | 38   | **none** — same                                                         |
| `Bleachers`      | 194  | `updateCurrentEventAlerts` only                                         |
| `WorkTrackers`   | 866  | `updateCurrentEventAlerts` only                                         |
| `Events`         | 1015 | `updateCurrentEventAlerts`, `calculateBestHue`, `deleteEvent`           |
| `BleacherEvents` | 2715 | `updateCurrentEventAlerts`, `EventConfigurationForm`                    |
| `Addresses`      | 2182 | `updateCurrentEventAlerts`, `getAddressFromUuid`                        |
| `Users`          | 77   | six components, all matching `clerk_user_id` or listing owners          |

Four of ten stores are downloaded on every page load and read by nobody.

Three further findings shrink the work again:

- **`updateEvent`'s `bleacherEvents` parameter is never used in its body.** The
  only reason `EventConfigurationForm` subscribes to `useBleacherEventsStore` is
  to pass an argument that is discarded. Dropping the parameter removes that
  consumer outright.
- **`InMemoryAlertContext` carries two dead fields.** Only two definitions still
  implement `evaluateInMemory`: `schedulingConflict` (needs `allEvents`,
  `allBleacherEvents`) and `eventRequirements` (needs `allBleachers`).
  `allWorkTrackers` and `allAddresses` are populated and never read —
  `bleacherTransportation` deliberately dropped its in-memory path when
  `useEventFormTransportationAlerts` replaced it.
- **The pattern already exists in this feature.**
  `useEventFormTransportationAlerts` is a PowerSync-driven hook that computes one
  alert family and writes it into `useCurrentEventStore.alerts`. This migration
  finishes a job that was already started.

So after removing dead stores and dead parameters, the layer rests on **four**
consumption points: the alert calculation, `calculateBestHue`, `deleteEvent`'s
manual store patch, and `Users` in six components.

### Pusher exists only for this

`db-changes-channel` has exactly one subscriber — `useSubscribeToDbChanges` — and
`pusherClient` is imported nowhere else. Once the stores are gone, the 23
`updateDataBase(...)` calls broadcast to nobody.

## Scope

**Phase 1 — retire the stores.** Migrate the four consumption points to
PowerSync, delete the ten stores and the loader machinery, delete the dead code
the audit found.

**Phase 2 — retire the broadcast.** Remove the 23 `updateDataBase(...)` calls,
`db.actions.ts`, `pusher.client.ts`, `pusher.server.ts`, the `pusher` dependency
and its env vars.

Phase 2 is specified here but is a **separate commit**, landed only after Phase 1
is verified in staging. Phase 1 leaves `updateDataBase` calling a broadcast with
no listener: wasteful but harmless, and it keeps the revert surface small.

Out of scope: any change to sync rules, to `AppSchema.ts`, or to what data a role
may see. Every table involved is already synced to web clients.

## Design

### 1. Alerts — `updateCurrentEventAlerts` becomes a hook

The central change, and the only one that alters _how_ code runs rather than
where it reads from.

Today `updateCurrentEventAlerts` is an imperative function reading `getState()`,
called from `useCurrentEventStore.subscribe` and from the `setEvents` /
`setBleacherEvents` / `setBleachers` / `setTasks` store setters — i.e. it re-runs
when a REST fetch lands.

It becomes `useEventFormAlerts()`, a hook mounted beside
`useEventFormTransportationAlerts` in the event config form, modelled on it
exactly: read PowerSync through `usePsEvents` / `usePsBleacherEvents` /
`usePsBleachers`, compute in `useMemo`, write to `useCurrentEventStore.alerts` in
an effect only when the result differs.

Alert-family ownership must stay disjoint or the two hooks will fight:

- `useEventFormTransportationAlerts` owns `title === "No Transportation"`.
- `useEventFormAlerts` owns everything `evaluateInMemory` produces
  (`"Scheduling Conflict"`, `eventRequirements`' title).
- Each hook replaces only its own titles and preserves the rest — the same
  merge rule both sides already use, made symmetric.

The four store-setter call sites disappear with the stores. The
`useCurrentEventStore.subscribe` call site disappears too: a hook re-runs on
store change by subscribing to the fields it reads, as
`useEventFormTransportationAlerts` already does.

`evaluateInMemory` keeps its signature; `InMemoryAlertContext` loses
`allWorkTrackers` and `allAddresses` and its row types change (below).

### 2. `usePsBleachers` needs one more column

`eventRequirements.evaluateInMemory` reads `b.bleacher_type_uuid`, which
`usePsBleachers` does not select. Added to the select list and to
`PsBleacherRow`. No other hook is affected; the extra column is already synced.

### 3. Types — `Tables<...>` gives way to `Ps*Row`

`InMemoryAlertContext` currently types its arrays as full Supabase rows:

```ts
allEvents: Tables < "Events" > [];
allBleacherEvents: Tables < "BleacherEvents" > [];
allBleachers: Tables < "Bleachers" > [];
```

PowerSync hooks return narrower rows with local-table conventions, so these
become `PsEventRow[]`, `PsBleacherEventRow[]`, `PsBleacherRow[]`.

Two consequences the compiler will surface and which must be handled, not cast
away:

- **Booleans arrive as `0 | 1 | null`.** `Tables<"Events">.deleted` is `boolean`;
  `PsEventRow.deleted` is `number | null`. Neither surviving definition reads a
  boolean column today, but the types must be correct for the next one that does.
- **Nullability widens.** `PsBleacherRow.bleacher_seats` is `number | null`
  where `Tables<"Bleachers">.bleacher_seats` is `number`.
  `eventRequirements` sums `b.bleacher_seats` and must coalesce.

### 4. `usePsEvents` filters differently — verified compatible

`usePsEvents` applies `deleted = 0 AND event_status != 'lost'`;
the `Events` store held everything RLS returned. `schedulingConflict` only
considers `other.event_status === 'booked'` and `calculateBestHue` only reads
booked-range hues, so no surviving consumer can observe the difference. Asserted
by test, not by inspection.

### 5. `calculateBestHue` and `deleteEvent`

- `calculateBestHue(state, events)` already takes events as a parameter. Its
  caller in `useCurrentEventStore.subscribe` is the problem, not the function:
  it moves into `useEventFormAlerts` (or a sibling hook) and is fed
  `usePsEvents()`. The function itself is unchanged and its tests stand.
- `deleteEvent` soft-deletes through PowerSync and then hand-patches
  `useEventsStore` "so non-PowerSync consumers reflect the change". With no
  non-PowerSync consumers left, the patch is deleted; the PowerSync write already
  drives every reader reactively.

### 6. `Users` in six components

`CellEditor`, `CreateEventButton`, `eventConfiguration/tabs/CoreTab`,
`maintenanceEvents/tabs/CoreTab`, `DriverListForWeek` and
`EventConfigurationForm` each read `useUsersStore` for one of two things: find a
user by `clerk_user_id`, or list users to pick an owner. `usePsUsers` already
returns `id`, `first_name`, `last_name`, `clerk_user_id` — everything they use.

**This is the one real risk in the migration.** REST reads are governed by RLS;
PowerSync reads are governed by sync rules, and they are not the same rule
written twice. The `web` stream syncs the full `Users` table only to **admins**,
**active account managers** and **viewers**; every other web role receives only
its own row.

Before any of the six is switched, each must be answered explicitly: which roles
can reach this screen, and does each of them sync the rows the screen needs? A
role that reaches an owner dropdown while syncing one `Users` row would see a
one-entry list — a silent regression of exactly the kind this whole effort is
about. The answers go in the PR description, per screen, and any gap is a
blocker, not a follow-up.

### 7. Deletions

Phase 1 removes:

- `src/hooks/useSupabaseSubscriptions.ts`, `useSetupTable.ts`, `useFetchTable.ts`,
  `useCachedTable.ts`, `useSubscribeToDbChanges.ts`
- `src/lib/fetchSetStoreAndCache.ts`, `src/lib/supabase/fetchAllRows.ts`,
  `src/lib/pusher/reconnectState.ts`, `src/lib/zustandRegistery.ts`
- the ten stores under `src/state/`
- `fetchBleachers` and `fetchDashboardEvents` in
  `src/features/dashboard/db/client/db.ts`
- `getHomeBaseUuidByName` and `getHomeBaseOptions` in `src/utils/utils.ts`
- `src/features/manageTeam/util/fetchUsers.ts`
- `updateEvent`'s unused `bleacherEvents` parameter and
  `EventConfigurationForm.refreshDashboardStores`
- `useVisibilityChangeRefresh` if it has no other caller at implementation time

`fetchAllRows` and `reconnectState` were added two commits ago and are deleted
here. That is the correct outcome — they were insurance for a layer being
removed, and they did their job by making the bug visible and bounded.

`TableName` (currently exported from `zustandRegistery`) moves to
`src/lib/tableName.ts` for Phase 1, since `db.actions.ts` still imports it, and
is deleted with it in Phase 2.

Zustand itself stays. `useCurrentEventStore`, `usePermissionsStore`,
`useDashboardEventsStore` and the dashboard filter stores hold client state that
is not in a table; that is what the library is for. What goes away is using it as
a table mirror.

## Behaviour scenarios (Playwright)

Run under the role projects described in `CLAUDE.md`.

1. **Admin opens the dashboard.** Grid renders as today. Network shows no
   `/rest/v1/` full-table reads on load.
2. **Admin opens an event with a bleacher double-booked against another booked
   event.** "Scheduling Conflict" appears. This is the alert that was silently
   missing whenever the conflicting `BleacherEvents` row sat past row 1000.
3. **Admin changes the assigned bleachers so the conflict is resolved.** The
   alert disappears without a save or a reload — reactivity is the point of the
   rewrite.
4. **Admin opens an event whose assigned seats do not match the requirement.**
   `eventRequirements` alert appears with the same text as today.
5. **Transportation and scheduling alerts coexist.** Both hooks write; neither
   erases the other's family.
6. **Account manager repeats 2 and 4.** Confirms sync-rule coverage for the
   non-admin role that reaches these screens.
7. **Account manager opens the event owner dropdown.** Lists the same users as
   before the migration — the check from §6.
8. **Viewer opens an event.** Read-only view renders; alerts computed.
9. **Admin deletes an event.** It leaves the grid immediately, with
   `deleteEvent`'s manual store patch gone.
10. **Work tracker modal opens with pickup and dropoff addresses.** Fields
    populate as today.

## Edge cases and error handling

- **First load on a new device.** The legacy layer showed a `localStorage` copy
  instantly; PowerSync shows its local DB, which on a brand-new device is empty
  until the first sync completes. Every migrated screen must render a defined
  empty/loading state rather than an alert computed from zero rows — an
  alert-free form is indistinguishable from a form with no problems. `usePs*`
  hooks return `[]` while loading, so **each migrated hook must distinguish
  "loaded and empty" from "not loaded yet"** and skip writing alerts in the
  latter case. This is the sharpest regression risk in the spec.
- **Offline.** Better than today: PowerSync reads its local DB, where the legacy
  layer needed the network and fell back to a cache of unknown age.
- **Clerk session not ready.** `useUserAccess` already gates
  `SignedInComponents`; no REST call remains that could 401.
- **PowerSync not yet connected.** Existing `SystemProvider` behaviour, unchanged.
- **A role that syncs no `Users` rows reaches a migrated screen.** Blocker, per
  §6 — resolved before merge, either by routing or by a sync-rule change, and a
  sync-rule change is its own spec.

## Testing

Unit (Vitest), written first:

- `schedulingConflict.evaluateInMemory` and `eventRequirements.evaluateInMemory`
  against `Ps*Row` fixtures, including the null-seat and `0/1` boolean cases the
  new types allow.
- Equivalence: the same scenario expressed as old-shape and new-shape rows
  produces identical `AlertPayload[]`. This is the regression net for §3.
- A `usePsEvents`-shaped fixture containing a deleted and a lost event proves §4
  — neither can change a verdict.
- Alert-family merge: each hook replaces only its own titles and preserves the
  other's, in both orders.
- The not-yet-loaded case writes no alerts.

E2E: the ten scenarios above, across the admin, am and viewer projects.

## Permissions

`src/features/userAccess/permissionPageData.ts` is expected to need no edit: this
changes where data is read from, not who may read or write it. But §6 makes that
a claim to _verify_, not assume — if any screen turns out to need a sync-rule
change to keep a role working, that role's effective capability has changed and
the matrix must be updated in the same commit.

## Definition of Done

`npm run tc`, `npx vitest run`, and `npm run test:e2e` across the affected role
projects, with real output. Playwright is **required** for this one: the previous
round skipped it by agreement, but this change touches how every signed-in page
loads data and unit tests cannot cover scenario 7.

Only touched files formatted; no repo-wide `npm run format`.
