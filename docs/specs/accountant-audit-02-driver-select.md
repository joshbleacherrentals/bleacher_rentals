# Accountant Audit 02: the driver select and the driver's details

Status: **DRAFT 2026-11-06, waiting for "Approved"** (0 open decisions; readings to confirm in
§1). Build order: **02 of 04**. Needs: [01](accountant-audit-01-tab.md) (the tab and
`AuditTab`). Needed by: [04](accountant-audit-04-table.md) (the chosen driver feeds the table).
Spec 03 does not need it: its data is keyed by a driver uuid it is given.
Plan: [accountant-audit-plan.md](accountant-audit-plan.md). Branch: `q4-sprint3-finance`.

## 0. The feature in brief (the same in the plan and in all four specs)

**The request (user, 2026-11-06, translated).** A new page-tab on `/accountant`, named "Audit".

- **Who it is for:** users with the Accountant role. Admin can open it too. It is not for
  Account Manager, Developer, Viewer, Maintainer or Driver.
- **What it does:** on the tab the user picks a driver in a search select, and a table of all
  of that driver's work trackers appears. Columns: Status, Date, Bleacher number, Type, Pickup
  location, Dropoff location, Drive time, Distance (miles / km), and Paid or Not paid.
- **Where the data comes from:** the `WorkTrackers` table. Paid / Not paid is not stored on a
  tracker. Take the tracker's `date`, find the `WorkTrackerGroups` row (the driver's week) that
  holds that date, and read its `is_paid`.
- **Reuse:** /work-trackers already sorts trackers into weekly groups. Use that code wherever
  possible, do not write new code for it. The Status column uses the same icons as
  /work-trackers.
- **Why:** a history of a driver's trackers, so an accountant can check them quickly, instead of
  opening week after week on /work-trackers and spending time hunting for the right week,
  driver and tracker.
- **How we work:** every spec runs in its own chat, so every spec repeats this context. Each
  spec exists twice: English in the repository, and a full Ukrainian copy as an artifact that
  is not committed. The user takes every decision; a question is asked, never guessed.
- **Design:** `docs/design/accountant-audit/` (`README.md` and three artboards: Main, Search,
  Table). Names, addresses, phone numbers and dates in it are made up.

**Decisions taken by the user (2026-11-06).** The full text, with the options, is in the plan §3.

- **D1:** every status is listed: draft, released, accepted, the in-progress ones, completed,
  cancelled, declined, abandoned.
- **D2:** a tracker whose group cannot be found (no date, or no group for its week) shows "–"
  in the payment column, neither Paid nor Not paid.
- **D3:** the Bleacher column shows the assigned bleacher (`bleacher_uuid`), not the one the
  driver confirmed in the mobile app (`actual_bleacher_uuid`).
- **D4:** the select lists every driver, deactivated ones too. Accountant and Admin both see
  the drivers of all zones.
- **D5:** newest date first. Trackers of one day go by pickup time, Any Time last in the day.
- **D6:** pages of 25 / 50 / 100 with the existing `Pagination` component. The page and the
  size are kept in the URL.
- **D7:** a block with the driver's Address, Phone and Email sits between the select and the
  table (it is in the design, not in the task text).
- **D8:** the chosen driver is kept in the URL.
- **D9:** a row of the table does nothing when clicked.
- **D10:** the Type column is a coloured badge with an icon, as in the design.
- **D11:** four specs and a plan (this split).
- **D12:** a deactivated driver has an "Inactive" label in the open list of the select.
- **D13:** the drivers in the open list are in alphabetical order: first name, then last name.

**What the code already has (researched 2026-11-06).**

- **The page.** `src/app/accountant/page.tsx`. Its tabs are declared in `ACCOUNTANT_TABS`
  (`src/features/quotesAndBookings/utils/listTabs.ts`): Collections (the one a bare
  `/accountant` opens), AR Deposits, Need attention. The page's hook `useListPageState` owns
  `tab`, `page`, `pageSize`, `sort`, `q`, `showDeleted` and the filters in the URL, and keeps
  every parameter it does not own. Collections is the model of a tab with parameters of its own
  (`csort`, `cdir`, `cnotdue`) that hides the receivables chrome: the filter sidebar, the Filter
  button, Show Deleted, the search box and the filter chips.
- **Access.** `/accountant` is in `allowedPaths` of `admin` and of `accountant`
  (`src/features/userAccess/accessConfig.ts`) and of no other role. A tab inside it is out of
  reach of the other five roles with no extra code.
