-- ============================================================================
-- Tests for the accountant reading EventTypes
-- Migration: 20261013120000_event_types_accountant_select.sql
-- Spec:      docs/specs/accountant-quotes-04-accountant-quote-access.md (Event type on the Contract tab)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/event_types_accountant_select.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an active accountant READS EventTypes, a retired type included — the Contract tab's
--     "Event Type" line says what a quote was saved with, so it does not filter on `deleted`;
--   * an accountant cannot add, rename or delete one (an UPDATE or DELETE that RLS filters out
--     does not raise, so each is also checked by looking at the row afterwards);
--   * nobody else gained or lost anything: admin, account manager and viewer still read; a
--     maintainer, a developer, an inactive accountant and a driver still read nothing.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(13);

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'et_acct@test.com', 'clerk_et_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'et_acct_off@test.com', 'clerk_et_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'et_admin@test.com', 'clerk_et_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'et_am@test.com', 'clerk_et_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'et_viewer@test.com', 'clerk_et_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'et_maint@test.com', 'clerk_et_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Dev', 'et_dev@test.com', 'clerk_et_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Drew', 'Driver', 'et_driver@test.com', 'clerk_et_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', true);

-- One current event type and one that has been retired since quotes were saved with it.
INSERT INTO public."EventTypes" (name, deleted) VALUES ('Probe Festival', false)
RETURNING id AS type_live \gset
INSERT INTO public."EventTypes" (name, deleted) VALUES ('Probe Retired Rodeo', true)
RETURNING id AS type_retired \gset

-- ═══ The accountant ══════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."EventTypes" WHERE id = :'type_live'), 1,
  'an accountant can read an event type');
SELECT is((SELECT count(*)::int FROM public."EventTypes" WHERE id = :'type_retired'), 1,
  'an accountant can read a retired event type — a quote keeps pointing at the type it was saved with');

SELECT is(
  public.test_rows_affected(format('UPDATE public."EventTypes" SET name = ''Renamed'' WHERE id = %L', :'type_live')),
  0,
  'an accountant cannot rename an event type'
);
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."EventTypes" WHERE id = %L', :'type_live')),
  0,
  'an accountant cannot delete an event type'
);
SELECT throws_ok(
  $$INSERT INTO public."EventTypes" (name) VALUES ('Accountant Added')$$,
  '42501',
  NULL,
  'an accountant cannot add an event type'
);

RESET ROLE;
SELECT is((SELECT name FROM public."EventTypes" WHERE id = :'type_live'), 'Probe Festival',
  'the event type is unchanged after the accountant tried to rename and delete it');

-- ═══ Nobody else gained or lost anything ═════════════════════════════════════

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes" WHERE id = :'type_live'), 1, 'an admin still reads event types');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes" WHERE id = :'type_live'), 1, 'an account manager still reads event types');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes" WHERE id = :'type_live'), 1, 'a viewer still reads event types');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes"), 0, 'a maintainer still reads no event types');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_dev')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes"), 0, 'a developer still reads no event types');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_acct_off')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes"), 0,
  'an inactive accountant row reads no event types — the role is revoked');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_et_driver')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypes"), 0, 'a driver still reads no event types');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
