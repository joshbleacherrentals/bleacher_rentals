-- ============================================================================
-- Maintainer: full CRUD on Damage Reports and Maintenance Events, nothing else new
-- Migration: 20260923140000_maintainer_damage_maintenance.sql
-- Spec:      docs/specs/maintainer-damage-and-maintenance.md
-- ============================================================================
--   npx supabase test db
-- Everything runs in a transaction that is ROLLED BACK at the end.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(27);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Ainer', 'maint_dm@test.com', 'clerk_maint_dm', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- A maintainer who is ALSO a driver: the driver fence on DamageReports must not restrict them.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Maint', 'Driver', 'maint_drv@test.com', 'clerk_maint_drv', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_both', true);

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9982, 10, 100) RETURNING id AS bleacher \gset

-- Something a maintainer must NOT be able to reach: a customer-facing address on an event.
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Customer Way', 'Tampa', 'FL')
RETURNING id AS customer_address \gset
INSERT INTO public."Events" (event_name, event_start, event_end, lenient, address_uuid)
VALUES ('Customer event', now(), now(), false, :'customer_address')
RETURNING id AS customer_event \gset

SELECT count(*)::int AS ack_total FROM public."DamageReportAcknowledgements" \gset

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_dm')::text, true);

-- ── Maintenance events: create, read, edit, delete ─────────────────────────
SELECT lives_ok(
  $$INSERT INTO public."Addresses" (street, city, state_province) VALUES ('9 Shop Rd', 'Simcoe', 'ON')$$,
  'a maintainer can create the address of a repair'
);
SELECT set_config('t.repair_addr', (SELECT id::text FROM public."Addresses" WHERE street = '9 Shop Rd'), true);

SELECT lives_ok(
  format($$INSERT INTO public."MaintenanceEvents" (event_name, event_start, event_end, address_uuid)
           VALUES ('Weld', now(), now(), %L)$$, current_setting('t.repair_addr')),
  'a maintainer can create a maintenance event'
);
SELECT set_config('t.maint', (SELECT id::text FROM public."MaintenanceEvents" WHERE event_name = 'Weld'), true);

SELECT lives_ok(
  format($$INSERT INTO public."BleacherMaintEvents" (bleacher_uuid, maintenance_event_uuid) VALUES (%L, %L)$$,
         :'bleacher', current_setting('t.maint')),
  'a maintainer can link a bleacher to it'
);
SELECT is((SELECT count(*)::int FROM public."MaintenanceEvents" WHERE id = current_setting('t.maint')::uuid), 1,
  'a maintainer can read maintenance events');
SELECT is((SELECT count(*)::int FROM public."BleacherMaintEvents" WHERE maintenance_event_uuid = current_setting('t.maint')::uuid), 1,
  'a maintainer can read the bleacher links');
SELECT is((SELECT count(*)::int FROM public."Bleachers" WHERE id = :'bleacher'), 1,
  'a maintainer can read bleachers, which the forms need');

SELECT lives_ok(
  format($$UPDATE public."MaintenanceEvents" SET notes = 'done' WHERE id = %L$$, current_setting('t.maint')),
  'a maintainer can edit a maintenance event'
);
SELECT is((SELECT notes FROM public."MaintenanceEvents" WHERE id = current_setting('t.maint')::uuid), 'done',
  'the edit actually landed (not silently filtered out by RLS)');
SELECT lives_ok(
  format($$UPDATE public."Addresses" SET street = '10 Shop Rd' WHERE id = %L$$, current_setting('t.repair_addr')),
  'a maintainer can correct the address of a repair'
);
SELECT lives_ok(
  format($$INSERT INTO public."MaintenancePhotos" (maintenance_event_uuid, photo_path) VALUES (%L, 'p.jpg')$$, current_setting('t.maint')),
  'a maintainer can attach a photo to a maintenance event'
);
SELECT lives_ok(
  format($$UPDATE public."MaintenanceEvents" SET deleted = true WHERE id = %L$$, current_setting('t.maint')),
  'a maintainer can soft-delete a maintenance event'
);
SELECT lives_ok(
  format($$UPDATE public."MaintenanceEvents" SET deleted = false WHERE id = %L$$, current_setting('t.maint')),
  'and restore it'
);

