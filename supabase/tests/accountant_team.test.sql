-- ============================================================================
-- Tests for the Accountant on the Team page: payment info, vendor, vendor companies
-- Migration: 20261006130000_accountant_team.sql
-- Spec:      docs/specs/accountant-team.md (§3, §9.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_team.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Two kinds of refusal, and the test tells them apart:
--   * an INSERT that RLS refuses, and an UPDATE the column guard refuses, RAISE 42501 — asserted
--     with throws_ok;
--   * an UPDATE or DELETE that RLS filters out RAISES NOTHING: it matches no row — asserted as
--     "0 rows affected", and the row is read back afterwards, because an update that was filtered
--     out proves nothing about the row on its own.
--
-- What it pins down, for an accountant-only user:
--   * Drivers: every allowed column (tax_dec, with tax derived by sync_driver_tax, pay_rate_cents,
--     pay_currency, pay_per_unit, deadhead_cents, setup_cents, teardown_cents, vendor_uuid) can be
--     updated; every other column (phone, address, vehicle, documents, expiry dates, owner, role
--     flag, user, app telemetry) is refused by the column guard; no insert, no delete;
--   * the guard does not fence an admin, an account manager, an accountant who is also an account
--     manager (spec D9), nor the caller's own driver row (spec C5);
--   * DriverPayRanges: read, create (also in the upsert form the connector sends), update, delete;
--   * Vendors: create (also in the upsert form), edit, set the QuickBooks columns, soft-delete; a
--     hard DELETE removes nothing;
--   * Vehicles and DriverZones: read only;
--   * Users: still drivers only, and nobody else's row can be written;
--   * a viewer, a maintainer, a developer, an inactive accountant, a user with no role and an
--     account manager who does not own the driver still cannot write, and the rows are unchanged.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(94);

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
VALUES ('Acct', 'Only', 'at_acct@test.com', 'clerk_at_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'at_acct_off@test.com', 'clerk_at_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

-- An accountant who is also an account manager: roles are additive (spec D9).
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'AndAM', 'at_both@test.com', 'clerk_at_both', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_both', true);

-- An accountant who is also a driver: the row the guard must not fence (spec C5).
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'AndDriver', 'at_acctdrv@test.com', 'clerk_at_acctdrv', false, false)
RETURNING id AS user_acctdrv \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acctdrv', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'at_admin@test.com', 'clerk_at_admin', true, false)
RETURNING id AS user_admin \gset

-- The account manager who owns the target driver, and one who does not.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Owner', 'AM', 'at_am@test.com', 'clerk_at_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true)
RETURNING id AS am_owner \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Other', 'AM', 'at_am2@test.com', 'clerk_at_am2', false, false)
RETURNING id AS user_am2 \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am2', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'at_viewer@test.com', 'clerk_at_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'at_maint@test.com', 'clerk_at_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Dev', 'at_dev@test.com', 'clerk_at_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'at_norole@test.com', 'clerk_at_norole', false, false)
RETURNING id AS user_norole \gset

-- The target driver: a Users row WITH a Drivers row, owned by `Owner AM`, so that an account manager
-- who is not the owner (and shares no zone) is refused by the policy as it was before this change.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Target', 'Driver', 'at_driver@test.com', 'clerk_at_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Home St', 'Teamville', 'ON')
RETURNING id AS addr_home \gset
INSERT INTO public."Vehicles" (make, model, year) VALUES ('Ford', 'F-150', 2020)
RETURNING id AS vehicle_target \gset
INSERT INTO public."Vendors" (display_name) VALUES ('AT probe vendor')
RETURNING id AS vendor_target \gset
INSERT INTO public."Vendors" (display_name) VALUES ('AT second vendor')
RETURNING id AS vendor_second \gset
INSERT INTO public."Drivers" (user_uuid, account_manager_uuid, address_uuid, vehicle_uuid, vendor_uuid,
                              phone_number, license_photo_path, license_expires_on, is_active,
                              pay_rate_cents, deadhead_cents, setup_cents, teardown_cents, tax_dec)
VALUES (:'user_driver', :'am_owner', :'addr_home', :'vehicle_target', :'vendor_target',
        '555-0100', 'drv/license.png', '2030-01-01', true, 100, 10, 20, 30, 5)
