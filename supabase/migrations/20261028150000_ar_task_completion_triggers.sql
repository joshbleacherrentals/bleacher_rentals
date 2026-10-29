-- Collections: triggers that complete tasks — see
-- docs/specs/accountant-collections-05-completion-triggers.md.
--
-- Two triggers close an event's open ArEventTasks by themselves:
--   * complete_ar_tasks_when_paid: after any insert or update of a PaymentHistory row, if the event's
--     Amount Due (public.ar_event_amount_due, spec 02) is 0, every open task of the event is
--     completed. It sees every payment path: the accountant's and admin's PowerSync upload, and the
--     Stripe webhook (service role). A payment moved to another event checks both events;
--   * complete_ar_tasks_when_lost: after event_status changes to 'lost', the event's open tasks are
--     completed. Any other way of leaving 'booked', and a soft delete, keep the tasks (they are only
--     hidden by the list).
--
-- Readings the user is asked to confirm (spec 05 §1):
--   * "becomes 0" is "is 0 after this change", not a before-and-after transition: an event whose
--     Amount Due is already 0 and that has an open task has it completed by any payment-row change;
--   * a soft delete is an UPDATE of the same table and goes through the same trigger; a soft delete
--     that raises Amount Due completes nothing and creates nothing;
--   * "today" is Toronto's date at the moment of the change;
--   * nothing fires on PaymentInstallments or EventLineItems: a task can stay open after a schedule
--     or price edit until a payment changes, the event is lost, or the accountant acts.
--
-- The webhook is idempotent and must not fail once the money is recorded, so the whole body of each
-- function sits in an exception block: if the calculation or the update raises, the write still
-- succeeds, the tasks stay open and a server WARNING says so. Both triggers are AFTER, so they run
-- after the BEFORE guards of PaymentHistory and Events and cannot disturb them.
--
-- The functions are SECURITY DEFINER because the signed-in user who writes the payment may not touch
-- ArEventTasks or run ar_event_amount_due; the owner bypasses RLS. EXECUTE is revoked from everyone
-- who is not the owner.
--
-- Most payment rows belong to events with no open task, so the payment function asks "does this
-- event have an open task?" first and only then runs the calculation.

CREATE FUNCTION public.complete_ar_tasks_when_paid()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today   date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_event uuid;
BEGIN
  BEGIN
    FOR v_event IN
      SELECT DISTINCT ev
      FROM unnest(ARRAY[NEW.event_uuid, CASE WHEN TG_OP = 'UPDATE' THEN OLD.event_uuid END]) AS ev
      WHERE ev IS NOT NULL
    LOOP
      IF EXISTS (SELECT 1 FROM public."ArEventTasks" t
                 WHERE t.event_uuid = v_event AND t.completed = false)
         AND public.ar_event_amount_due(v_event, today) = 0
      THEN
        UPDATE public."ArEventTasks" SET completed = true
        WHERE event_uuid = v_event AND completed = false;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'complete_ar_tasks_when_paid failed for payment %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.complete_ar_tasks_when_lost()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public."ArEventTasks" SET completed = true
    WHERE event_uuid = NEW.id AND completed = false;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'complete_ar_tasks_when_lost failed for event %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ar_tasks_when_paid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ar_tasks_when_lost() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER complete_ar_tasks_when_paid
  AFTER INSERT OR UPDATE ON public."PaymentHistory"
  FOR EACH ROW EXECUTE FUNCTION public.complete_ar_tasks_when_paid();

CREATE TRIGGER complete_ar_tasks_when_lost
  AFTER UPDATE OF event_status ON public."Events"
  FOR EACH ROW
  WHEN (NEW.event_status = 'lost' AND OLD.event_status IS DISTINCT FROM NEW.event_status)
  EXECUTE FUNCTION public.complete_ar_tasks_when_lost();
