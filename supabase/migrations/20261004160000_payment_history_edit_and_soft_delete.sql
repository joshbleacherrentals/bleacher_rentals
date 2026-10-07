-- PaymentHistory: a manual payment can be edited and soft-deleted
-- (docs/specs/accountant-quotes-07-payments-soft-delete-db.md).
--
-- The ledger was append-only: no UPDATE and no DELETE policy for anyone, mistakes corrected by a
-- negative row. After this migration a MANUAL payment can be edited and soft-deleted, by an admin
-- only (the accountant joins in spec 10). A negative row stays a valid way to record a refund.
--
-- What changes:
--   1. three columns record a deletion: deleted_at, deleted_by_user_uuid, delete_reason. A row is
--      deleted when deleted_at is not null; there is no flag.
--   2. a CHECK keeps them coherent: a deletion carries its author and a reason that is not blank
--      (spaces count as empty), only a manual row can be deleted, and a deleted row points at no
--      installment (so a deleted payment never blocks the schedule; intended_installment_id, the
--      historical fact, is untouched).
--   3. payment_history_update: an admin may update a manual row. A Stripe row is invisible to it, so
--      an update that matches no row changes nothing — and raises nothing.
--   4. payment_history_insert gains `deleted_at IS NULL`: a row is never inserted already deleted.
--   5. guard_payment_history_update (BEFORE UPDATE) is what RLS cannot be: it decides on columns. It
--      refuses (42501, like an RLS refusal) a change to an immutable column, any change to a row that
--      is already deleted (a deleted payment is frozen and cannot be restored), a deletion that is
--      attributed to someone other than the caller, and a deletion that changes anything besides the
--      four columns a deletion owns. Like the other guards, it fences only a request made as a
--      signed-in app user (`authenticated`): the service role, migrations and the table owner are not.
--
-- Not changed: there is still no DELETE policy, so a hard delete is impossible for every signed-in
-- user, an admin included (the service role bypasses RLS and could still delete a row; no code path
-- does); payment_history_select; the Stripe webhook's service-role path.
--
-- The guard names the immutable columns, so a column added to PaymentHistory later is NOT covered by
-- it: supabase/tests/payment_history_edit_soft_delete.test.sql lists today's columns and fails when
-- one is added, so that the new column gets a decision.
--
-- The upload connector treats 42501 and 23514 as unrecoverable: it discards the change and tells the
-- user. An update the policy filters out matches no row, raises nothing and tells no one.
--
-- Deploy order: this migration → the app. PowerSync sync rules already select "PaymentHistory".*, so
-- the new columns flow without a sync-rules change.

ALTER TABLE public."PaymentHistory"
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_uuid uuid REFERENCES public."Users"(id),
  ADD COLUMN delete_reason text;

ALTER TABLE public."PaymentHistory"
  ADD CONSTRAINT payment_history_deleted_fields_check CHECK (
    -- not deleted: no author and no reason
    (deleted_at IS NOT NULL OR (deleted_by_user_uuid IS NULL AND delete_reason IS NULL))
    -- deleted: an author and a reason that is not empty or only spaces
    AND (deleted_at IS NULL OR (
      deleted_by_user_uuid IS NOT NULL
      AND delete_reason IS NOT NULL
      AND btrim(delete_reason) <> ''
    ))
    -- only a manual row may be deleted
    AND (entry_source = 'manual' OR deleted_at IS NULL)
    -- a deleted row points at no installment
    AND (deleted_at IS NULL OR installment_id IS NULL)
  );

CREATE POLICY payment_history_update ON public."PaymentHistory"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.get_user_roles() && '{admin}'::text[]
    AND entry_source = 'manual'
  )
  WITH CHECK (
    public.get_user_roles() && '{admin}'::text[]
    AND entry_source = 'manual'
  );

ALTER POLICY payment_history_insert ON public."PaymentHistory"
  WITH CHECK (
    public.get_user_roles() && '{admin}'::text[]
    AND entry_source = 'manual'
    AND deleted_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.guard_payment_history_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only a request made as a signed-in app user (PostgREST runs those as `authenticated`) is
  -- checked. The service role (the webhook), migrations and a direct database session are not users
  -- with a role in the permission matrix.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- A deleted payment is frozen: no column changes, and it cannot be restored.
  IF OLD.deleted_at IS NOT NULL THEN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'A deleted payment cannot be changed or restored'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- The event, the currency, the author, the status, the creation time, the payer's email and every
  -- Stripe column are never edited.
  IF (
    NEW.id, NEW.event_uuid, NEW.currency, NEW.status, NEW.entry_source,
    NEW.recorded_by_user_uuid, NEW.created_at, NEW.payer_email,
    NEW.stripe_payment_intent_id, NEW.stripe_checkout_session_id,
    NEW.stripe_connection_uuid, NEW.stripe_receipt_url
  ) IS DISTINCT FROM (
    OLD.id, OLD.event_uuid, OLD.currency, OLD.status, OLD.entry_source,
    OLD.recorded_by_user_uuid, OLD.created_at, OLD.payer_email,
    OLD.stripe_payment_intent_id, OLD.stripe_checkout_session_id,
    OLD.stripe_connection_uuid, OLD.stripe_receipt_url
  ) THEN
    RAISE EXCEPTION 'The event, currency, author, status, creation time, payer email and Stripe fields of a payment cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- A statement that deletes changes the four columns a deletion owns, and nothing else.
  -- installment_id is one of the four: a deletion detaches the payment (the CHECK demands null).
  IF NEW.deleted_at IS NOT NULL THEN
    IF NEW.deleted_by_user_uuid IS DISTINCT FROM public.get_current_user_uuid() THEN
      RAISE EXCEPTION 'A payment can only be deleted in the name of the person deleting it'
        USING ERRCODE = '42501';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['deleted_at', 'deleted_by_user_uuid', 'delete_reason', 'installment_id'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['deleted_at', 'deleted_by_user_uuid', 'delete_reason', 'installment_id']) THEN
      RAISE EXCEPTION 'Deleting a payment cannot change anything else about it'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_payment_history_update
  BEFORE UPDATE ON public."PaymentHistory"
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_history_update();
