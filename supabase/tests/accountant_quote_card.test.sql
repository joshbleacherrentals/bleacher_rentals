-- ============================================================================
-- Tests for the Accountant on the quote card: Venues, BleacherTypes, EventChangeLog, EventEmailLog
-- Migration: 20261004130000_accountant_quote_card.sql
-- Spec:      docs/specs/accountant-quotes-04-accountant-quote-access.md (§3, §7.1, D10)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_quote_card.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the accountant READS each table the card is built from — one named assertion per table,
--     because a refused read is an empty result, not an error (a missing Venues grant is a card
--     with no venue, a missing EventChangeLog grant a Log tab with nothing in it);
--   * the accountant WRITES none of them, with TWO exceptions: EventChangeLog keeps its open INSERT
--     policy (D10), because every change any role makes must be logged — update and delete there are
--     refused; and Venues, which an accountant creates and edits since
--     docs/specs/accountant-address-book.md (accountant_address_book.test.sql asserts that side; a
--     hard delete is still refused here). An INSERT that RLS refuses raises 42501; an UPDATE or DELETE that
--     RLS filters out does not raise, so every refusal is also checked by looking at the row;
--   * EventFiles and the event-files storage policies are asserted AS THEY ARE (open to any
--     authenticated user), so a future change to them shows up here — spec 04 relies on them being
--     open and does not touch them;
--   * nobody else gained or lost anything.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(36);

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

-- How many of the four fixture rows the current role can see (one per table, so 4 is "all").
-- SECURITY INVOKER: the caller's row-level security applies.
CREATE FUNCTION public.test_card_visible() RETURNS int
LANGUAGE sql AS $$
  SELECT
    (SELECT count(*)::int FROM public."Venues"         WHERE id = current_setting('qc.venue')::uuid)
  + (SELECT count(*)::int FROM public."BleacherTypes"  WHERE id = current_setting('qc.btype')::uuid)
  + (SELECT count(*)::int FROM public."EventChangeLog" WHERE id = current_setting('qc.changelog')::uuid)
  + (SELECT count(*)::int FROM public."EventEmailLog"  WHERE id = current_setting('qc.emaillog')::uuid);
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'qc_acct@test.com', 'clerk_qc_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'qc_acct_off@test.com', 'clerk_qc_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'qc_admin@test.com', 'clerk_qc_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'qc_am@test.com', 'clerk_qc_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'qc_viewer@test.com', 'clerk_qc_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'qc_maint@test.com', 'clerk_qc_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'qc_norole@test.com', 'clerk_qc_norole', false, false)
RETURNING id AS user_norole \gset

-- One row in each table the card reads.
INSERT INTO public."Addresses" (street, city, state_province)
VALUES ('1 Card Street', 'Cardville', 'ON')
RETURNING id AS address \gset

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('Quote card probe event', '2026-07-01', '2026-07-02', false, false)
RETURNING id AS event \gset

INSERT INTO public."Venues" (name, address_uuid) VALUES ('Card probe venue', :'address')
RETURNING id AS venue \gset

INSERT INTO public."BleacherTypes" (name, row_count) VALUES ('Card probe type', 5)
RETURNING id AS btype \gset

INSERT INTO public."EventChangeLog" (event_uuid, field_name, action_type, prev_value, next_value)
VALUES (:'event', 'event_name', 'update', 'before', 'after')
RETURNING id AS changelog \gset

INSERT INTO public."EventEmailLog" (event_uuid, trigger, status)
VALUES (:'event', 'quote_sent', 'sent')
RETURNING id AS emaillog \gset

INSERT INTO public."EventFiles" (event_uuid, file_name, storage_path)
VALUES (:'event', 'probe.pdf', 'probe/probe.pdf')
RETURNING id AS eventfile \gset

-- test_card_visible() reads the ids from settings (is_local survives SET ROLE, not the rollback).
SELECT set_config('qc.venue', :'venue', true);
SELECT set_config('qc.btype', :'btype', true);
SELECT set_config('qc.changelog', :'changelog', true);
SELECT set_config('qc.emaillog', :'emaillog', true);

-- ═══ THE ACCOUNTANT: reads (spec §3, one assertion per table) ═════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."Venues" WHERE id = :'venue'), 1,
  'an accountant can read Venues');
SELECT is((SELECT count(*)::int FROM public."BleacherTypes" WHERE id = :'btype'), 1,
  'an accountant can read BleacherTypes');
SELECT is((SELECT count(*)::int FROM public."EventChangeLog" WHERE id = :'changelog'), 1,
  'an accountant can read EventChangeLog');
SELECT is((SELECT count(*)::int FROM public."EventEmailLog" WHERE id = :'emaillog'), 1,
  'an accountant can read EventEmailLog');

-- ═══ THE ACCOUNTANT: writes the closed tables, except Venues ═══════════════════

-- Venues. Since docs/specs/accountant-address-book.md an accountant creates and edits a venue; there
-- is still no DELETE policy, so a hard delete removes nothing.
SELECT lives_ok(
  format('INSERT INTO public."Venues" (name, address_uuid) VALUES (''QC new venue'', %L)', :'address'),
  'an accountant can create a venue');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET name = ''QC edited'' WHERE id = %L', :'venue')),
  1, 'an accountant can update a venue');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Venues" WHERE id = %L', :'venue')),
  0, 'an accountant cannot delete a venue');
