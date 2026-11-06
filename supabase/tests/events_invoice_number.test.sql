-- ============================================================================
-- Tests for the invoice number counter and its triggers on Events
-- Migration: 20261103120000_events_invoice_number_sequence.sql
-- Spec:      docs/specs/invoice-number-01-assign-in-database.md (§3, §7)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/events_invoice_number.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end. A sequence is not rolled back
-- with the rows, so the test saves the counter's state first and puts it back before it finishes:
-- run it on a local or CI database, not on one other people are writing to.
--
-- What it pins down:
--   * the counter and the two triggers exist; the random generator is gone;
--   * an insert without a number gets the next one, and two inserts get consecutive numbers;
--   * an insert that brings its own number keeps it, and the counter skips a number a hand-made
--     row already holds (rule 3);
--   * a repeated upload of an existing id (INSERT … ON CONFLICT DO UPDATE) takes nothing from the
--     counter and leaves the stored number as it was (rule 2);
--   * a stored number cannot be changed or cleared by an update, but a row whose number is null
--     may be given one;
--   * the unique index still refuses a duplicate inserted by hand.
-- The one-time backfill of the rows that had no number is checked by a dry run (the spec, §7),
-- not here: after the migration there is no row left for it to number.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(15);

-- The counter's state, to put back at the end.
CREATE TEMP TABLE seq_before AS
  SELECT last_value, is_called FROM public.events_invoice_number_seq;

-- ═══ THE PIECES ═════════════════════════════════════════════════════════════

SELECT has_sequence('public', 'events_invoice_number_seq', 'the invoice number counter exists');

SELECT hasnt_function('public', 'generate_invoice_number', ARRAY[]::text[],
  'the random number generator is gone');

SELECT has_trigger('public', 'Events', 'events_assign_invoice_number',
  'Events has the trigger that gives a new row its number');

SELECT has_trigger('public', 'Events', 'events_keep_invoice_number',
  'Events has the trigger that keeps a number once it is set');

SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.assign_invoice_number()'::regprocedure),
  true, 'the numbering function runs as its owner, so nextval works for every role');

-- ═══ A NEW ROW ══════════════════════════════════════════════════════════════

INSERT INTO public."Events" (event_name, event_start, event_end, lenient)
VALUES ('IN first', '2026-07-01', '2026-07-02', false)
RETURNING id AS ev_a \gset

INSERT INTO public."Events" (event_name, event_start, event_end, lenient)
VALUES ('IN second', '2026-07-01', '2026-07-02', false)
RETURNING id AS ev_b \gset

SELECT ok(
  (SELECT invoice_number IS NOT NULL AND invoice_number > 0
   FROM public."Events" WHERE id = :'ev_a'),
  'a row inserted without a number gets one');

SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_b'),
  (SELECT invoice_number + 1 FROM public."Events" WHERE id = :'ev_a'),
  'the next row gets the next number');

-- ═══ A NUMBER BROUGHT BY THE INSERT ═════════════════════════════════════════

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, invoice_number)
VALUES ('IN given', '2026-07-01', '2026-07-02', false, 987654321)
RETURNING id AS ev_c \gset

SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_c'),
  987654321::bigint, 'a row that brings a number keeps it');

-- The counter is moved next to a number a hand-made row holds.
SELECT setval('public.events_invoice_number_seq', 5000);

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, invoice_number)
VALUES ('IN taken', '2026-07-01', '2026-07-02', false, 5001);

INSERT INTO public."Events" (event_name, event_start, event_end, lenient)
VALUES ('IN skipped', '2026-07-01', '2026-07-02', false)
RETURNING id AS ev_d \gset

SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_d'),
  5002::bigint, 'the counter skips a number that is already held and takes the next one');

-- ═══ A REPEATED UPLOAD OF AN EXISTING ROW ═══════════════════════════════════
-- PowerSync sends a new row as an upsert, so the same id can arrive again.

SELECT last_value AS lv_before, is_called AS ic_before FROM public.events_invoice_number_seq \gset
SELECT invoice_number AS n_a_before FROM public."Events" WHERE id = :'ev_a' \gset

INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, invoice_number)
VALUES (:'ev_a', 'IN first, sent again', '2026-07-01', '2026-07-02', false, NULL)
ON CONFLICT (id) DO UPDATE
  SET event_name = EXCLUDED.event_name, invoice_number = EXCLUDED.invoice_number;

SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_a'),
  :n_a_before::bigint,
  'a repeated upload of the row leaves its stored number as it was, even with a null number in it');

SELECT is(
  (SELECT last_value = :lv_before AND is_called = (:'ic_before' = 't')
   FROM public.events_invoice_number_seq),
  true, 'a repeated upload takes nothing from the counter');

-- ═══ A NUMBER THAT IS ALREADY SET ═══════════════════════════════════════════

UPDATE public."Events" SET invoice_number = 123456789 WHERE id = :'ev_a';
SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_a'),
  :n_a_before::bigint, 'an update cannot change a stored number');

UPDATE public."Events" SET invoice_number = NULL WHERE id = :'ev_a';
SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_a'),
  :n_a_before::bigint, 'an update cannot clear a stored number');

-- A row that has no number (an old one) is made by switching the triggers off for one statement.
-- (The deferred collections trigger has events pending by now; they must run before an ALTER TABLE.)
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE public."Events" DISABLE TRIGGER USER;
UPDATE public."Events" SET invoice_number = NULL WHERE id = :'ev_b';
ALTER TABLE public."Events" ENABLE TRIGGER USER;

UPDATE public."Events" SET invoice_number = 777000777 WHERE id = :'ev_b';
SELECT is(
  (SELECT invoice_number FROM public."Events" WHERE id = :'ev_b'),
  777000777::bigint, 'a row whose number is null may be given one');

-- ═══ THE UNIQUE INDEX ═══════════════════════════════════════════════════════

SELECT throws_ok(
  format($f$INSERT INTO public."Events" (event_name, event_start, event_end, lenient, invoice_number)
            VALUES ('IN duplicate', '2026-07-01', '2026-07-02', false, %s)$f$, :n_a_before),
  '23505', NULL, 'the unique index still refuses a number held by another row');

-- Put the counter back (a sequence is not rolled back with the rows).
SELECT setval('public.events_invoice_number_seq',
              (SELECT last_value FROM seq_before), (SELECT is_called FROM seq_before));

SELECT * FROM finish();
ROLLBACK;
