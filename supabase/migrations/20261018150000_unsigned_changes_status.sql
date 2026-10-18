-- =============================================================
-- Status `unsigned_changes`: a signed quote whose contract was edited
--
-- Lifecycle (UI labels): draft = New, quoted = Quote Sent, booked = Signed,
-- unsigned_changes = Unsigned Changes, lost = Lost.
--
-- A booked quote whose contract terms change has a signature that no longer
-- describes the current terms. That already invalidates the signature
-- (20260812120000_invalidate_signature_on_contract_change.sql). Now the same
-- moment also moves the event from `booked` to `unsigned_changes`. From there it
-- never goes back to `quoted`: it becomes `booked` again when the client signs
-- (or someone overrides it by hand), or `lost`.
--
-- The change lives in the signature-invalidation trigger, like the hash it
-- follows, so every write path (PowerSync uploads, direct Supabase writes,
-- server routes) gets it.
--
-- `unsigned_changes` is only named inside the function body, which Postgres
-- reads when the function runs, never when it is created. The new enum value
-- cannot be used in the transaction that adds it, so nothing here uses it
-- directly: no UPDATE, no trigger WHEN clause.
-- =============================================================

ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'unsigned_changes';

CREATE OR REPLACE FUNCTION public.trg_invalidate_signature_on_contract_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invalidated integer;
BEGIN
  -- Only signatures whose snapshot disagrees with the new terms. Restricting
  -- to status='active' also makes this idempotent: an already-invalidated row
  -- is never touched again, so its original invalidated_at survives.
  WITH invalidated AS (
    UPDATE public."ContractSignatures"
    SET status = 'invalidated',
        invalidated_at = now()
    WHERE event_uuid = NEW.id
      AND status = 'active'
      AND signed_contract_hash IS DISTINCT FROM NEW.contract_hash
    RETURNING 1
  )
  SELECT count(*) INTO v_invalidated FROM invalidated;

  -- The signed contract just lost its standing: a booked event now has
  -- unsigned changes. Only `booked` moves; a quote still being sent, a lost
  -- one, or one already in `unsigned_changes` keeps its status. The write
  -- leaves contract_hash alone, so this trigger does not fire a second time.
  IF v_invalidated > 0 THEN
    UPDATE public."Events"
    SET event_status = 'unsigned_changes'
    WHERE id = NEW.id
      AND event_status = 'booked';
  END IF;

  RETURN NULL;
END;
$$;
