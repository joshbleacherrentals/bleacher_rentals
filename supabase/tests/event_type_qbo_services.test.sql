-- ============================================================================
-- Tests for the EventTypeQboServices table (event type + QuickBooks connection -> Product/Service)
-- Migration: 20261026120000_event_type_qbo_services.sql
-- Spec:      docs/specs/qbo-invoice-12-event-type-services.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/event_type_qbo_services.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an admin and an accountant select, insert, update and delete;
--   * an account manager, a viewer, a driver, a maintainer and a developer can do none of these:
--     they read 0 rows, an insert is refused (42501), an update and a delete change nothing (the
--     rows are read back unchanged);
--   * one row per event type and connection (23505); every column is required (23502); the two
--     references are enforced (23503);
--   * deleting the connection, or the event type, deletes its rows;
--   * the service role can read.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(39);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'etqs_admin@test.com', 'clerk_etqs_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'etqs_acct@test.com', 'clerk_etqs_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'etqs_am@test.com', 'clerk_etqs_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('View', 'Er', 'etqs_viewer@test.com', 'clerk_etqs_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dri', 'Ver', 'etqs_driver@test.com', 'clerk_etqs_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid) VALUES (:'user_driver');

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'etqs_maint@test.com', 'clerk_etqs_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dev', 'Eloper', 'etqs_dev@test.com', 'clerk_etqs_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."EventTypes" (name) VALUES ('ETQS City') RETURNING id AS et_1 \gset
INSERT INTO public."EventTypes" (name) VALUES ('ETQS Rural') RETURNING id AS et_2 \gset

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('ETQS conn 1', '__pending__') RETURNING id AS conn_1 \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('ETQS conn 2', '__pending__') RETURNING id AS conn_2 \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('ETQS conn 3', '__pending__') RETURNING id AS conn_3 \gset

INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id)
VALUES (:'et_1', :'conn_1', '10'), (:'et_2', :'conn_1', '11');

-- ═══ The shape ══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY column_name)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'EventTypeQboServices'),
  'created_at:NO,event_type_uuid:NO,id:NO,qbo_connection_uuid:NO,qbo_service_id:NO',
  'the table has the five columns, none nullable');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."EventTypeQboServices"'::regclass),
  'row level security is enabled');

SELECT is(
  (SELECT string_agg(cmd, ',' ORDER BY cmd) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'EventTypeQboServices'),
  'DELETE,INSERT,SELECT,UPDATE',
  'there is one policy for each of select, insert, update and delete');

-- ═══ One row per event type and connection; the references ═════════════════

SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''99'')', :'et_1', :'conn_1'),
  '23505', NULL, 'a second Product/Service for the same event type and connection is refused');

SELECT lives_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''10'')', :'et_1', :'conn_2'),
  'the same event type may have a Product/Service in another connection');

SELECT lives_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''10'')', :'et_2', :'conn_2'),
  'two event types may share one Product/Service');

SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, NULL)', :'et_1', :'conn_3'),
  '23502', NULL, 'a row without a Product/Service is refused');

SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (gen_random_uuid(), %L, ''1'')', :'conn_3'),
  '23503', NULL, 'an event type that does not exist is refused');

SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, gen_random_uuid(), ''1'')', :'et_1'),
  '23503', NULL, 'a connection that does not exist is refused');

-- ═══ An admin: everything ═══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_admin')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'), 2,
  'an admin selects the rows');
SELECT lives_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''12'')', :'et_1', :'conn_3'),
  'an admin inserts a row');
SELECT lives_ok(
  format('UPDATE public."EventTypeQboServices" SET qbo_service_id = ''10-new'' WHERE qbo_connection_uuid = %L AND event_type_uuid = %L', :'conn_1', :'et_1'),
  'an admin updates a row');
SELECT is(
  (SELECT qbo_service_id FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1' AND event_type_uuid = :'et_1'),
  '10-new', 'the admin''s update is stored');
SELECT lives_ok(
  format('DELETE FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = %L AND event_type_uuid = %L', :'conn_3', :'et_1'),
  'an admin deletes a row');
SELECT is(
  (SELECT count(*)::int FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_3'), 0,
  'the admin''s delete is stored');

RESET ROLE;

-- Back to what the rest of the file expects.
UPDATE public."EventTypeQboServices" SET qbo_service_id = '10'
 WHERE qbo_connection_uuid = :'conn_1' AND event_type_uuid = :'et_1';

-- ═══ An accountant: everything ══════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_acct')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'), 2,
  'an accountant selects the rows');
