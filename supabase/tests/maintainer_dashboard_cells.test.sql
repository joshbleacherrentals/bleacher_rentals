-- ============================================================================
-- Maintainer: write notes in dashboard cells, change only their own
-- Migration: 20261001120000_maintainer_dashboard_cells.sql
-- Spec:      docs/specs/maintainer-dashboard-cells.md
-- ============================================================================
--   npx supabase test db
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(44);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'One', 'maint_one_bc@test.com', 'clerk_maint_one_bc', false, false)
RETURNING id AS user_m1 \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_m1', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Two', 'maint_two_bc@test.com', 'clerk_maint_two_bc', false, false)
RETURNING id AS user_m2 \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_m2', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Ad', 'Min', 'admin_bc@test.com', 'clerk_admin_bc', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Ac', 'Manager', 'am_bc@test.com', 'clerk_am_bc', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('View', 'Er', 'viewer_bc@test.com', 'clerk_viewer_bc', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9971, 10, 100) RETURNING id AS bleacher \gset

-- One note per author, one with no author at all (a note that predates the column).
INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid)
VALUES (:'bleacher', '2026-10-01', 'by m1', :'user_m1') RETURNING id AS block_m1 \gset
INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid)
VALUES (:'bleacher', '2026-10-02', 'by m2', :'user_m2') RETURNING id AS block_m2 \gset
INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid)
VALUES (:'bleacher', '2026-10-03', 'by am', :'user_am') RETURNING id AS block_am \gset
INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid)
VALUES (:'bleacher', '2026-10-04', 'legacy', NULL) RETURNING id AS block_null \gset

-- Rows a maintainer may read on the grid but not change.
INSERT INTO public."Events" (event_name, event_start, event_end, lenient)
VALUES ('Some Event', '2026-10-05', '2026-10-06', false) RETURNING id AS event \gset
INSERT INTO public."WorkTrackers" DEFAULT VALUES RETURNING id AS work_tracker \gset
INSERT INTO public."Drivers" DEFAULT VALUES RETURNING id AS driver \gset
INSERT INTO public."HomeBases" (home_base_name) VALUES ('Base') RETURNING id AS home_base \gset

-- The dashboard settings row of maintainer 2, which maintainer 1 must not touch.
INSERT INTO public."DashboardFilterSettings" (user_uuid) VALUES (:'user_m2')
RETURNING id AS settings_m2 \gset

-- ── The column ──────────────────────────────────────────────────────────────
SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Blocks' AND column_name = 'created_by_user_uuid'),
  'YES',
  'the author column is nullable — old notes have none'
);
SELECT is(
  (SELECT count(*)::int FROM public."Blocks" WHERE id = :'block_null' AND created_by_user_uuid IS NULL),
  1,
  'an old note keeps a NULL author (nothing was guessed)'
);

SET LOCAL ROLE authenticated;

-- ═══ Maintainer 1 ═══════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_one_bc')::text, true);

-- Read
SELECT is(
  (SELECT count(*)::int FROM public."Blocks" WHERE bleacher_uuid = :'bleacher'),
  4,
  'a maintainer reads every note, whoever wrote it (and the old one)'
);

-- Create
SELECT lives_ok(
  format($$INSERT INTO public."Blocks" (bleacher_uuid, date, text) VALUES (%L, '2026-10-10', 'new from m1')$$, :'bleacher'),
  'a maintainer can write a note without sending an author'
);
SELECT is(
  (SELECT created_by_user_uuid::text FROM public."Blocks" WHERE text = 'new from m1'),
  :'user_m1',
  'the database filled in the author as the caller'
);
SELECT throws_ok(
  format($$INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid) VALUES (%L, '2026-10-11', 'forged', %L)$$,
         :'bleacher', :'user_m2'),
  '42501',
  NULL,
  'a maintainer cannot write a note in someone else''s name'
);
SELECT throws_ok(
  format($$INSERT INTO public."Blocks" (bleacher_uuid, date, text, created_by_user_uuid) VALUES (%L, '2026-10-12', 'no author', NULL)$$,
         :'bleacher'),
  '42501',
  NULL,
  'a maintainer cannot write a note with no author'
);

-- Update
UPDATE public."Blocks" SET text = 'm1 edited' WHERE id = :'block_m1';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m1'), 'm1 edited',
  'a maintainer can edit their own note (and it really landed)');

