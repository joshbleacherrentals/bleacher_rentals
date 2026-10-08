-- ============================================================================
-- Tests for Events.is_tax_overridden — whether a quote's tax was typed by hand
-- Migration: 20261008130000_events_is_tax_overridden.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/events_is_tax_overridden.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down: the column exists as a NOT NULL boolean defaulting to false, so every quote
-- that already existed — and every new one that does not say otherwise — has automatic tax.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(4);

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

SELECT * FROM finish();
ROLLBACK;
