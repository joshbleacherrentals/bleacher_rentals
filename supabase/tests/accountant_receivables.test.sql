-- ============================================================================
-- Tests for the Accountant page: AR and AR Deposits
-- Migration: 20261004120000_accountant_receivables.sql
-- Spec:      docs/specs/accountant-quotes-02-accountant-page.md (§5, §10.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_receivables.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the accountant READS each table the AR tabs are built from — one named assertion per
--     table, because a refused read is an empty result, not an error (a missing Contacts grant
--     silently becomes empty contact columns, a missing SalesOffices grant a wrong currency);
--   * the accountant WRITES none of them (Events.is_qbo excepted since spec 05, manual payments since
--     accountant-quotes-10: accountant_writes_payments.test.sql asserts that side). An INSERT that RLS
--     refuses raises 42501; an UPDATE or
--     DELETE that RLS filters out does not raise, so every refusal is also checked by looking
--     at the row afterwards;
--   * nobody else gained or lost anything: admin, account manager, viewer and maintainer read
--     what they read before, an inactive accountant and a user with no role still read nothing.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(44);

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

-- How many of the seven fixture rows the current role can see (one per table, so 7 is "all").
-- SECURITY INVOKER: the caller's row-level security applies.
CREATE FUNCTION public.test_ar_visible() RETURNS int
LANGUAGE sql AS $$
  SELECT
    (SELECT count(*)::int FROM public."Events"              WHERE id = current_setting('ar.event')::uuid)
  + (SELECT count(*)::int FROM public."PaymentHistory"      WHERE id = current_setting('ar.payment')::uuid)
  + (SELECT count(*)::int FROM public."PaymentInstallments" WHERE id = current_setting('ar.installment')::uuid)
  + (SELECT count(*)::int FROM public."EventLineItems"      WHERE id = current_setting('ar.line_item')::uuid)
  + (SELECT count(*)::int FROM public."Contacts"            WHERE id = current_setting('ar.contact')::uuid)
  + (SELECT count(*)::int FROM public."Companies"           WHERE id = current_setting('ar.company')::uuid)
  + (SELECT count(*)::int FROM public."SalesOffices"        WHERE id = current_setting('ar.office')::uuid);
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'ar_acct@test.com', 'clerk_ar_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'ar_acct_off@test.com', 'clerk_ar_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'ar_admin@test.com', 'clerk_ar_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'ar_am@test.com', 'clerk_ar_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'ar_viewer@test.com', 'clerk_ar_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'ar_maint@test.com', 'clerk_ar_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'ar_norole@test.com', 'clerk_ar_norole', false, false)
RETURNING id AS user_norole \gset

-- One row in each table the AR tabs read.
INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('AR probe event', '2026-07-01', '2026-07-02', false, false)
RETURNING id AS event \gset

INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, payer_name)
VALUES (:'event', 12345, 'AR probe payer')
RETURNING id AS payment \gset

INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
VALUES (:'event', '2026-06-01', 'USD', 10000)
RETURNING id AS installment \gset

INSERT INTO public."EventLineItems" (event_uuid, header, currency, value_cents)
VALUES (:'event', 'AR probe line', 'USD', 50000)
RETURNING id AS line_item \gset

INSERT INTO public."Contacts" (first_name) VALUES ('AR probe contact')
RETURNING id AS contact \gset

INSERT INTO public."Companies" (company_name) VALUES ('AR probe company')
RETURNING id AS company \gset

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('AR probe connection', '__pending__')
RETURNING id AS qbo_conn \gset

INSERT INTO public."SalesOffices" (name, quickbook_uuid)
VALUES ('AR probe office', :'qbo_conn')
RETURNING id AS office \gset

-- test_ar_visible() reads the ids from settings (is_local survives SET ROLE, not the rollback).
SELECT set_config('ar.event', :'event', true);
SELECT set_config('ar.payment', :'payment', true);
SELECT set_config('ar.installment', :'installment', true);
SELECT set_config('ar.line_item', :'line_item', true);
SELECT set_config('ar.contact', :'contact', true);
SELECT set_config('ar.company', :'company', true);
SELECT set_config('ar.office', :'office', true);

-- ═══ THE ACCOUNTANT: reads (spec §5, one assertion per table) ═════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."Events" WHERE id = :'event'), 1,
  'an accountant can read Events');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE id = :'payment'), 1,
  'an accountant can read PaymentHistory');
SELECT is((SELECT count(*)::int FROM public."PaymentInstallments" WHERE id = :'installment'), 1,
  'an accountant can read PaymentInstallments');
SELECT is((SELECT count(*)::int FROM public."EventLineItems" WHERE id = :'line_item'), 1,
  'an accountant can read EventLineItems');
SELECT is((SELECT count(*)::int FROM public."Contacts" WHERE id = :'contact'), 1,
  'an accountant can read Contacts');
SELECT is((SELECT count(*)::int FROM public."Companies" WHERE id = :'company'), 1,
  'an accountant can read Companies');
SELECT is((SELECT count(*)::int FROM public."SalesOffices" WHERE id = :'office'), 1,
  'an accountant can read SalesOffices');

-- Deliberately not changed (spec §5): Users stays driver rows only, BleacherEvents stays closed.
SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_admin'), 0,
  'an accountant still cannot read a Users row that is not a driver');
SELECT is((SELECT count(*)::int FROM public."BleacherEvents"), 0,
  'an accountant still cannot read BleacherEvents');

-- ═══ THE ACCOUNTANT: writes none of these tables ══════════════════════════════

-- Events
SELECT throws_ok(
  'INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean) VALUES (''AR intruder'', ''2026-07-01'', ''2026-07-02'', false, false)',
  '42501', NULL, 'an accountant cannot create an Event');