RETURNING id AS driver_target \gset

-- The accountant's own driver row.
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_acctdrv', true)
RETURNING id AS driver_acct \gset

INSERT INTO public."Zones" (display_name) VALUES ('AT probe zone')
RETURNING id AS zone_target \gset
INSERT INTO public."DriverZones" (driver_uuid, zone_uuid) VALUES (:'driver_target', :'zone_target');

INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, max_value, rate)
VALUES (:'driver_target', 0, 100, 1.5)
RETURNING id AS range_target \gset

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('AT probe connection', '__pending__')
RETURNING id AS qbo_conn \gset

-- Ids the accountant sections insert with (the upsert form needs the id up front).
SELECT gen_random_uuid() AS ve1, gen_random_uuid() AS ve2,
       gen_random_uuid() AS pr1, gen_random_uuid() AS pr2 \gset

-- ═══ THE ACCOUNTANT: Drivers — the allowed columns ═══════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."Drivers" WHERE id = :'driver_target'), 1,
  'an accountant can read a driver (as before)');

SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET tax_dec = 7.5 WHERE id = %L', :'driver_target')),
  1, 'an accountant can update tax_dec');
SELECT is((SELECT tax_dec FROM public."Drivers" WHERE id = :'driver_target'), 7.5,
  '...and tax_dec is changed');
SELECT is((SELECT tax::int FROM public."Drivers" WHERE id = :'driver_target'), 8,
  '...and sync_driver_tax derived tax from it, which the guard lets through');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 250 WHERE id = %L', :'driver_target')),
  1, 'an accountant can update pay_rate_cents');
SELECT is((SELECT pay_rate_cents::int FROM public."Drivers" WHERE id = :'driver_target'), 250,
  '...and pay_rate_cents is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_currency = ''USD'' WHERE id = %L', :'driver_target')),
  1, 'an accountant can update pay_currency');
SELECT is((SELECT pay_currency::text FROM public."Drivers" WHERE id = :'driver_target'), 'USD',
  '...and pay_currency is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_per_unit = ''MI'' WHERE id = %L', :'driver_target')),
  1, 'an accountant can update pay_per_unit');
SELECT is((SELECT pay_per_unit::text FROM public."Drivers" WHERE id = :'driver_target'), 'MI',
  '...and pay_per_unit is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET deadhead_cents = 11, setup_cents = 22, teardown_cents = 33 WHERE id = %L', :'driver_target')),
  1, 'an accountant can update deadhead, setup and teardown together');
SELECT is((SELECT deadhead_cents + setup_cents + teardown_cents FROM public."Drivers" WHERE id = :'driver_target'), 66,
  '...and all three are changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET vendor_uuid = %L WHERE id = %L', :'vendor_second', :'driver_target')),
  1, 'an accountant can change the vendor of a driver');
SELECT is((SELECT vendor_uuid FROM public."Drivers" WHERE id = :'driver_target'), :'vendor_second'::uuid,
  '...and the vendor is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET vendor_uuid = NULL WHERE id = %L', :'driver_target')),
  1, 'an accountant can clear the vendor (Employee)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 300, vendor_uuid = %L, tax_dec = 9 WHERE id = %L', :'vendor_target', :'driver_target')),
  1, 'an accountant can change several allowed columns in one update, as the form does');

-- ═══ THE ACCOUNTANT: Drivers — every other column is refused ═════════════════

SELECT throws_ok(
  format('UPDATE public."Drivers" SET phone_number = ''555-9999'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change a phone number');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET address_uuid = NULL WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change the home address of a driver');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET vehicle_uuid = NULL WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change the vehicle of a driver');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET license_photo_path = ''x/y.png'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change a document path');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET license_expires_on = ''2099-01-01'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change an expiry date');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET insurance_photo_path = ''x/i.png'', medical_card_expires_on = ''2099-01-01'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot change the other document columns either');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET account_manager_uuid = NULL WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot release a driver from their account manager');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET is_active = false WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot deactivate the driver role');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET user_uuid = %L WHERE id = %L', :'user_viewer', :'driver_target'),
  '42501', NULL, 'an accountant cannot point a driver at another user');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET app_version = ''9.9.9'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot write the app telemetry');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET bucket_count = 1 WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an accountant cannot write the sync telemetry');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET pay_rate_cents = 1, phone_number = ''555-9999'' WHERE id = %L', :'driver_target'),
  '42501', NULL, 'an allowed column does not smuggle a refused one through in the same update');

