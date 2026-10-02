-- ============================================================================
-- Tests for the Accountant role, Stage 2: Work Trackers access
-- Migration: 20261001130000_accountant_work_trackers.sql
-- Spec:      docs/specs/accountant-work-trackers.md
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_work_trackers.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the accountant READS what the Work Trackers pages, the payment modal, the
--     create-bill route and the PDF read through the database — one named assertion per
--     grant, because a refused read is an empty result, not an error (a missing
--     QboConnections grant silently becomes tax code NON, a missing Zone grant a bill
--     with no QuickBooks Class);
--   * the accountant WRITES WorkTrackerGroups (insert, update) and nothing else;
--   * the accountant CANNOT create, edit, reassign, release or delete a work tracker, nor
--     touch its line items (spec §0). An UPDATE that RLS filters out does not raise, so
--     every refusal is also checked by looking at the row afterwards;
--   * nobody else gained or lost anything.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(60);

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
VALUES ('Acct', 'Only', 'wt_acct@test.com', 'clerk_wt_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'wt_acct_off@test.com', 'clerk_wt_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'wt_admin@test.com', 'clerk_wt_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'wt_am@test.com', 'clerk_wt_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'wt_viewer@test.com', 'clerk_wt_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'wt_maint@test.com', 'clerk_wt_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- A driver (a Users row WITH a Drivers row) and a user who is not one.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Drew', 'Driver', 'wt_driver@test.com', 'clerk_wt_driver', false, false)
RETURNING id AS user_driver \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Not', 'ADriver', 'wt_notdriver@test.com', 'clerk_wt_notdriver', false, false)
RETURNING id AS user_notdriver \gset

INSERT INTO public."Vendors" (display_name) VALUES ('Accountant Probe Vendor')
RETURNING id AS vendor \gset

INSERT INTO public."Drivers" (user_uuid, vendor_uuid, is_active)
VALUES (:'user_driver', :'vendor', false)
RETURNING id AS driver \gset

INSERT INTO public."Addresses" (street, city, state_province)
VALUES ('1 Probe Street', 'Probeville', 'ON')
RETURNING id AS address \gset

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9983, 10, 100)
RETURNING id AS bleacher \gset

INSERT INTO public."WorkTrackerTypes" (display_name, sort_order)
VALUES ('Accountant Probe Type', 99)
RETURNING id AS wt_type \gset

INSERT INTO public."WorkTrackers"
  (driver_uuid, bleacher_uuid, pickup_address_uuid, work_tracker_type_uuid, date, status, pay_cents)
VALUES (:'driver', :'bleacher', :'address', :'wt_type', '2026-09-22', 'draft', 10000)
RETURNING id AS tracker \gset

INSERT INTO public."WorkTrackerLineItems" (work_tracker_uuid, type, description)
VALUES (:'tracker', 'hauling', 'probe line')
RETURNING id AS line_item \gset

-- Inserting a work tracker creates its week's group (a trigger), so it is looked up, not inserted.
SELECT id AS grp FROM public."WorkTrackerGroups"
 WHERE driver_uuid = :'driver' AND week_start = '2026-09-21' \gset

-- QuickBooks mapping reads that create-bill depends on.
INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('Probe connection', '__pending__')
RETURNING id AS qbo_conn \gset

INSERT INTO public."WorkTrackerTypeQboAccounts" (work_tracker_type_uuid, qbo_connection_uuid, qbo_account_id)
VALUES (:'wt_type', :'qbo_conn', 'ACCT-1');

INSERT INTO public."Zones" (display_name) VALUES ('Accountant Probe Zone')
RETURNING id AS zone \gset

INSERT INTO public."ZoneStateProvinces" (zone_uuid, state_province) VALUES (:'zone', 'ON');

INSERT INTO public."ZoneQboClasses" (zone_uuid, qbo_connection_uuid, qbo_class_id)
VALUES (:'zone', :'qbo_conn', 'CLASS-1');

-- Rows the accountant must still NOT see.
INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('Accountant WT probe event', '2026-07-01', '2026-07-02', false, false)
RETURNING id AS event \gset

INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, payer_name)
VALUES (:'event', 12345, 'Accountant WT probe');

INSERT INTO public."DamageReports" (bleacher_uuid) VALUES (:'bleacher');

-- ═══ THE ACCOUNTANT: reads ═══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'tracker'), 1,
  'an accountant can read WorkTrackers');
SELECT is((SELECT count(*)::int FROM public."Drivers" WHERE id = :'driver'), 1,
  'an accountant can read Drivers — including a driver who is no longer active');
SELECT is((SELECT count(*)::int FROM public."Vendors" WHERE id = :'vendor'), 1,
  'an accountant can read Vendors');
SELECT is((SELECT count(*)::int FROM public."Addresses" WHERE id = :'address'), 1,
  'an accountant can read Addresses');
