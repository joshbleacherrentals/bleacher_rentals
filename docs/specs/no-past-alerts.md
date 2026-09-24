# No alerts in the past

Alerts are for things someone can still act on. Once the thing an alert is about is over, the alert
goes away — "what's done is done."

## Decisions (Josh, 2026-09-18)

| Question                              | Answer                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| When is an event past?                | After its **end date** (`Events.event_end`), not after teardown. |
| Are "Review Requested" alerts exempt? | **No.** A past review request is removed like any other alert.   |
| Which clock defines "today"?          | **Toronto** (`America/Toronto`).                                 |

## Definition of past

`today` is the current date in `America/Toronto`. An alert's entity is past when:

| `entity_type`    | Past when                       |
| ---------------- | ------------------------------- |
| `event`          | `Events.event_end < today`      |
| `bleacher_event` | its event's `event_end < today` |
| `work_tracker`   | `WorkTrackers.date < today`     |

An event that started before today but ends today or later is **not** past.

An alert is also removed (server side only) when its entity no longer exists, or when its event is
soft-deleted (`Events.deleted`).

## Where it is enforced

1. **Never written.** `planAlertsForEntity` (`src/features/alerts/engine.ts`) is the single path every
   alert write goes through — definition evaluation, cascades, and review requests. When the entity
   is past, it plans no inserts and deletes any existing alerts for that entity + title. An entity
   whose date is unknown locally (not synced) is not gated.
2. **Never shown.** `useUserAlerts` hides alerts whose entity date is known and past, so they vanish
   at Toronto midnight instead of waiting for the cleanup. The event form's alerts section
   (`useEventFormAlerts`) shows no alerts while the form's end date is past.
3. **Cleaned up daily.** `public.delete_past_alerts()` deletes past and orphaned alerts (and their
   `UserAlerts`) in one set-based statement. **pg_cron** runs it at 05:10 UTC — just after the
   Toronto day rolls over — under the job name `delete-past-alerts`.

   It does not run on the Vercel cron, which on the Hobby plan fires once a day at an imprecise
   time and keeps logs for one hour, so a failed run is invisible. pg_cron records every run in
   `cron.job_run_details`, queryable with SQL:

   ```sql
   select j.jobname, d.status, d.start_time, d.return_message
   from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where j.jobname = 'delete-past-alerts' order by d.start_time desc limit 14;
   ```

   That table has no retention on any Supabase tier, so a second job, `prune-cron-job-run-details`,
   deletes rows older than 30 days every Sunday. The Vercel cron keeps the work that needs
   TypeScript ("Pending Acceptance") and the old row-by-row cleanup loop is gone.

4. **One-off cleanup.** The migration that creates the function also runs it once. The same SQL is
   appended to `supabase/seed.sql` so `npx supabase db reset` exercises it against seeded data.

`delete_past_alerts()` is `SECURITY DEFINER` and executable only by `service_role`.

## Edge cases

- **Dates changed after the fact.** Moving a past event into the future lets its alerts be written
  again on the next save; moving a future event into the past clears them on save.
- **Offline clients.** The gate runs on the client at save time against the device clock, in Toronto
  time.
- **Alerts whose entity is not synced to a user.** Not hidden by the client (date unknown); the
  server cleanup still removes them once past.
- **Cascade ripples** still select other bleacher events by `event_start >= today`; in-progress
  events are not re-evaluated by a ripple. Unchanged by this spec — any alert they already have
  stays valid until their end date, and the gate still prevents past writes.
- **One "today" for alerts.** `todayStart()` and `upcomingWindowEndInstant()` are gone. Triage and
  the Vercel route now use `businessToday()` and `getUpcomingWindowEnd()`, both Toronto dates.
  Those helpers used to build ISO instants and compare them against `Events.event_start`,
  `Events.event_end` and `WorkTrackers.date`, which are DATE columns stored locally as
  "YYYY-MM-DD": as text, `"2026-09-21" >= "2026-09-21T04:00:00.000Z"` is false, so rows dated today
  were dropped from every ripple. They also read the weekday from the server's clock, which is UTC
  on Vercel. `getUpcomingWindow.test.ts` now covers both, and the suite passes under `TZ=UTC`.
- **The same mistake is still live outside alerts.** `localDayStartInstant` / `localDayEndInstant`
  are compared against `Events.event_start` in `resolveEventInstructionsForWorkTracker`,
  `resolvePocContact`, `resolveAdjacentEventsForWorkTracker` and `workTrackerTransportation` —
  the work tracker locate buttons and adjacent-event cards. The lower bound excludes events on the
  target day and the upper bound reaches into the next day. Out of scope here; worth its own fix.
