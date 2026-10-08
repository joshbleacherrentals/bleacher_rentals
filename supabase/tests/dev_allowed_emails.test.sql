-- ============================================================================
-- Tests for DevAllowedEmails — the development email allowlist
-- Migration: 20261007120000_dev_allowed_emails.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/dev_allowed_emails.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an active developer can read, create, update and delete rows;
--   * nobody else can — admin, account manager, viewer, accountant, a user with no role, and a
--     developer whose role is switched off all read an empty table and are refused every write.
--     An INSERT that RLS refuses raises 42501; an UPDATE or DELETE that RLS filters out raises
--     nothing and matches no row, so each is asserted as "0 rows affected" and the row is read
--     back afterwards;
--   * the table itself refuses an address that is not trimmed and lower-cased, and a duplicate.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(29);

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

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dev', 'Active', 'dae_dev@test.com', 'clerk_dae_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dev', 'Off', 'dae_dev_off@test.com', 'clerk_dae_dev_off', false, false)
RETURNING id AS user_dev_off \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'dae_admin@test.com', 'clerk_dae_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'dae_am@test.com', 'clerk_dae_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'dae_viewer@test.com', 'clerk_dae_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Accountant', 'dae_acct@test.com', 'clerk_dae_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'dae_norole@test.com', 'clerk_dae_norole', false, false);

-- A row to read, change and delete. Inserted as the superuser, so RLS does not apply.
INSERT INTO public."DevAllowedEmails" (email) VALUES ('seed.row@dae.test')
RETURNING id AS seed_row \gset

-- ═══ THE DEVELOPER ═══════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_dev')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."DevAllowedEmails" WHERE id = :'seed_row'), 1,
  'a developer can read the list');
SELECT is(
  public.test_rows_affected($q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('made.by.dev@dae.test')$q$),
  1, 'a developer can add an address');
SELECT is(
  public.test_rows_affected(format('UPDATE public."DevAllowedEmails" SET email = ''renamed@dae.test'' WHERE id = %L', :'seed_row')),
  1, 'a developer can change an address');
SELECT is(
  (SELECT email FROM public."DevAllowedEmails" WHERE id = :'seed_row'), 'renamed@dae.test',
  '...and the address is changed');
SELECT is(
  public.test_rows_affected($q$DELETE FROM public."DevAllowedEmails" WHERE email = 'made.by.dev@dae.test'$q$),
  1, 'a developer can delete an address');
SELECT is(
  (SELECT count(*)::int FROM public."DevAllowedEmails" WHERE email = 'made.by.dev@dae.test'), 0,
  '...and it is gone');

-- The table's own rules hold for a developer too.
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('Upper.Case@dae.test')$q$,
  '23514', NULL, 'an address with capitals is refused by the table');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES (' padded@dae.test ')$q$,
  '23514', NULL, 'an address with surrounding spaces is refused by the table');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('')$q$,
  '23514', NULL, 'an empty address is refused by the table');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('renamed@dae.test')$q$,
  '23505', NULL, 'a duplicate address is refused by the table');

RESET ROLE;

-- Put the seed row back to a known address for the refusals below.
UPDATE public."DevAllowedEmails" SET email = 'seed.row@dae.test' WHERE id = :'seed_row';

-- ═══ EVERYONE ELSE ═══════════════════════════════════════════════════════════
-- admin, account manager, viewer, accountant, no role, and a developer who is switched off.

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'an admin reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.admin@dae.test')$q$,
  '42501', NULL, 'an admin cannot add an address');
SELECT is(
  public.test_rows_affected(format('UPDATE public."DevAllowedEmails" SET email = ''by.admin@dae.test'' WHERE id = %L', :'seed_row')),
  0, 'an admin cannot change an address');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."DevAllowedEmails" WHERE id = %L', :'seed_row')),
  0, 'an admin cannot delete an address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'an account manager reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.am@dae.test')$q$,
  '42501', NULL, 'an account manager cannot add an address');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."DevAllowedEmails" WHERE id = %L', :'seed_row')),
  0, 'an account manager cannot delete an address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'a viewer reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.viewer@dae.test')$q$,
  '42501', NULL, 'a viewer cannot add an address');
SELECT is(
  public.test_rows_affected(format('UPDATE public."DevAllowedEmails" SET email = ''by.viewer@dae.test'' WHERE id = %L', :'seed_row')),
  0, 'a viewer cannot change an address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_acct')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'an accountant reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.acct@dae.test')$q$,
  '42501', NULL, 'an accountant cannot add an address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_norole')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'a user with no role reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.norole@dae.test')$q$,
  '42501', NULL, 'a user with no role cannot add an address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dae_dev_off')::text, true);
SELECT is((SELECT count(*)::int FROM public."DevAllowedEmails"), 0, 'a developer whose role is off reads an empty list');
SELECT throws_ok(
  $q$INSERT INTO public."DevAllowedEmails" (email) VALUES ('by.dev.off@dae.test')$q$,
  '42501', NULL, 'a developer whose role is off cannot add an address');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."DevAllowedEmails" WHERE id = %L', :'seed_row')),
  0, 'a developer whose role is off cannot delete an address');

RESET ROLE;

-- None of the refused writes changed anything.
SELECT is(
  (SELECT email FROM public."DevAllowedEmails" WHERE id = :'seed_row'), 'seed.row@dae.test',
  'the seed row is unchanged after every refused write');
SELECT is(
  (SELECT count(*)::int FROM public."DevAllowedEmails" WHERE email LIKE 'by.%@dae.test'), 0,
  'no refused insert left a row behind');

SELECT * FROM finish();
ROLLBACK;
