-- Collections: one function keeps the tasks in step with the debt — see
-- docs/specs/accountant-collections-11-task-sync.md. It is the only migration for the daily job of
-- spec 04 and the completion triggers of spec 05: their own two migrations never reached production
-- and were deleted, so nothing here has to drop anything.
--
-- THE RULE LIVES IN ONE PLACE: public.ar_sync_event_tasks(event, today). For an eligible event
-- (booked, not deleted) it looks at the state after the change:
--   * Amount Due above 0 and no open task  -> creates the task (note "Remind the customer about
--     payment", due today). The insert names the partial unique index of spec 01 (one open task per
--     event) as its conflict target, so running it twice, or while an accountant writes, adds nothing;
--   * Amount Due 0                          -> completes the event's open tasks.
-- A Lost event has its open tasks completed. Any other status, or a deleted event, keeps its tasks:
-- the list only hides them. "Today" is Toronto's date. The function is a state, not a transition: it
-- never compares before and after.
--
-- WHO CALLS IT. The nightly job (a due date arriving changes no row, so no trigger can see it) and
-- four triggers on the tables the calculation reads. Neither holds any rule of its own.
--
-- WHY THE TRIGGERS ARE DEFERRED. They are CONSTRAINT TRIGGERs, DEFERRABLE INITIALLY DEFERRED, so they
-- run at COMMIT. recompute_quote_hashes_* rewrite the contract hash after every quote edit, and
-- invalidate_signature_on_contract_change then moves a signed booked event to unsigned_changes in the
-- same transaction. An ordinary AFTER trigger runs in trigger-name order and could see "booked" just
-- before that move, create a task, and leave it orphaned and hidden. At commit the status is final.
-- They sit on the whole table with no column list, so a new column on a watched table needs nothing.
--
-- A TABLE THE CALCULATION READS MUST BE WATCHED. A helper the calculation uses must be named ar_*.
-- A new table read by an ar_* function needs one CREATE CONSTRAINT TRIGGER line below. The pgTAP test
-- supabase/tests/ar_task_sync.test.sql stays red until it has one, or until the table is listed in
-- the test's exceptions with a reason. SalesOffices, QboConnections and Addresses are the exceptions
-- today: they decide the office currency, and the nightly run covers a change there (spec 11 D4).
--
-- NO WRITE IS EVER BLOCKED. The triggers run at commit, where an uncaught error would undo the user's
-- whole save (a payment, a quote, the Stripe webhook). The trigger function catches every error and
-- raises a WARNING; the tasks stay as they were. The nightly function and ar_sync_event_tasks do not
-- catch: their callers decide.
--
-- Readings the user confirmed (spec 11 §1): the nightly run also completes (the first night after the
-- deploy closes every stale task, including one an accountant dated in the future); a half-saved
-- schedule can show a task for a moment that the last request of the save removes; the two requests
-- of Done / Next Task can be split by a trigger run (the accountant's insert is refused with 23505).
--
-- The functions are SECURITY DEFINER because the signed-in user who writes the payment may not touch
-- ArEventTasks or run ar_event_amount_due; the owner bypasses RLS. EXECUTE is revoked from the app
-- roles. The file can run twice.
--
-- A database that still holds the two deleted migrations (a local one made before they were removed)
-- keeps their function, triggers and job: reset it with `supabase db reset`.

-- ── 1. The rule ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ar_sync_event_tasks(p_event uuid, p_today date)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status  event_status;
  v_deleted boolean;
  v_due     bigint;
  v_rows    integer;
BEGIN
  SELECT e.event_status, coalesce(e.deleted, false)
    INTO v_status, v_deleted
  FROM public."Events" e
  WHERE e.id = p_event;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  -- Lost: its open tasks are done, whatever Amount Due says.
  IF v_status = 'lost' THEN
    UPDATE public."ArEventTasks" SET completed = true
    WHERE event_uuid = p_event AND completed = false;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN CASE WHEN v_rows > 0 THEN 'completed' ELSE 'none' END;
  END IF;

  -- Any other status, or deleted: the tasks are kept (the list hides them).
  IF v_status IS DISTINCT FROM 'booked' OR v_deleted THEN
    RETURN 'none';
  END IF;

  v_due := public.ar_event_amount_due(p_event, p_today);

  IF v_due > 0 THEN
    INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
    VALUES (p_today, 'Remind the customer about payment', p_event)
    ON CONFLICT (event_uuid) WHERE completed = false DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN CASE WHEN v_rows > 0 THEN 'created' ELSE 'none' END;
  END IF;

  UPDATE public."ArEventTasks" SET completed = true
  WHERE event_uuid = p_event AND completed = false;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN CASE WHEN v_rows > 0 THEN 'completed' ELSE 'none' END;
END;
$$;

-- ── 2. The nightly job ──────────────────────────────────────────────────────

-- Every booked, non-deleted event, and every Lost event that still has an open task.
CREATE OR REPLACE FUNCTION public.ar_sync_all_event_tasks()
RETURNS TABLE (created integer, completed integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today       date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_event       uuid;
  v_result      text;
  v_n_created   integer := 0;
  v_n_completed integer := 0;
BEGIN
  FOR v_event IN
    SELECT e.id
    FROM public."Events" e
    WHERE (e.event_status = 'booked' AND NOT coalesce(e.deleted, false))
       OR (e.event_status = 'lost'
           AND EXISTS (SELECT 1 FROM public."ArEventTasks" t
                       WHERE t.event_uuid = e.id AND t.completed = false))
  LOOP
    v_result := public.ar_sync_event_tasks(v_event, v_today);
    IF v_result = 'created' THEN
      v_n_created := v_n_created + 1;
    ELSIF v_result = 'completed' THEN
      v_n_completed := v_n_completed + 1;
    END IF;
  END LOOP;

  created := v_n_created;
  completed := v_n_completed;
  RETURN NEXT;
END;
$$;

-- ── 3. The trigger function ─────────────────────────────────────────────────

-- TG_ARGV[0] names the column that holds the event id: event_uuid on three tables, id on Events.
-- It checks the event of the new row and, when a row changed hands, the event of the old one.
CREATE OR REPLACE FUNCTION public.ar_sync_tasks_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_event uuid;
BEGIN
  BEGIN
    FOR v_event IN
      SELECT DISTINCT ev
      FROM unnest(ARRAY[
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN (to_jsonb(NEW) ->> TG_ARGV[0])::uuid END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN (to_jsonb(OLD) ->> TG_ARGV[0])::uuid END
      ]) AS ev
      WHERE ev IS NOT NULL
    LOOP
      PERFORM public.ar_sync_event_tasks(v_event, v_today);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ar_sync_tasks_trigger failed on % (%): % (%)', TG_TABLE_NAME, TG_OP, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- Only the owner (the triggers, the cron) and the service role may run these.
REVOKE ALL ON FUNCTION public.ar_sync_event_tasks(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_sync_all_event_tasks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_sync_tasks_trigger() FROM PUBLIC, anon, authenticated;

-- ── 4. The four triggers ────────────────────────────────────────────────────
-- Whole table, no column list. A hard delete of an event cascades its tasks away; an insert into
-- Events has no line items or payments yet, and their own triggers follow.

DROP TRIGGER IF EXISTS ar_sync_tasks_on_payment_history ON public."PaymentHistory";
CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_payment_history
  AFTER INSERT OR UPDATE OR DELETE ON public."PaymentHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ar_sync_tasks_trigger('event_uuid');

DROP TRIGGER IF EXISTS ar_sync_tasks_on_payment_installments ON public."PaymentInstallments";
CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_payment_installments
  AFTER INSERT OR UPDATE OR DELETE ON public."PaymentInstallments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ar_sync_tasks_trigger('event_uuid');

DROP TRIGGER IF EXISTS ar_sync_tasks_on_event_line_items ON public."EventLineItems";
CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_event_line_items
  AFTER INSERT OR UPDATE OR DELETE ON public."EventLineItems"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ar_sync_tasks_trigger('event_uuid');

-- to_jsonb, not OLD.* IS DISTINCT FROM NEW.*: Events has a json column, which has no equality.
DROP TRIGGER IF EXISTS ar_sync_tasks_on_events ON public."Events";
CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_events
  AFTER UPDATE ON public."Events"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW))
  EXECUTE FUNCTION public.ar_sync_tasks_trigger('id');

-- ── 5. The nightly schedule ─────────────────────────────────────────────────
-- pg_cron schedules in UTC. 05:20 UTC is 00:20 or 01:20 in Toronto depending on daylight saving —
-- always after Toronto's date has turned. A schedule with a name replaces the job of that name, so
-- running this file twice leaves one job. Each run is kept in cron.job_run_details.
SELECT cron.schedule(
  'sync-ar-collection-tasks',
  '20 5 * * *',
  $$SELECT * FROM public.ar_sync_all_event_tasks();$$
);
