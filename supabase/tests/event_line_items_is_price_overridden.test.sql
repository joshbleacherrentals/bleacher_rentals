-- ============================================================================
-- Tests for EventLineItems.is_price_overridden — whether a line's price was typed by hand
-- Migration: 20261013140000_event_line_items_is_price_overridden.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/event_line_items_is_price_overridden.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the column exists as a NOT NULL boolean defaulting to true, so every line that already
--     existed — and every new one that does not say otherwise — keeps its price;
--   * PostgREST, which is how the PowerSync connector uploads, stores the integer 0/1 the app
--     writes as false/true (json_populate_record is the conversion it uses);
--   * flipping the flag alone changes neither content_hash nor contract_hash, so it can never
--     invalidate a customer's signature — with a control showing the hashes do move when the
--     price moves.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(8);

SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'EventLineItems' AND column_name = 'is_price_overridden'),
  'boolean', 'EventLineItems.is_price_overridden is a boolean');

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'EventLineItems' AND column_name = 'is_price_overridden'),
  'NO', '...and cannot be null');

SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'EventLineItems' AND column_name = 'is_price_overridden'),
  'true', '...and defaults to true');

INSERT INTO public."Events" (event_name, event_start, event_end, lenient)
VALUES ('Price flag test', '2026-01-01', '2026-01-02', false)
RETURNING id AS event_id \gset

INSERT INTO public."EventLineItems" (event_uuid, header, currency, value_cents, quantity)
VALUES (:'event_id', 'Typed by hand', 'USD', 540000, 2)
RETURNING id AS line_id \gset
SELECT is(
  (SELECT is_price_overridden FROM public."EventLineItems" WHERE id = :'line_id'), true,
  'a line saved with a price but no flag keeps that price: it is overridden, not matrix-following');

-- ═══ THE VALUE THE APP UPLOADS ═══════════════════════════════════════════════
-- PowerSync holds booleans as 0/1 and uploads them as JSON integers.

SELECT is(
  (json_populate_record(null::public."EventLineItems", '{"is_price_overridden": 1}'::json)).is_price_overridden,
  true, 'the integer 1, as the app uploads it, is stored as true');
SELECT is(
  (json_populate_record(null::public."EventLineItems", '{"is_price_overridden": 0}'::json)).is_price_overridden,
  false, 'the integer 0 is stored as false');

-- ═══ SIGNATURES ═════════════════════════════════════════════════════════════
-- A signature is invalidated when contract_hash moves, so the flag must stay out of both hashes.

CREATE TEMP TABLE hashes_before AS
  SELECT content_hash, contract_hash FROM public."Events" WHERE id = :'event_id';

UPDATE public."EventLineItems" SET is_price_overridden = false WHERE id = :'line_id';
SELECT is(
  (SELECT count(*)::int FROM public."Events" e JOIN hashes_before h
     ON e.content_hash IS NOT DISTINCT FROM h.content_hash
    AND e.contract_hash IS NOT DISTINCT FROM h.contract_hash
   WHERE e.id = :'event_id'),
  1, 'flipping is_price_overridden alone changes neither content_hash nor contract_hash');

UPDATE public."EventLineItems" SET value_cents = 180000 WHERE id = :'line_id';
SELECT is(
  (SELECT count(*)::int FROM public."Events" e JOIN hashes_before h
     ON e.contract_hash IS NOT DISTINCT FROM h.contract_hash
   WHERE e.id = :'event_id'),
  0, '...whereas changing the price does move contract_hash, so that check is not vacuous');

SELECT * FROM finish();
ROLLBACK;