SELECT lives_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''13'')', :'et_2', :'conn_3'),
  'an accountant inserts a row');
SELECT lives_ok(
  format('UPDATE public."EventTypeQboServices" SET qbo_service_id = ''11-new'' WHERE qbo_connection_uuid = %L AND event_type_uuid = %L', :'conn_1', :'et_2'),
  'an accountant updates a row');
SELECT is(
  (SELECT qbo_service_id FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1' AND event_type_uuid = :'et_2'),
  '11-new', 'the accountant''s update is stored');
SELECT lives_ok(
  format('DELETE FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = %L AND event_type_uuid = %L', :'conn_3', :'et_2'),
  'an accountant deletes a row');
SELECT is(
  (SELECT count(*)::int FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_3'), 0,
  'the accountant''s delete is stored');

RESET ROLE;

UPDATE public."EventTypeQboServices" SET qbo_service_id = '11'
 WHERE qbo_connection_uuid = :'conn_1' AND event_type_uuid = :'et_2';

-- ═══ Everyone else: nothing ═════════════════════════════════════════════════
-- Each role reads 0 rows and cannot insert; an update and a delete are silent no-ops under RLS, so
-- the proof is the read-back with full rights after every role.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices"), 0, 'an account manager sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''x'')', :'et_1', :'conn_3'),
  '42501', NULL, 'an account manager cannot insert');
UPDATE public."EventTypeQboServices" SET qbo_service_id = 'HACK';
DELETE FROM public."EventTypeQboServices";
RESET ROLE;
SELECT is((SELECT string_agg(qbo_service_id, ',' ORDER BY qbo_service_id)
             FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'),
  '10,11', 'an account manager''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices"), 0, 'a viewer sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''x'')', :'et_1', :'conn_3'),
  '42501', NULL, 'a viewer cannot insert');
UPDATE public."EventTypeQboServices" SET qbo_service_id = 'HACK';
DELETE FROM public."EventTypeQboServices";
RESET ROLE;
SELECT is((SELECT string_agg(qbo_service_id, ',' ORDER BY qbo_service_id)
             FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'),
  '10,11', 'a viewer''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_driver')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices"), 0, 'a driver sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''x'')', :'et_1', :'conn_3'),
  '42501', NULL, 'a driver cannot insert');
UPDATE public."EventTypeQboServices" SET qbo_service_id = 'HACK';
DELETE FROM public."EventTypeQboServices";
RESET ROLE;
SELECT is((SELECT string_agg(qbo_service_id, ',' ORDER BY qbo_service_id)
             FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'),
  '10,11', 'a driver''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices"), 0, 'a maintainer sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''x'')', :'et_1', :'conn_3'),
  '42501', NULL, 'a maintainer cannot insert');
UPDATE public."EventTypeQboServices" SET qbo_service_id = 'HACK';
DELETE FROM public."EventTypeQboServices";
RESET ROLE;
SELECT is((SELECT string_agg(qbo_service_id, ',' ORDER BY qbo_service_id)
             FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'),
  '10,11', 'a maintainer''s update and delete changed nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_etqs_dev')::text, true);
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices"), 0, 'a developer sees no rows');
SELECT throws_ok(
  format('INSERT INTO public."EventTypeQboServices" (event_type_uuid, qbo_connection_uuid, qbo_service_id) VALUES (%L, %L, ''x'')', :'et_1', :'conn_3'),
  '42501', NULL, 'a developer cannot insert');
UPDATE public."EventTypeQboServices" SET qbo_service_id = 'HACK';
DELETE FROM public."EventTypeQboServices";
RESET ROLE;
SELECT is((SELECT string_agg(qbo_service_id, ',' ORDER BY qbo_service_id)
             FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1'),
  '10,11', 'a developer''s update and delete changed nothing');

-- ═══ The service role reads ═════════════════════════════════════════════════

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT qbo_service_id FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_1' AND event_type_uuid = :'et_2'),
  '11', 'the service role reads a Product/Service');
RESET ROLE;

-- ═══ Cascade ════════════════════════════════════════════════════════════════

DELETE FROM public."QboConnections" WHERE id = :'conn_2';
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices" WHERE qbo_connection_uuid = :'conn_2'), 0,
  'deleting the connection deletes its rows');

DELETE FROM public."EventTypes" WHERE id = :'et_2';
SELECT is((SELECT count(*)::int FROM public."EventTypeQboServices" WHERE event_type_uuid = :'et_2'), 0,
  'deleting the event type deletes its rows');

SELECT * FROM finish();
ROLLBACK;