-- Since docs/specs/accountant-quotes-05 the accountant may UPDATE Events, but only is_qbo: a guard
-- trigger raises 42501 for any other column (supabase/tests/accountant_events_is_qbo.test.sql
-- asserts the whole rule). Before it, RLS filtered the update out and it affected 0 rows.
SELECT throws_ok(
  format('UPDATE public."Events" SET event_name = ''AR edited'' WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot change an Event other than its is_qbo flag');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Events" WHERE id = %L', :'event')),
  0, 'an accountant cannot delete an Event');
SELECT is((SELECT event_name FROM public."Events" WHERE id = :'event'), 'AR probe event',
  '...and the Event is unchanged');

-- PaymentHistory. Since docs/specs/accountant-quotes-10 an accountant records, edits and soft-deletes
-- MANUAL payments (accountant_writes_payments.test.sql asserts that). What is still refused, and
-- what this fixture shows, is a row that is not manual: the fixture payment and the INSERT below
-- both carry the table's default entry_source, 'stripe', which only the webhook (service role)
-- writes. There is no DELETE policy for anyone.
SELECT throws_ok(
  format('INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, payer_name) VALUES (%L, 1, ''AR intruder'')', :'event'),
  '42501', NULL, 'an accountant cannot write a row that claims to be a Stripe payment');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'payment')),
  0, 'an accountant cannot update a Stripe payment');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."PaymentHistory" WHERE id = %L', :'payment')),
  0, 'an accountant cannot delete a payment');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'payment'), 12345,
  '...and the payment is unchanged');

-- PaymentInstallments
SELECT throws_ok(
  format('INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps) VALUES (%L, ''2026-08-01'', ''USD'', 100)', :'event'),
  '42501', NULL, 'an accountant cannot create an installment');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentInstallments" SET percentage_bps = 1 WHERE id = %L', :'installment')),
  0, 'an accountant cannot update an installment');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."PaymentInstallments" WHERE id = %L', :'installment')),
  0, 'an accountant cannot delete an installment');
SELECT is((SELECT percentage_bps FROM public."PaymentInstallments" WHERE id = :'installment'), 10000,
  '...and the installment is unchanged');

-- EventLineItems
SELECT throws_ok(
  format('INSERT INTO public."EventLineItems" (event_uuid, header, currency, value_cents) VALUES (%L, ''AR intruder'', ''USD'', 1)', :'event'),
  '42501', NULL, 'an accountant cannot create a line item');
SELECT is(
  public.test_rows_affected(format('UPDATE public."EventLineItems" SET value_cents = 1 WHERE id = %L', :'line_item')),
  0, 'an accountant cannot update a line item');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."EventLineItems" WHERE id = %L', :'line_item')),
  0, 'an accountant cannot delete a line item');
SELECT is((SELECT value_cents FROM public."EventLineItems" WHERE id = :'line_item'), 50000,
  '...and the line item is unchanged');

-- Contacts
SELECT throws_ok(
  'INSERT INTO public."Contacts" (first_name) VALUES (''AR intruder'')',
  '42501', NULL, 'an accountant cannot create a contact');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET first_name = ''AR edited'' WHERE id = %L', :'contact')),
  0, 'an accountant cannot update a contact');
SELECT is((SELECT first_name FROM public."Contacts" WHERE id = :'contact'), 'AR probe contact',
  '...and the contact is unchanged');

-- Companies
SELECT throws_ok(
  'INSERT INTO public."Companies" (company_name) VALUES (''AR intruder'')',
  '42501', NULL, 'an accountant cannot create a company');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Companies" SET company_name = ''AR edited'' WHERE id = %L', :'company')),
  0, 'an accountant cannot update a company');
SELECT is((SELECT company_name FROM public."Companies" WHERE id = :'company'), 'AR probe company',
  '...and the company is unchanged');

-- SalesOffices
SELECT throws_ok(
  format('INSERT INTO public."SalesOffices" (name, quickbook_uuid) VALUES (''AR intruder'', %L)', :'qbo_conn'),
  '42501', NULL, 'an accountant cannot create a sales office');
SELECT is(
  public.test_rows_affected(format('UPDATE public."SalesOffices" SET name = ''AR edited'' WHERE id = %L', :'office')),
  0, 'an accountant cannot update a sales office');
SELECT is((SELECT name FROM public."SalesOffices" WHERE id = :'office'), 'AR probe office',
  '...and the sales office is unchanged');

-- ═══ NOBODY ELSE gained or lost anything ═════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_acct_off')::text, true);
SELECT is(public.test_ar_visible(), 0,
  'an inactive accountant still reads none of the seven tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_norole')::text, true);
SELECT is(public.test_ar_visible(), 0,
  'a user with no role still reads none of the seven tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_am')::text, true);
SELECT is(public.test_ar_visible(), 7, 'an account manager still reads all seven tables');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET event_name = ''AM edit'' WHERE id = %L', :'event')),
  1, 'an account manager can still edit an Event');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_viewer')::text, true);
SELECT is(public.test_ar_visible(), 7, 'a viewer still reads all seven tables');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET event_name = ''Viewer edit'' WHERE id = %L', :'event')),
  0, 'a viewer still cannot edit an Event');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."Events" WHERE id = :'event'), 1,
  'a maintainer still reads Events');
SELECT is(public.test_ar_visible() - 1, 0,
  'a maintainer still reads none of the other six tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ar_admin')::text, true);
SELECT is(public.test_ar_visible(), 7, 'an admin still reads all seven tables');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET event_name = ''Admin edit'' WHERE id = %L', :'event')),
  1, 'an admin can still edit an Event');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
