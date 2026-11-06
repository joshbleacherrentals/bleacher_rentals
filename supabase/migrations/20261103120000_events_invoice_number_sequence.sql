-- ============================================================================
-- Invoice numbers: one counter, given by the database when the event is created
-- Spec: docs/specs/invoice-number-01-assign-in-database.md
-- ============================================================================
--
-- Until now the browser asked for a random nine-digit number in a second step after the insert
-- (RPC generate_invoice_number). When that step failed, or the event came from the dashboard
-- form, or the event is older than the column, the row kept no number, and without one the
-- QuickBooks invoice cannot be created.
--
-- From here:
--   * a counter (1, 2, 3, …) hands out the numbers, one for every event;
--   * a BEFORE INSERT trigger gives a new row its number, so no code path can forget it;
--   * a BEFORE UPDATE trigger keeps a number once it is set (an old open browser tab may still try
--     to write its own);
--   * the rows that have no number are numbered once, below, in the order they were created;
--   * the old random numbers (100000000 and up) are NOT changed, and generate_invoice_number is
--     dropped (nothing calls it any more).
--
-- The column stays bigint and the unique index Events_invoice_number_key stays: it is what really
-- keeps two events from sharing a number. The zeros of "000000042" are added when the number is
-- shown or sent (spec 02), not stored.
-- ============================================================================
--
-- One explicit transaction. The Supabase CLI sends a migration file as a batch, which is not a
-- transaction block, and LOCK TABLE refuses to run outside one; the block also keeps the whole
-- change all-or-nothing when the file is run any other way (psql), so the triggers of Events can
-- never be left switched off by a failed backfill.

BEGIN;

-- 1. The counter.
CREATE SEQUENCE IF NOT EXISTS public.events_invoice_number_seq AS bigint START WITH 1 MINVALUE 1;

-- 2. The backfill. Nobody writes to Events while it runs, and the triggers are off for it: it is a
--    data fix, and must not recompute quote hashes, resync collections tasks or touch signatures.
--    (Rows reach PowerSync through the replication log, which triggers do not affect.)
LOCK TABLE public."Events" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public."Events" DISABLE TRIGGER USER;

WITH todo AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public."Events"
  WHERE invoice_number IS NULL
),
-- The free numbers from 1 upward. A number a row already holds is skipped, so the backfill can
-- never collide with one (the table has at least as many rows as numbers needed).
free AS (
  SELECT g AS num, row_number() OVER (ORDER BY g) AS rn
  FROM generate_series(1, (SELECT count(*) FROM public."Events")) AS g
  WHERE NOT EXISTS (SELECT 1 FROM public."Events" e WHERE e.invoice_number = g)
),
given AS (
  UPDATE public."Events" e
  SET invoice_number = free.num
  FROM todo
  JOIN free USING (rn)
  WHERE e.id = todo.id
  RETURNING e.invoice_number
)
-- The counter continues after the last number given (null: nothing was given, it stays at 1).
SELECT setval('public.events_invoice_number_seq', max(invoice_number)) FROM given;

ALTER TABLE public."Events" ENABLE TRIGGER USER;

-- 3. A new row gets its number.
--    Rule 1: a number brought by the insert is left alone (seed data, test fixtures).
--    Rule 2: a row with this id already exists (PowerSync sends a new row as an upsert, so it may be
--            sent again): take nothing from the counter; the keep trigger below protects the
--            stored number.
--    Rule 3: otherwise take the next number, skipping any a hand-made row already holds.
--    SECURITY DEFINER so nextval works for every role that writes Events.
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate bigint;
BEGIN
  IF NEW.invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public."Events" WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := nextval('public.events_invoice_number_seq');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public."Events" WHERE invoice_number = candidate);
  END LOOP;

  NEW.invoice_number := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_assign_invoice_number ON public."Events";
CREATE TRIGGER events_assign_invoice_number
  BEFORE INSERT ON public."Events"
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_number();

-- 4. A number that is set stays. No error: an upload that is refused would be retried and could
--    block the queue; the old value is simply written back.
CREATE OR REPLACE FUNCTION public.keep_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.invoice_number := OLD.invoice_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_keep_invoice_number ON public."Events";
CREATE TRIGGER events_keep_invoice_number
  BEFORE UPDATE OF invoice_number ON public."Events"
  FOR EACH ROW
  WHEN (OLD.invoice_number IS NOT NULL AND NEW.invoice_number IS DISTINCT FROM OLD.invoice_number)
  EXECUTE FUNCTION public.keep_invoice_number();

COMMENT ON COLUMN public."Events".invoice_number IS
  'Unique invoice number from events_invoice_number_seq, given on insert and never changed (older events keep a random nine-digit number). Written with nine digits by the app.';

-- 5. The random generator is gone. An old open browser tab that still calls it gets an error, which
--    its code ignores (it writes a number only when one comes back).
DROP FUNCTION IF EXISTS public.generate_invoice_number();

COMMIT;