SELECT throws_ok(
  format('INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (%L, true)', :'user_norole'),
  '42501', NULL, 'an accountant cannot create a driver');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Drivers" WHERE id = %L', :'driver_target')),
  0, 'an accountant cannot delete a driver');

-- ═══ THE ACCOUNTANT: the rows of the refused writes are unchanged ════════════

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."Drivers"
    WHERE id = :'driver_target' AND phone_number = '555-0100' AND address_uuid = :'addr_home'
      AND vehicle_uuid = :'vehicle_target' AND license_photo_path = 'drv/license.png'
      AND license_expires_on = '2030-01-01' AND account_manager_uuid = :'am_owner'
      AND is_active = true AND user_uuid = :'user_driver'
      AND app_version IS NULL AND bucket_count IS NULL),
  1, 'every refused column of the target driver is as it was');
SELECT is(
  (SELECT pay_rate_cents::int FROM public."Drivers" WHERE id = :'driver_target'), 300,
  'the allowed columns kept the last value the accountant wrote');
SELECT is(
  (SELECT count(*)::int FROM public."Drivers" WHERE id = :'driver_target'), 1,
  'the driver still exists after the refused delete');

-- ═══ THE ACCOUNTANT: DriverPayRanges ═════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_acct')::text, true);

SELECT is((SELECT count(*)::int FROM public."DriverPayRanges" WHERE id = :'range_target'), 1,
  'an accountant can read the pay tiers of a driver');
SELECT lives_ok(
  format('INSERT INTO public."DriverPayRanges" (id, driver_uuid, min_value, max_value, rate) VALUES (%L, %L, 100, 200, 2)', :'pr1', :'driver_target'),
  'an accountant can add a pay tier');
SELECT lives_ok(
  format('INSERT INTO public."DriverPayRanges" (id, driver_uuid, min_value, max_value, rate) VALUES (%L, %L, 200, NULL, 3) ON CONFLICT (id) DO UPDATE SET rate = EXCLUDED.rate', :'pr2', :'driver_target'),
  'an accountant can add a pay tier in the upsert form the connector sends');
SELECT is(
  public.test_rows_affected(format('UPDATE public."DriverPayRanges" SET rate = 2.5 WHERE id = %L', :'pr1')),
  1, 'an accountant can update a pay tier');
SELECT is((SELECT rate FROM public."DriverPayRanges" WHERE id = :'pr1'), 2.5,
  '...and the tier is changed');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."DriverPayRanges" WHERE id = %L', :'pr1')),
  1, 'an accountant can delete a pay tier');
SELECT is((SELECT count(*)::int FROM public."DriverPayRanges" WHERE id = :'pr1'), 0,
  '...and it is gone');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, max_value, rate) VALUES (%L, 5, 1, 1)', :'driver_target'),
  '23514', NULL, 'the check constraints of the table still apply to an accountant');

-- ═══ THE ACCOUNTANT: Vendors ═════════════════════════════════════════════════

SELECT lives_ok(
  format('INSERT INTO public."Vendors" (id, display_name) VALUES (%L, ''AT acct vendor'')', :'ve1'),
  'an accountant can create a vendor');
SELECT lives_ok(
  format('INSERT INTO public."Vendors" (id, display_name) VALUES (%L, ''AT upsert vendor'') ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name', :'ve2'),
  'an accountant can create a vendor in the upsert form the connector sends');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Vendors" SET display_name = ''AT acct vendor edited'', ein = ''123456789'', hst = ''123456789RT0001'' WHERE id = %L', :'ve1')),
  1, 'an accountant can edit a vendor');
