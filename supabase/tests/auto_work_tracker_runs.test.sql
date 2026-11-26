-- ============================================================================
-- Tests for the Auto Work Trackers settings and run log
-- Migrations: 20261125180000_auto_work_tracker_settings.sql,
--             20261125190000_auto_work_tracker_runs.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/auto_work_tracker_runs.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * admins and account managers can READ the settings, runs, run trips and feedback;
--     viewers and maintainers see none of them (a refused read is an empty result);
--   * only admins CHANGE the settings and DISCARD a run (an UPDATE that RLS filters out
--     does not raise, so each refusal is checked by looking at the row afterwards);
--   * admins and account managers can CREATE runs, run trips and feedback the way the
--     PowerSync upload does it: INSERT ... ON CONFLICT (id) DO UPDATE (an upsert);
--   * the JSON columns hold JSON objects.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(20);

CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Awt', 'Admin', 'awt_admin@test.com', 'clerk_awt_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Awt', 'AM', 'awt_am@test.com', 'clerk_awt_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Awt', 'Viewer', 'awt_viewer@test.com', 'clerk_awt_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Awt', 'Maint', 'awt_maint@test.com', 'clerk_awt_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- A run made as a fixture, for the read and discard checks.
INSERT INTO public."AutoWorkTrackerRuns" (id, week_start, auto_work_tracker_id, settings)
VALUES ('00000000-0000-0000-0000-0000000a0001', '2026-09-14', 'zone|2026-09-14', '{"objective":"time"}');

-- ── Account manager ─────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_awt_am')::text, true);

SELECT is((SELECT count(*)::int FROM public."AutoWorkTrackerSettings"), 1,
  'an account manager reads the settings');
SELECT is((SELECT count(*)::int FROM public."AutoWorkTrackerRuns"
           WHERE id = '00000000-0000-0000-0000-0000000a0001'), 1,
  'an account manager reads the runs');

SELECT lives_ok($$
  INSERT INTO public."AutoWorkTrackerRuns" (id, week_start, auto_work_tracker_id, settings, result)
  VALUES ('00000000-0000-0000-0000-0000000a0002', '2026-09-14', 'zone|2026-09-14',
          '{"objective":"distance"}', '{"created":1}')
  ON CONFLICT (id) DO UPDATE SET settings = excluded.settings
$$, 'an account manager creates a run with an upsert, as the PowerSync upload does');

SELECT lives_ok($$
  INSERT INTO public."AutoWorkTrackerRunTrips" (id, run_uuid, work_tracker_uuid, snapshot)
  VALUES ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000a0002',
          '00000000-0000-0000-0000-0000000c0001', '{"tracker":{"driver_uuid":"d1"},"lineItems":[]}')
  ON CONFLICT (id) DO UPDATE SET snapshot = excluded.snapshot
$$, 'an account manager records a run trip with an upsert');

SELECT lives_ok($$
  INSERT INTO public."AutoWorkTrackerFeedback" (id, run_uuid, kind, reason)
  VALUES ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000a0002',
          'edit', 'Driver cannot make it that day')
  ON CONFLICT (id) DO UPDATE SET reason = excluded.reason
$$, 'an account manager records a reason with an upsert');

SELECT is(public.test_rows_affected($$
  UPDATE public."AutoWorkTrackerSettings" SET max_day_minutes = 600 WHERE id = 'global'
$$), 0, 'an account manager cannot change the settings');

SELECT is(public.test_rows_affected($$
  UPDATE public."AutoWorkTrackerRuns" SET discarded_at = now()
  WHERE id = '00000000-0000-0000-0000-0000000a0001'
$$), 0, 'an account manager cannot discard a run');

-- ── Viewer and maintainer: nothing ──────────────────────────────────────────

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_awt_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."AutoWorkTrackerSettings"), 0,
  'a viewer does not read the settings');
SELECT is((SELECT count(*)::int FROM public."AutoWorkTrackerRuns"
           WHERE id = '00000000-0000-0000-0000-0000000a0001'), 0,
  'a viewer does not read the runs');
SELECT throws_ok($$
  INSERT INTO public."AutoWorkTrackerRuns" (week_start, auto_work_tracker_id)
  VALUES ('2026-09-14', 'zone|2026-09-14')
$$, '42501', NULL, 'a viewer cannot create a run');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_awt_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."AutoWorkTrackerRunTrips"), 0,
  'a maintainer does not read run trips');
SELECT throws_ok($$
  INSERT INTO public."AutoWorkTrackerFeedback" (run_uuid, kind, reason)
  VALUES ('00000000-0000-0000-0000-0000000a0001', 'edit', 'x')
$$, '42501', NULL, 'a maintainer cannot leave feedback');

-- ── Admin ───────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_awt_admin')::text, true);
SELECT is(public.test_rows_affected($$
  UPDATE public."AutoWorkTrackerSettings" SET max_day_minutes = 600 WHERE id = 'global'
$$), 1, 'an admin changes the settings');
SELECT is(public.test_rows_affected($$
  UPDATE public."AutoWorkTrackerSettings" SET max_day_minutes = NULL WHERE id = 'global'
$$), 1, 'an admin resets a setting to its default (null)');
SELECT is(public.test_rows_affected($$
  UPDATE public."AutoWorkTrackerRuns" SET discarded_at = now()
  WHERE id = '00000000-0000-0000-0000-0000000a0001'
$$), 1, 'an admin discards a run');

RESET ROLE;

-- ── Rows and checks ─────────────────────────────────────────────────────────

SELECT is((SELECT discarded_at IS NULL FROM public."AutoWorkTrackerRuns"
           WHERE id = '00000000-0000-0000-0000-0000000a0002'), true,
  'the account manager''s run was not discarded by their refused update');
SELECT is((SELECT jsonb_typeof(snapshot) FROM public."AutoWorkTrackerRunTrips"
           WHERE id = '00000000-0000-0000-0000-0000000b0001'), 'object',
  'a snapshot is a JSON object');
SELECT throws_ok($$
  INSERT INTO public."AutoWorkTrackerSettings" (id) VALUES ('second')
$$, '23514', NULL, 'there is only ever one settings row');
SELECT throws_ok($$
  UPDATE public."AutoWorkTrackerSettings" SET search_seconds = 60 WHERE id = 'global'
$$, '23514', NULL, 'a setting outside its range is refused');
SELECT throws_ok($$
  INSERT INTO public."AutoWorkTrackerFeedback" (run_uuid, kind, reason)
  VALUES ('00000000-0000-0000-0000-0000000a0001', 'edit', '   ')
$$, '23514', NULL, 'a blank reason is refused');

SELECT * FROM finish();
ROLLBACK;