- **Permissions matrix.** `src/features/userAccess/permissionPageData.ts` has seven roles
  (`admin`, `account_manager`, `accountant`, `maintainer`, `driver`, `viewer`, `developer`).
  CLAUDE.md says to update it in the same commit as the change. `permissionPageData.test.ts`
  pins the exact list of rows the accountant is granted, so a new row must be added there too.
- **Tables.**
  - `WorkTrackers`: `date` (text `YYYY-MM-DD`, nullable), `driver_uuid`, `status` (enum),
    `bleacher_uuid` -> `Bleachers.bleacher_number`, `work_tracker_type_uuid` ->
    `WorkTrackerTypes` (`code`, `display_name`), `pickup_address_uuid` and
    `dropoff_address_uuid` -> `Addresses` (`street`, `city`, `state_province`, `zip_postal`),
    `drive_minutes`, `distance_meters`, `pickup_time_start`, `worktracker_group_uuid`.
  - `WorkTrackerGroups`: one row per driver per week (`unique (driver_uuid, week_start)`),
    Monday to Sunday (`week_start`, `week_end`), with `is_paid` (local value 0 / 1 / null).
    A database trigger (`assign_worktracker_to_group`) creates the group with the week's first
    tracker and fills `WorkTrackers.worktracker_group_uuid` whenever a tracker has a date and a
    driver. A tracker with no date has no group.
  - `Drivers` (`user_uuid`, `address_uuid`, `phone_number`, `is_active`), `Users` (`first_name`,
    `last_name`, `email`, `phone`, `status_uuid`; `STATUSES.inactive` is the deactivated one).
- **Local-first reads.** App data is read from the local PowerSync database through `db`
  (Kysely) and `useTypedQuery(compiled, expect<T>())`, never `supabase.from(...)`
  (`docs/POWERSYNC_ARCHITECTURE.md`). The local tables `WorkTrackers` and `WorkTrackerGroups`
  both have an index on `driver_uuid` (`src/lib/powersync/AppSchema.ts`).
- **Sync.** The Accountant and the Admin buckets of `br_powersync/config/sync_rules.yaml` give
  the whole `WorkTrackers`, `WorkTrackerGroups`, `WorkTrackerTypes`, `Drivers`, `Users`,
  `Addresses` and `Bleachers` tables, so no sync-rule change is expected. It stays unchecked
  by a test, so the implementer reads those buckets again before starting.
- **What /work-trackers offers for reuse.**
  - `WorkTrackerStatusBadge` with `showText={false}`: the status icon, as in `TripList`.
  - `WORK_TRACKER_TYPE_STYLES` and `WORK_TRACKER_TYPE_STYLE_FALLBACK`
    (`src/features/workTrackers/constants.ts`): the colour and icon of each type.
  - `formatDriveTime` ("2.4 hrs") and `formatMileage` ("21.4 mi (34.4 km)")
    (`src/features/workTrackers/util.ts`).
  - `useDrivers` and `SelectUserDropDown`, the select behind `SelectDriver`.
  - `workTrackerGroupPaid.ts` and `useWorkTrackerGroupPaid`: read one group by (driver, week
    start). That fits a single week, not a history; a history needs the group of each
    tracker's date, which is a join by date.
  - `Pagination` and `PageSize` (25 / 50 / 100), and `DataTable` (`src/components/DataTable.tsx`).
