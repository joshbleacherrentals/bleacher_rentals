-- ============================================================================
-- Tests for "BleacherAnnualInspections"
-- Migration: 20260908120000_bleacher_annual_inspections.sql
-- Spec:      docs/specs/bleacher-annual-inspections.md
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/bleacher_annual_inspections.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Plain top-level statements + psql's \gset rather than a DO block: pgTAP's
-- is() returns its TAP line as a result row, and PERFORM throws that away, so
-- assertions inside plpgsql run without ever being counted.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(12);

-- ── Shape of the table ──────────────────────────────────────────────────────
--
-- A row exists to answer "when is the next one due", so that is the one column
-- that cannot be missing. Everything else is optional on purpose: Michelle's
-- first pass is a due date typed off a spreadsheet, with no inspection behind
-- it and no certificate yet.

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'BleacherAnnualInspections'
      AND column_name = 'next_due_on'),
  'date',
  'next_due_on is a calendar date, so a status cannot depend on the reader''s timezone'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'BleacherAnnualInspections'
      AND column_name = 'next_due_on'),
  'NO',
  'next_due_on is NOT NULL — a row with no due date says nothing'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'BleacherAnnualInspections'
      AND column_name = 'inspected_on'),
  'YES',
  'inspected_on is nullable — a known due date with no inspection behind it is valid'
);

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Users'
      AND column_name = 'inspection_queue_last_seen_at'),
  'timestamp with time zone',
  'Users carries the one column the whole notification system needs'
);

SELECT ok(
  (SELECT count(*) = 1 FROM storage.buckets WHERE id = 'bleacher-inspections'),
  'the inspection certificates have a bucket to live in'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9971, 10, 100)
RETURNING id AS bleacher \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Insp', 'Admin', 'insp_admin@test.com', 'clerk_insp_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Insp', 'Viewer', 'insp_viewer@test.com', 'clerk_insp_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Insp', 'AM', 'insp_am@test.com', 'clerk_insp_am', false, false)
RETURNING id AS user_am \gset

INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Insp', 'Nobody', 'insp_nobody@test.com', 'clerk_insp_nobody', false, false)
RETURNING id AS user_nobody \gset

-- ── The one constraint that matters ─────────────────────────────────────────

SELECT throws_ok(
  format(
    'INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, next_due_on) VALUES (%L, NULL)',
    :'bleacher'
  ),
  '23502',
  NULL,
  'a row without a due date is rejected'
);

-- ── Cascade ─────────────────────────────────────────────────────────────────
--
-- Inspection history belongs to the bleacher. When the bleacher goes, so does
-- the paperwork trail — there is nothing left for it to describe.

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9972, 10, 100)
RETURNING id AS doomed \gset

INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, next_due_on)
VALUES (:'doomed', '2027-03-14');

DELETE FROM public."Bleachers" WHERE id = :'doomed';

SELECT is(
  (SELECT count(*)::int FROM public."BleacherAnnualInspections" WHERE bleacher_uuid = :'doomed'),
  0,
  'deleting a bleacher takes its inspection history with it'
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Mirrors who may see and edit a bleacher: admin and account managers write,
-- viewers read, everyone else sees nothing. Drivers have no policy at all —
-- the mobile app has no screen for this.

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_insp_admin')::text, true);
SELECT lives_ok(
  format(
    'INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, inspected_on, next_due_on, notes) '
    'VALUES (%L, ''2026-03-14'', ''2027-03-14'', ''frame ok'')',
    :'bleacher'
  ),
  'an admin can record an inspection'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_insp_am')::text, true);
SELECT lives_ok(
  format(
    'INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, next_due_on) VALUES (%L, ''2028-03-14'')',
    :'bleacher'
  ),
  'an account manager can record an inspection'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_insp_viewer')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."BleacherAnnualInspections" WHERE bleacher_uuid = :'bleacher'),
  2,
  'a viewer can read the inspection history'
);

SELECT throws_ok(
  format(
    'INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, next_due_on) VALUES (%L, ''2029-03-14'')',
    :'bleacher'
  ),
  '42501',
  NULL,
  'a viewer cannot record an inspection'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_insp_nobody')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."BleacherAnnualInspections" WHERE bleacher_uuid = :'bleacher'),
  0,
  'a user with no web role sees no inspections at all'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
