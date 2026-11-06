# Accountant Audit 01: the tab, its empty state and the permissions row

Status: **IMPLEMENTED 2026-11-06, uncommitted** (approved 2026-11-06; 0 open decisions; readings
R1-R6 in §1 approved with the spec; deviations in "Implementation notes" at the end). Playwright
specs written, not run. Build order: **01 of 04**. Needs: nothing. Needed by: 02, 03 and 04, which fill the tab.
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

This spec is the **shell**: the tab exists, opens, hides what the receivables tabs show, and
says what to do next (choose a driver). It does not draw a select or a table. It also writes the
permissions row, because CLAUDE.md wants it in the same commit as the change.

Not releasable alone: the empty state tells the user to pick a driver "above", and the select
is added by spec 02. The four specs go out in one release (D11).

**Readings to confirm:**

- **R1:** the tab id is `audit`, its label is "Audit", it is the last tab (after Need
  attention), with no count badge and no info icon (the design has neither). The URL is
  `?tab=audit`. A bare `/accountant` still opens Collections.
- **R2:** on Audit the page hides what it hides on Collections: the filter sidebar, the Filter
  button, Show Deleted, the search box and the filter chips. The design draws none of them.
  The page's other hooks keep running as they do for Collections; this spec does not change
  them.
- **R3:** the empty state uses the design's words. Title: "Choose a driver". Text: "Pick a
  driver above to see all of their work trackers and whether each one has been paid."
- **R4:** the row is called "Driver Audit", category "Day to Day Operations", placed right after
  "Collections". Admin and Accountant: level `read` (the tab changes nothing). The other five
  roles: `none`.
- **R5:** `ROLE_DESCRIPTIONS.accountant` gets one sentence about the Audit tab. The Admin
  description is "full access" and does not change.