- **Read-only.** The tab writes nothing. Marking a week Paid stays on the Work Trackers pages.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright
  specs are written and **not run** (the user's rule); mark that step SKIPPED in the report.
  The seeded E2E admin user has no `Users` row locally, so admin specs cannot run there.

## 1. What this spec decides

This spec adds, to the tab of spec 01: the search select where a driver is chosen, the driver
being kept in the URL, and the block with the driver's Address, Phone and Email.

**Decisions that apply (plan §3), with the user's answers:**

- **D4: which drivers the select lists.** Options were: active drivers only (as the select on
  /work-trackers), or every driver including deactivated ones. **User's answer:** every driver,
  deactivated ones too. Consequence: `useDrivers` gets an option that drops its two "active"
  conditions. The select shows drivers of all zones to the accountant and the admin alike.
- **D12: marking a deactivated driver.** **User's answer:** an "Inactive" label beside the name
  in the open list.
- **D13: the order in the open list.** Options were: the order the existing query gives (by user
  id, not alphabetical), or alphabetical. **User's answer:** alphabetical, first name then last
  name, sorted in Audit only. Other pages are not changed.
- **D7: the driver's details block.** **User's answer:** add it, with Address, Phone and Email,
  between the select and the table. It is in the design but was not in the task text.
- **D8: the chosen driver in the URL.** **User's answer:** yes. After F5, Back or a copied link
  the same driver opens.

**Readings to confirm:**

- **R1:** a new component `AuditDriverSelect` is built on `SelectUserDropDown` and `useDrivers`,
  rather than adding flags to `SelectDriver`. `SelectDriver` also reads `DriverUnavailability`
  for a date and prints "Showing drivers assigned to your zones." to every non-admin, which is
  wrong for an accountant who sees all zones. Three new flags would change a component the work
  tracker window uses. `SelectDriver` is not touched.
- **R2:** the "Inactive" label is drawn in the open list only, not on the closed select.
- **R3:** a driver is inactive when `Drivers.is_active` is false **or** the user's `status_uuid`
  is `STATUSES.inactive`.
- **R4:** the select is 360px wide (`w-[360px] max-w-full`, as the design), placeholder "Choose
  driver", search placeholder "Search drivers...", empty message "No driver found.". Searching
  matches the name and the email, as `SelectDriver` does. The clear button and the "click the
  chosen driver again to clear" behaviour come with `SelectUserDropDown`.
- **R5:** the avatar and name in the select are what `UserSmall` draws today (an avatar with
  initials, the name beside it). The design's grey initials circle is that.
- **R6:** the URL parameter is `driver`, holding the driver's id (`Drivers.id`). A value that is
  not in the loaded list of drivers is treated as no driver and removed from the URL. It is
  judged only after the list has loaded, so a link is not dropped while loading.
- **R7:** choosing or clearing a driver uses `router.replace` (no new history entry), as
  Collections does for its parameters.
- **R8:** when the user goes from Audit to another tab, `driver` stays in the URL (the page keeps
  parameters it does not own) and comes back with the tab. Nothing is cleaned.
- **R9:** in the details block a missing value shows "–", so the block keeps its three items.
  Phone is `Drivers.phone_number`, and if that is empty `Users.phone` (the rule of the driver's
  page, `fetchDriverHeaderInfo`). Address is one line, `street, city, state zip`, with missing
  parts left out (the rule of `formatAddressForCopy`).
- **R10:** while a driver is chosen and their details are loading the block draws nothing; the
  layout does not reserve its height.

## 2. Research findings

- `useDrivers` (`workTrackers/hooks/useDrivers.db.ts`) builds one Kysely query inside `useMemo`:
  `Drivers d` joined to `Users u`, filtered `d.is_active = 1` and `u.status_uuid` in (active,
  invited), then `applyDriverScope`, ordered by `d.user_uuid`. It also reads the current user
  and, for a non-admin, the active `AccountManagers` row. With `showAll: true` the scope is
  `all`. For an accountant that is the only scope that returns drivers (`resolveDriverScope`
  gives `none` to a non-admin without an account-manager row).
- `DriverWithUser` already has `is_active`. It does not have `status_uuid`; the query does not
  select it.
- Local booleans are 0 / 1; the hook casts the rows to `DriverWithUser`, so `is_active` is a
  number at run time. Test it with truthiness, never `=== true`.
- `SelectUserDropDown` renders `UserSmall` for the trigger and for every row, takes
  `renderOptionExtra` (drawn at the end of a row), `getSearchValue`, and calls
  `onChange(id === value ? null : id)`.
- `fetchDriverHeaderInfo` (`workTrackers/db/db.ts`) reads the driver's page header from Supabase
  directly (online only): `Drivers.phone_number`, the `Addresses` row, and the `Users` row. The
  Audit block reads the same facts from the local database instead (CLAUDE.md). The Accountant
  and Admin buckets give `Drivers`, `Users` and `Addresses` whole.
- `CollectionsTab` shows the pattern for URL state: `useSearchParams` to read, `router.replace`
  with `scroll: false` to write, and a pure helper (`withCollectionsListState`) that keeps every
  other parameter.
- `formatAddressForCopy` (`venues/logic/formatAddressForCopy.ts`) is pure but typed for
  non-null strings.

## 3. Design

**`useDrivers.db.ts`.**

- A new option: `useDrivers({ showAll?, includeInactive? })`. `includeInactive` is false by
  default, so every existing caller gets the same rows.
- The query is moved into an exported pure function
  `buildDriversQuery({ currentUser, scope, includeInactive })` so a test can run its SQL on a
  real SQLite database. With `includeInactive` it leaves out `d.is_active = 1` and the
  `u.status_uuid` condition.
- The query also selects `u.status_uuid as status_uuid`; `DriverWithUser` gets
  `status_uuid?: string | null` (optional, so existing mocks and fixtures still type-check).

**`utils/auditDrivers.ts`** (new, pure).

```ts
export type AuditDriverOption = {
  id: string; // Drivers.id
  driverUuid: string;
  clerkUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  isInactive: boolean; // R3
};
export function isDriverInactive(d: { is_active: unknown; status_uuid?: string | null }): boolean;
export function toAuditDriverOptions(drivers: DriverWithUser[]): AuditDriverOption[]; // D13
```

`toAuditDriverOptions` sorts by `` `${firstName} ${lastName}` `` with
`localeCompare(undefined, { sensitivity: "base" })`, and uses the id as the last tie-break so the
order never flips between renders. `id` and `driverUuid` are `driver_uuid`, and `clerkUserId` is
`user_id`, the way `SelectDriver` maps a driver into its option.

**`hooks/useAuditDriverOptions.ts`** (new). `useAuditDriverOptions()` calls
`useDrivers({ showAll: true, includeInactive: true })` and returns
`{ options: AuditDriverOption[]; isLoading: boolean }` built with `toAuditDriverOptions`. It is
called once, by `AuditTab`.

**`components/AuditDriverSelect.tsx`** (new). A presentational component, props
`{ options; isLoading; value: string | null; onChange(id | null) }`. It renders
`SelectUserDropDown` with the texts of R4. `renderOptionExtra` draws, for an inactive driver, a
small grey pill "Inactive" at the end of the row
(`ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600`). No zones note is passed.
`getOptionTitle` is not used.

**`utils/auditUrlState.ts`** (new, pure).

```ts
export const AUDIT_DRIVER_PARAM = "driver";
export function parseAuditDriver(searchParams: { get(key: string): string | null }): string | null;
export function withAuditDriver(current: URLSearchParams, driverUuid: string | null): string;
```

`parseAuditDriver` returns the non-empty trimmed value or null. `withAuditDriver` copies `current`,
sets or deletes `driver`, keeps every other parameter, and returns the query string.

**`db/auditDriverInfo.ts`** (new). `buildAuditDriverInfoQuery(driverUuid)`: `Drivers d` inner join
`Users u` on `u.id = d.user_uuid`, left join `Addresses a` on `a.id = d.address_uuid`, where
`d.id = driverUuid` (a null driver uses the inert sentinel `"__none__"`), selecting
`d.phone_number`, `u.phone`, `u.email`, `a.street`, `a.city`, `a.state_province`, `a.zip_postal`,
limit 1. And a pure `toAuditDriverInfo(row)`:

```ts
export type AuditDriverInfo = {
  address: string | null;
  phone: string | null;
  email: string | null;
};
```

with the rules of R9 (empty strings count as missing).

**`hooks/useAuditDriverInfo.ts`** (new). `useAuditDriverInfo(driverUuid: string | null)` runs the
query with `useTypedQuery(compiled, expect<Row>())` and returns `{ info, isLoading }`.

**`components/AuditDriverInfo.tsx`** (new). Three items in a wrapping row, 40px column gap, as
the design's Table artboard: lucide `MapPin`, `Phone`, `Mail` icons (18px, `gray-500`), an
uppercase 12px label (Address, Phone, Email), and the value (14px). A missing value shows "–".
`data-testid="audit-driver-info"`.

**`AuditTab.tsx`** (changed from spec 01).

- Reads `driver` with `parseAuditDriver(useSearchParams())`, and the options with
  `useAuditDriverOptions()`.
- Renders `AuditDriverSelect` first (`mt-5`, as the design), with those options.
- `onChange` calls `router.replace(`${pathname}?${withAuditDriver(params, id)}`, { scroll: false })`.
- When a driver is chosen it renders `AuditDriverInfo` under the select. When none is chosen it
  renders the empty state of spec 01.
- R6: once `isLoading` is false, a `driver` value that is not among the options is removed with
  the same `router.replace`.
- The area below the details block stays empty until spec 04.

No database change, no sync-rule change, no permissions change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1 (accountant):** on Audit open the select; it lists drivers; type part of a name and the
  list narrows; pick one; the URL has `driver=<id>`; the details block shows Address, Phone and
  Email; the empty state is gone.
- **S2:** reload the page; the same driver is still chosen and the block is shown.
- **S3:** clear the driver with the select's X button; the URL has no `driver`; the empty state is
  back.
- **S4:** open `/accountant?tab=audit&driver=00000000-0000-0000-0000-000000000000`; the page
  ends up with no driver and no `driver` in the URL.
- **S5:** the open list shows an "Inactive" label beside a deactivated driver and not beside an
  active one. It needs a deactivated driver in the seed; if there is none the scenario
  `test.skip`s with a message saying so.
- **S6 (admin):** the same as S1 for an admin (`audit.admin.spec.ts`).
- **S7:** go to Collections and back to Audit; the driver is still chosen.

## 5. Tests (Vitest)

- `useDrivers.includeInactive.test.ts` (new): `buildDriversQuery` on SQLite with four drivers
  (active; `is_active` 0; user status inactive; user status invited). Without the option: the
  active and the invited one. With it: all four. The scope still applies (an account manager's
  zones narrow the list in both cases).
- `auditDrivers.test.ts`: `isDriverInactive` (0, null, 1 for `is_active`; inactive status);
  `toAuditDriverOptions` sorts by first then last name, ignores case, is stable for equal names.
- `auditUrlState.test.ts`: `parseAuditDriver` (missing, empty, spaces, value); `withAuditDriver`
  sets, replaces, deletes, and keeps `tab`, `page`, `csort` and the rest.
- `auditDriverInfo.test.ts`: `buildAuditDriverInfoQuery` on SQLite (the phone falls back from
  `Drivers.phone_number` to `Users.phone`; a driver with no address row; an unknown id gives no
  row); `toAuditDriverInfo` (address line with missing parts, empty strings as missing).
- `AuditDriverSelect.test.tsx`: the options are listed in the order given, the "Inactive" label
  is on an inactive driver only, `onChange` gets the id, and null on clear.
- `useAuditDriverOptions.test.tsx`: it asks `useDrivers` for `showAll` and `includeInactive`, and
  returns the sorted options and the loading flag.
- `AuditDriverInfo.test.tsx`: three items, "–" for each missing value.
- `AuditTab.test.tsx` (extended): no `driver` shows the empty state and no block; a valid
  `driver` shows the block and the select's value; an unknown `driver` after loading is removed;
  while the list is loading a `driver` is kept.

## 6. Files

Production, 9: `workTrackers/hooks/useDrivers.db.ts`, `accountantAudit/components/AuditDriverSelect.tsx`
(new), `components/AuditDriverInfo.tsx` (new), `components/AuditTab.tsx`,
`hooks/useAuditDriverOptions.ts` (new), `hooks/useAuditDriverInfo.ts` (new), `db/auditDriverInfo.ts`
(new), `utils/auditDrivers.ts` (new), `utils/auditUrlState.ts` (new). One logic ("choose the
driver and read their details"), so it stays whole.

Tests: the eight of §5, and `accountantAudit/e2e/auditDriver.accountant.spec.ts` and
`auditDriver.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **The list of drivers is still loading.** The select shows "Loading..." (the component's own);
  a `driver` in the URL is kept (R6).
- **No drivers at all.** The select opens with "No driver found."
- **A driver without a `Users` row.** `useDrivers` joins `Users` (inner), so such a driver is not
  listed. A `Drivers` row always has a user in the app's own data.
- **Two drivers with the same name.** They are listed in the order of the tie-break (id) and the
  email in the search tells them apart. No other marker.
- **A driver without an address or a phone.** The block shows "–".
- **A tracker or a driver changed on another device.** Everything is a live local query and
  updates by itself.
- **Auth error from Clerk, offline.** Nothing is fetched online by this spec; the local database
  answers.

## 8. Out of scope

- The table and the pager (spec 04), which also add the paging parameters `apage` and
  `apagesize` to `auditUrlState.ts` and make `withAuditDriver` drop `apage`; the data (03).
- Changing `SelectDriver`, its zones note or the order of other pages' driver lists.
- A marker on the closed select for an inactive driver (R2).
- Any write: this tab edits no driver and no tracker.
