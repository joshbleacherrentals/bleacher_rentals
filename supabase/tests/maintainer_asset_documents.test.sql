-- ============================================================================
-- Maintainer: Assets — bleacher types (upsert) and the Documents tab (BlueBook)
-- Migration: 20261020120000_maintainer_asset_documents.sql
-- ============================================================================
--   npx supabase test db
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Every PowerSync PUT reaches Postgres as INSERT ... ON CONFLICT DO UPDATE (BackendConnector
-- calls table.upsert), which needs the SELECT policy as well as INSERT. A plain INSERT passes
-- without it, which is how maintainer_edit_bleachers.test.sql missed this.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(11);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'maint_docs@test.com', 'clerk_maint_docs', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('View', 'Er', 'viewer_docs@test.com', 'clerk_viewer_docs', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."BleacherTypes" (name, row_count) VALUES ('88 Row', 88)
RETURNING id AS type_existing \gset
INSERT INTO public."BlueBook" (name) VALUES ('Existing doc') RETURNING id AS doc_existing \gset
INSERT INTO public."BlueBook" (name) VALUES ('Doc to keep') RETURNING id AS doc_keep \gset

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_docs')::text, true);

-- ── Maintainer: bleacher types ──────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO public."BleacherTypes" (id, name, row_count) VALUES (gen_random_uuid(), '89 Row', 89)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name$$,
  'a maintainer can create a bleacher type the way PowerSync uploads it (upsert)'
);

UPDATE public."BleacherTypes" SET name = 'Renamed' WHERE id = :'type_existing';
DELETE FROM public."BleacherTypes" WHERE id = :'type_existing';
RESET ROLE;
SELECT is((SELECT name FROM public."BleacherTypes" WHERE id = :'type_existing'), '88 Row',
  'a maintainer still cannot rename or delete a bleacher type');
SET LOCAL ROLE authenticated;

-- ── Maintainer: Documents (BlueBook) ────────────────────────────────────────
SELECT is((SELECT count(*)::int FROM public."BlueBook" WHERE id = :'doc_existing'), 1,
  'a maintainer can read documents');

SELECT lives_ok(
  $$INSERT INTO public."BlueBook" (name) VALUES ('Added by maintainer')$$,
  'a maintainer can add a document'
);

SELECT lives_ok(
  $$INSERT INTO public."BlueBook" (id, name) VALUES (gen_random_uuid(), 'Upserted by maintainer')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name$$,
  'a maintainer can add a document the way PowerSync uploads it (upsert)'
);

UPDATE public."BlueBook" SET name = 'Edited by maintainer' WHERE id = :'doc_existing';
SELECT is((SELECT name FROM public."BlueBook" WHERE id = :'doc_existing'), 'Edited by maintainer',
  'a maintainer can edit a document, and the edit lands (not filtered out by RLS)');

DELETE FROM public."BlueBook" WHERE id = :'doc_keep';
SELECT is((SELECT count(*)::int FROM public."BlueBook" WHERE id = :'doc_keep'), 1,
  'a maintainer cannot delete a document');

-- ── Viewer: unchanged, no access at all ─────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_viewer_docs')::text, true);

SELECT is((SELECT count(*)::int FROM public."BlueBook"), 0, 'a viewer still reads no documents');
SELECT throws_ok(
  $$INSERT INTO public."BlueBook" (name) VALUES ('Viewer doc')$$,
  '42501', NULL, 'a viewer still cannot add a document'
);
UPDATE public."BlueBook" SET name = 'Viewer edit' WHERE id = :'doc_keep';
RESET ROLE;
SELECT is((SELECT name FROM public."BlueBook" WHERE id = :'doc_keep'), 'Doc to keep',
  'a viewer still cannot edit a document');
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::int FROM public."BlueBook" WHERE name = 'Viewer doc'), 0,
  'and nothing a viewer tried got in');

SELECT * FROM finish();
ROLLBACK;