SELECT is((SELECT count(*)::int FROM public."Bleachers" WHERE id = :'bleacher'), 1,
  'an accountant can read Bleachers (the PDF prints the bleacher number)');
SELECT is((SELECT count(*)::int FROM public."WorkTrackerTypes" WHERE id = :'wt_type'), 1,
  'an accountant can read WorkTrackerTypes');
SELECT is((SELECT count(*)::int FROM public."WorkTrackerGroups" WHERE id = :'grp'), 1,
  'an accountant can read WorkTrackerGroups');
SELECT is((SELECT count(*)::int FROM public."QboConnections" WHERE id = :'qbo_conn'), 1,
  'an accountant can read QboConnections — create-bill takes the default tax code from it');
SELECT is((SELECT count(*)::int FROM public."WorkTrackerTypeQboAccounts" WHERE qbo_connection_uuid = :'qbo_conn'), 1,
  'an accountant can read WorkTrackerTypeQboAccounts');
SELECT is((SELECT count(*)::int FROM public."ZoneQboClasses" WHERE qbo_connection_uuid = :'qbo_conn'), 1,
  'an accountant can read ZoneQboClasses — it is what puts a QuickBooks Class on a bill');
SELECT is((SELECT count(*)::int FROM public."Zones" WHERE id = :'zone'), 1,
  'an accountant can read Zones');
SELECT is((SELECT count(*)::int FROM public."ZoneStateProvinces" WHERE zone_uuid = :'zone'), 1,
  'an accountant can read ZoneStateProvinces');

-- The embedded read create-bill makes, end to end: a Class is found.
SELECT is(
  (SELECT count(*)::int
     FROM public."ZoneQboClasses" zc
     JOIN public."Zones" z ON z.id = zc.zone_uuid
     JOIN public."ZoneStateProvinces" sp ON sp.zone_uuid = z.id
    WHERE zc.qbo_connection_uuid = :'qbo_conn' AND sp.state_province = 'ON'),
  1,
  'the state → zone → QuickBooks Class lookup works for an accountant'
);

-- Users: drivers only, plus their own row (D4).
SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_driver'), 1,
  'an accountant can read a driver''s Users row');
SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_acct'), 1,
  'an accountant can read their own Users row');
SELECT is(
  (SELECT count(*)::int FROM public."Users"
    WHERE id IN (:'user_admin', :'user_am', :'user_viewer', :'user_maint', :'user_notdriver')),
  0,
  'an accountant cannot read the Users rows of admins, managers, viewers, maintainers or any non-driver'
);

-- ── Still nothing else (zero-trust holds) ───────────────────────────────────

SELECT is((SELECT count(*)::int FROM public."Events"), 0, 'an accountant still cannot read Events');
SELECT is((SELECT count(*)::int FROM public."BleacherEvents"), 0, 'an accountant still cannot read BleacherEvents');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory"), 0, 'an accountant still cannot read PaymentHistory');
SELECT is((SELECT count(*)::int FROM public."DamageReports"), 0, 'an accountant still cannot read DamageReports');
SELECT is((SELECT count(*)::int FROM public."AccountManagers"), 0, 'an accountant still cannot read AccountManagers');
SELECT is((SELECT count(*)::int FROM public."Accountants"), 0, 'an accountant still cannot read who holds the role');
SELECT is((SELECT count(*)::int FROM public."Contacts"), 0, 'an accountant still cannot read Contacts');
SELECT is((SELECT count(*)::int FROM public."Notifications"), 0, 'an accountant still cannot read Notifications');

-- ═══ THE ACCOUNTANT: writes ══════════════════════════════════════════════════

-- The payment modal moves a week between statuses...
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackerGroups" SET status = ''no_bill_ready_for_payment'' WHERE id = %L', :'grp')),
  1,
  'an accountant can mark a week Ready for Payment'
);
SELECT is((SELECT status::text FROM public."WorkTrackerGroups" WHERE id = :'grp'), 'no_bill_ready_for_payment',
  '...and the status really changed');
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackerGroups" SET status = ''draft'' WHERE id = %L', :'grp')),
  1,
  'an accountant can take it back to Draft'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackerGroups" SET status = ''qbo_bill_created'', qbo_bill_id = ''B-1'' WHERE id = %L', :'grp')),
  1,
  'an accountant can record a created QuickBooks bill'
);

-- ...and the modal creates the group row when the week has none yet.
SELECT lives_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end, status) VALUES (%L, ''2026-09-28'', ''2026-10-04'', ''draft'')',
    :'driver'),
  'an accountant can create the payment group of a week that has none'
);

-- A group is never deleted by the accountant.
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."WorkTrackerGroups" WHERE id = %L', :'grp')),
  0,
  'an accountant cannot delete a payment group'
);
SELECT is((SELECT count(*)::int FROM public."WorkTrackerGroups" WHERE id = :'grp'), 1,
  '...and the group is still there');

