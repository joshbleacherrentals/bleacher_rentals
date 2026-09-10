-- ============================================================================
-- Tests for the Maintainer role
-- Migration: 20260908130000_maintainer_role.sql
-- Spec:      docs/specs/maintainer-role.md
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/maintainer_role.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(10);

-- ── Shape ───────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Maintainers' AND column_name = 'is_active'),
  'true',
  'a new maintainer is active by default'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Maintainers' AND column_name = 'user_uuid'),
  'NO',
  'a maintainer row without a user is meaningless, so it is not allowed'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

-- Ensure the "Inactive" status row exists (CI runs `supabase db reset --no-seed`,
-- so it isn't there unless a test creates it — see rls_multi_role.test.sql).
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Only', 'maint_only@test.com', 'clerk_maint_only', false, false)
RETURNING id AS user_maint \gset

INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Inactive', 'maint_inactive@test.com', 'clerk_maint_inactive', false, false)
RETURNING id AS user_inactive_row \gset

INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_inactive_row', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer, status_uuid)
VALUES ('Maint', 'Deactivated', 'maint_deact@test.com', 'clerk_maint_deact', false, false,
        '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5')
RETURNING id AS user_deactivated \gset

INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_deactivated', true);

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9981, 10, 100)
RETURNING id AS bleacher \gset

-- ── get_user_roles() ────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_only')::text, true);
SELECT is(
  public.get_user_roles(),
  '{maintainer}'::text[],
  'an active row grants the maintainer role and nothing else'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_inactive')::text, true);
SELECT is(
  public.get_user_roles(),
  '{}'::text[],
  'an inactive row grants nothing — the role is revoked, not deleted'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_deact')::text, true);
SELECT is(
  public.get_user_roles(),
  '{}'::text[],
  'the deactivated-user lockout still wins over an active maintainer row'
);

-- ── The role can do its job ────────────────────────────────────────────────
--
-- The point of the whole migration: without this the form would appear to
-- work and PowerSync would drop the write in silence.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_only')::text, true);

SELECT lives_ok(
  format(
    'INSERT INTO public."BleacherAnnualInspections" (bleacher_uuid, next_due_on) VALUES (%L, ''2027-04-01'')',
    :'bleacher'
  ),
  'a maintainer can record an inspection'
);

SELECT is(
  (SELECT count(*)::int FROM public."BleacherAnnualInspections" WHERE bleacher_uuid = :'bleacher'),
  1,
  'a maintainer can read the inspections back'
);

SELECT lives_ok(
  format(
    'UPDATE public."BleacherAnnualInspections" SET notes = ''checked'' WHERE bleacher_uuid = %L',
    :'bleacher'
  ),
  'a maintainer can correct an inspection'
);

-- Handing out the role stays an administrator's job.
SELECT is(
  (SELECT count(*)::int FROM public."Maintainers"),
  0,
  'a maintainer cannot read the list of who holds the role'
);

SELECT throws_ok(
  format(
    'INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (%L, true)',
    :'user_maint'
  ),
  '42501',
  NULL,
  'a maintainer cannot grant the role to anyone, including themselves'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
