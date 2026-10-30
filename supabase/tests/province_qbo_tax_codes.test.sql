-- ============================================================================
-- Tests for the ProvinceQboTaxCodes table (connection + Canadian province -> QuickBooks tax code)
-- Migration: 20261022150000_province_qbo_tax_codes.sql
-- Spec:      docs/specs/qbo-invoice-03a-province-tax-codes.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/province_qbo_tax_codes.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an admin selects, inserts, updates and deletes;
--   * an account manager, an accountant, a viewer, a driver and a maintainer can do none of these:
--     they read 0 rows, an insert is refused (42501), an update and a delete change nothing (the
--     rows are read back unchanged);
--   * one row per connection and province (23505); a province outside the 13 codes is refused (23514);
--   * deleting the connection deletes its rows;
--   * the service role can read.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(34);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'pqtc_admin@test.com', 'clerk_pqtc_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'pqtc_am@test.com', 'clerk_pqtc_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'pqtc_acct@test.com', 'clerk_pqtc_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('View', 'Er', 'pqtc_viewer@test.com', 'clerk_pqtc_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'pqtc_maint@test.com', 'clerk_pqtc_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dri', 'Ver', 'pqtc_driver@test.com', 'clerk_pqtc_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid) VALUES (:'user_driver');

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('PQTC conn 1', '__pending__') RETURNING id AS conn_1 \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('PQTC conn 2', '__pending__') RETURNING id AS conn_2 \gset

INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id)
VALUES (:'conn_1', 'ON', '5'), (:'conn_1', 'QC', '7');

-- ═══ The shape ══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY column_name)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ProvinceQboTaxCodes'),
  'created_at:NO,id:NO,province:NO,qbo_connection_uuid:NO,qbo_tax_code_id:NO',
  'the table has the five columns, none nullable');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."ProvinceQboTaxCodes"'::regclass),
  'row level security is enabled');

SELECT is(
  (SELECT string_agg(cmd, ',' ORDER BY cmd) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ProvinceQboTaxCodes'),
  'DELETE,INSERT,SELECT,UPDATE',
  'there is one policy for each of select, insert, update and delete');

-- ═══ One row per connection and province; the 13 codes only ═════════════════

SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''ON'', ''99'')', :'conn_1'),
  '23505', NULL, 'a second code for the same connection and province is refused');

SELECT lives_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''ON'', ''5'')', :'conn_2'),
  'the same province may have a code in another connection');

SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''XX'', ''1'')', :'conn_1'),
  '23514', NULL, 'a province outside the 13 codes is refused');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''on'', ''1'')', :'conn_1'),
  '23514', NULL, 'a province written in lower case is refused');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''Ontario'', ''1'')', :'conn_1'),
  '23514', NULL, 'a province name instead of its code is refused');

SELECT lives_ok(
  format($f$INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id)
    SELECT %L, p, '1' FROM unnest(ARRAY['AB','BC','MB','NB','NL','NS','NT','NU','PE','QC','SK','YT']) AS p$f$, :'conn_2'),
  'the other 12 codes are accepted');
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_2'), 13,
  'a connection holds all 13 provinces');

SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''QC'', NULL)', :'conn_1'),
  '23502', NULL, 'a row without a tax code is refused');

-- ═══ An admin: everything ═══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_admin')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'), 2,
  'an admin selects the rows');
SELECT lives_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''9'')', :'conn_1'),
  'an admin inserts a row');
SELECT lives_ok(
  format('UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = ''5-new'' WHERE qbo_connection_uuid = %L AND province = ''ON''', :'conn_1'),
  'an admin updates a row');
SELECT is(
  (SELECT qbo_tax_code_id FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1' AND province = 'ON'),
  '5-new', 'the admin''s update is stored');
SELECT lives_ok(
  format('DELETE FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = %L AND province = ''AB''', :'conn_1'),
  'an admin deletes a row');
SELECT is(
  (SELECT count(*)::int FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1' AND province = 'AB'), 0,
  'the admin''s delete is stored');

RESET ROLE;

-- Back to what the rest of the file expects.
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = '5'
 WHERE qbo_connection_uuid = :'conn_1' AND province = 'ON';

-- ═══ Everyone else: nothing ═════════════════════════════════════════════════
-- Each role reads 0 rows and cannot insert; an update and a delete are silent no-ops under RLS, so
-- the proof is the read-back with full rights after every role.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes"), 0, 'an account manager sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''x'')', :'conn_1'),
  '42501', NULL, 'an account manager cannot insert');
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = 'HACK';
DELETE FROM public."ProvinceQboTaxCodes";
RESET ROLE;
SELECT is((SELECT string_agg(province || ':' || qbo_tax_code_id, ',' ORDER BY province)
             FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'),
  'ON:5,QC:7', 'an account manager''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_acct')::text, true);
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes"), 0, 'an accountant sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''x'')', :'conn_1'),
  '42501', NULL, 'an accountant cannot insert');
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = 'HACK';
DELETE FROM public."ProvinceQboTaxCodes";
RESET ROLE;
SELECT is((SELECT string_agg(province || ':' || qbo_tax_code_id, ',' ORDER BY province)
             FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'),
  'ON:5,QC:7', 'an accountant''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes"), 0, 'a viewer sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''x'')', :'conn_1'),
  '42501', NULL, 'a viewer cannot insert');
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = 'HACK';
DELETE FROM public."ProvinceQboTaxCodes";
RESET ROLE;
SELECT is((SELECT string_agg(province || ':' || qbo_tax_code_id, ',' ORDER BY province)
             FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'),
  'ON:5,QC:7', 'a viewer''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_driver')::text, true);
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes"), 0, 'a driver sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''x'')', :'conn_1'),
  '42501', NULL, 'a driver cannot insert');
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = 'HACK';
DELETE FROM public."ProvinceQboTaxCodes";
RESET ROLE;
SELECT is((SELECT string_agg(province || ':' || qbo_tax_code_id, ',' ORDER BY province)
             FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'),
  'ON:5,QC:7', 'a driver''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pqtc_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes"), 0, 'a maintainer sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."ProvinceQboTaxCodes" (qbo_connection_uuid, province, qbo_tax_code_id) VALUES (%L, ''AB'', ''x'')', :'conn_1'),
  '42501', NULL, 'a maintainer cannot insert');
UPDATE public."ProvinceQboTaxCodes" SET qbo_tax_code_id = 'HACK';
DELETE FROM public."ProvinceQboTaxCodes";
RESET ROLE;
SELECT is((SELECT string_agg(province || ':' || qbo_tax_code_id, ',' ORDER BY province)
             FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1'),
  'ON:5,QC:7', 'a maintainer''s update and delete changed nothing');

-- ═══ The service role reads ═════════════════════════════════════════════════

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT qbo_tax_code_id FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_1' AND province = 'QC'),
  '7', 'the service role reads a code');
RESET ROLE;

-- ═══ Cascade ════════════════════════════════════════════════════════════════

DELETE FROM public."QboConnections" WHERE id = :'conn_2';
SELECT is((SELECT count(*)::int FROM public."ProvinceQboTaxCodes" WHERE qbo_connection_uuid = :'conn_2'), 0,
  'deleting the connection deletes its rows');

SELECT * FROM finish();
ROLLBACK;
