-- ============================================================================
-- Tests for the ContactQboCustomers table (contact + QuickBooks connection -> customer)
-- Migration: 20261022140000_contact_qbo_customers.sql
-- Spec:      docs/specs/qbo-invoice-02-customer.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/contact_qbo_customers.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * one row per contact and connection: a second insert fails (23505);
--   * deleting the contact, or the connection, deletes its rows;
--   * a signed-in `authenticated` user (admin, account manager, accountant) can neither read the
--     existing row (0 rows, not an error) nor insert (42501);
--   * the service role can read and write.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(14);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'cqc_admin@test.com', 'clerk_cqc_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'cqc_am@test.com', 'clerk_cqc_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'cqc_acct@test.com', 'clerk_cqc_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Contacts" (first_name, last_name) VALUES ('Ann', 'One') RETURNING id AS contact_a \gset
INSERT INTO public."Contacts" (first_name, last_name) VALUES ('Bob', 'Two') RETURNING id AS contact_b \gset

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('CQC conn 1', '__pending__') RETURNING id AS conn_1 \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('CQC conn 2', '__pending__') RETURNING id AS conn_2 \gset

-- ═══ One row per contact and connection ═════════════════════════════════════

INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id)
VALUES (:'contact_a', :'conn_1', '101');

SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers" WHERE contact_uuid = :'contact_a'), 1,
  'a link row is stored');

SELECT throws_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''999'')', :'contact_a', :'conn_1'),
  '23505', NULL, 'a second link for the same contact and connection is refused');

SELECT lives_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''202'')', :'contact_a', :'conn_2'),
  'the same contact may be a different customer in another connection');
SELECT lives_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''101'')', :'contact_b', :'conn_1'),
  'another contact may link in the same connection');

-- ═══ Signed-in users: nothing ═══════════════════════════════════════════════

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_cqc_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers"), 0, 'an admin sees no link rows');
SELECT throws_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''x'')', :'contact_b', :'conn_2'),
  '42501', NULL, 'an admin cannot insert a link row');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_cqc_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers"), 0, 'an account manager sees no link rows');
SELECT throws_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''x'')', :'contact_b', :'conn_2'),
  '42501', NULL, 'an account manager cannot insert a link row');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_cqc_acct')::text, true);
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers"), 0, 'an accountant sees no link rows');
SELECT throws_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''x'')', :'contact_b', :'conn_2'),
  '42501', NULL, 'an accountant cannot insert a link row');

RESET ROLE;

-- ═══ The service role: reads and writes ═════════════════════════════════════

SET LOCAL ROLE service_role;
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers"), 3, 'the service role reads the link rows');
SELECT lives_ok(
  format('INSERT INTO public."ContactQboCustomers" (contact_uuid, qbo_connection_uuid, qbo_customer_id) VALUES (%L, %L, ''303'')', :'contact_b', :'conn_2'),
  'the service role inserts a link row');
RESET ROLE;

-- ═══ Cascades ═══════════════════════════════════════════════════════════════

DELETE FROM public."Contacts" WHERE id = :'contact_b';
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers" WHERE contact_uuid = :'contact_b'), 0,
  'deleting the contact deletes its link rows');

DELETE FROM public."QboConnections" WHERE id = :'conn_2';
SELECT is((SELECT count(*)::int FROM public."ContactQboCustomers" WHERE qbo_connection_uuid = :'conn_2'), 0,
  'deleting the connection deletes its link rows');

SELECT * FROM finish();
ROLLBACK;
