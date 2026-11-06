-- =============================================================
-- Collections: the table ArEventTasks (docs/specs/accountant-collections-01-backend.md)
--
-- One row is one follow-up task on an overdue booking ("call the customer", "send an email"). A task
-- is OPEN while completed = false, and an event has at most one open task. Admin and accountant use
-- the table; nobody else sees a row. The service role (the daily cron, the completion triggers, the
-- Stripe webhook) bypasses RLS.
--
-- Decided by the spec:
--   * the partial unique index is the backstop for "one open task per event" when the cron and an
--     accountant, or two accountants, act on the same event at once. The cron uses ON CONFLICT DO
--     NOTHING, so it is never refused;
--   * note must not be blank after btrim; the interface trims and refuses first;
--   * event_uuid cascades on a PHYSICAL delete of the event. Soft delete (Events.deleted) leaves tasks;
--   * "due date is today or later" is checked in the interface only, never here;
--   * updates are not restricted by column, and nobody can DELETE: there is no DELETE policy. A task
--     that "disappears" is completed (spec 05).
--
-- Deploy order: this migration -> the sync rules and a PowerSync restart -> the app. Without the sync
-- rules the table never reaches a device; without this migration an upload is refused.
-- =============================================================

CREATE TABLE public."ArEventTasks" (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  due_date   date        NOT NULL,
  completed  boolean     NOT NULL DEFAULT false,
  note       text        NOT NULL,
  event_uuid uuid        NOT NULL,
  CONSTRAINT ar_event_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT ar_event_tasks_note_not_blank CHECK (btrim(note) <> ''),
  CONSTRAINT ar_event_tasks_event_fkey
    FOREIGN KEY (event_uuid) REFERENCES public."Events" (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ar_event_tasks_one_open_per_event
  ON public."ArEventTasks" (event_uuid) WHERE completed = false;
CREATE INDEX ar_event_tasks_event_idx ON public."ArEventTasks" (event_uuid);

ALTER TABLE public."ArEventTasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar_event_tasks_select ON public."ArEventTasks" FOR SELECT TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);
CREATE POLICY ar_event_tasks_insert ON public."ArEventTasks" FOR INSERT TO authenticated
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);
CREATE POLICY ar_event_tasks_update ON public."ArEventTasks" FOR UPDATE TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);
-- No DELETE policy: no signed-in user can hard delete a task.
