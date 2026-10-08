-- ============================================================================
-- Tests for Events.is_tax_overridden — whether a quote's tax was typed by hand
-- Migration: 20261008130000_events_is_tax_overridden.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/events_is_tax_overridden.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the column exists as a NOT NULL boolean defaulting to false, so every quote that already
--     existed — and every new one that does not say otherwise — has automatic tax;
--   * PostgREST, which is how the PowerSync connector uploads, stores the integer 0/1 the app
--     writes as false/true (json_populate_record is the conversion it uses);
--   * flipping the flag alone changes neither content_hash nor contract_hash, so it can never
--     invalidate a customer's signature — with a control showing the hashes do move when the tax
--     amount moves;
--   * an admin and an account manager can change it, an accountant is refused by the column guard
--     (42501) and a viewer by RLS, and the row is unchanged afterwards.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(13);

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

SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'is_tax_overridden'),
  'boolean', 'Events.is_tax_overridden is a boolean');

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'is_tax_overridden'),
  'NO', '...and cannot be null');

SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'is_tax_overridden'),
  'false', '...and defaults to false');

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, tax_amount_cents)
VALUES ('Tax flag test', '2026-01-01', '2026-01-02', false, 12345)
RETURNING id AS event_id \gset
SELECT is(
  (SELECT is_tax_overridden FROM public."Events" WHERE id = :'event_id'), false,
  'a quote saved with a tax amount but no flag is automatic, not overridden');

-- ═══ THE VALUE THE APP UPLOADS ═══════════════════════════════════════════════
-- PowerSync holds booleans as 0/1 and uploads them as JSON integers.

SELECT is(
  (json_populate_record(null::public."Events", '{"is_tax_overridden": 1}'::json)).is_tax_overridden,
  true, 'the integer 1, as the app uploads it, is stored as true');
SELECT is(
  (json_populate_record(null::public."Events", '{"is_tax_overridden": 0}'::json)).is_tax_overridden,
  false, 'the integer 0 is stored as false');

-- ═══ SIGNATURES ═════════════════════════════════════════════════════════════
-- A signature is invalidated when contract_hash moves, so the flag must stay out of both hashes.

CREATE TEMP TABLE hashes_before AS
  SELECT content_hash, contract_hash FROM public."Events" WHERE id = :'event_id';

UPDATE public."Events" SET is_tax_overridden = true WHERE id = :'event_id';
SELECT is(
  (SELECT count(*)::int FROM public."Events" e JOIN hashes_before h
     ON e.content_hash IS NOT DISTINCT FROM h.content_hash
    AND e.contract_hash IS NOT DISTINCT FROM h.contract_hash
   WHERE e.id = :'event_id'),
  1, 'flipping is_tax_overridden alone changes neither content_hash nor contract_hash');

UPDATE public."Events" SET tax_amount_cents = 99999 WHERE id = :'event_id';
SELECT is(
  (SELECT count(*)::int FROM public."Events" e JOIN hashes_before h
     ON e.content_hash IS NOT DISTINCT FROM h.content_hash
   WHERE e.id = :'event_id'),
  0, '...whereas changing the tax amount does move content_hash, so that check is not vacuous');

UPDATE public."Events" SET is_tax_overridden = false WHERE id = :'event_id';

-- ═══ WHO CAN CHANGE IT ══════════════════════════════════════════════════════

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tax', 'Admin', 'tax_admin@test.com', 'clerk_tax_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tax', 'AM', 'tax_am@test.com', 'clerk_tax_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tax', 'Acct', 'tax_acct@test.com', 'clerk_tax_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tax', 'Viewer', 'tax_viewer@test.com', 'clerk_tax_viewer', false, true);

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tax_admin')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_tax_overridden = true WHERE id = %L', :'event_id')),
  1, 'an admin can change is_tax_overridden');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tax_am')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_tax_overridden = false WHERE id = %L', :'event_id')),
  1, 'an account manager can change it — this is the path every quote save takes');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tax_acct')::text, true);
SELECT throws_ok(
  format('UPDATE public."Events" SET is_tax_overridden = true WHERE id = %L', :'event_id'),
  '42501', NULL, 'an accountant is refused by the Events column guard');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tax_viewer')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."Events" SET is_tax_overridden = true WHERE id = %L', :'event_id')),
  0, 'a viewer changes no row');

RESET ROLE;

SELECT is(
  (SELECT is_tax_overridden FROM public."Events" WHERE id = :'event_id'), false,
  'the flag is unchanged after the refused attempts');

SELECT * FROM finish();
ROLLBACK;