UPDATE public."Blocks" SET text = 'hijacked' WHERE id = :'block_m2';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m2'), 'by m2',
  'a maintainer cannot edit another maintainer''s note');

UPDATE public."Blocks" SET text = 'hijacked' WHERE id = :'block_am';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_am'), 'by am',
  'a maintainer cannot edit an account manager''s note');

UPDATE public."Blocks" SET text = 'hijacked' WHERE id = :'block_null';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_null'), 'legacy',
  'a maintainer cannot edit an old note that has no author');

SELECT throws_ok(
  format($$UPDATE public."Blocks" SET created_by_user_uuid = %L WHERE id = %L$$, :'user_m2', :'block_m1'),
  '42501',
  NULL,
  'a maintainer cannot hand their note to another user'
);
SELECT throws_ok(
  format($$UPDATE public."Blocks" SET created_by_user_uuid = NULL WHERE id = %L$$, :'block_m1'),
  '42501',
  NULL,
  'a maintainer cannot strip the author off their note'
);

-- Claiming someone else's note by editing its author: the row is invisible to the update.
UPDATE public."Blocks" SET created_by_user_uuid = :'user_m1' WHERE id = :'block_m2';
SELECT is((SELECT created_by_user_uuid::text FROM public."Blocks" WHERE id = :'block_m2'), :'user_m2',
  'a maintainer cannot claim another user''s note');
UPDATE public."Blocks" SET created_by_user_uuid = :'user_m1' WHERE id = :'block_null';
SELECT is((SELECT count(*)::int FROM public."Blocks" WHERE id = :'block_null' AND created_by_user_uuid IS NULL), 1,
  'a maintainer cannot claim an old note either');

-- Delete
DELETE FROM public."Blocks" WHERE id = :'block_m2';
DELETE FROM public."Blocks" WHERE id = :'block_am';
DELETE FROM public."Blocks" WHERE id = :'block_null';
SELECT is((SELECT count(*)::int FROM public."Blocks" WHERE id IN (:'block_m2', :'block_am', :'block_null')), 3,
  'a maintainer cannot delete anyone else''s note, nor an old one');

DELETE FROM public."Blocks" WHERE id = :'block_m1';
SELECT is((SELECT count(*)::int FROM public."Blocks" WHERE id = :'block_m1'), 0,
  'a maintainer can delete their own note');

-- Nothing else on the dashboard becomes writable.
SELECT throws_ok(
  $$INSERT INTO public."Events" (event_name, event_start, event_end, lenient) VALUES ('Nope', '2026-11-01', '2026-11-02', false)$$,
  '42501',
  NULL,
  'a maintainer cannot create an event'
);
UPDATE public."Events" SET event_name = 'Changed' WHERE id = :'event';
DELETE FROM public."Events" WHERE id = :'event';
SELECT is((SELECT event_name FROM public."Events" WHERE id = :'event'), 'Some Event',
  'a maintainer can read an event but not change or delete it');

SELECT throws_ok(
  $$INSERT INTO public."WorkTrackers" DEFAULT VALUES$$,
  '42501',
  NULL,
  'a maintainer cannot create a work tracker'
);
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'work_tracker'), 1,
  'a maintainer can read a work tracker');
DELETE FROM public."WorkTrackers" WHERE id = :'work_tracker';
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'work_tracker'), 1,
  'a maintainer cannot delete a work tracker');

SELECT is((SELECT count(*)::int FROM public."Drivers" WHERE id = :'driver'), 1,
  'a maintainer can read a driver');
DELETE FROM public."Drivers" WHERE id = :'driver';
SELECT is((SELECT count(*)::int FROM public."Drivers" WHERE id = :'driver'), 1,
  'a maintainer cannot delete a driver');

SELECT is((SELECT count(*)::int FROM public."HomeBases" WHERE id = :'home_base'), 1,
  'a maintainer can read a home base');
SELECT throws_ok(
  $$INSERT INTO public."HomeBases" (home_base_name) VALUES ('New base')$$,
  '42501',
  NULL,
  'a maintainer cannot create a home base'
);

