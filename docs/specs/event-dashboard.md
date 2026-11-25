# Event Dashboard (Auto Work Trackers)

Status: written and built in one go while Josh was away. He asked for the whole feature without
questions, so this spec was not separately approved. Review it before relying on the contracts below.

## Goal

A third tab on `/auto-work-trackers`, **Event Dashboard**: the dashboard's Pixi grid (same scrolling,
tiles, work trackers, maintenance), but broken down by the events that start in the selected week.

- A row per event (a pinned **event header row**), then one row per bleacher assigned to that event.
  A bleacher on several events appears under each.
- Lets a person see whether a generated (or suggested) work tracker overlaps any event or work tracker.
- Later: the Python service _suggests_ trips instead of inserting them. They show on the grid as
  flashing ghost work trackers. Clicking one accepts it (creates the work tracker). Trips can only be
  created inside the selected week.

## Not in scope

Editing from this grid: clicking tiles, events, work trackers does nothing. No drag, no cell editor,
no swap, no subrental rows. Zone is the page's selected zone.

## Data (no schema change)

No migration, no `AppSchema.ts` change. Reads only:

- `useDashboardPowerSync()` already assembles every dashboard `Bleacher` (events, work trackers,
  maintenance, damage). The new view reuses it.
- `useLogisticsPlans(weekStart, zoneId)` (Schedule Validator) gives the week's events and each
  event's bleachers with `matches` (ready) and the event's street.

## Types

```ts
// src/features/eventDashboard/utils/rows.ts
type EventHeaderRow = {
  kind: "header";
  key: string; // `header:${eventId}`
  eventId: string;
  title: string; // event name
  detail: string; // "Nov 13 · 9 Here St"
  status: string; // "2 of 5 to deliver" | "Ready" | "No bleachers assigned"
  ready: boolean;
};
type BleacherGridRow = {
  kind: "bleacher";
  key: string; // `${eventId}:${bleacherUuid}`
  eventId: string;
  bleacher: Bleacher; // the dashboard's own type
  ready: boolean;
};
type GridRow = EventHeaderRow | BleacherGridRow;
buildGridRows(events: EventLogisticsCheck[], bleachers: Bleacher[]): GridRow[];
toDashboardRows(rows: GridRow[]): Bleacher[]; // header rows become empty synthetic Bleachers
```

```ts
// src/features/eventDashboard/utils/suggestions.ts
type SuggestedTrip = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  fromAddressUuid: string | null;
  toAddressUuid: string | null;
  fromStreet: string;
  toStreet: string;
  fromEventUuid: string;
  toEventUuid: string;
  date: string; // where the draft would be dated, inside the week
  availableFrom: string;
  mustArriveBy: string;
};
```

## Python API (`python_api/auto_work_trackers`)

- `POST /api/py/auto-work-trackers/suggest` `{zone_id, week_start, timezone}` → `{bleachers_in_zone, trips: [...]}`.
  Same discovery as `generate`, nothing written.
- `POST /api/py/auto-work-trackers/accept` `{week_start, trips: [{bleacher_uuid, date, from_address_uuid, to_address_uuid}]}`
  → `{created: [{work_tracker_id, bleacher_uuid, date}], skipped: [{bleacher_uuid, date, reason}]}`.
  - 422 when `week_start` is not a Monday.
  - A trip whose `date` is outside Monday..Sunday of `week_start` is **skipped** (`outside_week`), not created.
  - A trip that already has an active work tracker for the same bleacher, date and drop-off is skipped
    (`already_exists`).
  - Created as drafts: no driver, contacts, or times (as `generate`).
- `generate` is unchanged (the header button).

## Behaviour (for Playwright later)

1. Open Event Dashboard with a zone and week: grid scrolls to the selected week.
2. Each event starting that week has a header row (name, date, street, status) pinned to the left
   while scrolling sideways, followed by its bleacher rows.
3. Ready bleachers' rows are normal; events with all ready are marked Ready.
4. Suggested trips flash on the bleacher row at their date. Clicking one creates the work tracker, then
   the ghost becomes a normal work tracker tile.
5. A zone-less page shows "Select a zone".

## Edge cases

- A bleacher on several events: its row repeats (separate row keys). Ghosts show on every repeat.
- Event with no bleachers: header only, status "No bleachers assigned".
- Event starting in the week but the bleacher's work runs outside it: the grid is the whole dashboard
  range, so it scrolls; only accepting is clamped to the week.
- WebGL unavailable: same message as the dashboard.
- Offline: data is local. Accept needs the Python service; failure shows an error and keeps the ghost.
- Auth: Clerk sign-in only (as `generate`); role checks on the Python side are still not in place.
- Clicking in the grid never opens the dashboard's panels (cells are made non-interactive).
