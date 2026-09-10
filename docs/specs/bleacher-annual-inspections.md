# Bleacher Annual Inspections

Status: **DRAFT — awaiting approval**
Scope: bleachers only (not `/assets/other-assets`).

## 1. The problem

Josh: every asset needs an inspection due date, flagged ahead of time, with the
inspection PDF kept up to date.
Michelle: she used to keep annual inspection dates on her damage spreadsheets;
those spreadsheets are gone, so the dates need a home in the software — for now
just a field she can maintain by hand, eventually a notification.

Both are the same feature seen from two ends: a **date per bleacher** that
someone maintains, and a **queue** that tells you which bleachers are coming up.

## 2. Decisions locked before writing this

| #   | Question                  | Answer                                                                                                               |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Which assets?             | Bleachers only.                                                                                                      |
| 2   | How is the next date set? | Manually — that is the primary path. Recording an inspection prefills `inspected_on + 1 year`, which stays editable. |
| 3   | Thresholds                | Yellow at 30 days out, red at 7 days out.                                                                            |
| 4   | Who inspected             | Not tracked. A free-text note covers anything extra.                                                                 |

### Assumptions this spec makes (say so if either is wrong)

- **Overdue is its own state.** Josh asked for "an alert or something for an
  over due inspection", and the 7-day red would otherwise swallow it. So:
  `warning` (≤30d), `critical` (≤7d), `overdue` (past the date) — critical and
  overdue are both red, but they are separate labels and count separately.
- **The `Maintainer` role is out of scope here.** Stage 1 ships on the existing
  roles; the new role is a separate spec. Nothing here blocks it — it is one
  extra column in the permission matrix when it lands.

## 3. Data model

### 3.1 New table

One row = one inspection record. Not a column on `Bleachers`: the PDF is
replaced every year, and a single column would destroy last year's document and
the history along with it. (See also
`20260903130000_drop_payment_installment_cache_columns.sql` — a cached copy of a
derivable value is a second source of truth that drifts.)

```sql
create table public."BleacherAnnualInspections" (
  id                uuid        not null default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by        uuid        null,          -- Users.id, informational
  bleacher_uuid     uuid        not null,      -- FK Bleachers(id) on delete cascade
  inspected_on      date        null,          -- null = date known, inspection not recorded
  next_due_on       date        not null,
  document_path     text        null,          -- Supabase Storage key, bucket below
  notes             text        null,
  constraint bleacher_annual_inspections_pkey primary key (id),
  constraint bleacher_annual_inspections_bleacher_uuid_fkey
    foreign key (bleacher_uuid) references public."Bleachers" (id) on delete cascade
);

create index "BleacherAnnualInspections_bleacher_uuid_idx"
  on public."BleacherAnnualInspections" (bleacher_uuid);
create index "BleacherAnnualInspections_next_due_on_idx"
  on public."BleacherAnnualInspections" (next_due_on);
```

`date`, not `timestamptz`, deliberately: an annual inspection happens on a
calendar day, and a timestamp would put a bleacher in a different state
depending on the reader's timezone.

`inspected_on` is nullable so Michelle's minimum case works today — a row that
says only "next one is due 2027-03-14".

**Which row is current:** the most recently created row for that bleacher
(`created_at desc, id desc`). Correcting a mistake = edit that row. A new row =
a new inspection happened. No "is_active" flag, no ambiguity.

**A bleacher with no rows** is `unscheduled` — it appears at the top of the
queue as needing attention, but is not counted as overdue.

### 3.2 Column on `Users`

```sql
alter table public."Users" add column if not exists
  inspection_queue_last_seen_at timestamptz null;
```

Exactly the `changelog_last_read_at` pattern (`useHasUnreadChangelog` /
`markChangelogRead`).

### 3.3 No notification table

A threshold crossing is a pure function of `next_due_on` and the calendar:

- warning crosses at `next_due_on − 30 days`
- critical crosses at `next_due_on − 7 days`
- overdue crosses at `next_due_on`

A bleacher is **new to me** when any of those three dates falls in
`(inspection_queue_last_seen_at, today]`. That is the whole notification system:
no rows, no cron job, works offline, and survives a cold start.

### 3.4 RLS

Mirrors `Bleachers`, in the shape of `20260818120000_work_tracker_line_items.sql`:

- `select` — `{admin, account_manager, viewer}`
- `insert` / `update` / `delete` — `{admin, account_manager}`