SELECT is((SELECT name FROM public."Venues" WHERE id = :'venue'), 'QC edited',
  '...and the venue is changed, not removed');

-- BleacherTypes
SELECT throws_ok(
  'INSERT INTO public."BleacherTypes" (name, row_count) VALUES (''QC intruder'', 1)',
  '42501', NULL, 'an accountant cannot create a bleacher type');
SELECT is(
  public.test_rows_affected(format('UPDATE public."BleacherTypes" SET name = ''QC edited'' WHERE id = %L', :'btype')),
  0, 'an accountant cannot update a bleacher type');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."BleacherTypes" WHERE id = %L', :'btype')),
  0, 'an accountant cannot delete a bleacher type');
SELECT is((SELECT name FROM public."BleacherTypes" WHERE id = :'btype'), 'Card probe type',
  '...and the bleacher type is unchanged');

-- EventEmailLog (no write policy exists for anyone but the service role)
SELECT throws_ok(
  format('INSERT INTO public."EventEmailLog" (event_uuid, trigger, status) VALUES (%L, ''qc_intruder'', ''sent'')', :'event'),
  '42501', NULL, 'an accountant cannot write to the email log');
SELECT is(
  public.test_rows_affected(format('UPDATE public."EventEmailLog" SET trigger = ''qc_edited'' WHERE id = %L', :'emaillog')),
  0, 'an accountant cannot update an email log row');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."EventEmailLog" WHERE id = %L', :'emaillog')),
  0, 'an accountant cannot delete an email log row');
SELECT is((SELECT trigger FROM public."EventEmailLog" WHERE id = :'emaillog'), 'quote_sent',
  '...and the email log row is unchanged');

-- ═══ EventChangeLog: the insert stays open (D10), update and delete are refused ═══

SELECT lives_ok(
  format('INSERT INTO public."EventChangeLog" (event_uuid, field_name, action_type, prev_value, next_value) VALUES (%L, ''event_name'', ''update'', ''a'', ''b'')', :'event'),
  'EventChangeLog insert is open: every change any role makes is written to the log (D10)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."EventChangeLog" SET next_value = ''rewritten'' WHERE id = %L', :'changelog')),
  0, 'an accountant cannot rewrite a log entry');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."EventChangeLog" WHERE id = %L', :'changelog')),
  0, 'an accountant cannot delete a log entry');
SELECT is((SELECT next_value FROM public."EventChangeLog" WHERE id = :'changelog'), 'after',
  '...and the log entry is unchanged');

-- ═══ EventFiles and the event-files bucket: asserted as they are (spec §2, D5) ═══

SELECT is((SELECT count(*)::int FROM public."EventFiles" WHERE id = :'eventfile'), 1,
  'an accountant can read EventFiles — open to any authenticated user');
SELECT lives_ok(
  format('INSERT INTO public."EventFiles" (event_uuid, file_name, storage_path) VALUES (%L, ''added.pdf'', ''probe/added.pdf'')', :'event'),
  'an accountant can add a file — the Files tab does not check the role');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."EventFiles" WHERE id = %L', :'eventfile')),
  1, 'an accountant can delete a file — the Files tab does not check the role');

RESET ROLE;

-- The three EventFiles policies are open to every authenticated user. If one of them gains a role
-- condition, the Files tab changes for the accountant and this test must be edited on purpose.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'EventFiles'
      AND ((cmd = 'SELECT' AND qual = 'true')
        OR (cmd = 'INSERT' AND with_check = 'true')
        OR (cmd = 'DELETE' AND qual = 'true'))),
  3, 'the EventFiles select, insert and delete policies are open to every authenticated user');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('event-files: select', 'event-files: insert', 'event-files: delete')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%event-files%'
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%get_user_roles%'),
  3, 'the event-files bucket policies check the bucket only, not the role');

-- ═══ NOBODY ELSE gained or lost anything ═════════════════════════════════════

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_acct_off')::text, true);
SELECT is(public.test_card_visible(), 0, 'an inactive accountant still reads none of the four tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_norole')::text, true);
SELECT is(public.test_card_visible(), 0, 'a user with no role still reads none of the four tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_maint')::text, true);
SELECT is(public.test_card_visible(), 0, 'a maintainer still reads none of the four tables');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_am')::text, true);
SELECT is(public.test_card_visible(), 4, 'an account manager still reads all four tables');
SELECT lives_ok(
  format('INSERT INTO public."Venues" (name, address_uuid) VALUES (''AM venue'', %L)', :'address'),
  'an account manager can still create a venue');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET name = ''AM edited'' WHERE id = %L', :'venue')),
  1, 'an account manager can still edit a venue');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_viewer')::text, true);
SELECT is(public.test_card_visible(), 4, 'a viewer still reads all four tables');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET name = ''Viewer edit'' WHERE id = %L', :'venue')),
  0, 'a viewer still cannot edit a venue');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qc_admin')::text, true);
SELECT is(public.test_card_visible(), 4, 'an admin still reads all four tables');
SELECT lives_ok(
  'INSERT INTO public."BleacherTypes" (name, row_count) VALUES (''Admin type'', 2)',
  'an admin can still create a bleacher type');
SELECT is(
  public.test_rows_affected(format('UPDATE public."BleacherTypes" SET name = ''Admin edited'' WHERE id = %L', :'btype')),
  1, 'an admin can still edit a bleacher type');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
