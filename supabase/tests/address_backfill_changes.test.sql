-- ============================================================================
-- Tests for the Address Backfill change log
-- Migration: 20261127150000_address_backfill_changes.sql
-- ============================================================================
--   npx supabase test db supabase/tests/address_backfill_changes.test.sql
--
-- What it pins down:
--   * only administrators read, write and revert (update) the change log;
--   * an administrator can write the address and its log row (the backfill's batch), and stamp a
--     change reverted;
--   * the log goes with its address, and only knows the two sources.
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
VALUES ('Ab', 'Admin', 'ab_admin@test.com', 'clerk_ab_admin', true, false)
RETURNING id AS user_admin \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Ab', 'AM', 'ab_am@test.com', 'clerk_ab_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Ab', 'Viewer', 'ab_viewer@test.com', 'clerk_ab_viewer', false, true);

INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('00000000-0000-0000-0000-00000000ab01', '100 Hersheypark Dr', 'Hershey', 'Pennsylvania');
INSERT INTO public."AddressBackfillChanges"
  (id, run_uuid, address_uuid, source, before, after)
VALUES ('00000000-0000-0000-0000-00000000ac01', gen_random_uuid(),
        '00000000-0000-0000-0000-00000000ab01', 'google',
        '{"latitude":null,"longitude":null,"place_id":null,"country":null}',
        '{"latitude":40.28,"longitude":-76.65,"place_id":"P","country":"US"}');

SET LOCAL ROLE authenticated;

-- An administrator: reads the log, writes an address change with its log row, stamps a revert.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."AddressBackfillChanges"
           WHERE id = '00000000-0000-0000-0000-00000000ac01'), 1, 'an admin reads the log');
SELECT is(public.test_rows_affected($$
  UPDATE public."Addresses" SET latitude = 40.28, longitude = -76.65, place_id = 'P'
  WHERE id = '00000000-0000-0000-0000-00000000ab01' AND latitude IS NULL
$$), 1, 'an admin gives an address its map position');
SELECT lives_ok($$
  INSERT INTO public."AddressBackfillChanges" (run_uuid, address_uuid, source, before, after)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 'twin', '{}', '{}')
$$, 'an admin writes a log row');
SELECT is(public.test_rows_affected($$
  UPDATE public."AddressBackfillChanges" SET reverted_at = now()
  WHERE id = '00000000-0000-0000-0000-00000000ac01'
$$), 1, 'an admin stamps a change reverted');

-- An account manager and a viewer: no log at all.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."AddressBackfillChanges"), 0,
  'an account manager does not read the log');
SELECT throws_ok($$
  INSERT INTO public."AddressBackfillChanges" (run_uuid, address_uuid, source, before, after)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 'google', '{}', '{}')
$$, '42501', NULL, 'an account manager does not write the log');
SELECT is(public.test_rows_affected($$
  UPDATE public."AddressBackfillChanges" SET reverted_at = NULL
  WHERE id = '00000000-0000-0000-0000-00000000ac01'
$$), 0, 'an account manager does not revert');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ab_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."AddressBackfillChanges"), 0,
  'a viewer does not read the log');

RESET ROLE;

SELECT isnt((SELECT reverted_at FROM public."AddressBackfillChanges"
             WHERE id = '00000000-0000-0000-0000-00000000ac01'), NULL,
  'the refused un-revert left the stamp');
SELECT throws_ok($$
  INSERT INTO public."AddressBackfillChanges" (run_uuid, address_uuid, source, before, after)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 'guess', '{}', '{}')
$$, '23514', NULL, 'only twin and google');
DELETE FROM public."Addresses" WHERE id = '00000000-0000-0000-0000-00000000ab01';
SELECT is((SELECT count(*)::int FROM public."AddressBackfillChanges"
           WHERE address_uuid = '00000000-0000-0000-0000-00000000ab01'), 0,
  'the log goes with its address');

SELECT * FROM finish();
ROLLBACK;
