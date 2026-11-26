-- ============================================================================
-- Vendors page: Vendors.type and the maintainer's rights on a vendor's address
-- Migration: 20261127120000_vendors_type_and_vendor_addresses.sql
-- Spec:      docs/specs/vendors-page.md (section 6.2, T1 to T7)
-- ============================================================================
--   npx supabase test db
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * T1 to T3: the enum, the NOT NULL DEFAULT 'driver' column, an insert with no type;
--   * T4 to T6: a maintainer changes an address a vendor (or a repair) points at, and still
--     cannot touch a customer's address; a delete of a pointed-at address reaches the
--     foreign key, not the policy;
--   * T7: nobody else's rights changed on Vendors and Addresses.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(26);

-- ── Fixtures (as postgres, bypassing RLS) ────────────────────────────────────
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('VT', 'Admin', 'vt_admin@test.com', 'clerk_vt_admin', true, false);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('VT', 'Viewer', 'vt_viewer@test.com', 'clerk_vt_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('VT', 'Am', 'vt_am@test.com', 'clerk_vt_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('VT', 'Accountant', 'vt_acc@test.com', 'clerk_vt_acc', false, false)
RETURNING id AS user_acc \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acc', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('VT', 'Maintainer', 'vt_maint@test.com', 'clerk_vt_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- A vendor with an address, a repair with an address, and a customer's address on an event.
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Vendor Way', 'Dallas', 'TX')
RETURNING id AS vendor_address \gset
INSERT INTO public."Vendors" (display_name, address_uuid) VALUES ('VT vendor with address', :'vendor_address')
RETURNING id AS vendor_with_address \gset

INSERT INTO public."Addresses" (street, city, state_province) VALUES ('2 Repair Rd', 'Simcoe', 'ON')
RETURNING id AS repair_address \gset
INSERT INTO public."MaintenanceEvents" (event_name, event_start, event_end, address_uuid)
VALUES ('VT repair', now(), now(), :'repair_address');

INSERT INTO public."Addresses" (street, city, state_province) VALUES ('3 Customer Way', 'Tampa', 'FL')
RETURNING id AS customer_address \gset
INSERT INTO public."Events" (event_name, event_start, event_end, lenient, address_uuid)
VALUES ('VT customer event', now(), now(), false, :'customer_address');

INSERT INTO public."Vendors" (display_name) VALUES ('VT vendor for update') RETURNING id AS vendor_for_update \gset

-- ── T1: the enum ─────────────────────────────────────────────────────────────
SELECT is(
  (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
    WHERE enumtypid = 'public.vendor_type'::regtype),
  ARRAY['driver','repairs'],
  'T1 vendor_type has driver and repairs, in that order'
);

-- ── T2: the column ───────────────────────────────────────────────────────────
SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Vendors' AND column_name = 'type'),
  'NO',
  'T2 Vendors.type is NOT NULL'
);
SELECT matches(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Vendors' AND column_name = 'type'),
  '^''driver''',
  'T2 Vendors.type defaults to driver'
);
SELECT is(
  (SELECT count(*)::int FROM public."Vendors" WHERE type <> 'driver'),
  0,
  'T2 every vendor that exists before the page is a driver vendor'
);

-- ── T3: an insert with no type, with repairs, with nonsense ─────────────────
INSERT INTO public."Vendors" (display_name) VALUES ('VT no type') RETURNING type::text AS no_type \gset
SELECT is(:'no_type'::text, 'driver'::text, 'T3 an insert with no type stores driver');
SELECT lives_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT repairs vendor', 'repairs')$$,
  'T3 an insert of repairs works'
);
SELECT throws_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT bad type', 'foo')$$,
  '22P02',
  NULL,
  'T3 an insert of any other text fails'
);

-- ── T4 to T6: a maintainer and addresses ─────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_vt_maint')::text, true);

-- T4: the address a vendor points at can be changed
SELECT lives_ok(
  format($$UPDATE public."Addresses" SET street = '10 Vendor Way' WHERE id = %L$$, :'vendor_address'),
  'T4 a maintainer can update the address of a vendor'
);
SELECT is((SELECT street FROM public."Addresses" WHERE id = :'vendor_address'), '10 Vendor Way',
  'T4 the update landed (not silently filtered out by RLS)');

