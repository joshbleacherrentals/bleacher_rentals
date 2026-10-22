-- =============================================================
-- Events.quote_sent_at: when the quote first left `draft`
--
-- The scorecard (Number / Value of Quotes Sent) used created_at, which is when
-- the event was created, not when the quote was sent. This column is stamped
-- once, the first time event_status is anything other than `draft`, and never
-- touched again (so draft -> quoted -> booked -> ... keeps the original value).
-- =============================================================

ALTER TABLE public."Events"
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz NULL;

-- Backfill: best available approximation is created_at for already-sent events.
UPDATE public."Events"
SET quote_sent_at = created_at
WHERE quote_sent_at IS NULL
  AND event_status IS DISTINCT FROM 'draft'::public.event_status;

CREATE OR REPLACE FUNCTION public.trg_set_quote_sent_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quote_sent_at IS NULL
     AND NEW.event_status IS DISTINCT FROM 'draft'::public.event_status THEN
    NEW.quote_sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_quote_sent_at ON public."Events";
CREATE TRIGGER set_quote_sent_at
  BEFORE INSERT OR UPDATE OF event_status ON public."Events"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_quote_sent_at();