SELECT is((SELECT display_name FROM public."Vendors" WHERE id = :'ve1'), 'AT acct vendor edited',
  '...and the vendor is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Vendors" SET qbo_connection_uuid = %L, qbo_vendor_id = ''42'' WHERE id = %L', :'qbo_conn', :'ve1')),
  1, 'an accountant can set the QuickBooks connection and vendor of a vendor');
SELECT is((SELECT qbo_vendor_id FROM public."Vendors" WHERE id = :'ve1'), '42',
  '...and the QuickBooks vendor is stored');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Vendors" SET is_active = false WHERE id = %L', :'ve1')),
  1, 'an accountant can delete a vendor (a soft delete is an update of is_active)');
SELECT is((SELECT is_active FROM public."Vendors" WHERE id = :'ve1'), false,
  '...and the row still exists, marked inactive');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Vendors" WHERE id = %L', :'ve1')),
  0, 'an accountant cannot hard-delete a vendor');

-- ═══ THE ACCOUNTANT: Vehicles and DriverZones are read only ═══════════════════

SELECT is((SELECT count(*)::int FROM public."Vehicles" WHERE id = :'vehicle_target'), 1,
  'an accountant can read the vehicle of a driver');
SELECT throws_ok(
  'INSERT INTO public."Vehicles" (make, model, year) VALUES (''X'', ''Y'', 2000)',
  '42501', NULL, 'an accountant cannot create a vehicle');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Vehicles" SET make = ''Hacked'' WHERE id = %L', :'vehicle_target')),
  0, 'an accountant cannot update a vehicle');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Vehicles" WHERE id = %L', :'vehicle_target')),
  0, 'an accountant cannot delete a vehicle');

SELECT is((SELECT count(*)::int FROM public."DriverZones" WHERE driver_uuid = :'driver_target'), 1,
  'an accountant can read the zones of a driver');
SELECT throws_ok(
  format('INSERT INTO public."DriverZones" (driver_uuid, zone_uuid) VALUES (%L, %L)', :'driver_acct', :'zone_target'),
  '42501', NULL, 'an accountant cannot add a driver to a zone');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."DriverZones" WHERE driver_uuid = %L', :'driver_target')),
  0, 'an accountant cannot take a driver out of a zone');
SELECT is((SELECT count(*)::int FROM public."Zones" WHERE id = :'zone_target'), 1,
  'an accountant can read a zone (as before)');

-- ═══ THE ACCOUNTANT: Users ═══════════════════════════════════════════════════

SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_driver'), 1,
  'an accountant can read a driver''s Users row');
SELECT is((SELECT count(*)::int FROM public."Users" WHERE id = :'user_admin'), 0,
  'an accountant still cannot read an admin''s Users row directly (D5: unchanged)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Users" SET first_name = ''Hacked'' WHERE id = %L', :'user_driver')),
  0, 'an accountant cannot change a driver''s name');

-- ═══ THE GUARD DOES NOT FENCE EVERYONE ELSE ══════════════════════════════════

-- An accountant who is also a driver: their own row (spec C5).
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_acctdrv')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET phone_number = ''555-0001'', app_version = ''1.2.3'' WHERE id = %L', :'driver_acct')),
  1, 'an accountant who is also a driver can update their own row, every column (the guard skips it)');
SELECT throws_ok(
  format('UPDATE public."Drivers" SET phone_number = ''555-0002'' WHERE id = %L', :'driver_target'),
  '42501', NULL, '...but not another driver''s phone number');

-- An accountant who is also an account manager, on a driver they do not own (spec D9).
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_both')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 400, vendor_uuid = %L WHERE id = %L', :'vendor_second', :'driver_target')),
  1, 'an account manager who is also an accountant can change pay and vendor of a driver outside their zones');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET phone_number = ''555-0003'' WHERE id = %L', :'driver_target')),
  1, '...and, being an account manager, is not fenced to those columns');

-- A plain account manager who does not own the driver: the policy as it was.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_am2')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'an account manager who does not own the driver and shares no zone still cannot update it');

-- The owner, and an admin.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_am')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET phone_number = ''555-0004'', is_active = true WHERE id = %L', :'driver_target')),
  1, 'the owning account manager still updates any column');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_admin')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET phone_number = ''555-0005'', account_manager_uuid = NULL WHERE id = %L', :'driver_target')),
  1, 'an admin still updates any column');