-- ── Damage reports: create, read, edit, delete ─────────────────────────────
SELECT lives_ok(
  format($$INSERT INTO public."DamageReports" (bleacher_uuid, note) VALUES (%L, 'cracked seat')$$, :'bleacher'),
  'a maintainer can create a damage report'
);
SELECT set_config('t.dr', (SELECT id::text FROM public."DamageReports" WHERE note = 'cracked seat'), true);
SELECT is((SELECT count(*)::int FROM public."DamageReports" WHERE id = current_setting('t.dr')::uuid), 1,
  'a maintainer can read damage reports');
SELECT lives_ok(
  format($$INSERT INTO public."DamageReportPhotos" (damage_report_uuid, photo_path) VALUES (%L, 'd.jpg')$$, current_setting('t.dr')),
  'a maintainer can add a photo to a damage report'
);
SELECT lives_ok(
  format($$UPDATE public."DamageReports" SET note = 'cracked seat, fixed' WHERE id = %L$$, current_setting('t.dr')),
  'a maintainer can edit a damage report'
);
SELECT is((SELECT note FROM public."DamageReports" WHERE id = current_setting('t.dr')::uuid), 'cracked seat, fixed',
  'the damage report edit actually landed');
SELECT lives_ok(
  format($$UPDATE public."DamageReports" SET deleted = true WHERE id = %L$$, current_setting('t.dr')),
  'a maintainer can soft-delete a damage report'
);
SELECT lives_ok(
  format($$DELETE FROM public."DamageReportPhotos" WHERE damage_report_uuid = %L$$, current_setting('t.dr')),
  'a maintainer can remove a damage report photo row'
);
SELECT is((SELECT count(*)::int FROM public."DamageReportAcknowledgements"), :ack_total,
  'a maintainer can read every acknowledgement');

-- ── Hard delete is allowed too ("full CRUD") ───────────────────────────────
SELECT lives_ok(
  format($$DELETE FROM public."DamageReports" WHERE id = %L$$, current_setting('t.dr')),
  'a maintainer can delete a damage report');
SELECT lives_ok(
  format($$DELETE FROM public."MaintenancePhotos" WHERE maintenance_event_uuid = %L$$, current_setting('t.maint')),
  'a maintainer can delete maintenance photos');
SELECT lives_ok(
  format($$DELETE FROM public."BleacherMaintEvents" WHERE maintenance_event_uuid = %L$$, current_setting('t.maint')),
  'a maintainer can unlink bleachers from a maintenance event');
SELECT lives_ok(
  format($$DELETE FROM public."MaintenanceEvents" WHERE id = %L$$, current_setting('t.maint')),
  'a maintainer can delete a maintenance event');

-- ── What stays out of reach ────────────────────────────────────────────────
SELECT is((SELECT count(*)::int FROM public."Events" WHERE id = :'customer_event'), 0,
  'a maintainer still cannot read customer events');
UPDATE public."Addresses" SET street = 'hijacked' WHERE id = :'customer_address';
RESET ROLE;
SELECT is((SELECT street FROM public."Addresses" WHERE id = :'customer_address'), '1 Customer Way',
  'a maintainer cannot edit an address that is not a repair''s');

-- ── Maintainer + driver: the driver fence must not restrict a maintainer ──
INSERT INTO public."DamageReports" (bleacher_uuid, note) VALUES (:'bleacher', 'both roles')
RETURNING id AS dr_both \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_maint_drv')::text, true);
SELECT lives_ok(
  format($$UPDATE public."DamageReports" SET note = 'edited by maintainer-driver' WHERE id = %L$$, :'dr_both'),
  'someone who is both maintainer and driver can edit more than the "fixed" columns'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