-- Dashboard filter settings: their own row only.
SELECT lives_ok(
  format($$INSERT INTO public."DashboardFilterSettings" (user_uuid) VALUES (%L)$$, :'user_m1'),
  'a maintainer can create their own dashboard settings row'
);
SELECT throws_ok(
  format($$INSERT INTO public."DashboardFilterSettings" (user_uuid) VALUES (%L)$$, :'user_m2'),
  '42501',
  NULL,
  'a maintainer cannot create a settings row for someone else'
);
SELECT lives_ok(
  format($$INSERT INTO public."DashboardFilterSettings" (id, user_uuid)
           SELECT id, user_uuid FROM public."DashboardFilterSettings" WHERE user_uuid = %L
           ON CONFLICT (id) DO UPDATE SET user_uuid = EXCLUDED.user_uuid$$, :'user_m1'),
  'the PowerSync upload (an upsert) works on their own row'
);
UPDATE public."DashboardFilterSettings" SET user_uuid = :'user_m1' WHERE id = :'settings_m2';
SELECT is((SELECT count(*)::int FROM public."DashboardFilterSettings" WHERE id = :'settings_m2' AND user_uuid = :'user_m2'), 0,
  'a maintainer cannot see — so cannot change — another user''s settings row');

-- ═══ Maintainer 2: sees the same notes, owns a different one ════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_two_bc')::text, true);

UPDATE public."Blocks" SET text = 'm2 edited' WHERE id = :'block_m2';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m2'), 'm2 edited',
  'a second maintainer edits their own note');

-- ═══ Account manager: unchanged, still writes any note ═════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_am_bc')::text, true);

UPDATE public."Blocks" SET text = 'am edited m2' WHERE id = :'block_m2';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m2'), 'am edited m2',
  'an account manager can still edit a maintainer''s note');

UPDATE public."Blocks" SET text = 'am edited legacy' WHERE id = :'block_null';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_null'), 'am edited legacy',
  'an account manager can still edit an old note');

SELECT lives_ok(
  format($$INSERT INTO public."Blocks" (bleacher_uuid, date, text) VALUES (%L, '2026-10-20', 'new from am')$$, :'bleacher'),
  'an account manager can still write a note'
);
SELECT is(
  (SELECT created_by_user_uuid::text FROM public."Blocks" WHERE text = 'new from am'),
  :'user_am',
  'and their notes now carry their name too'
);

-- ═══ Admin: unchanged; editing a maintainer's note keeps the author ════════
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_admin_bc')::text, true);

UPDATE public."Blocks" SET text = 'admin edited m2' WHERE id = :'block_m2';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m2'), 'admin edited m2',
  'an admin can still edit a maintainer''s note');
SELECT is((SELECT created_by_user_uuid::text FROM public."Blocks" WHERE id = :'block_m2'), :'user_m2',
  'an admin''s edit leaves the author alone');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_two_bc')::text, true);
UPDATE public."Blocks" SET text = 'm2 again' WHERE id = :'block_m2';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_m2'), 'm2 again',
  'so the maintainer can keep editing their note after an admin touched it');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_admin_bc')::text, true);
DELETE FROM public."Blocks" WHERE id = :'block_m2';
SELECT is((SELECT count(*)::int FROM public."Blocks" WHERE id = :'block_m2'), 0,
  'an admin can still delete a maintainer''s note');

-- ═══ Viewer: unchanged, read only ═══════════════════════════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_viewer_bc')::text, true);

SELECT ok((SELECT count(*)::int FROM public."Blocks") > 0, 'a viewer still reads notes');
SELECT throws_ok(
  format($$INSERT INTO public."Blocks" (bleacher_uuid, date, text) VALUES (%L, '2026-10-30', 'viewer')$$, :'bleacher'),
  '42501',
  NULL,
  'a viewer still cannot write a note'
);
UPDATE public."Blocks" SET text = 'viewer edit' WHERE id = :'block_am';
SELECT is((SELECT text FROM public."Blocks" WHERE id = :'block_am'), 'by am',
  'a viewer still cannot edit a note');
DELETE FROM public."Blocks" WHERE id = :'block_am';
SELECT is((SELECT count(*)::int FROM public."Blocks" WHERE id = :'block_am'), 1,
  'a viewer still cannot delete a note');

-- A viewer must not have gained a read on driver unavailability by accident.
RESET ROLE;
SELECT is(
  (SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'DriverUnavailability' AND policyname = 'rbac_select'),
  '(get_user_roles() && ''{admin,account_manager,maintainer}''::text[])',
  'the maintainer was added to driver unavailability, and no one else'
);

SELECT * FROM finish();
ROLLBACK;
