-- ============================================================================
-- Tests for PerfEvents — the real-user performance telemetry table
-- Migration: 20261008120000_perf_events.sql
-- Spec:      docs/specs/perf-telemetry-pipeline.md (§5, §12)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/perf_events.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the table is UNLOGGED and is NOT in the `powersync` publication — the whole reason the
--     table is built this way, so a later "make it durable" edit fails here instead of quietly
--     loading the replication slot with telemetry;
--   * RLS is on with no policy: `anon` and `authenticated` read nothing and cannot insert;
--   * the table refuses an outcome or a tab role outside its sets;
--   * the retention job exists, and the statement it runs deletes a row older than 30 days
--     and keeps a newer one.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(13);

-- ── Shape ───────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT relpersistence::text FROM pg_class
    WHERE oid = 'public."PerfEvents"'::regclass),
  'u', 'the table is UNLOGGED');

SELECT is(
  (SELECT count(*)::int FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'PerfEvents'),
  0, 'the table is not in the powersync publication');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."PerfEvents"'::regclass),
  true, 'row level security is on');

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'PerfEvents'),
  0, 'there is no policy, so no API role gets in');

SELECT has_index('public', 'PerfEvents', 'PerfEvents_name_received_idx',
  'the (name, received_at) index exists');

-- ── The table's own rules (as the superuser) ────────────────────────────────

INSERT INTO public."PerfEvents"
  (event_at, name, outcome, session_id, tab_role, app_version, env)
VALUES
  (now(), 'app.telemetry_dropped', 'ok', gen_random_uuid(), 'leader', '1.16.0', 'production');

SELECT is(
  (SELECT count(*)::int FROM public."PerfEvents"), 1, 'a valid row can be inserted');

SELECT throws_ok(
  $q$INSERT INTO public."PerfEvents" (event_at, name, outcome, session_id, tab_role, app_version, env)
     VALUES (now(), 'x', 'slow', gen_random_uuid(), 'leader', '1', 'production')$q$,
  '23514', NULL, 'an outcome outside ok/error is refused');

SELECT throws_ok(
  $q$INSERT INTO public."PerfEvents" (event_at, name, outcome, session_id, tab_role, app_version, env)
     VALUES (now(), 'x', 'ok', gen_random_uuid(), 'first', '1', 'production')$q$,
  '23514', NULL, 'the old tab roles first/other are refused');

-- ── API roles ───────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public."PerfEvents"), 0,
  'an authenticated user reads nothing');
SELECT throws_ok(
  $q$INSERT INTO public."PerfEvents" (event_at, name, outcome, session_id, tab_role, app_version, env)
     VALUES (now(), 'x', 'ok', gen_random_uuid(), 'leader', '1', 'production')$q$,
  '42501', NULL, 'an authenticated user cannot insert');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public."PerfEvents"), 0, 'anon reads nothing');
SELECT throws_ok(
  $q$INSERT INTO public."PerfEvents" (event_at, name, outcome, session_id, tab_role, app_version, env)
     VALUES (now(), 'x', 'ok', gen_random_uuid(), 'leader', '1', 'production')$q$,
  '42501', NULL, 'anon cannot insert');
RESET ROLE;

-- ── Retention ───────────────────────────────────────────────────────────────

INSERT INTO public."PerfEvents"
  (received_at, event_at, name, outcome, session_id, tab_role, app_version, env)
VALUES
  (now() - interval '31 days', now() - interval '31 days', 'old', 'ok', gen_random_uuid(), 'leader', '1', 'production'),
  (now() - interval '29 days', now() - interval '29 days', 'recent', 'ok', gen_random_uuid(), 'leader', '1', 'production');

-- Run exactly the statement the scheduled job runs, not a copy of it.
DO $$
BEGIN
  EXECUTE (SELECT command FROM cron.job WHERE jobname = 'prune-perf-events');
END $$;

SELECT is(
  (SELECT array_agg(name ORDER BY name) FROM public."PerfEvents" WHERE name IN ('old', 'recent')),
  ARRAY['recent'],
  'the retention job deletes a 31-day-old row and keeps a 29-day-old one');

SELECT finish();
ROLLBACK;
