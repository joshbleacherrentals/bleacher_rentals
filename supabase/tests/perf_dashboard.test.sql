-- ============================================================================
-- Tests for the performance dashboard's database side
-- Migration: 20261009120000_perf_dashboard.sql
-- Spec:      docs/specs/performance-dashboard.md (§1, §2, §7)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/perf_dashboard.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an active developer reads PerfEvents and every function returns the sample data;
--   * nobody else does — admin, account manager, viewer, accountant, driver, a user with no role,
--     a developer whose role is switched off — they read zero rows and get empty results;
--   * anon cannot execute any function, and no API role can insert, update or delete;
--   * the numbers are the hand-computed ones: percentiles, errors kept in, sqlite.* left out of
--     the percentiles, the fast/slow merge of perf_sqlite, filters, breakdowns;
--   * perf_health gives a non-developer no row at all (the table's size is not theirs to see).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(49);

CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- A clean slate: a developer's local table holds real events. Rolled back with everything else.
DELETE FROM public."PerfEvents";

-- ── People ──────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dev', 'Active', 'pd_dev@test.com', 'clerk_pd_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dev', 'Off', 'pd_dev_off@test.com', 'clerk_pd_dev_off', false, false)
RETURNING id AS user_dev_off \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'pd_admin@test.com', 'clerk_pd_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'pd_am@test.com', 'clerk_pd_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'pd_viewer@test.com', 'clerk_pd_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Accountant', 'pd_acct@test.com', 'clerk_pd_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Driver', 'pd_driver@test.com', 'clerk_pd_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'pd_norole@test.com', 'clerk_pd_norole', false, false);

-- ── The sample events (superuser, so RLS does not apply) ────────────────────
-- Every row carries an explicit received_at so "newest first" has no ties.

CREATE FUNCTION public.test_event(
  p_name text, p_ms double precision, p_outcome text, p_kind text, p_version text, p_env text,
  p_device text, p_os text, p_roles text[], p_attrs jsonb, p_age interval
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."PerfEvents"
    (received_at, event_at, name, duration_ms, outcome, error_kind, session_id, tab_role,
     app_version, env, browser, os, device_class, roles, attrs)
  VALUES (now() - p_age, now() - p_age, p_name, p_ms, p_outcome, p_kind, gen_random_uuid(),
          'leader', p_version, p_env, 'chrome 141', p_os, p_device, p_roles, p_attrs);
$$;

-- powersync.connect, 1.0.0, production: 100..500 ok and 600 an error
SELECT public.test_event('powersync.connect', 100, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', ARRAY['admin'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 200, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', ARRAY['admin'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 300, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', ARRAY['admin'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 400, 'ok', NULL, '1.0.0', 'production', 'mobile', 'windows', ARRAY['accountant'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 500, 'ok', NULL, '1.0.0', 'production', 'mobile', 'windows', ARRAY['accountant'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 600, 'error', 'timeout', '1.0.0', 'production', 'desktop', 'macos', ARRAY['accountant'], NULL, '1 hour');
-- a newer version, a development event and one 40 days old: each must be left out somewhere
SELECT public.test_event('powersync.connect', 1000, 'ok', NULL, '1.1.0', 'production', 'desktop', 'macos', ARRAY['admin'], NULL, '1 minute');
SELECT public.test_event('powersync.connect', 5000, 'ok', NULL, '1.0.0', 'development', 'desktop', 'macos', ARRAY['admin'], NULL, '1 hour');
SELECT public.test_event('powersync.connect', 9999, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', ARRAY['admin'], NULL, '40 days');
-- errors
SELECT public.test_event('sync.upload', 50, 'error', 'pg:23505', '1.0.0', 'production', 'desktop', 'macos', NULL, NULL, '1 hour');
SELECT public.test_event('sync.upload', 70, 'error', 'pg:23505', '1.0.0', 'production', 'desktop', 'macos', NULL, NULL, '2 hours');
SELECT public.test_event('sync.upload', 10, 'error', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, NULL, '1 hour');
-- count events and the telemetry's own health
SELECT public.test_event('app.start', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"navType":"reload"}', '1 hour');
SELECT public.test_event('app.start', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"navType":"navigate"}', '1 hour');
SELECT public.test_event('app.telemetry_dropped', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"dropped":7}', '1 hour');
SELECT public.test_event('app.telemetry_dropped', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"dropped":3}', '1 hour');
-- sqlite.query: an aggregate of 100 fast calls (40 <= 1 ms, 30 <= 5 ms, 30 <= 50 ms), two slow
-- calls, and one fast failure at 3 ms: 103 calls, 2 of them slow
SELECT public.test_event('sqlite.query', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL,
  '{"op":"select","tables":"Users","count":100,"sumMs":900,"maxMs":50,"b1":40,"b2":0,"b3":30,"b4":0,"b5":0,"b6":30}', '1 hour');
SELECT public.test_event('sqlite.query', 80, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"op":"select","tables":"Users"}', '1 hour');
SELECT public.test_event('sqlite.query', 200, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"op":"select","tables":"Users"}', '1 hour');
SELECT public.test_event('sqlite.query', 3, 'error', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL, '{"op":"select","tables":"Users"}', '1 hour');
SELECT public.test_event('sqlite.write', NULL, 'ok', NULL, '1.0.0', 'production', 'desktop', 'macos', NULL,
  '{"op":"update","tables":"Events","count":10,"sumMs":15,"maxMs":2,"b1":0,"b2":10,"b3":0,"b4":0,"b5":0,"b6":0}', '1 hour');

SELECT set_config('perf.since', (now() - interval '7 days')::text, true);

-- ═══ SHAPE ═══════════════════════════════════════════════════════════════════

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'PerfEvents' AND cmd = 'SELECT'),
  1, 'PerfEvents has one SELECT policy');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'PerfEvents' AND cmd <> 'SELECT'),
  0, 'and no policy for insert, update or delete');

-- ═══ THE DEVELOPER ═══════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pd_dev')::text, true);

SELECT cmp_ok((SELECT count(*)::int FROM public."PerfEvents"), '>', 20, 'a developer reads PerfEvents');

-- perf_versions
SELECT is(
  (SELECT array_agg(app_version ORDER BY ord) FROM (
     SELECT app_version, row_number() OVER () AS ord
       FROM public.perf_versions(current_setting('perf.since')::timestamptz, 'production')) v),
  ARRAY['1.1.0', '1.0.0'], 'versions come newest first, one row each');
SELECT is(
  (SELECT events::int FROM public.perf_versions(current_setting('perf.since')::timestamptz, 'production')
    WHERE app_version = '1.1.0'),
  1, '...with their event counts');
SELECT is(
  (SELECT count(*)::int FROM public.perf_versions(current_setting('perf.since')::timestamptz, 'development')),
  1, 'the environment filter narrows the versions');

-- perf_percentiles: all versions
SELECT is(
  (SELECT array_agg(name ORDER BY name) FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', NULL)),
  ARRAY['powersync.connect', 'sync.upload'],
  'percentiles list metrics with durations only: no sqlite.*, no count events');
SELECT is(
  (SELECT n::int FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'powersync.connect'),
  7, 'seven connects: development and the 40-day-old one are left out');
SELECT is(
  (SELECT errors::int FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'powersync.connect'),
  1, 'the failed connect is counted as an error...');
SELECT is(
  (SELECT p50::numeric FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'powersync.connect'),
  400::numeric, '...and kept in the median (100..600 and 1000)');
SELECT is(
  (SELECT max_ms::numeric FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'powersync.connect'),
  1000::numeric, 'max is the largest duration');

-- ...one version
SELECT is(
  (SELECT n::int FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', '1.0.0') WHERE name = 'powersync.connect'),
  6, 'the version filter keeps only that version');
SELECT is(
  (SELECT p50::numeric FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', '1.0.0') WHERE name = 'powersync.connect'),
  350::numeric, 'P50 of 100..600 is 350');
SELECT is(
  (SELECT p95::numeric FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'production', '1.0.0') WHERE name = 'powersync.connect'),
  575::numeric, 'P95 of 100..600 is 575, interpolated');
SELECT is(
  (SELECT n::int FROM public.perf_percentiles(current_setting('perf.since')::timestamptz, 'development', NULL) WHERE name = 'powersync.connect'),
  1, 'the environment filter works');
SELECT is(
  (SELECT n::int FROM public.perf_percentiles((now() - interval '60 days'), 'production', NULL) WHERE name = 'powersync.connect'),
  8, 'a longer period brings the old event back');

-- perf_sqlite: 100 aggregated + 1 fast failure + 2 slow = 103 calls
SELECT is(
  (SELECT calls::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'sqlite.query' LIMIT 1),
  103, 'sqlite.query counts the aggregate, the fast failure and the slow calls');
SELECT is(
  (SELECT slow_calls::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL) WHERE name = 'sqlite.query' LIMIT 1),
  2, '...two of them slow');
SELECT is(
  (SELECT kind || ':' || value::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sqlite.query' AND p = 0.5),
  'bucket:5', 'P50 lands among the fast calls, so it is a bucket edge (<= 5 ms)');
SELECT is(
  (SELECT kind || ':' || value::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sqlite.query' AND p = 0.75),
  'bucket:50', 'P75 is in the last bucket');
SELECT is(
  (SELECT kind || ':' || value::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sqlite.query' AND p = 0.99),
  'exact:80', 'P99 lands among the slow calls, so it is exact');
SELECT is(
  (SELECT count(*)::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL)),
  10, 'two sqlite metrics, five percentiles each');
SELECT is(
  (SELECT kind || ':' || value::int FROM public.perf_sqlite(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sqlite.write' AND p = 0.99),
  'bucket:2', 'a metric with only fast calls has only buckets');

-- perf_errors
SELECT is(
  (SELECT count(*)::int FROM public.perf_errors(current_setting('perf.since')::timestamptz, 'production', NULL)),
  4, 'errors are grouped by metric and kind');
SELECT is(
  (SELECT count::int FROM public.perf_errors(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sync.upload' AND kind = 'pg:23505'),
  2, 'two pg:23505 upload errors');
SELECT is(
  (SELECT median_ms::numeric FROM public.perf_errors(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sync.upload' AND kind = 'pg:23505'),
  60::numeric, '...with their median');
SELECT is(
  (SELECT count::int FROM public.perf_errors(current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE name = 'sync.upload' AND kind = 'unknown'),
  1, 'an error with no kind is listed as unknown');

-- perf_health
SELECT is(
  (SELECT events::int FROM public.perf_health(current_setting('perf.since')::timestamptz, 'production', NULL)),
  19, 'health counts every event of the period and environment');
SELECT is(
  (SELECT dropped::int FROM public.perf_health(current_setting('perf.since')::timestamptz, 'production', NULL)),
  10, '...the events browsers reported dropping');
SELECT is(
  (SELECT loads::int FROM public.perf_health(current_setting('perf.since')::timestamptz, 'production', NULL)),
  2, '...and the page loads (app.start)');
SELECT is(
  (SELECT table_rows::int FROM public.perf_health(current_setting('perf.since')::timestamptz, 'production', NULL)),
  (SELECT count(*)::int FROM public."PerfEvents"), 'the table totals ignore the filters');
SELECT cmp_ok(
  (SELECT size_bytes FROM public.perf_health(current_setting('perf.since')::timestamptz, 'production', NULL)),
  '>', 0::bigint, 'the table has a size');

-- perf_breakdown
SELECT is(
  (SELECT n::int FROM public.perf_breakdown('powersync.connect', current_setting('perf.since')::timestamptz, 'production', '1.0.0')
    WHERE dimension = 'device_class' AND value = 'mobile'),
  2, 'breakdown by device class');
SELECT is(
  (SELECT p50::numeric FROM public.perf_breakdown('powersync.connect', current_setting('perf.since')::timestamptz, 'production', '1.0.0')
    WHERE dimension = 'device_class' AND value = 'mobile'),
  450::numeric, '...with the median of that slice');
SELECT is(
  (SELECT p50::numeric FROM public.perf_breakdown('powersync.connect', current_setting('perf.since')::timestamptz, 'production', '1.0.0')
    WHERE dimension = 'role' AND value = 'accountant'),
  500::numeric, 'breakdown by role: the accountant slice (400, 500, 600)');
SELECT is(
  (SELECT errors::int FROM public.perf_breakdown('powersync.connect', current_setting('perf.since')::timestamptz, 'production', '1.0.0')
    WHERE dimension = 'os' AND value = 'macos'),
  1, 'breakdown by OS carries its errors');
SELECT is(
  (SELECT calls::int FROM public.perf_breakdown('sqlite.query', current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE dimension = 'op' AND value = 'select'),
  103, 'a sqlite metric is broken down by op, as calls');
SELECT is(
  (SELECT max_ms::numeric FROM public.perf_breakdown('sqlite.query', current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE dimension = 'tables' AND value = 'Users'),
  200::numeric, '...and by tables, with the slowest call seen');
SELECT is(
  (SELECT p95 FROM public.perf_breakdown('sqlite.query', current_setting('perf.since')::timestamptz, 'production', NULL)
    WHERE dimension = 'op' AND value = 'select'),
  NULL::double precision, '...with no percentile, which would be invented precision');

-- Writes through the API are refused whatever the role
SELECT throws_ok(
  $q$INSERT INTO public."PerfEvents" (event_at, name, outcome, session_id, tab_role, app_version, env)
     VALUES (now(), 'x', 'ok', gen_random_uuid(), 'leader', '1', 'production')$q$,
  '42501', NULL, 'even a developer cannot insert through the API');
SELECT is(
  public.test_rows_affected($q$DELETE FROM public."PerfEvents"$q$), 0,
  'or delete');

RESET ROLE;

-- ═══ EVERYONE ELSE ═══════════════════════════════════════════════════════════

CREATE FUNCTION public.test_nothing_visible(p_sub text) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  since timestamptz := now() - interval '7 days';
  seen int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  seen := (SELECT count(*) FROM public."PerfEvents")
        + (SELECT count(*) FROM public.perf_versions(since, 'production'))
        + (SELECT count(*) FROM public.perf_percentiles(since, 'production', NULL))
        + (SELECT count(*) FROM public.perf_sqlite(since, 'production', NULL))
        + (SELECT count(*) FROM public.perf_errors(since, 'production', NULL))
        + (SELECT count(*) FROM public.perf_health(since, 'production', NULL))
        + (SELECT count(*) FROM public.perf_breakdown('powersync.connect', since, 'production', NULL))
        + (SELECT count(*) FROM public.perf_breakdown('sqlite.query', since, 'production', NULL));
  EXECUTE 'RESET ROLE';
  RETURN seen = 0;
END;
$$;

SELECT ok(public.test_nothing_visible('clerk_pd_admin'), 'an admin sees nothing and gets nothing from the functions');
SELECT ok(public.test_nothing_visible('clerk_pd_am'), 'an account manager sees nothing');
SELECT ok(public.test_nothing_visible('clerk_pd_viewer'), 'a viewer sees nothing');
SELECT ok(public.test_nothing_visible('clerk_pd_acct'), 'an accountant sees nothing');
SELECT ok(public.test_nothing_visible('clerk_pd_driver'), 'a driver sees nothing');
SELECT ok(public.test_nothing_visible('clerk_pd_norole'), 'a user with no role sees nothing');
SELECT ok(public.test_nothing_visible('clerk_pd_dev_off'), 'a developer whose role is switched off sees nothing');

-- ═══ ANON ════════════════════════════════════════════════════════════════════

SET LOCAL ROLE anon;
SELECT throws_ok(
  $q$SELECT * FROM public.perf_percentiles(now() - interval '7 days', 'production', NULL)$q$,
  '42501', NULL, 'anon cannot execute the functions');
RESET ROLE;

SELECT finish();
ROLLBACK;