Drivers get no policy on this table at all; the mobile app has no use for it.

### 3.5 Storage

Bucket `bleacher-inspections`, path
`bleacher-<number>/inspection-<timestamp>.pdf`, uploaded with the existing
`FileUploadInput` (`acceptedTypes: ["application/pdf"]`, `maxSizeMB: 10`) — the
same component and conventions as the NVIS PDF on the bleacher form.

Photos are **not** in this stage. If they turn out to be needed, they get their
own table modelled on `DamageReportPhotos`; a second nullable path column now
would be the wrong shape later.

### 3.6 PowerSync

`AppSchema.ts`: `BleacherAnnualInspections` table + indexes on `bleacher_uuid`
and `next_due_on`, exported `BleacherAnnualInspectionsRecord`, added to the
table list; `inspection_queue_last_seen_at` added to `UsersCols`. Sync rules in
the PowerSync dashboard need the new table in the global bucket (web roles
only). `npm run gtl` regenerates `database.types.ts`.

## 4. TypeScript contract

```ts
// src/features/annualInspections/logic/inspectionStatus.ts
export type InspectionStatus =
  | "unscheduled" // no inspection row at all
  | "ok" // more than 30 days out
  | "warning" // 30 days or fewer, more than 7
  | "critical" // 7 days or fewer, not yet past
  | "overdue"; // past next_due_on

export const WARNING_DAYS = 30;
export const CRITICAL_DAYS = 7;

/** `nextDueOn` and `today` are calendar dates, "YYYY-MM-DD". */
export function inspectionStatus(nextDueOn: string | null, today: string): InspectionStatus;

/** The three dates at which a bleacher changes status, oldest first. */
export function thresholdDates(nextDueOn: string): {
  warning: string;
  critical: string;
  overdue: string;
};

/**
 * True when a threshold fell in (lastSeenAt, today]. A null lastSeenAt means
 * the user has never opened the page: everything currently flagged is new.
 */
export function isNewSinceLastSeen(
  nextDueOn: string | null,
  today: string,
  lastSeenAt: string | null,
): boolean;
```

```ts
// src/features/annualInspections/db/annualInspections.ts
export type AnnualInspectionQueueRow = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  inspectionId: string | null;
  inspectedOn: string | null;
  nextDueOn: string | null;
  documentPath: string | null;
  notes: string | null;
};

export function useInspectionQueue(): AnnualInspectionQueueRow[];
export function useInspectionHistory(bleacherUuid: string): AnnualInspectionRow[];
export function useUnseenInspectionCount(): number;

export async function recordInspection(input: {
  bleacherUuid: string;
  inspectedOn: string | null;
  nextDueOn: string;
  documentPath: string | null;
  notes: string | null;
  createdBy: string | null;
}): Promise<void>;

export async function updateInspection(input: {
  id: string;
  inspectedOn: string | null;
  nextDueOn: string;
  documentPath: string | null;
  notes: string | null;
}): Promise<void>;

export async function markInspectionQueueSeen(userUuid: string): Promise<void>;
```

The queue row carries no bleacher attributes beyond the number — no location
column at all (decided during implementation: `Bleachers` has a summer home
base, a winter home base and a storage location, and any one of them would be
wrong half the year). This list is a **queue**, not a second Master Asset List.

## 5. UI

### 5.1 New page `/annual-inspections`

Sidebar: `Quality Assurance → Annual Inspections`, alongside Damage Reports,
Inspections, Repairs. (The existing "Inspections" page is pre/post work-tracker
inspections — different thing, hence a distinct feature directory
`src/features/annualInspections/` rather than folding into `qualityAssurance`.)

One list, sorted soonest-due first: `unscheduled` → `overdue` → `critical` →
`warning` → `ok`, then by `next_due_on` ascending. Columns: bleacher #, last
inspected, next due, status pill, PDF link, note indicator.

Rows that are **new since my last visit** render highlighted. On mount the page
stamps `inspection_queue_last_seen_at = now()` — the highlight stays for this
visit and is gone next time. Filter chips for status; search by bleacher number.

Clicking a row opens a sheet: history for that bleacher, plus "Record
inspection" (date, next due prefilled to `inspected_on + 1 year` and editable,
PDF upload, notes).

### 5.2 Bleacher edit sheet (`/assets/bleachers?edit=<n>`)

A read-only "Annual inspection" block under the NVIS PDF field: next due date
with its status pill, and a button that opens the same record/edit sheet. Both
entry points write through the same `db/annualInspections.ts` module.

