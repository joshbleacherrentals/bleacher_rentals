-- WorkTrackerGroups.is_paid: whether a driver's week has been paid.
--
-- A group is one driver's pay for one week. "Paid" is bookkeeping done by hand (a person marks it
-- once the money has gone out), so it is a flag of its own and is NOT a value of
-- worktracker_group_status — a week can be Draft, Ready for Payment or Bill Created and be paid
-- or unpaid in each.
--
-- Existing rows take the default: nothing already in the table has been recorded as paid.
--
-- Who may change it: an admin or an accountant. The pages hide the button from everyone else,
-- but a hidden button is not a permission, so the database refuses the change too. RLS cannot do
-- this alone — it works on rows, and account managers must keep updating every other column of a
-- group (status, qbo_bill_id) — hence a trigger on this one column.
--
-- Deploy order: this migration → the app. PowerSync sync rules select the whole row
-- (`SELECT "WorkTrackerGroups".*`), so the new column needs no change there.

ALTER TABLE public."WorkTrackerGroups"
  ADD COLUMN is_paid boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_work_tracker_group_is_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only a request made as a signed-in app user (PostgREST runs those as `authenticated`) is
  -- checked. The service role, migrations and a direct database session are not users with a
  -- role in the permission matrix, and the backfills and server routes that use them must keep
  -- working.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- A write that leaves the flag alone is not this trigger's business: an account manager moving
  -- a week to Ready for Payment, or the modal creating the group of a week that has none (the
  -- default `false`), both pass.
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_paid = false THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.is_paid IS NOT DISTINCT FROM OLD.is_paid THEN
    RETURN NEW;
  END IF;

  IF NOT (public.get_user_roles() && '{admin,accountant}'::text[]) THEN
    -- 42501 is what an RLS refusal raises; the PowerSync upload connector treats it as
    -- unrecoverable, discards the change and tells the user, instead of retrying it forever.
    RAISE EXCEPTION 'Only an admin or an accountant can mark a work tracker group paid or unpaid'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_work_tracker_group_is_paid
  BEFORE INSERT OR UPDATE OF is_paid
  ON public."WorkTrackerGroups"
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_work_tracker_group_is_paid();
