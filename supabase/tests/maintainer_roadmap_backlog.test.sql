-- ============================================================================
-- Maintainer: roadmap backlog tickets
-- Migration: 20261020130000_maintainer_roadmap_backlog.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/maintainer_roadmap_backlog.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- A maintainer reads, submits and edits backlog tickets (as an account manager does), cannot
-- delete one, and still sees nothing of quarters. An UPDATE or DELETE that RLS filters out does
-- not raise, so each refusal is also checked by looking at the row.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(6);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'maint_roadmap@test.com', 'clerk_maint_roadmap', false, false);
INSERT INTO public."Maintainers" (user_uuid, is_active)
SELECT id, true FROM public."Users" WHERE clerk_user_id = 'clerk_maint_roadmap';

INSERT INTO public."RoadmapTasks" (title, is_backlog) VALUES ('Existing ticket', true)
RETURNING id AS ticket \gset
INSERT INTO public."RoadmapQuarters" (quarter, year) VALUES (3, 2997);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_roadmap')::text, true);

SELECT is((SELECT count(*)::int FROM public."RoadmapTasks" WHERE id = :'ticket'), 1,
  'a maintainer can read backlog tickets');

SELECT lives_ok(
  $$INSERT INTO public."RoadmapTasks" (id, title, is_backlog) VALUES (gen_random_uuid(), 'Maintainer ticket', true)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title$$,
  'a maintainer can submit a ticket the way PowerSync uploads it (upsert)'
);

UPDATE public."RoadmapTasks" SET title = 'Edited by maintainer' WHERE id = :'ticket';
DELETE FROM public."RoadmapTasks" WHERE id = :'ticket';

SELECT is((SELECT title FROM public."RoadmapTasks" WHERE id = :'ticket'), 'Edited by maintainer',
  'a maintainer can edit a ticket, and a delete leaves it in place');

SELECT is((SELECT count(*)::int FROM public."RoadmapQuarters"), 0,
  'a maintainer still sees no quarters');

SELECT throws_ok(
  $$INSERT INTO public."RoadmapQuarters" (quarter, year) VALUES (4, 2996)$$,
  '42501', NULL, 'a maintainer cannot create a quarter'
);

SELECT throws_ok(
  $$INSERT INTO public."RoadmapSprints" (quarter_id, sprint_number) VALUES (gen_random_uuid(), 1)$$,
  NULL, NULL, 'a maintainer cannot create a sprint'
);

SELECT * FROM finish();

ROLLBACK;