### 5.3 Sidebar indicator

A count on the Annual Inspections item (unseen bleachers), rendered through the
existing `showIndicator` path in `Sidebar.tsx` / `SideNavButton.tsx`, extended
to take a number. **Not** added to `alerts/registry.ts` — that system is
per-entity dropdowns; this is a persistent counter.

`useUnseenInspectionCount` subscribes to a derived number, not the row array
(`rerender-derived-state`), so the sidebar does not re-render on unrelated
inspection edits.

## 6. Permissions

`permissionPageData.ts` gains one entry, in the same commit:

| Role            | Level |
| --------------- | ----- |
| admin           | full  |
| account_manager | full  |
| viewer          | read  |
| developer       | none  |
| driver          | none  |

## 7. Tests (written first, then frozen)

### 7.1 Pure logic — `logic/inspectionStatus.test.ts`

- `null` due date → `unscheduled`
- 31 days out → `ok`; exactly 30 → `warning`; 8 → `warning`
- exactly 7 → `critical`; 1 → `critical`; same day → `critical`
- 1 day past → `overdue`; a year past → `overdue`
- month/year boundaries: due 2027-01-05 seen from 2026-12-06 → `warning`
- leap day: due 2028-02-29 seen from 2028-02-22 → `critical`
- `thresholdDates("2027-03-14")` → `2027-02-12` / `2027-03-07` / `2027-03-14`

### 7.2 Pure logic — `logic/isNewSinceLastSeen.test.ts`

- never seen (`null`) + currently flagged → true; never seen + `ok` → false
- crossed warning yesterday, last seen a week ago → true
- crossed warning a week ago, last seen yesterday → false
- crossed critical since last seen, warning before it → true
- became overdue today, last seen yesterday → true
- `ok` bleacher, never seen anything → false
- same calendar day as `lastSeenAt` → true (boundary is inclusive at `today`)

### 7.3 One-year prefill — `logic/nextDueFromInspected.test.ts`

- `2026-03-14` → `2027-03-14`
- leap day `2028-02-29` → `2029-02-28`
- `null` inspected date → `null` (nothing to prefill from)

### 7.4 DB module — `db/annualInspections.test.ts`

Kysely compile assertions in the style of
`src/features/workTrackers/db/workTrackerLineItems.test.ts`: the queue query
picks the latest row per bleacher, excludes `deleted = 1` bleachers, includes
bleachers with no inspection row at all, and orders as specified.

### 7.5 SQL — `supabase/tests/bleacher_annual_inspections.test.sql`

RLS per §3.4 for each role; cascade delete with the bleacher; `next_due_on` not
null.

### 7.6 E2E — `src/features/annualInspections/e2e/annualInspections.admin.spec.ts`

1. Admin opens `/annual-inspections`, sees the queue sorted with overdue first.
2. Records an inspection on a bleacher; next-due prefills to one year out; the
   row moves to `ok`.
3. Overrides the prefilled date by hand; the row reflects the typed date.
4. Sidebar shows a count; opening the page clears it; a reload leaves the
   previously highlighted rows unhighlighted.
5. `/assets/bleachers?edit=<n>` shows the same next-due date.

A `*.viewer.spec.ts` asserts the page is read-only (no Record button).

## 8. Edge cases

- **Editing `next_due_on` backwards** moves its threshold dates into the past,
  so an already-seen bleacher can silently stop being "new", or a long-past one
  can highlight again. Accepted: the alternative is storing crossing events,
  which costs a table and a job to save a rare case. Documented in the module.
- **Clock skew / device date.** `today` is the client's calendar date; the
  status is cosmetic and self-corrects the next day.
- **PowerSync offline.** Both writes are local-first and sync on reconnect; the
  PDF upload is not — the storage upload requires a connection, and the file
  field stays empty with an error toast until it succeeds. The date can still
  be saved offline without the document.
- **Deleted bleachers** (`deleted = 1`) never appear in the queue; their
  inspection rows are left alone.
- **Two rows created in the same second** — `created_at desc, id desc` keeps the
  ordering deterministic.
- **Storage upload succeeds, row write fails** — an orphan file in the bucket.
  Acceptable; no cleanup job in this stage.

## 9. Out of scope for this stage

- The `Maintainer` role (separate spec).
- Photos on an inspection.
- Email or push notification — in-app only.
- `/assets/other-assets`.
