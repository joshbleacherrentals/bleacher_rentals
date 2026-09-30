-- ============================================================================
-- Maintainer: may add and edit bleachers, nothing else new
-- Migration: 20260930120000_maintainer_edit_bleachers.sql
-- ============================================================================
--   npx supabase test db
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(10);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'maint_bl@test.com', 'clerk_maint_bl', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('View', 'Er', 'viewer_bl@test.com', 'clerk_viewer_bl', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9983, 10, 100) RETURNING id AS bleacher \gset

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_bl')::text, true);

-- ── Maintainer ──────────────────────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats) VALUES (9984, 12, 120)$$,
  'a maintainer can add a bleacher'
);

SELECT lives_ok(
  format($$UPDATE public."Bleachers" SET bleacher_seats = 110 WHERE id = %L$$, :'bleacher'),
  'a maintainer can edit a bleacher'
);
SELECT is((SELECT bleacher_seats::int FROM public."Bleachers" WHERE id = :'bleacher'), 110,
  'the edit actually landed (not silently filtered out by RLS)');

SELECT lives_ok(
  format($$UPDATE public."Bleachers" SET deleted = true WHERE id = %L$$, :'bleacher'),
  'a maintainer can soft-delete a bleacher'
);
SELECT is((SELECT deleted FROM public."Bleachers" WHERE id = :'bleacher'), true,
  'the soft delete actually landed');

SELECT lives_ok(
  $$INSERT INTO public."BleacherTypes" (name, row_count) VALUES ('19 Row', 19)$$,
  'a maintainer can create the bleacher type a new row count needs'
);

DELETE FROM public."Bleachers" WHERE id = :'bleacher';
SELECT is((SELECT count(*)::int FROM public."Bleachers" WHERE id = :'bleacher'), 1,
  'a maintainer still cannot hard-delete a bleacher');

UPDATE public."BleacherTypes" SET name = 'Renamed' WHERE row_count = 19;
-- A maintainer cannot read BleacherTypes through the database (the app reads its local copy), so
-- check the outcome from the table owner's side.
RESET ROLE;
SELECT is((SELECT name FROM public."BleacherTypes" WHERE row_count = 19), '19 Row',
  'a maintainer still cannot rename a bleacher type');
SET LOCAL ROLE authenticated;

-- ── Viewer: unchanged, still read-only ─────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_viewer_bl')::text, true);

SELECT throws_ok(
  $$INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats) VALUES (9985, 12, 120)$$,
  '42501',
  NULL,
  'a viewer still cannot add a bleacher'
);
UPDATE public."Bleachers" SET bleacher_seats = 1 WHERE bleacher_number = 9983;
SELECT is((SELECT bleacher_seats::int FROM public."Bleachers" WHERE bleacher_number = 9983), 110,
  'a viewer still cannot edit a bleacher');

SELECT * FROM finish();
ROLLBACK;
