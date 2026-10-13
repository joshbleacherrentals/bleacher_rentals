-- ============================================================================
-- Tests for clearing a driver's withdrawal when the office takes the work back.
-- Migration: 20261013120000_work_tracker_clear_withdrawal_on_rerelease.sql
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/work_tracker_withdrawal_reset.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Why this matters: the driver app's sync rules only hand a driver the
-- addresses, contacts, line items and inspections of a tracker whose
-- completed_at, declined_at and abandoned_at are all NULL. A tracker that came
-- back to the office as 'declined' or 'abandoned' and was then put back on the
-- board (Back to Draft, edit, Released) kept its old stamp, so the next driver
-- — or the same one — was offered a trip with no addresses on it.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(13);

-- ── Back to Draft clears a decline ──────────────────────────────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'released');

UPDATE public."WorkTrackers"
   SET status = 'declined'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT ok(
  (SELECT declined_at IS NOT NULL AND history_json IS NOT NULL
     FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'setup: a declined tracker carries declined_at and a history snapshot'
);

UPDATE public."WorkTrackers"
   SET status = 'draft'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT is(
  (SELECT declined_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  NULL,
  'declined -> draft clears declined_at'
);

-- ── Releasing an abandoned tracker clears the abandonment and the snapshot ──

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'accepted');

UPDATE public."WorkTrackers"
   SET status = 'abandoned'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

UPDATE public."WorkTrackers"
   SET status = 'released'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

SELECT is(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  NULL,
  'abandoned -> released clears abandoned_at'
);

-- The snapshot trigger fires after the status-timestamp trigger, so it must
-- see the cleared columns and stop treating the tracker as finished. A stale
-- snapshot would keep the mobile app reading history instead of live data.
SELECT is(
  (SELECT history_json FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  NULL,
  'a re-released tracker is no longer finished, so its history snapshot is dropped'
);

-- ── A stale value sent along with the status change does not survive ────────
--
-- A client that writes the whole row would send the old timestamp back in the
-- very UPDATE that re-releases the tracker.

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'released');

UPDATE public."WorkTrackers"
   SET status = 'declined'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';

UPDATE public."WorkTrackers"
   SET status = 'released', declined_at = '2026-09-01T10:00:00Z'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';

SELECT is(
  (SELECT declined_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  NULL,
  'declined -> released clears declined_at even when the UPDATE resends it'
);

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004', 'accepted');

UPDATE public."WorkTrackers"
   SET status = 'abandoned'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004';

UPDATE public."WorkTrackers"
   SET status = 'draft', abandoned_at = '2026-09-01T10:00:00Z'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004';

SELECT is(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  NULL,
  'abandoned -> draft clears abandoned_at even when the UPDATE resends it'
);

-- ── Both columns go, not only the one matching the old status ───────────────

INSERT INTO public."WorkTrackers" (id, status, declined_at, abandoned_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000005', 'abandoned',
        '2026-09-01T08:00:00Z', '2026-09-02T08:00:00Z');

UPDATE public."WorkTrackers"
   SET status = 'released'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005';

SELECT ok(
  (SELECT declined_at IS NULL AND abandoned_at IS NULL
     FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'a release clears both withdrawal columns'
);

-- ── Statuses outside the list keep the record ───────────────────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000006', 'released');

UPDATE public."WorkTrackers"
   SET status = 'declined'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000006';

UPDATE public."WorkTrackers"
   SET status = 'cancelled'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000006';

SELECT isnt(
  (SELECT declined_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000006'),
  NULL,
  'declined -> cancelled keeps declined_at: the office calling it off is not a re-release'
);

-- 'completed' is deliberately not in the list. completed_at already keeps the
-- tracker out of the driver's sync, so clearing here would fix nothing and
-- would only erase the record of the earlier withdrawal.
INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000007', 'accepted');

UPDATE public."WorkTrackers"
   SET status = 'abandoned'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000007';

UPDATE public."WorkTrackers"
   SET status = 'completed'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000007';

SELECT ok(
  (SELECT abandoned_at IS NOT NULL AND completed_at IS NOT NULL
     FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000007'),
  'abandoned -> completed keeps abandoned_at and stamps completed_at'
);

-- ── Only a status change clears ─────────────────────────────────────────────
--
-- The office edits pay and notes on finished trackers all the time; none of
-- that may wipe the record. Tracker 7 above is completed and still carries
-- its abandonment.

UPDATE public."WorkTrackers"
   SET notes = 'office edit after the trip'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000007';

SELECT isnt(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000007'),
  NULL,
  'an UPDATE that leaves status alone does not clear anything'
);

-- ── A full second life ──────────────────────────────────────────────────────
--
-- released -> declined (driver A) -> draft -> released -> abandoned (driver B):
-- the row describes the latest withdrawal only.

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000008', 'released');

UPDATE public."WorkTrackers"
   SET status = 'declined', declined_at = '2026-09-01T07:00:00Z'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008';

UPDATE public."WorkTrackers"
   SET status = 'draft'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008';

UPDATE public."WorkTrackers"
   SET status = 'released'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008';

UPDATE public."WorkTrackers"
   SET status = 'abandoned', abandoned_at = '2026-09-03T09:30:00Z'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008';

SELECT is(
  (SELECT declined_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008'),
  NULL,
  'the first driver''s decline is gone once the tracker is back on the board'
);

SELECT is(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008'),
  '2026-09-03T09:30:00Z'::timestamptz,
  'the second driver''s abandonment is recorded as sent'
);

-- ── Releasing a tracker that never withdrew changes nothing ─────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000009', 'draft');

UPDATE public."WorkTrackers"
   SET status = 'released'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009';

SELECT ok(
  (SELECT declined_at IS NULL AND abandoned_at IS NULL AND released_at IS NOT NULL
     FROM public."WorkTrackers"
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009'),
  'an ordinary draft -> released still stamps released_at and leaves the withdrawal columns NULL'
);

SELECT * FROM finish();
ROLLBACK;
