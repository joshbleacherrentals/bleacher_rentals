-- ============================================================================
-- Tests for the Accountant role (Stage 1: the role exists, it has no access)
-- Migration: 20260930130000_accountant_role.sql
-- Spec:      docs/specs/accountant-role.md
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_role.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(27);

-- ── Shape ───────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Accountants' AND column_name = 'is_active'),
  'true',
  'a new accountant is active by default'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Accountants' AND column_name = 'user_uuid'),
  'NO',
  'an accountant row without a user is meaningless, so it is not allowed'
);

SELECT is(
  (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Accountants'),
  ARRAY['created_at', 'id', 'is_active', 'user_uuid'],
  'the table has exactly the four agreed columns'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

-- Ensure the "Inactive" status row exists (CI runs `supabase db reset --no-seed`,
-- so it isn't there unless a test creates it — see rls_multi_role.test.sql).
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'acct_only@test.com', 'clerk_acct_only', false, false)
RETURNING id AS user_acct \gset

INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'acct_inactive@test.com', 'clerk_acct_inactive', false, false)
RETURNING id AS user_inactive_row \gset

INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_inactive_row', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer, status_uuid)
VALUES ('Acct', 'Deactivated', 'acct_deact@test.com', 'clerk_acct_deact', false, false,
        '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5')
RETURNING id AS user_deactivated \gset

INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_deactivated', true);

-- An admin who is also an accountant: roles are additive.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Admin', 'Acct', 'admin_acct@test.com', 'clerk_admin_acct', true, false)
RETURNING id AS user_admin_acct \gset

INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_admin_acct', true);

-- One user per pre-existing role, so we can prove the function still knows them all.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'plain_admin@test.com', 'clerk_plain_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'plain_viewer@test.com', 'clerk_plain_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'plain_am@test.com', 'clerk_plain_am', false, false)
RETURNING id AS user_am \gset

INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Dev', 'plain_dev@test.com', 'clerk_plain_dev', false, false)
RETURNING id AS user_dev \gset

INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'plain_maint@test.com', 'clerk_plain_maint', false, false)
RETURNING id AS user_maint \gset

INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- Rows in role-gated tables that an accountant must not be able to see.
INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9982, 10, 100)
RETURNING id AS bleacher \gset

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('Accountant probe event', '2026-07-01', '2026-07-02', false, false)
RETURNING id AS event \gset

INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_viewer', true);

INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, payer_name)
VALUES (:'event', 12345, 'Accountant probe');

INSERT INTO public."WorkTrackers" DEFAULT VALUES;

INSERT INTO public."DamageReports" (bleacher_uuid) VALUES (:'bleacher');

INSERT INTO public."ChangeLog" (version, body_md) VALUES ('0.0.9982', 'probe release');

-- ── Cascade ─────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Doomed', 'acct_doomed@test.com', 'clerk_acct_doomed', false, false)
RETURNING id AS user_doomed \gset

INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_doomed', true);
DELETE FROM public."Users" WHERE id = :'user_doomed';

SELECT is(
  (SELECT count(*)::int FROM public."Accountants" WHERE user_uuid = :'user_doomed'),
  0,
  'deleting a user removes their accountant row'
);

-- ── get_user_roles() ────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_acct_only')::text, true);
SELECT is(
  public.get_user_roles(),
  '{accountant}'::text[],
  'an active row grants the accountant role and nothing else'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_acct_inactive')::text, true);
SELECT is(
  public.get_user_roles(),
  '{}'::text[],
  'an inactive row grants nothing — the role is revoked, not deleted'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_acct_deact')::text, true);
SELECT is(
  public.get_user_roles(),
  '{}'::text[],
  'the deactivated-user lockout still wins over an active accountant row'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_admin_acct')::text, true);
SELECT is(
  (SELECT array_agg(r ORDER BY r) FROM unnest(public.get_user_roles()) AS r),
  ARRAY['accountant', 'admin'],
  'roles are additive: an admin who is also an accountant holds both'
);

-- The function was re-created: every role that existed before must survive.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_admin')::text, true);
SELECT is(public.get_user_roles(), '{admin}'::text[], 'admin is still resolved');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_viewer')::text, true);
SELECT is(public.get_user_roles(), '{viewer}'::text[], 'viewer is still resolved');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_am')::text, true);
SELECT is(public.get_user_roles(), '{account_manager}'::text[], 'account_manager is still resolved');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_dev')::text, true);
SELECT is(public.get_user_roles(), '{developer}'::text[], 'developer is still resolved');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_maint')::text, true);
SELECT is(public.get_user_roles(), '{maintainer}'::text[], 'maintainer is still resolved');

-- ── The role has no access beyond what it was explicitly given ──────────────
--
-- Zero-trust RLS: every policy names the roles it admits. Stage 1 gave the role nothing;
-- Stage 2 (accountant_work_trackers.test.sql, 20261001130000) added the Work Trackers
-- tables — Bleachers, Drivers, WorkTrackers and the Users rows of drivers — so those are
-- asserted THERE. This sweep is what keeps everything else closed.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_acct_only')::text, true);

SELECT is((SELECT count(*)::int FROM public."Events"), 0, 'an accountant cannot read Events');
SELECT is((SELECT count(*)::int FROM public."AccountManagers"), 0, 'an accountant cannot read AccountManagers');
SELECT is((SELECT count(*)::int FROM public."Developers"), 0, 'an accountant cannot read Developers');
SELECT is((SELECT count(*)::int FROM public."Maintainers"), 0, 'an accountant cannot read Maintainers');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory"), 0, 'an accountant cannot read PaymentHistory');
SELECT is((SELECT count(*)::int FROM public."DamageReports"), 0, 'an accountant cannot read DamageReports');

SELECT is(
  (SELECT count(*)::int FROM public."Users" u
    WHERE u.clerk_user_id <> 'clerk_acct_only'
      AND NOT EXISTS (SELECT 1 FROM public."Drivers" d WHERE d.user_uuid = u.id)),
  0,
  'an accountant cannot read the users who are not drivers'
);

SELECT is(
  (SELECT count(*)::int FROM public."Users" WHERE clerk_user_id = 'clerk_acct_only'),
  1,
  'an accountant can read their own Users row'
);

SELECT is(
  (SELECT count(*)::int FROM public."ChangeLog" WHERE version = '0.0.9982'),
  1,
  'an accountant can read the changelog, which every signed-in user can'
);

-- Handing out the role stays an administrator's job.
SELECT is(
  (SELECT count(*)::int FROM public."Accountants"),
  0,
  'an accountant cannot read the list of who holds the role'
);

SELECT throws_ok(
  format(
    'INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (%L, true)',
    :'user_acct'
  ),
  '42501',
  NULL,
  'an accountant cannot grant the role to anyone, including themselves'
);

SELECT throws_ok(
  format(
    'INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean) VALUES (%L, ''2026-07-01'', ''2026-07-02'', false, false)',
    'Accountant write probe'
  ),
  '42501',
  NULL,
  'an accountant cannot write to Events either'
);

-- An account manager (not an admin) cannot grant it: the table is admin-only.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_am')::text, true);
SELECT throws_ok(
  format(
    'INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (%L, true)',
    :'user_am'
  ),
  '42501',
  NULL,
  'an account manager cannot grant the accountant role'
);

-- ...and an admin can.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_plain_admin')::text, true);
SELECT lives_ok(
  format(
    'INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (%L, true)',
    :'user_am'
  ),
  'an admin can grant the accountant role'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
