-- =============================================================
-- Collections: deleting a closed task from Task History
-- (docs/specs/accountant-collections-19-task-delete.md)
--
-- An accountant who added a task by accident can delete it from Task History, once it is closed.
-- The delete is soft (D1, asked 2026-11-11): the row stays in the table and is hidden, marked by
-- the new column deleted_at. It is not a physical delete.
--
-- Decided by the spec:
--   * D1, soft delete. The delete is an UPDATE of deleted_at, made through the existing update policy
--     (admin and accountant, get_user_roles() && '{admin,accountant}'). No policy is added, and the
--     table still has no DELETE policy: nobody can DELETE a row;
--   * only a closed task can be deleted, also in the database: the CHECK
--     ar_event_tasks_deleted_is_closed (deleted_at IS NULL OR completed) refuses to mark an open task
--     as deleted, whoever asks. An UPDATE that would, and an INSERT of an open row with deleted_at,
--     fail with 23514. It also means a deleted task cannot be reopened. The interface has no undo; a
--     deleted task can be brought back only by clearing deleted_at here, in the database;
--   * the sync rules select the whole table ("ArEventTasks".*), so the new column reaches the app by
--     itself and hidden rows keep synchronising: the app hides them in its Task History query. The
--     Collections list, Previous / Next Task and the functions of spec 11 read open tasks only, and
--     the CHECK keeps an open task from ever being deleted, so none of them changes;
--   * no trigger, no backfill: no existing row is touched;
--   * no log row (EventChangeLog) is written for a delete; the spec does not ask for one.
--
-- It can run twice. Deploy order: this migration, then the app (the other order is not safe: the
-- app would send an UPDATE of a column the server does not have yet).
-- =============================================================

ALTER TABLE public."ArEventTasks" ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ar_event_tasks_deleted_is_closed') THEN
    ALTER TABLE public."ArEventTasks" ADD CONSTRAINT ar_event_tasks_deleted_is_closed
      CHECK (deleted_at IS NULL OR completed);
  END IF;
END
$$;
