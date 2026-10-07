-- ============================================================================
-- Tests for the Accountant creating, editing and soft-deleting companies, contacts and venues
-- Migration: 20261006120000_accountant_address_book.sql
-- Spec:      docs/specs/accountant-address-book.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_address_book.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Two kinds of refusal, and the test tells them apart:
--   * an INSERT that RLS refuses RAISES 42501 — asserted with throws_ok;
--   * an UPDATE or DELETE that RLS filters out RAISES NOTHING: it matches no row — asserted as
--     "0 rows affected", and the row is read back afterwards, because an update that was filtered
--     out proves nothing about the row on its own.
--
-- What it pins down, for an accountant-only user:
--   * a company, a contact and a venue are created (once as a plain INSERT, once in the upsert
--     form the PowerSync connector sends), edited, soft-deleted (UPDATE ... SET deleted) — and the
--     row still exists afterwards; a hard DELETE removes nothing (no DELETE policy for anyone);
--   * Addresses, D1 option B of the spec: an accountant inserts an address and replays that upsert
--     (the window of D4), updates an address a company (billing, shipping) or a venue points at and,
--     as an account manager can, one a sales office, a storage location, an event and a driver
--     point at, and one nothing points at; it never hard-deletes one;
--   * the definer triggers still do their work on the accountant's edit: the stored quote hash of an
--     event that uses the contact, or the address, changes although the accountant cannot write
--     Events;
--   * an accountant who is also an account manager writes; an admin and an account manager still
--     write; an inactive accountant, a user with no role, a viewer, a maintainer and a developer
--     still do not; the rows they tried on are unchanged.
--
-- A driver is asserted AS IT IS: driver_addresses_insert and driver_addresses_update are open to
-- any driver (spec §9, "found on the way", reported and not fixed), so this test would go red if
-- that is ever closed, and should then be edited on purpose.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(57);

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
VALUES ('Acct', 'Only', 'ab_acct@test.com', 'clerk_ab_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Inactive', 'ab_acct_off@test.com', 'clerk_ab_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

-- An accountant who is also an account manager: roles are additive.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'AndAM', 'ab_both@test.com', 'clerk_ab_both', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_both', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Admin', 'ab_admin@test.com', 'clerk_ab_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'AM', 'ab_am@test.com', 'clerk_ab_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Viewer', 'ab_viewer@test.com', 'clerk_ab_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Maint', 'ab_maint@test.com', 'clerk_ab_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Dev', 'ab_dev@test.com', 'clerk_ab_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Plain', 'Driver', 'ab_driver@test.com', 'clerk_ab_driver', false, false)
RETURNING id AS user_driver \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('No', 'Role', 'ab_norole@test.com', 'clerk_ab_norole', false, false)
RETURNING id AS user_norole \gset

-- One address per kind of row that points at Addresses, plus one that nothing points at.
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Billing St', 'Cardville', 'ON')
RETURNING id AS addr_billing \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('2 Shipping St', 'Cardville', 'ON')
RETURNING id AS addr_shipping \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('3 Venue St', 'Cardville', 'ON')
RETURNING id AS addr_venue \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('4 Office St', 'Cardville', 'ON')
RETURNING id AS addr_office \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('5 Storage St', 'Cardville', 'ON')
RETURNING id AS addr_storage \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('6 Event St', 'Cardville', 'ON')
RETURNING id AS addr_event \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('7 Driver St', 'Cardville', 'ON')
RETURNING id AS addr_driver \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('8 Free St', 'Cardville', 'ON')
RETURNING id AS addr_free \gset

-- The three rows the refused roles try on: untouched by the accountant sections.
INSERT INTO public."Companies" (company_name, billing_address_uuid, shipping_address_uuid)
VALUES ('AB target company', :'addr_billing', :'addr_shipping')
RETURNING id AS company_target \gset
INSERT INTO public."Contacts" (first_name, company_uuid) VALUES ('AB target contact', :'company_target')
RETURNING id AS contact_target \gset
INSERT INTO public."Venues" (name, address_uuid) VALUES ('AB target venue', :'addr_venue')
RETURNING id AS venue_target \gset

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('AB probe connection', '__pending__')
RETURNING id AS qbo_conn \gset
INSERT INTO public."SalesOffices" (name, quickbook_uuid, address_uuid)
VALUES ('AB probe office', :'qbo_conn', :'addr_office');
INSERT INTO public."StorageLocations" (name, address_uuid) VALUES ('AB probe storage', :'addr_storage');
INSERT INTO public."Drivers" (user_uuid, address_uuid, is_active)
VALUES (:'user_driver', :'addr_driver', true);

-- An event that uses the target contact and has its own address: its stored hashes are what the
-- definer triggers recompute.
INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, contact_uuid, address_uuid)
VALUES ('AB probe event', '2026-07-01', '2026-07-02', false, false, :'contact_target', :'addr_event')
RETURNING id AS event \gset
SELECT content_hash AS hash0 FROM public."Events" WHERE id = :'event' \gset