-- ═══ ROLES THAT STILL CANNOT WRITE ═══════════════════════════════════════════

-- Put the target back to a known state, as the superuser.
RESET ROLE;
UPDATE public."Drivers"
   SET phone_number = '555-0100', account_manager_uuid = :'am_owner', pay_rate_cents = 100,
       vendor_uuid = :'vendor_target'
 WHERE id = :'driver_target';
SET LOCAL ROLE authenticated;

-- The same three probes for every role that must stay out: a driver update, a vendor insert and a
-- pay tier insert.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_viewer')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'a viewer still cannot update a driver');
SELECT throws_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT intruder'')',
  '42501', NULL, 'a viewer still cannot create a vendor');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 300, 1)', :'driver_target'),
  '42501', NULL, 'a viewer still cannot add a pay tier');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_maint')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'a maintainer still cannot update a driver');
SELECT throws_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT intruder'')',
  '42501', NULL, 'a maintainer still cannot create a vendor');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 300, 1)', :'driver_target'),
  '42501', NULL, 'a maintainer still cannot add a pay tier');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_dev')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'a developer still cannot update a driver');
SELECT throws_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT intruder'')',
  '42501', NULL, 'a developer still cannot create a vendor');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 300, 1)', :'driver_target'),
  '42501', NULL, 'a developer still cannot add a pay tier');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_acct_off')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'an inactive accountant cannot update a driver');
SELECT throws_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT intruder'')',
  '42501', NULL, 'an inactive accountant cannot create a vendor');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 300, 1)', :'driver_target'),
  '42501', NULL, 'an inactive accountant cannot add a pay tier');
SELECT is((SELECT count(*)::int FROM public."Vehicles"), 0,
  'an inactive accountant cannot read vehicles');
SELECT is((SELECT count(*)::int FROM public."DriverZones"), 0,
  'an inactive accountant cannot read driver zones');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_norole')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Drivers" SET pay_rate_cents = 1 WHERE id = %L', :'driver_target')),
  0, 'a user with no role cannot update a driver');
SELECT throws_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT intruder'')',
  '42501', NULL, 'a user with no role cannot create a vendor');
SELECT throws_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 300, 1)', :'driver_target'),
  '42501', NULL, 'a user with no role cannot add a pay tier');

-- The roles that wrote before still do.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_am')::text, true);
SELECT lives_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT am vendor'')',
  'an account manager can still create a vendor');
SELECT lives_ok(
  format('INSERT INTO public."DriverPayRanges" (driver_uuid, min_value, rate) VALUES (%L, 900, 1)', :'driver_target'),
  'an account manager can still add a pay tier');
SELECT is((SELECT count(*)::int FROM public."Vehicles" WHERE id = :'vehicle_target'), 1,
  'an account manager can still read vehicles');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_at_admin')::text, true);
SELECT lives_ok(
  'INSERT INTO public."Vendors" (display_name) VALUES (''AT admin vendor'')',
  'an admin can still create a vendor');

-- ═══ THE ROWS THE REFUSED ROLES TRIED ON ARE UNCHANGED ════════════════════════

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."Drivers"
    WHERE id = :'driver_target' AND pay_rate_cents = 100 AND vendor_uuid = :'vendor_target'),
  1, 'the target driver is unchanged after every refused write');
SELECT is(
  (SELECT count(*)::int FROM public."Vendors" WHERE display_name = 'AT intruder'), 0,
  'no vendor was created by a refused role');
SELECT is(
  (SELECT count(*)::int FROM public."DriverPayRanges" WHERE driver_uuid = :'driver_target' AND min_value = 300), 0,
  'no pay tier was created by a refused role');
SELECT is(
  (SELECT make FROM public."Vehicles" WHERE id = :'vehicle_target'), 'Ford',
  'the vehicle is unchanged');
SELECT is(
  (SELECT first_name FROM public."Users" WHERE id = :'user_driver'), 'Target',
  'the driver''s name is unchanged');

SELECT * FROM finish();
ROLLBACK;