-- ═══ THE ACCOUNTANT: what they must NOT do to a work tracker (spec §0) ═══════

SELECT throws_ok(
  format(
    'INSERT INTO public."WorkTrackers" (driver_uuid, date, status) VALUES (%L, ''2026-09-23'', ''draft'')',
    :'driver'),
  '42501',
  NULL,
  'an accountant cannot create a work tracker'
);

SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackers" SET pay_cents = 1 WHERE id = %L', :'tracker')),
  0,
  'an accountant cannot edit a work tracker''s pay'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackers" SET notes = ''tampered'' WHERE id = %L', :'tracker')),
  0,
  'an accountant cannot edit a work tracker''s notes'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackers" SET driver_uuid = NULL WHERE id = %L', :'tracker')),
  0,
  'an accountant cannot reassign a work tracker to another driver'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackers" SET status = ''released'' WHERE id = %L', :'tracker')),
  0,
  'an accountant cannot release a work tracker (draft → released)'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackers" SET status = ''released'' WHERE driver_uuid = %L AND status = ''draft''', :'driver')),
  0,
  'an accountant cannot release a driver''s drafts in bulk — what Release All does'
);
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."WorkTrackers" WHERE id = %L', :'tracker')),
  0,
  'an accountant cannot delete a work tracker'
);

SELECT throws_ok(
  format(
    'INSERT INTO public."WorkTrackerLineItems" (work_tracker_uuid, type) VALUES (%L, ''deadhead'')',
    :'tracker'),
  '42501',
  NULL,
  'an accountant cannot add a line item'
);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackerLineItems" SET description = ''tampered'' WHERE id = %L', :'line_item')),
  0,
  'an accountant cannot edit a line item'
);
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."WorkTrackerLineItems" WHERE id = %L', :'line_item')),
  0,
  'an accountant cannot delete a line item'
);

-- Looking at the rows afterwards: an UPDATE that RLS filters out does not raise.
RESET ROLE;
SELECT results_eq(
  format(
    'SELECT pay_cents, notes, driver_uuid::text, status::text FROM public."WorkTrackers" WHERE id = %L',
    :'tracker'),
  format('VALUES (10000::bigint, NULL::text, %L::text, ''draft''::text)', :'driver'),
  'the work tracker is exactly as it was after every refused write'
);
SELECT is((SELECT description FROM public."WorkTrackerLineItems" WHERE id = :'line_item'), 'probe line',
  'the line item is exactly as it was');
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE driver_uuid = :'driver'), 1,
  'no work tracker was added or removed');

-- The group updates were the accountant's own and stay (rolled back with the test).
SELECT is((SELECT status::text FROM public."WorkTrackerGroups" WHERE id = :'grp'), 'qbo_bill_created',
  'the allowed payment-status writes did persist');

-- ═══ An inactive accountant row grants nothing ═══════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_acct_off')::text, true);

SELECT is((SELECT count(*)::int FROM public."WorkTrackers"), 0,
  'an inactive accountant row reads no work trackers — the role is revoked');
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."WorkTrackerGroups" SET status = ''draft'' WHERE id = %L', :'grp')),
  0,
  'an inactive accountant row cannot change a payment status'
);

-- ═══ Nobody else gained or lost anything ═════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'tracker'), 1, 'an account manager still reads WorkTrackers');
SELECT is((SELECT count(*)::int FROM public."Vendors" WHERE id = :'vendor'), 1, 'an account manager still reads Vendors');
SELECT is((SELECT count(*)::int FROM public."QboConnections" WHERE id = :'qbo_conn'), 1, 'an account manager still reads QboConnections');
SELECT is((SELECT count(*)::int FROM public."ZoneQboClasses"), 0,
  'an account manager still cannot read ZoneQboClasses — this migration did not touch their access');
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET status = ''draft'' WHERE id = %L', :'grp')),
  1,
  'an account manager can still change a payment status'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'tracker'), 1, 'a viewer still reads WorkTrackers');
SELECT is((SELECT count(*)::int FROM public."Vendors"), 0, 'a viewer still cannot read Vendors');
SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_admin'), 1,
  'a viewer still reads every Users row — this migration did not narrow theirs');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."WorkTrackers" WHERE id = :'tracker'), 1, 'a maintainer still reads WorkTrackers');
SELECT is((SELECT count(*)::int FROM public."WorkTrackerGroups"), 0, 'a maintainer still cannot read WorkTrackerGroups');
SELECT is((SELECT count(*)::int FROM public."Vendors"), 0, 'a maintainer still cannot read Vendors');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_wt_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."ZoneQboClasses" WHERE qbo_connection_uuid = :'qbo_conn'), 1, 'an admin still reads ZoneQboClasses');
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackers" SET notes = ''admin edit'' WHERE id = %L', :'tracker')),
  1,
  'an admin can still edit a work tracker'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