-- Ids the accountant sections insert with (the upsert form needs the id up front).
SELECT gen_random_uuid() AS co1, gen_random_uuid() AS co2,
       gen_random_uuid() AS ct1, gen_random_uuid() AS ct2,
       gen_random_uuid() AS ve1, gen_random_uuid() AS ve2,
       gen_random_uuid() AS ad1 \gset

SELECT isnt(:'hash0'::text, ''::text, 'fixture: the probe event has a stored content hash');

-- ═══ THE ACCOUNTANT: companies ═══════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_acct')::text, true);

SELECT lives_ok(
  format('INSERT INTO public."Companies" (id, company_name) VALUES (%L, ''AB acct company'')', :'co1'),
  'an accountant can create a company');
SELECT lives_ok(
  format('INSERT INTO public."Companies" (id, company_name) VALUES (%L, ''AB upsert company'') ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name', :'co2'),
  'an accountant can create a company in the upsert form the connector sends');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Companies" SET company_name = ''AB acct company edited'' WHERE id = %L', :'co1')),
  1, 'an accountant can update a company');
SELECT is((SELECT company_name FROM public."Companies" WHERE id = :'co1'), 'AB acct company edited',
  '...and the company is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Companies" SET deleted = true WHERE id = %L', :'co1')),
  1, 'an accountant can soft-delete a company');
SELECT is((SELECT deleted FROM public."Companies" WHERE id = :'co1'), true,
  '...and the row still exists, marked deleted');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Companies" WHERE id = %L', :'co1')),
  0, 'an accountant cannot hard-delete a company');

-- ═══ THE ACCOUNTANT: contacts ════════════════════════════════════════════════

SELECT lives_ok(
  format('INSERT INTO public."Contacts" (id, first_name) VALUES (%L, ''AB acct contact'')', :'ct1'),
  'an accountant can create a contact');
SELECT lives_ok(
  format('INSERT INTO public."Contacts" (id, first_name) VALUES (%L, ''AB upsert contact'') ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name', :'ct2'),
  'an accountant can create a contact in the upsert form the connector sends');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET first_name = ''AB acct contact edited'' WHERE id = %L', :'ct1')),
  1, 'an accountant can update a contact');
SELECT is((SELECT first_name FROM public."Contacts" WHERE id = :'ct1'), 'AB acct contact edited',
  '...and the contact is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET deleted = true WHERE id = %L', :'ct1')),
  1, 'an accountant can soft-delete a contact');
SELECT is((SELECT deleted FROM public."Contacts" WHERE id = :'ct1'), true,
  '...and the row still exists, marked deleted');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Contacts" WHERE id = %L', :'ct1')),
  0, 'an accountant cannot hard-delete a contact');

-- ═══ THE ACCOUNTANT: venues ══════════════════════════════════════════════════

SELECT lives_ok(
  format('INSERT INTO public."Venues" (id, name, address_uuid) VALUES (%L, ''AB acct venue'', %L)', :'ve1', :'addr_free'),
  'an accountant can create a venue');
