-- ============================================================================
-- Tests for who may make the two writes the Dashboard's event panel still has:
-- the bleacher + / – (BleacherEvents) and the colour slider (Events.hsl_hue)
-- Spec: docs/specs/dashboard-events-read-only.md (D1, D5, D9)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/dashboard_event_panel_writes.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end. No migration is involved: the
-- policies already existed, but the Dashboard's event panel is now a view whose only writes are
-- these two, written the moment the user clicks. The panel hides + / – for people who may not use
-- them (D9) and the client checks `canEditEvent` (D5); this file pins what the DATABASE refuses,
-- which is what actually decides.
--
-- What it pins down, one named assertion per role:
--   * + (INSERT into BleacherEvents): an admin and an account manager can; an accountant, a viewer,
--     a maintainer, a driver, a developer and a user with no role are refused (42501);
--   * – (DELETE from BleacherEvents): same split. A DELETE that RLS filters out does not raise, so
--     every refusal is also checked by reading the row afterwards as the table owner;
--   * the colour (UPDATE of Events.hsl_hue): an admin and an account manager can; a viewer, a
--     maintainer, a driver, a developer and a user with no role change nothing. (An accountant may
--     update Events for payments and invoices, but has no Dashboard, so it is not asserted here.)
--
-- Not covered here, on purpose: an account manager can write ANY event's bleachers at the database
-- (the "own events only" rule of D5 is the client's, as it always was for Update).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(38);

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

-- A fresh Event with a known colour.
CREATE FUNCTION public.test_new_event(label text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, hsl_hue)
  VALUES ('Panel writes probe ' || label, '2026-07-01', '2026-07-02', false, false, 100)
  RETURNING id;
$$;

-- What the tables really hold, read with the owner's rights, so a refused role can be checked.
CREATE FUNCTION public.test_link_exists(link uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public."BleacherEvents" WHERE id = link);
$$;
CREATE FUNCTION public.test_event_hue(ev uuid) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT hsl_hue::int FROM public."Events" WHERE id = ev;
$$;

-- ── Fixtures: one user per role ─────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'admin', 'dpw_admin@test.com', 'clerk_dpw_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'am', 'dpw_am@test.com', 'clerk_dpw_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct', 'dpw_acct@test.com', 'clerk_dpw_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'viewer', 'dpw_viewer@test.com', 'clerk_dpw_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'maint', 'dpw_maint@test.com', 'clerk_dpw_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'driver', 'dpw_driver@test.com', 'clerk_dpw_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'dev', 'dpw_dev@test.com', 'clerk_dpw_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'norole', 'dpw_norole@test.com', 'clerk_dpw_norole', false, false);

INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9981, 10, 100) RETURNING id AS bleacher \gset

-- Every role gets its own event, so no scenario touches another's row. Seeded as the table owner.
SELECT public.test_new_event('admin')  AS ev_admin  \gset
SELECT public.test_new_event('am')     AS ev_am     \gset
SELECT public.test_new_event('acct')   AS ev_acct   \gset
SELECT public.test_new_event('viewer') AS ev_viewer \gset
SELECT public.test_new_event('maint')  AS ev_maint  \gset
SELECT public.test_new_event('driver') AS ev_driver \gset
SELECT public.test_new_event('dev')    AS ev_dev    \gset
SELECT public.test_new_event('norole') AS ev_norole \gset

-- One existing link per role: the target of every – below.
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_admin',  :'bleacher') RETURNING id AS link_admin  \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_am',     :'bleacher') RETURNING id AS link_am     \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_acct',   :'bleacher') RETURNING id AS link_acct   \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_viewer', :'bleacher') RETURNING id AS link_viewer \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_maint',  :'bleacher') RETURNING id AS link_maint  \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_driver', :'bleacher') RETURNING id AS link_driver \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_dev',    :'bleacher') RETURNING id AS link_dev    \gset
INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (:'ev_norole', :'bleacher') RETURNING id AS link_norole \gset

