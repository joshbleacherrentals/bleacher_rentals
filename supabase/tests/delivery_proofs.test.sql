-- ============================================================================
-- Tests for GPS proof of delivery
-- Migration: 20261125210000_delivery_proofs.sql
-- ============================================================================
--   npx supabase test db supabase/tests/delivery_proofs.test.sql
--
-- What it pins down:
--   * admins, account managers, viewers and accountants READ the proofs (they open work
--     trackers); maintainers do not;
--   * nobody writes them from the app: only the cron, with the service role (no write policy);
--   * one proof per work tracker, and it goes with its work tracker.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(11);

CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dp', 'Admin', 'dp_admin@test.com', 'clerk_dp_admin', true, false);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dp', 'AM', 'dp_am@test.com', 'clerk_dp_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dp', 'Viewer', 'dp_viewer@test.com', 'clerk_dp_viewer', false, true);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dp', 'Acct', 'dp_acct@test.com', 'clerk_dp_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Dp', 'Maint', 'dp_maint@test.com', 'clerk_dp_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."WorkTrackers" (id, status, completed_at)
VALUES ('00000000-0000-0000-0000-0000000f0001', 'completed', now() - interval '5 hours');
INSERT INTO public."DeliveryProofs" (work_tracker_uuid, status, final, distance_meters)
VALUES ('00000000-0000-0000-0000-0000000f0001', 'verified', true, 80);

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dp_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 1, 'an admin reads proofs');
SELECT is(public.test_rows_affected($$
  UPDATE public."DeliveryProofs" SET status = 'not_found'
  WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'
$$), 0, 'not even an admin changes a proof from the app');
SELECT throws_ok($$
  INSERT INTO public."DeliveryProofs" (work_tracker_uuid, status) VALUES (gen_random_uuid(), 'verified')
$$, '42501', NULL, 'nobody inserts a proof from the app');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dp_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 1, 'an account manager reads proofs');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dp_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 1, 'a viewer reads proofs');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dp_acct')::text, true);
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 1, 'an accountant reads proofs');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dp_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 0, 'a maintainer does not');

RESET ROLE;

SELECT is((SELECT status FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 'verified',
  'the refused update left the proof as it was');
SELECT throws_ok($$
  INSERT INTO public."DeliveryProofs" (work_tracker_uuid, status)
  VALUES ('00000000-0000-0000-0000-0000000f0001', 'waiting')
$$, '23505', NULL, 'one proof per work tracker');
SELECT throws_ok($$
  INSERT INTO public."DeliveryProofs" (work_tracker_uuid, status)
  VALUES (gen_random_uuid(), 'maybe')
$$, '23514', NULL, 'only the known statuses');
DELETE FROM public."WorkTrackers" WHERE id = '00000000-0000-0000-0000-0000000f0001';
SELECT is((SELECT count(*)::int FROM public."DeliveryProofs"
           WHERE work_tracker_uuid = '00000000-0000-0000-0000-0000000f0001'), 0,
  'a proof goes with its work tracker');

SELECT * FROM finish();
ROLLBACK;
