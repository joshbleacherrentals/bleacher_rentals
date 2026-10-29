-- The daily job that creates Collections tasks — see
-- docs/specs/accountant-collections-04-cron.md.
--
-- create_ar_collection_tasks() gives every eligible event that is overdue and has no open task one
-- task: note "Remind the customer about payment", due today. Eligible = booked and not deleted.
-- Overdue = public.ar_event_amount_due(event, today) > 0 (spec 02). "Today" is Toronto's date, as in
-- delete_past_alerts(). It returns the number of tasks made.
--
-- It is safe to run twice, or while an accountant writes: the insert names the partial unique index
-- of spec 01 (one open task per event) as its conflict target and does nothing on a conflict. The
-- NOT EXISTS above it is not what keeps it safe; it only spares the Amount Due calculation for
-- events that already have a task. ar_event_amount_due is declared COST 1000, so the planner runs it
-- after the cheap tests (status, deleted, open task).
--
-- Two readings the user is asked to confirm (spec 04 §1):
--   * The first run after the deploy creates a task for every booked event that is overdue at that
--     moment, including every booked event with no schedule that is already inside 7 days of its
--     start or past it. That can be many tasks, all due that day. Nothing stages or limits it.
--   * The job writes no author: ArEventTasks has no such column.
--
-- Not done here: completing tasks (spec 05) and writing tasks from the app (spec 06). If a payment
-- brings Amount Due back up, nothing is created at that moment; the next run decides.

CREATE OR REPLACE FUNCTION public.create_ar_collection_tasks()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today   date := (now() AT TIME ZONE 'America/Toronto')::date;
  created integer;
BEGIN
  WITH candidates AS (
    SELECT e.id
    FROM public."Events" e
    WHERE e.event_status = 'booked' AND NOT coalesce(e.deleted, false)
      AND NOT EXISTS (SELECT 1 FROM public."ArEventTasks" t
                      WHERE t.event_uuid = e.id AND t.completed = false)
      AND public.ar_event_amount_due(e.id, today) > 0
  ), inserted AS (
    INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
    SELECT today, 'Remind the customer about payment', id FROM candidates
    ON CONFLICT (event_uuid) WHERE completed = false DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO created FROM inserted;
  RETURN created;
END;
$$;

-- Only the cron (which runs as the owner) and the service role may run it.
REVOKE ALL ON FUNCTION public.create_ar_collection_tasks() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_cron schedules in UTC. 05:20 UTC is 00:20 or 01:20 in Toronto depending on daylight saving —
-- always after Toronto's date has turned. A schedule with a name replaces the job of that name, so
-- running this file twice leaves one job. Each run is kept in cron.job_run_details.
SELECT cron.schedule(
  'create-ar-collection-tasks',
  '20 5 * * *',
  $$SELECT public.create_ar_collection_tasks();$$
);