SELECT lives_ok(
  format('INSERT INTO public."Venues" (id, name, address_uuid) VALUES (%L, ''AB upsert venue'', %L) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', :'ve2', :'addr_free'),
  'an accountant can create a venue in the upsert form the connector sends');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET name = ''AB acct venue edited'' WHERE id = %L', :'ve1')),
  1, 'an accountant can update a venue');
SELECT is((SELECT name FROM public."Venues" WHERE id = :'ve1'), 'AB acct venue edited',
  '...and the venue is changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET deleted = true WHERE id = %L', :'ve1')),
  1, 'an accountant can soft-delete a venue');
SELECT is((SELECT deleted FROM public."Venues" WHERE id = :'ve1'), true,
  '...and the row still exists, marked deleted');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Venues" WHERE id = %L', :'ve1')),
  0, 'an accountant cannot hard-delete a venue');

-- ═══ THE ACCOUNTANT: addresses (D1 option B) ═════════════════════════════════

SELECT lives_ok(
  format('INSERT INTO public."Addresses" (id, street, city, state_province) VALUES (%L, ''9 New St'', ''Cardville'', ''ON'') ON CONFLICT (id) DO UPDATE SET street = EXCLUDED.street', :'ad1'),
  'an accountant can create an address, in the upsert form the connector sends');
-- The window of D4: the connector sends the same upsert again when the reply to the first was lost.
-- Now it is a conflict, the UPDATE path runs, and nothing points at the address yet.
SELECT lives_ok(
  format('INSERT INTO public."Addresses" (id, street, city, state_province) VALUES (%L, ''9 New St'', ''Cardville'', ''ON'') ON CONFLICT (id) DO UPDATE SET street = EXCLUDED.street', :'ad1'),
  'an accountant can replay that upsert before anything points at the address');

SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_billing')),
  1, 'an accountant can update a company''s billing address');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_shipping')),
  1, 'an accountant can update a company''s shipping address');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_venue')),
  1, 'an accountant can update a venue''s address');
-- D1 option B: the policy does not look at what points at the address, as for an account manager.
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_office')),
  1, 'an accountant can update a sales office''s address (the UI does not offer it)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_storage')),
  1, 'an accountant can update a storage location''s address (the UI does not offer it)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_event')),
  1, 'an accountant can update an event''s address (the UI does not offer it)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_driver')),
  1, 'an accountant can update a driver''s address (the UI does not offer it)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Edited'' WHERE id = %L', :'addr_free')),
  1, 'an accountant can update an address nothing points at');
SELECT is(
  (SELECT count(*)::int FROM public."Addresses"
    WHERE street = 'Edited'
      AND id IN (:'addr_billing', :'addr_shipping', :'addr_venue', :'addr_office', :'addr_storage',
                 :'addr_event', :'addr_driver', :'addr_free')),
  8, '...and all eight rows really changed');

SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Addresses" WHERE id = %L', :'addr_billing')),
  0, 'an accountant cannot hard-delete an address a company points at');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."Addresses" WHERE id = %L', :'addr_free')),
  0, 'an accountant cannot hard-delete an address nothing points at');
SELECT is((SELECT count(*)::int FROM public."Addresses" WHERE id IN (:'addr_billing', :'addr_free')), 2,
  '...and both rows are still there');

-- ═══ THE ACCOUNTANT: the definer triggers still run ═══════════════════════════
-- The accountant cannot write Events; the triggers are SECURITY DEFINER, so they recompute the
-- stored quote hashes of the events that use the changed contact or address all the same.

SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET first_name = ''AB hash probe'' WHERE id = %L', :'contact_target')),
  1, 'an accountant can edit a contact that a quote uses');
SELECT isnt((SELECT content_hash FROM public."Events" WHERE id = :'event'), :'hash0',
  '...and the quote''s stored content hash was recomputed');
SELECT content_hash AS hash1 FROM public."Events" WHERE id = :'event' \gset
-- addr_event was edited above ("Edited"); one more change, to a value that is not in the hash yet.
SELECT public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''Hash probe St'' WHERE id = %L', :'addr_event'));
SELECT isnt((SELECT content_hash FROM public."Events" WHERE id = :'event'), :'hash1',
  'editing the address of a quote recomputes its stored content hash too');

