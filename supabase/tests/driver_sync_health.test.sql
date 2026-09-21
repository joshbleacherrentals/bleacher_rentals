-- ============================================================================
-- Tests for the Sync Health columns on "Drivers"
-- Migration: 20260921120000_driver_sync_health.sql
-- Context:   br_driver/docs/specs/sync-bucket-limit.md (PSYNC_S2305)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/driver_sync_health.test.sql
--
-- The driver app reports how many PowerSync buckets it holds by writing three
-- columns on its own Drivers row; developers read every row on the Sync Health
-- page. What must hold at the database level:
--
--  * NULL means "this build never reported" — the page tells that apart from
--    a real zero, so the columns have no default;
--  * a driver writes its own row and nobody else's — the count is only worth
--    something if it came from that driver's phone;
--  * a developer sees every driver, and cannot change any of them.
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(15);

-- ── Shape ───────────────────────────────────────────────────────────────────

SELECT col_type_is('public', 'Drivers', 'bucket_count', 'integer',
  'bucket_count is an integer');
SELECT col_type_is('public', 'Drivers', 'sync_version', 'integer',
  'sync_version is an integer (the connect param the build syncs with)');
SELECT col_type_is('public', 'Drivers', 'bucket_count_reported_at', 'timestamp with time zone',
  'bucket_count_reported_at is a timestamptz');

SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Drivers'
      AND column_name IN ('bucket_count', 'sync_version', 'bucket_count_reported_at')
      AND is_nullable = 'YES' AND column_default IS NULL),
  3,
  'all three are nullable with no default: NULL is "no report yet", not zero'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id)
VALUES ('Driver', 'A', 'sh_driver_a@test.com', 'clerk_sh_driver_a')
RETURNING id AS user_a \gset
INSERT INTO public."Drivers" (user_uuid) VALUES (:'user_a') RETURNING id AS driver_a \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id)
VALUES ('Driver', 'B', 'sh_driver_b@test.com', 'clerk_sh_driver_b')
RETURNING id AS user_b \gset
INSERT INTO public."Drivers" (user_uuid) VALUES (:'user_b') RETURNING id AS driver_b \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id)
VALUES ('Dev', 'Only', 'sh_dev@test.com', 'clerk_sh_dev')
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id)
VALUES ('Dev', 'Retired', 'sh_dev_inactive@test.com', 'clerk_sh_dev_inactive')
RETURNING id AS user_dev_inactive \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev_inactive', false);

SELECT count(*)::int AS all_drivers FROM public."Drivers" \gset

SELECT ok(
  (SELECT bucket_count IS NULL AND sync_version IS NULL AND bucket_count_reported_at IS NULL
     FROM public."Drivers" WHERE id = :'driver_a'),
  'a new driver starts with no report'
);

-- ── A driver reports on its own row ─────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_sh_driver_a')::text, true);

WITH u AS (
  UPDATE public."Drivers"
     SET bucket_count = 412, sync_version = 2, bucket_count_reported_at = now()
   WHERE id = :'driver_a'
  RETURNING 1
)
SELECT is(count(*)::int, 1, 'a driver can write the report on its own row') FROM u;

WITH u AS (
  UPDATE public."Drivers"
     SET bucket_count = 1, sync_version = 2, bucket_count_reported_at = now()
   WHERE id = :'driver_b'
  RETURNING 1
)
SELECT is(count(*)::int, 0, 'a driver cannot write the report on another driver''s row') FROM u;

SELECT is(
  (SELECT count(*)::int FROM public."Drivers"),
  1,
  'a driver still sees only its own row'
);

RESET ROLE;

SELECT is(
  (SELECT bucket_count FROM public."Drivers" WHERE id = :'driver_a'),
  412,
  'the driver''s own report landed'
);

SELECT ok(
  (SELECT bucket_count IS NULL FROM public."Drivers" WHERE id = :'driver_b'),
  'the other driver''s row is untouched'
);

-- ── The count is never negative ─────────────────────────────────────────────

SELECT throws_ok(
  format('UPDATE public."Drivers" SET bucket_count = -1 WHERE id = %L', :'driver_a'),
  '23514',
  NULL,
  'a negative bucket count is rejected'
);

-- ── A developer sees every driver ───────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_sh_dev')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."Drivers"),
  :all_drivers,
  'a developer sees every driver row'
);

SELECT is(
  (SELECT bucket_count FROM public."Drivers" WHERE id = :'driver_a'),
  412,
  'a developer can read the reported count'
);

WITH u AS (
  UPDATE public."Drivers" SET bucket_count = 0 WHERE id = :'driver_a' RETURNING 1
)
SELECT is(count(*)::int, 0, 'a developer cannot change a driver''s report') FROM u;

-- ── An inactive developer row grants nothing ────────────────────────────────

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_sh_dev_inactive')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."Drivers"),
  0,
  'an inactive developer sees no drivers'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