- **R6:** the new e2e files are written, not run (the user's rule), and the admin one cannot run
  locally anyway.

## 2. Research findings

- `ACCOUNTANT_TABS` is `{ tabs, openingTab: "collections", writeTabToUrl: true }`. A tab entry is
  `{ id, startingSort, offersStatus }`. Collections never uses its `startingSort`; Audit will not
  either. `parseListTab` falls back to the opening tab for an unknown id, so before this spec a
  link `?tab=audit` opens Collections.
- In `page.tsx` the variable `onCollections` hides four things: the filter sidebar, the page
  header action (Show Deleted and Filter), the search box and the filter chips. Every use is a
  "hide the receivables chrome" rule, so it can become one variable that also covers Audit.
- `AccountsReceivableTabs` and `NeedAttentionTab` are always mounted and show themselves only
  when their tab is active. `TabsContent` renders the active tab's children.
- `permissionPageData.test.ts` has a test, "is only granted Work Trackers, ...", that lists every
  row the accountant is granted, sorted. A new row with `read` for the accountant must be added
  to that list ("Driver Audit" sorts before "Driver Payments & QuickBooks Bills").
- The access gate is the path: `/accountant` is allowed for admin and accountant only. The
  existing `collectionsAccess.am.spec.ts` and `collectionsAccess.viewer.spec.ts` prove the other
  roles cannot reach it.

## 3. Design

**`listTabs.ts`.** `ACCOUNTANT_TABS.tabs` gets a fourth entry, after `need_attention`:
`{ id: "audit", startingSort: DEFAULT_SORT, offersStatus: false }`. The doc comment above it
gets a short paragraph for Audit (what it is, `startingSort` unused, see this spec).

**`page.tsx`.**

- `const onAudit = activeTab === "audit";` and one variable for the chrome:
  `const hideReceivablesChrome = onCollections || onAudit;`. Each place that uses `!onCollections`
  or `onCollections ? undefined : ...` for the chrome uses `hideReceivablesChrome` instead.
- After the Need attention trigger: `<TabsTrigger value="audit">Audit</TabsTrigger>`.
- After the Collections content: `<TabsContent value="audit"><AuditTab /></TabsContent>`.

**`AuditTab.tsx`** (new, `src/features/accountantAudit/components/`). A client component, no
props. It renders the empty state of R3 and nothing else:

```tsx
<div data-testid="audit-tab">
  <div data-testid="audit-empty-state" /* dashed border, centred, as the design's Main */>
    <Truck aria-hidden /> {/* lucide, the design's truck icon */}
    <p>Choose a driver</p>
    <p>Pick a driver above to see all of their work trackers and whether each one has been paid.</p>
  </div>
</div>
```

Classes follow the design: a 10px-radius box, dashed `gray-300` border, `gray-50` background,
56px vertical padding, a 44px round icon holder, title 16px semibold, text 14px `gray-600`.
Specs 02 and 04 extend this component; the empty state stays what it shows when no driver is
chosen.

**`permissionPageData.ts`.**

- A new entry after "Collections":
  - **label:** "Driver Audit". **category:** "Day to Day Operations".
  - **description:** "The Audit tab of the Accountant page. The user picks a driver and reads all
    of that driver's work trackers: status, date, bleacher, type, pickup and dropoff, drive time,
    distance, and whether the tracker's week has been paid. Read-only: nothing on the tab changes
    a work tracker or a payment."
  - **admin:** `read("Can open the Audit tab and read the work trackers of any driver, including
drivers who are no longer active.")`
  - **account_manager:** `none("The Accountant page is for accountants and administrators. An
account manager still reads their drivers' work trackers on the Work Trackers pages.")`
  - **developer:** `none("Developer is only meant to work on the developer roadmap and the Dev
Tools pages.")`
  - **viewer:** `none("The Accountant page is for accountants and administrators. A viewer still
reads work trackers on the Work Trackers pages.")`
  - **driver:** `none("Drivers only have access to the Driver Mobile App.")`
  - **maintainer:** `none(MAINTAINER_NO_ACCESS_NOTE)`
  - **accountant:** `read("Can open the Audit tab and read the work trackers of any driver,
including drivers who are no longer active. Marking a week Paid stays on the Work Trackers
pages.")`
- `ROLE_DESCRIPTIONS.accountant` gets, before "Everything else on the web dashboard is hidden
  from this role.": "Also has the Audit tab of the Accountant page, where they pick a driver and
  read all of that driver's work trackers with their Paid or Not paid status."
- The comment above `PERMISSIONS` names this spec next to the other accountant specs.

No database change, no sync-rule change, no change to `accessConfig.ts`.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1 (accountant):** open `/accountant`; the tab bar reads Collections, AR Deposits, Need
  attention, Audit, and Collections is selected.
- **S2 (accountant):** click Audit; the URL has `tab=audit`; "Choose a driver" is visible; the
  search box, the Filter button and Show Deleted are not.
- **S3 (accountant):** open `/accountant?tab=audit` directly; Audit is selected and shows the
  empty state.
- **S4 (admin):** the same as S1 to S3 for an admin (file `audit.admin.spec.ts`).
- **S5 (account manager, viewer):** `/accountant?tab=audit` is not reachable: the browser ends
  up off `/accountant`.
- **S6:** go from Audit back to Collections; the filter sidebar and search are back.

## 5. Tests (Vitest)

- `listTabs.test.ts`: `ACCOUNTANT_TABS.tabs` ids are `collections`, `ar_deposits`,
  `need_attention`, `audit`, in this order; the opening tab is Collections and the tab is still
  written to the URL; `parseListTab("audit", ACCOUNTANT_TABS)` is `audit`; `tabUsesStatusFilter`
  is false for it.
- `page.test.tsx`: the Audit trigger is rendered, last; with `?tab=audit` the page renders
  `AuditTab`, and no search box, Filter button, Show Deleted or filter sidebar; with no `tab`
  Collections is still the active tab.
- `AuditTab.test.tsx` (new): the empty state's title and text, and its `data-testid`s.
- `permissionPageData.test.ts`: "Driver Audit" is added to the accountant's granted list; a new
  test says its `admin` and `accountant` cells are `read` and the other five are `none`.

## 6. Files

Production, 4: `quotesAndBookings/utils/listTabs.ts`, `app/accountant/page.tsx`,
`accountantAudit/components/AuditTab.tsx` (new), `userAccess/permissionPageData.ts`.

Tests: the four of §5, and `accountantAudit/e2e/audit.accountant.spec.ts`,
`audit.admin.spec.ts`, `auditAccess.am.spec.ts`, `auditAccess.viewer.spec.ts` (new).

## 7. Edge cases and error handling

- **A role that cannot open `/accountant`** never reaches the page, whatever `?tab` says: the
  path gate comes first.
- **A stale or unknown `?tab`** opens Collections, as today.
- **`driver`, `apage` and `apagesize` in the URL on another tab.** Not this spec's business: the
  page keeps parameters it does not own, and specs 02 and 04 define these.
- **Auth error from Clerk, offline.** Nothing is read or written by this spec.

## 8. Out of scope

- The select and the driver's details (spec 02), the data (03), the table (04).
- Any change to the receivables tabs, `useListPageState` or `accessConfig.ts`.

## 9. Implementation notes (2026-11-06)

Built as specified. Types, files and wording of §3 are unchanged. What differs from, or goes a step
beyond, the text of the spec:

- **An existing e2e file was edited, outside the file list of §6.**
  `accountantCollections/e2e/collections.accountant.spec.ts`, scenario S1, asserted that the tab
  bar is exactly Collections, AR Deposits, Need attention. With the fourth tab that assertion is
  false, so `"Audit"` was added to its list (one line). Not run (project rule).
- **Existing unit assertions on the tab count were updated** in `page.test.tsx` (two places, 3 to
  4, and the "in that order, and nothing else" test). They are the same test file §5 names.
- **A few small extra assertions** besides the ones listed in §5, all of them readings R1/R2/§3
  restated: no count badge and no info icon on the Audit trigger; `defaultSortForTab("audit")` is
  the default sort; a status in the URL is ignored on `?tab=audit`; the Audit body is not drawn on
  the other three tabs.
- **Spacing of the empty state.** The design puts 24px between the select and the empty state. This
  spec has no select, so the wrapper `data-testid="audit-tab"` carries `mt-5` (the design's 20px
  between the tab bar and what follows), and the empty state box has no margin of its own. Spec 02
  adds the select and the 24px gap.
- **Sync rules (plan R-C)** were not re-read: this spec reads and writes no data, so there is
  nothing for a bucket to give. Specs 02 and 03 read them.
- **Page test** mocks `AuditTab` the way it mocks `CollectionsTab`; the body has its own test file.