-- ═══ A USER WHO IS AN ACCOUNTANT AND AN ACCOUNT MANAGER ═══════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_both')::text, true);
SELECT lives_ok(
  'INSERT INTO public."Companies" (company_name) VALUES (''AB both company'')',
  'an accountant who is also an account manager can create a company');

-- ═══ NOBODY ELSE GAINED OR LOST ANYTHING ═════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_admin')::text, true);
SELECT lives_ok(
  'INSERT INTO public."Companies" (company_name) VALUES (''AB admin company'')',
  'an admin can still create a company');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_am')::text, true);
SELECT lives_ok(
  'INSERT INTO public."Contacts" (first_name) VALUES (''AB am contact'')',
  'an account manager can still create a contact');

-- An accountant whose role was switched off writes nothing.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_acct_off')::text, true);
SELECT throws_ok(
  'INSERT INTO public."Companies" (company_name) VALUES (''AB intruder'')',
  '42501', NULL, 'an inactive accountant cannot create a company');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET first_name = ''AB intruder'' WHERE id = %L', :'contact_target')),
  0, 'an inactive accountant cannot update a contact');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_norole')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."Venues" (name, address_uuid) VALUES (''AB intruder'', %L)', :'addr_free'),
  '42501', NULL, 'a user with no role cannot create a venue');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_viewer')::text, true);
SELECT throws_ok(
  'INSERT INTO public."Contacts" (first_name) VALUES (''AB intruder'')',
  '42501', NULL, 'a viewer still cannot create a contact');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Companies" SET company_name = ''AB intruder'' WHERE id = %L', :'company_target')),
  0, 'a viewer still cannot update a company');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Venues" SET name = ''AB intruder'' WHERE id = %L', :'venue_target')),
  0, 'a viewer still cannot update a venue');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_maint')::text, true);
SELECT throws_ok(
  'INSERT INTO public."Contacts" (first_name) VALUES (''AB intruder'')',
  '42501', NULL, 'a maintainer still cannot create a contact');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Companies" SET company_name = ''AB intruder'' WHERE id = %L', :'company_target')),
  0, 'a maintainer still cannot update a company');
-- The maintainer's own Addresses policy: update only an address a maintenance event points at.
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''AB intruder'' WHERE id = %L', :'addr_venue')),
  0, 'a maintainer still cannot update a venue''s address');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_dev')::text, true);
SELECT throws_ok(
  'INSERT INTO public."Companies" (company_name) VALUES (''AB intruder'')',
  '42501', NULL, 'a developer still cannot create a company');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Contacts" SET first_name = ''AB intruder'' WHERE id = %L', :'contact_target')),
  0, 'a developer still cannot update a contact');

-- A driver: no policy on the three tables, the open driver_addresses_* policies on Addresses.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_driver')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."Venues" (name, address_uuid) VALUES (''AB intruder'', %L)', :'addr_free'),
  '42501', NULL, 'a driver cannot create a venue');
SELECT lives_ok(
  'INSERT INTO public."Addresses" (street, city, state_province) VALUES (''AB driver St'', ''Cardville'', ''ON'')',
  'a driver can insert an address (driver_addresses_insert, as it is today)');
SELECT is(
  public.test_rows_affected(format('UPDATE public."Addresses" SET street = ''AB driver edit'' WHERE id = %L', :'addr_free')),
  1, 'a driver can update any address (driver_addresses_update, as it is today)');

-- ═══ THE ROWS THE REFUSED ROLES TRIED ON ARE UNCHANGED ════════════════════════

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT 1 FROM public."Companies" WHERE id = :'company_target' AND company_name = 'AB target company'
     UNION ALL
     SELECT 1 FROM public."Venues"    WHERE id = :'venue_target'   AND name = 'AB target venue'
  ) s),
  2, 'the target company and venue are unchanged after every refused write');

SELECT * FROM finish();
ROLLBACK;
