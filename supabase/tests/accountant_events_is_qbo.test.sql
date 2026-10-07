-- ============================================================================
-- Tests for the Accountant changing exactly one column of Events: is_qbo
-- Migration: 20261004140000_accountant_events_is_qbo.sql
-- Spec:      docs/specs/accountant-quotes-05-is-qbo-column.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_events_is_qbo.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * an accountant-only user changes is_qbo (both ways) and the row really changes;
--   * the same user cannot change any other column. The guard raises 42501 — an UPDATE that RLS
--     merely filters out raises nothing, so a refusal that was only the policy would show up here
--     as a missing exception — and the row is read back afterwards, unchanged;
--   * one update touching is_qbo AND another column is refused as a whole;
--   * an accountant cannot insert or delete an Events row, by any route;
--   * an accountant who is also an account manager is not fenced; admin and account manager change
--     is_qbo and other columns as before; a viewer still cannot update;
--   * the AFTER triggers (SECURITY DEFINER hash recomputation) still run after an accountant's tick,
--     and a SECURITY DEFINER path or the table owner changing another column is not refused;
--   * the EventChangeLog row the app writes for the flip is accepted.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(34);

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

-- A SECURITY DEFINER path (run as the function's owner, like the hash-recomputation triggers) that
-- changes a column an accountant may not. Created here as the test's owner role.
CREATE FUNCTION public.test_definer_rename(p_event uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public."Events" SET event_name = 'renamed by a definer path' WHERE id = p_event;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.test_definer_rename(uuid) TO authenticated;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'qbo_acct@test.com', 'clerk_qbo_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'qbo_acct_off@test.com', 'clerk_qbo_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

-- Both roles at once: roles are additive, so this user is not fenced.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'AndAM', 'qbo_both@test.com', 'clerk_qbo_both', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_both', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'qbo_admin@test.com', 'clerk_qbo_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'qbo_am@test.com', 'clerk_qbo_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'qbo_viewer@test.com', 'clerk_qbo_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Addresses" (street, city, state_province)
VALUES ('1 Flag Street', 'Flagville', 'ON')
RETURNING id AS address \gset

INSERT INTO public."Venues" (name, address_uuid) VALUES ('Flag venue A', :'address')
RETURNING id AS venue_a \gset
INSERT INTO public."Venues" (name, address_uuid) VALUES ('Flag venue B', :'address')
RETURNING id AS venue_b \gset

INSERT INTO public."Events"
  (event_name, event_start, event_end, lenient, must_be_clean, event_status, contract_revenue_cents, notes, venue_uuid)
VALUES
  ('Flag probe event', '2026-07-01', '2026-07-02', false, false, 'quoted', 100000, 'original notes', :'venue_a')
RETURNING id AS event \gset

-- The hashes the AFTER INSERT trigger computed, to compare with after an accountant's tick.
SELECT content_hash AS hash_content, contract_hash AS hash_contract
  FROM public."Events" WHERE id = :'event' \gset

-- ═══ THE ACCOUNTANT: changes is_qbo, and the row changes ═════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_acct')::text, true);

SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = true WHERE id = %L', :'event')),
  1, 'an accountant can tick is_qbo');
SELECT is((SELECT is_qbo FROM public."Events" WHERE id = :'event'), true,
  '...and the row really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = false WHERE id = %L', :'event')),
  1, 'an accountant can untick is_qbo');
SELECT is((SELECT is_qbo FROM public."Events" WHERE id = :'event'), false,
  '...and the row really changed back');

-- ═══ THE ACCOUNTANT: nothing else (each column, refused with 42501, row unchanged) ═══

SELECT throws_ok(
  format('UPDATE public."Events" SET event_name = ''AR edited'' WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot change event_name');
SELECT is((SELECT event_name FROM public."Events" WHERE id = :'event'), 'Flag probe event',
  '...and event_name is unchanged');

SELECT throws_ok(
  format('UPDATE public."Events" SET event_status = ''booked'' WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot change event_status');
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'event'), 'quoted',
  '...and event_status is unchanged');

