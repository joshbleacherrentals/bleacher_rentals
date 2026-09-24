-- ============================================================================
-- Tests for WorkTrackers.status_changed_at — "how long has it said that?"
-- Migration: 20260921130000_work_tracker_status_changed_at.sql
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/work_tracker_status_changed_at.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- The driver app reads this column to tell an event organiser what another
-- driver is doing and since when (br_driver/docs/specs/event-bleacher-roster.md).
-- Two properties carry that promise:
--
--   * an office edit to a note, a pay amount or an address must NOT move it,
--     or every trip on the sheet reads as "moved 2 minutes ago";
--   * a phone that was offline for hours sends the real moment with the row,
--     and the trigger must not overwrite it with the reconnect time — the same
--     rule the withdrawal timestamps already follow.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(6);

-- ── The column ──────────────────────────────────────────────────────────────

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkTrackers'
      AND column_name = 'status_changed_at'),
  'timestamp with time zone',
  'status_changed_at is a timestamptz'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

CREATE TEMP TABLE _ids AS
SELECT gen_random_uuid() AS tracker_id;

INSERT INTO "WorkTrackers" (id, status, date)
SELECT tracker_id, 'released', CURRENT_DATE FROM _ids;

-- ── A new tracker is stamped from the start ─────────────────────────────────

SELECT isnt(
  (SELECT status_changed_at FROM "WorkTrackers" WHERE id = (SELECT tracker_id FROM _ids)),
  NULL,
  'a tracker carries a status_changed_at from the moment it is created'
);

-- ── An edit that leaves the status alone leaves the stamp alone ─────────────

UPDATE "WorkTrackers" SET status_changed_at = now() - interval '3 hours'
WHERE id = (SELECT tracker_id FROM _ids);

UPDATE "WorkTrackers" SET notes = 'office added a note'
WHERE id = (SELECT tracker_id FROM _ids);

SELECT ok(
  (SELECT now() - status_changed_at > interval '2 hours'
     FROM "WorkTrackers" WHERE id = (SELECT tracker_id FROM _ids)),
  'editing a note does not move status_changed_at'
);

-- ── A real status change moves it ───────────────────────────────────────────

UPDATE "WorkTrackers" SET status = 'accepted'
WHERE id = (SELECT tracker_id FROM _ids);

SELECT ok(
  (SELECT now() - status_changed_at < interval '1 minute'
     FROM "WorkTrackers" WHERE id = (SELECT tracker_id FROM _ids)),
  'changing the status stamps the moment it changed'
);

-- ── A phone that was offline keeps the moment it recorded ───────────────────

UPDATE "WorkTrackers"
   SET status = 'dest_pickup',
       status_changed_at = now() - interval '5 hours'
WHERE id = (SELECT tracker_id FROM _ids);

SELECT ok(
  (SELECT now() - status_changed_at > interval '4 hours'
     FROM "WorkTrackers" WHERE id = (SELECT tracker_id FROM _ids)),
  'a status change that arrives with its own timestamp keeps it'
);

-- ── Rows that existed before the migration were backfilled ──────────────────

SELECT is(
  (SELECT count(*) FROM "WorkTrackers"
    WHERE status_changed_at IS NULL
      AND COALESCE(completed_at, abandoned_at, declined_at, started_at,
                   accepted_at, released_at, updated_at) IS NOT NULL),
  0::bigint,
  'every existing tracker with any timestamp to go on was backfilled'
);

SELECT * FROM finish();
ROLLBACK;