-- A second bleacher for the + to put on the events.
INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
VALUES (9982, 10, 100) RETURNING id AS bleacher2 \gset

SET LOCAL ROLE authenticated;

-- ═══ + : put an event on a bleacher ═════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_admin')::text, true);
SELECT lives_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_admin', :'bleacher2'),
  'an admin can put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_am')::text, true);
SELECT lives_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_am', :'bleacher2'),
  'an account manager can put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_acct')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_acct', :'bleacher2'),
  '42501', NULL, 'an accountant cannot put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_viewer')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_viewer', :'bleacher2'),
  '42501', NULL, 'a viewer cannot put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_maint')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_maint', :'bleacher2'),
  '42501', NULL, 'a maintainer cannot put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_driver')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_driver', :'bleacher2'),
  '42501', NULL, 'a driver cannot put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_dev')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_dev', :'bleacher2'),
  '42501', NULL, 'a developer cannot put an event on a bleacher');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_norole')::text, true);
SELECT throws_ok(
  format('INSERT INTO public."BleacherEvents" (event_uuid, bleacher_uuid) VALUES (%L, %L)', :'ev_norole', :'bleacher2'),
  '42501', NULL, 'a user with no role cannot put an event on a bleacher');

-- ═══ – : take an event off a bleacher ═══════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_admin')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_admin')), 1,
  'an admin can take an event off a bleacher');
SELECT ok(NOT public.test_link_exists(:'link_admin'), '...and the link is gone (an admin)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_am')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_am')), 1,
  'an account manager can take an event off a bleacher');
SELECT ok(NOT public.test_link_exists(:'link_am'), '...and the link is gone (an account manager)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_acct')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_acct')), 0,
  'an accountant cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_acct'), '...and the link is still there (an accountant)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_viewer')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_viewer')), 0,
  'a viewer cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_viewer'), '...and the link is still there (a viewer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_maint')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_maint')), 0,
  'a maintainer cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_maint'), '...and the link is still there (a maintainer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_driver')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_driver')), 0,
  'a driver cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_driver'), '...and the link is still there (a driver)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_dev')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_dev')), 0,
  'a developer cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_dev'), '...and the link is still there (a developer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_norole')::text, true);
SELECT is(public.test_rows_affected(format('DELETE FROM public."BleacherEvents" WHERE id = %L', :'link_norole')), 0,
  'a user with no role cannot take an event off a bleacher');
SELECT ok(public.test_link_exists(:'link_norole'), '...and the link is still there (a user with no role)');

-- ═══ colour: Events.hsl_hue ═════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_admin')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_admin')), 1,
  'an admin can change an event''s colour');
SELECT is(public.test_event_hue(:'ev_admin'), 200, '...and the colour is saved (an admin)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_am')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_am')), 1,
  'an account manager can change an event''s colour');
SELECT is(public.test_event_hue(:'ev_am'), 200, '...and the colour is saved (an account manager)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_viewer')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_viewer')), 0,
  'a viewer cannot change an event''s colour');
SELECT is(public.test_event_hue(:'ev_viewer'), 100, '...and the colour is unchanged (a viewer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_maint')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_maint')), 0,
  'a maintainer cannot change an event''s colour');
SELECT is(public.test_event_hue(:'ev_maint'), 100, '...and the colour is unchanged (a maintainer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_driver')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_driver')), 0,
  'a driver cannot change an event''s colour');
SELECT is(public.test_event_hue(:'ev_driver'), 100, '...and the colour is unchanged (a driver)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_dev')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_dev')), 0,
  'a developer cannot change an event''s colour');
SELECT is(public.test_event_hue(:'ev_dev'), 100, '...and the colour is unchanged (a developer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dpw_norole')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."Events" SET hsl_hue = 200 WHERE id = %L', :'ev_norole')), 0,
  'a user with no role cannot change an event''s colour');
SELECT is(public.test_event_hue(:'ev_norole'), 100, '...and the colour is unchanged (a user with no role)');

SELECT * FROM finish();
ROLLBACK;