-- T5: a customer's address cannot
UPDATE public."Addresses" SET street = 'hijacked' WHERE id = :'customer_address';
SELECT is((SELECT street FROM public."Addresses" WHERE id = :'customer_address'), '3 Customer Way',
  'T5 a maintainer cannot update an address that no repair and no vendor points at');

-- T6: a delete of a pointed-at address passes the policy and meets the foreign key (23503);
-- a customer's address is filtered out by the policy, so nothing is deleted.
SELECT throws_ok(
  format($$DELETE FROM public."Addresses" WHERE id = %L$$, :'vendor_address'),
  '23503',
  NULL,
  'T6 a delete of a vendor address reaches the foreign key, not the policy'
);
SELECT throws_ok(
  format($$DELETE FROM public."Addresses" WHERE id = %L$$, :'repair_address'),
  '23503',
  NULL,
  'T6 a delete of a repair address still reaches the foreign key (D3 keeps it)'
);
DELETE FROM public."Addresses" WHERE id = :'customer_address';
SELECT is((SELECT count(*)::int FROM public."Addresses" WHERE id = :'customer_address'), 1,
  'T6 a delete of a customer address removes nothing');
SELECT lives_ok(
  format($$UPDATE public."Addresses" SET street = '20 Repair Rd' WHERE id = %L$$, :'repair_address'),
  'T6 a maintainer can still update the address of a repair'
);
SELECT is((SELECT street FROM public."Addresses" WHERE id = :'repair_address'), '20 Repair Rd',
  'T6 and that update landed');

-- ── T7: nobody else's rights changed ────────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_vt_admin')::text, true);
SELECT lives_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT by admin', 'repairs')$$,
  'T7 an admin still inserts a vendor'
);
SELECT lives_ok(
  $$INSERT INTO public."Addresses" (street, city, state_province) VALUES ('7 Admin St', 'X', 'TX')$$,
  'T7 an admin still inserts an address'
);
UPDATE public."Vendors" SET display_name = 'VT updated by admin' WHERE id = :'vendor_for_update';
SELECT is((SELECT display_name FROM public."Vendors" WHERE id = :'vendor_for_update'), 'VT updated by admin',
  'T7 an admin still updates a vendor');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_vt_am')::text, true);
SELECT lives_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT by am', 'repairs')$$,
  'T7 an account manager still inserts a vendor'
);
SELECT lives_ok(
  $$INSERT INTO public."Addresses" (street, city, state_province) VALUES ('7 Am St', 'X', 'TX')$$,
  'T7 an account manager still inserts an address'
);
UPDATE public."Vendors" SET display_name = 'VT updated by am' WHERE id = :'vendor_for_update';
SELECT is((SELECT display_name FROM public."Vendors" WHERE id = :'vendor_for_update'), 'VT updated by am',
  'T7 an account manager still updates a vendor');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_vt_acc')::text, true);
SELECT lives_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT by accountant', 'driver')$$,
  'T7 an accountant still inserts a vendor'
);
SELECT lives_ok(
  $$INSERT INTO public."Addresses" (street, city, state_province) VALUES ('7 Acc St', 'X', 'TX')$$,
  'T7 an accountant still inserts an address'
);
UPDATE public."Vendors" SET display_name = 'VT updated by accountant' WHERE id = :'vendor_for_update';
SELECT is((SELECT display_name FROM public."Vendors" WHERE id = :'vendor_for_update'), 'VT updated by accountant',
  'T7 an accountant still updates a vendor');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_vt_viewer')::text, true);
SELECT throws_ok(
  $$INSERT INTO public."Vendors" (display_name, type) VALUES ('VT by viewer', 'driver')$$,
  '42501',
  NULL,
  'T7 a viewer still cannot insert a vendor'
);
UPDATE public."Vendors" SET display_name = 'VT by viewer' WHERE id = :'vendor_for_update';
RESET ROLE;
SELECT is((SELECT display_name FROM public."Vendors" WHERE id = :'vendor_for_update'), 'VT updated by accountant',
  'T7 a viewer still cannot update a vendor');

SELECT * FROM finish();

ROLLBACK;
