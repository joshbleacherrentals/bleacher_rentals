-- Accountant: changes exactly one column of Events, is_qbo
-- (docs/specs/accountant-quotes-05-is-qbo-column.md).
--
-- The QuickBooks Invoice checkbox on the Billing tab is Events.is_qbo, a flag a person ticks once
-- the invoice has been entered in QuickBooks. The accountant does that bookkeeping, so it may tick
-- it — and change nothing else on an event, and add or delete no event.
--
-- RLS decides on rows, not columns, so this is two parts:
--   1. events_update gains 'accountant', so an accountant's UPDATE reaches the row at all;
--   2. a BEFORE UPDATE trigger refuses (42501, like an RLS refusal) any change to another column
--      when the caller holds the accountant role and neither admin nor account manager. Roles are
--      additive: an accountant who is also an account manager is not fenced.
--
-- The write stays local-first (PowerSync) and works offline; the upload connector sends only the
-- changed columns, and treats 42501 as unrecoverable: it discards the change and tells the user.
--
-- Not changed: events_insert and events_delete (the accountant adds and deletes nothing, by any
-- route), events_select, and what an admin or account manager may write — events_update still lets
-- them change any column.
--
-- Deploy order: this migration → the app. PowerSync sync rules already select the whole Events row.

ALTER POLICY events_update ON public."Events"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

CREATE OR REPLACE FUNCTION public.guard_events_accountant_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  caller_roles text[];
BEGIN
  -- Only a request made as a signed-in app user (PostgREST runs those as `authenticated`) is
  -- checked. The service role, migrations and a direct database session are not users with a role
  -- in the permission matrix, and neither are SECURITY DEFINER functions, which run as their owner:
  -- recompute_quote_hashes_events updates content_hash and contract_hash that way after every
  -- Events update, and must not be refused.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  caller_roles := public.get_user_roles();

  -- An admin or an account manager may change what they could before. Roles are additive, so an
  -- accountant who is also one of them is not fenced.
  IF caller_roles && '{admin,account_manager}'::text[] THEN
    RETURN NEW;
  END IF;

  -- Any other role is refused by RLS already (events_update names only the three above).
  IF NOT ('accountant' = ANY (caller_roles)) THEN
    RETURN NEW;
  END IF;

  -- The whole row but is_qbo: a column added to Events later is covered without touching this.
  IF (to_jsonb(NEW) - 'is_qbo') IS DISTINCT FROM (to_jsonb(OLD) - 'is_qbo') THEN
    -- 42501 is what an RLS refusal raises; the PowerSync upload connector treats it as
    -- unrecoverable, discards the change and tells the user, instead of retrying it forever.
    RAISE EXCEPTION 'An accountant can only change whether a quote or booking is in QuickBooks'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Every column, not `UPDATE OF …`: the point is to see what else changed.
CREATE TRIGGER guard_events_accountant_columns
  BEFORE UPDATE
  ON public."Events"
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_events_accountant_columns();
