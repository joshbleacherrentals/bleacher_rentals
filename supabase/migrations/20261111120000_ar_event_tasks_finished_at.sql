-- =============================================================
-- Collections: when a task was finished (docs/specs/accountant-collections-18-task-finished-at.md)
--
-- ArEventTasks gets finished_at, the moment the task became closed, and the Task History table shows
-- it as a date. A BEFORE INSERT OR UPDATE trigger writes it, and nothing else does.
--
-- Decided by the spec:
--   * D1, only the database writes the time. One mechanism closes every path: Done / Next Task (the
--     app's `completed` update), the system's completions (ar_sync_event_tasks: the payment arrived,
--     the event is Lost) and any later writer. The app never sends finished_at. So an accountant who
--     presses Done / Next Task offline gets the time of the synchronisation, not of the click;
--   * D2, no backfill. A task closed before this migration keeps finished_at NULL for good; the table
--     shows a dash for it. The migration does not touch any existing row;
--   * the trigger stamps now() when the row is closed (an insert with completed = true, or an update
--     from false to true) and finished_at is still empty. A value that is already there is kept (the
--     app never sends one; seeds and tests may). An update of a row that was already closed never
--     changes it, so a later edit of an old closed row does not stamp it;
--   * now() is the start of the transaction: all tasks closed by one nightly run, or by one payment's
--     transaction, share that moment;
--   * no policy change, no sync-rule change (the rules select "ArEventTasks".*).
--
-- It can run twice. Deploy order: this migration, then the app; the other order is harmless too
-- (without the column on the server the app's column stays empty).
-- =============================================================

ALTER TABLE public."ArEventTasks" ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE OR REPLACE FUNCTION public.ar_event_tasks_stamp_finished() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed AND NEW.finished_at IS NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.completed) THEN
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ar_event_tasks_stamp_finished ON public."ArEventTasks";
CREATE TRIGGER ar_event_tasks_stamp_finished
  BEFORE INSERT OR UPDATE ON public."ArEventTasks"
  FOR EACH ROW EXECUTE FUNCTION public.ar_event_tasks_stamp_finished();