SELECT throws_ok(
  format('UPDATE public."Events" SET deleted = true WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot delete an event by flagging it');
SELECT is((SELECT deleted FROM public."Events" WHERE id = :'event'), false,
  '...and deleted is unchanged');

SELECT throws_ok(
  format('UPDATE public."Events" SET contract_revenue_cents = 1 WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot change contract_revenue_cents');
SELECT is((SELECT contract_revenue_cents FROM public."Events" WHERE id = :'event'), 100000,
  '...and contract_revenue_cents is unchanged');

SELECT throws_ok(
  format('UPDATE public."Events" SET venue_uuid = %L WHERE id = %L', :'venue_b', :'event'),
  '42501', NULL, 'an accountant cannot change venue_uuid');
SELECT is((SELECT venue_uuid FROM public."Events" WHERE id = :'event'), :'venue_a'::uuid,
  '...and venue_uuid is unchanged');

SELECT throws_ok(
  format('UPDATE public."Events" SET notes = ''rewritten'' WHERE id = %L', :'event'),
  '42501', NULL, 'an accountant cannot change notes');
SELECT is((SELECT notes FROM public."Events" WHERE id = :'event'), 'original notes',
  '...and notes is unchanged');

-- One statement that touches is_qbo and something else is refused as a whole.
SELECT throws_ok(
  format('UPDATE public."Events" SET is_qbo = true, notes = ''smuggled'' WHERE id = %L', :'event'),
  '42501', NULL, 'an update of is_qbo together with another column is refused');
SELECT is((SELECT is_qbo FROM public."Events" WHERE id = :'event'), false,
  '...and is_qbo stays as it was');

-- ═══ THE ACCOUNTANT: no insert, no delete ═══════════════════════════════════

SELECT throws_ok(
  'INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean) VALUES (''QBO intruder'', ''2026-07-01'', ''2026-07-02'', false, false)',
  '42501', NULL, 'an accountant cannot create an Event');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Events" WHERE id = %L', :'event')),
  0, 'an accountant cannot delete an Event');
SELECT is((SELECT count(*)::int FROM public."Events" WHERE id = :'event'), 1,
  '...and the Event is still there');

-- ═══ THE ACCOUNTANT: the rest of the flow still works ═══════════════════════

-- The AFTER triggers (recompute_quote_hashes_events, SECURITY DEFINER) update the row as its owner.
-- They must not be refused by the guard, and the hashes an is_qbo flip leaves behind are unchanged.
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = true WHERE id = %L', :'event')),
  1, 'a tick runs the AFTER triggers without error');
SELECT is(
  (SELECT content_hash = :'hash_content' AND contract_hash = :'hash_contract'
     FROM public."Events" WHERE id = :'event'),
  true, '...and content_hash and contract_hash are present and consistent');

-- The app writes this row next to the flip (setEventIsQbo); its insert policy is open.
SELECT lives_ok(
  format('INSERT INTO public."EventChangeLog" (event_uuid, changed_by_user_uuid, field_name, prev_value, next_value, action_type) VALUES (%L, %L, ''is_qbo'', ''No'', ''Yes'', ''update'')', :'event', :'user_acct'),
  'the EventChangeLog row an accountant writes for the flip is accepted');

-- A SECURITY DEFINER path is not fenced (current_user is its owner), so a trigger of that kind that
-- touches another column keeps working.
SELECT is(public.test_definer_rename(:'event'), 1,
  'a SECURITY DEFINER path can change another column on behalf of an accountant');

-- ═══ Other people ═════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_both')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET notes = ''both roles'' WHERE id = %L', :'event')),
  1, 'an accountant who is also an account manager can change other columns');
SELECT is((SELECT notes FROM public."Events" WHERE id = :'event'), 'both roles',
  '...and the row changed');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_admin')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = false WHERE id = %L', :'event')),
  1, 'an admin can still change is_qbo');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET event_name = ''Admin edit'' WHERE id = %L', :'event')),
  1, 'an admin can still change other columns');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_am')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = true WHERE id = %L', :'event')),
  1, 'an account manager can still change is_qbo');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET event_name = ''AM edit'' WHERE id = %L', :'event')),
  1, 'an account manager can still change other columns');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_viewer')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = false WHERE id = %L', :'event')),
  0, 'a viewer still cannot update an Event');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_acct_off')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_qbo = false WHERE id = %L', :'event')),
  0, 'a deactivated accountant cannot update an Event');

RESET ROLE;

-- The table owner (the service role and migrations run like this) is not fenced either, even with
-- an accountant's token in the session.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qbo_acct')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET notes = ''set by the owner'' WHERE id = %L', :'event')),
  1, 'an update run as the table owner that changes another column is not refused');

SELECT * FROM finish();
ROLLBACK;
