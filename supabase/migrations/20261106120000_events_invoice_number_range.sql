-- ============================================================================
-- Invoice numbers: the small numbers move up by 300000000; the counter runs 300000001–999999999
-- Spec: docs/specs/invoice-number-03-start-at-300000001.md
-- ============================================================================
--
-- Migration 20261103120000 numbered the events that had no number 1, 2, 3, … and every event
-- created since took the next number of the same counter. From here:
--   * every event whose number has four digits or fewer (1 to 9999) and that has no QuickBooks
--     invoice linked by the app (qbo_invoice_id is empty) gets 300000000 added: 1 → 300000001,
--     43 → 300000043. The rows are taken from the smallest number to the largest; a target that any
--     row already holds (an old random number, or a row renumbered a moment ago) is raised by one
--     until it is free;
--   * the counter runs from 300000001 to 999999999 and stops there (no wrap-around);
--   * the old random nine-digit numbers, the numbers of 10000 and up, 0, and the numbers of events
--     with a linked QuickBooks invoice are NOT changed.
--
-- The user triggers of Events are off while the numbers move: events_keep_invoice_number would write
-- the old number back (a set number never changes), and the others (quote hashes, collections task
-- sync, signatures, statuses) have nothing to react to, since only invoice_number changes.
--
-- One explicit transaction: the Supabase CLI sends a migration file as a batch, which is not a
-- transaction block, and LOCK TABLE refuses to run outside one; the block also keeps the change
-- all-or-nothing, so the triggers of Events can never be left switched off by a failure.

BEGIN;

LOCK TABLE public."Events" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public."Events" DISABLE TRIGGER USER;

DO $$
DECLARE
  r           record;
  candidate   bigint;
  last_given  bigint;
  renumbered  integer := 0;
  kept        integer;
BEGIN
  -- 1. The small numbers, from the smallest to the largest. The loop gives each row the first number
  --    from (old + 300000000) upward that no row holds. A row renumbered earlier already holds its
  --    new number, so it counts as taken. (At most 9999 rows move and each skips only numbers other
  --    rows hold, so the numbers stay far below 999999999.)
  FOR r IN
    SELECT id, invoice_number
    FROM public."Events"
    WHERE invoice_number BETWEEN 1 AND 9999
      AND qbo_invoice_id IS NULL
    ORDER BY invoice_number
  LOOP
    candidate := r.invoice_number + 300000000;
    WHILE EXISTS (SELECT 1 FROM public."Events" WHERE invoice_number = candidate) LOOP
      candidate := candidate + 1;
    END LOOP;

    UPDATE public."Events" SET invoice_number = candidate WHERE id = r.id;
    renumbered := renumbered + 1;
    last_given := candidate;
  END LOOP;

  -- 2. The counter. MINVALUE alone fails while the old start value is below it, so all four are set
  --    in one statement.
  ALTER SEQUENCE public.events_invoice_number_seq
    MINVALUE 300000001 MAXVALUE 999999999 START WITH 300000001 RESTART WITH 300000001 NO CYCLE;

  -- The counter continues after the last number given; with none given (an empty table, as in CI) the
  -- next number is 300000001.
  IF last_given IS NOT NULL THEN
    PERFORM setval('public.events_invoice_number_seq', last_given);
  END IF;

  -- 3. The rows left alone because of a linked QuickBooks invoice, for the deploy log.
  SELECT count(*) INTO kept
  FROM public."Events"
  WHERE invoice_number BETWEEN 1 AND 9999
    AND qbo_invoice_id IS NOT NULL;

  RAISE NOTICE 'invoice numbers: % renumbered, % kept (linked QuickBooks invoice)', renumbered, kept;
END
$$;

ALTER TABLE public."Events" ENABLE TRIGGER USER;

COMMENT ON COLUMN public."Events".invoice_number IS
  'Unique invoice number from events_invoice_number_seq (300000001–999999999), given on insert and never changed; older events keep their number. Written with nine digits by the app.';

COMMIT;
