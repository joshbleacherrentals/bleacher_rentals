-- ============================================================================
-- Tests for the driver's two ways of handing work back.
-- Migrations: 20260911120000_worktracker_withdrawal_statuses.sql
--             20260911120100_worktracker_withdrawal_timestamps.sql
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/worktracker_withdrawal.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What matters here is that the two withdrawals stay distinguishable from each
-- other and from a cancellation, and that a phone which was offline all day
-- keeps the moment it actually recorded — the board reads these timestamps as
-- "when the driver walked away", and a server-side now() would quietly turn
-- them into "when the phone found signal".
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(9);

-- ── The statuses exist and nothing existing moved ───────────────────────────

SELECT is(
  (SELECT enum_range(NULL::worktracker_status)::text[]),
  ARRAY['draft', 'released', 'accepted', 'dest_pickup', 'pickup_inspection',
        'dest_dropoff', 'dropoff_inspection', 'completed', 'cancelled',
        'declined', 'abandoned'],
  'the two withdrawals are appended, leaving every existing value in place'
);

-- ── The columns ─────────────────────────────────────────────────────────────

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkTrackers'
      AND column_name = 'declined_at'),
  'timestamp with time zone',
  'declined_at is a timestamptz'
);

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkTrackers'
      AND column_name = 'abandoned_at'),
  'timestamp with time zone',
  'abandoned_at is a timestamptz'
);

-- ── Declining an offer ──────────────────────────────────────────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'released');

UPDATE public."WorkTrackers"
   SET status = 'declined'
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT isnt(
  (SELECT declined_at FROM public."WorkTrackers"
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  NULL,
  'a decline with no client timestamp is stamped by the trigger'
);

SELECT is(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  NULL,
  'declining does not stamp the abandonment column'
);

-- ── Abandoning accepted work, from a phone that was offline ─────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('22222222-2222-2222-2222-222222222222', 'accepted');

UPDATE public."WorkTrackers"
   SET status = 'abandoned', abandoned_at = '2026-09-11T06:15:00Z'
 WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT abandoned_at FROM public."WorkTrackers"
    WHERE id = '22222222-2222-2222-2222-222222222222'),
  '2026-09-11T06:15:00Z'::timestamptz,
  'the moment the driver recorded on the phone survives the trigger'
);

SELECT is(
  (SELECT completed_at FROM public."WorkTrackers"
    WHERE id = '22222222-2222-2222-2222-222222222222'),
  NULL,
  'abandoned work is not completed work'
);

-- ── A cancellation is still the office's own, separate fact ─────────────────

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('33333333-3333-3333-3333-333333333333', 'accepted');

UPDATE public."WorkTrackers"
   SET status = 'cancelled'
 WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT ok(
  (SELECT declined_at IS NULL AND abandoned_at IS NULL
     FROM public."WorkTrackers"
    WHERE id = '33333333-3333-3333-3333-333333333333'),
  'cancelling stamps neither withdrawal column'
);

-- ── A tracker that arrives already accepted ─────────────────────────────────
--
-- The INSERT branch of the trigger tested `accepted_at` and then stamped
-- `released_at`, so a row inserted straight as 'accepted' carried no
-- acceptance time at all. Nothing in the app inserts that way today, which is
-- why it went unnoticed since the trigger was written.

INSERT INTO public."WorkTrackers" (id, status)
VALUES ('44444444-4444-4444-4444-444444444444', 'accepted');

SELECT ok(
  (SELECT accepted_at IS NOT NULL AND released_at IS NOT NULL
     FROM public."WorkTrackers"
    WHERE id = '44444444-4444-4444-4444-444444444444'),
  'a tracker inserted as accepted is stamped as both released and accepted'
);

SELECT * FROM finish();
ROLLBACK;
