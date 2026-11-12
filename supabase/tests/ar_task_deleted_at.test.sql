-- ============================================================================
-- Tests for ArEventTasks.deleted_at: the soft delete of a closed task
-- Migration: 20261111130000_ar_event_tasks_deleted_at.sql
-- Spec:      docs/specs/accountant-collections-19-task-delete.md (§1 D1, §3, §5, §7)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_task_deleted_at.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the shape: the column is timestamptz, nullable, with no default; the CHECK
--     ar_event_tasks_deleted_is_closed exists; the table still has exactly the select, insert and
--     update policies (no policy was added, and there is no DELETE one);
--   * the CHECK (deleted_at IS NULL OR completed), whoever asks: an update that sets deleted_at on an
--     open row is refused (23514), so is an insert of an open row with deleted_at, and so is an
--     update that reopens a deleted row. A closed row can be deleted and brought back (clearing
--     deleted_at, in the database; the interface has no undo);
--   * the access, one named assertion per role: the UPDATE of deleted_at works for an active
--     accountant and an admin, and does nothing (zero rows, read back as the table owner) for an
--     account manager, developer, viewer, maintainer, driver, an inactive accountant and a user with
--     no role. DELETE still raises nothing and removes nothing for any of them;
--   * the system's functions: ar_sync_event_tasks still creates a task for an event whose only task is
--     deleted, and completes the open task next to a deleted one without touching the deleted row.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(57);

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.dt_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- A fresh Event per scenario, so the one-open-task rule never crosses over. Booked, one 1000-cent
-- line, no payment schedule and no payment: with a start in the past its whole balance is due.
CREATE FUNCTION public.dt_event(label text, status event_status DEFAULT 'booked') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, event_status)
  VALUES ('deleted_at probe ' || label, '2026-07-01', '2026-07-02', false, false, status)
  RETURNING id INTO v_id;
  INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
  VALUES ('line', 'USD', 1000, 1, v_id);
  RETURN v_id;
END;
$$;

-- A closed task: inserted already closed, so the trigger of spec 18 stamps it and nothing else
-- is needed.
CREATE FUNCTION public.dt_closed_task(p_event uuid, p_note text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed)
  VALUES ('2026-11-01', p_note, p_event, true)
  RETURNING id;
$$;

-- What the table really holds, read with the owner's rights (SECURITY DEFINER bypasses RLS), so a
-- role that is refused the SELECT can still have its refused UPDATE / DELETE checked.
CREATE FUNCTION public.dt_deleted_at(task uuid) RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT deleted_at FROM public."ArEventTasks" WHERE id = task;
$$;
CREATE FUNCTION public.dt_task_exists(task uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public."ArEventTasks" WHERE id = task);
$$;

-- ── Fixtures: one user per role ─────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct', 'dt_acct@test.com', 'clerk_dt_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct_off', 'dt_acct_off@test.com', 'clerk_dt_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'admin', 'dt_admin@test.com', 'clerk_dt_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'am', 'dt_am@test.com', 'clerk_dt_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'dev', 'dt_dev@test.com', 'clerk_dt_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'viewer', 'dt_viewer@test.com', 'clerk_dt_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'maint', 'dt_maint@test.com', 'clerk_dt_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'driver', 'dt_driver@test.com', 'clerk_dt_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'norole', 'dt_norole@test.com', 'clerk_dt_norole', false, false)
RETURNING id AS user_norole \gset

-- ═══ SHAPE (spec §3) ════════════════════════════════════════════════════════

SELECT has_column('public', 'ArEventTasks', 'deleted_at', 'ArEventTasks has the column deleted_at');
SELECT col_type_is('public', 'ArEventTasks', 'deleted_at', 'timestamp with time zone',
  'deleted_at is timestamp with time zone');
SELECT col_is_null('public', 'ArEventTasks', 'deleted_at', 'deleted_at is nullable');
SELECT col_hasnt_default('public', 'ArEventTasks', 'deleted_at', 'deleted_at has no default');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
   WHERE conrelid = 'public."ArEventTasks"'::regclass
     AND conname = 'ar_event_tasks_deleted_is_closed' AND contype = 'c'),
  'the CHECK ar_event_tasks_deleted_is_closed exists');
-- D1: the delete is an UPDATE through the existing policy. No policy was added.
SELECT is(
  (SELECT array_agg(cmd ORDER BY cmd) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ArEventTasks'),
  ARRAY['INSERT', 'SELECT', 'UPDATE'],
  'the table has exactly the select, insert and update policies: none for DELETE, none added');

-- ═══ THE CHECK: only a closed task can be deleted (owner, so no policy gets in the way) ═══

SELECT public.dt_event('check') AS ev_check \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'open probe', :'ev_check')
RETURNING id AS task_check_open \gset

SELECT throws_ok(
  format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_check_open'),
  '23514', NULL, 'an update that sets deleted_at on an open task is refused');
SELECT is(public.dt_deleted_at(:'task_check_open'), NULL::timestamptz,
  '...and the open task has no deleted_at');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed, deleted_at) VALUES (''2026-11-01'', ''born deleted and open'', %L, false, now())', :'ev_check'),
  '23514', NULL, 'an insert of an open task with deleted_at is refused');

SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed, deleted_at) VALUES (''2026-11-01'', ''born deleted and closed'', %L, true, now())', :'ev_check'),
  'an insert of a closed task with deleted_at is accepted');

-- The closed probes sit on an event of their own, with no open task, so that reopening one can only
-- be stopped by the CHECK and not by the one-open-task index.
SELECT public.dt_event('check-closed') AS ev_check_closed \gset
SELECT public.dt_closed_task(:'ev_check_closed', 'closed probe') AS task_check_closed \gset
SELECT lives_ok(
  format('UPDATE public."ArEventTasks" SET deleted_at = %L WHERE id = %L', '2026-11-11 09:30:00+00', :'task_check_closed'),
  'an update that sets deleted_at on a closed task is accepted');
SELECT is(public.dt_deleted_at(:'task_check_closed'), '2026-11-11 09:30:00+00'::timestamptz,
  '...and the moment is stored as it was sent');

SELECT throws_ok(
  format('UPDATE public."ArEventTasks" SET completed = false WHERE id = %L', :'task_check_closed'),
  '23514', NULL, 'an update that reopens a deleted task is refused');
SELECT lives_ok(
  format('UPDATE public."ArEventTasks" SET deleted_at = NULL WHERE id = %L', :'task_check_closed'),
  'clearing deleted_at on a closed task is accepted: the only way back, in the database');

-- ═══ ACCESS: one fixture task per writing role, one shared task for the refused ones ═══

SELECT public.dt_event('access') AS ev_access \gset
SELECT public.dt_closed_task(:'ev_access', 'accountant deletes this') AS task_acct \gset
SELECT public.dt_closed_task(:'ev_access', 'admin deletes this') AS task_admin \gset
SELECT public.dt_closed_task(:'ev_access', 'nobody else may delete this') AS task_denied \gset

SET LOCAL ROLE authenticated;

-- ═══ THE ROLES THAT USE THE TABLE ═══════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_acct')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_acct')),
  1, 'an active accountant can delete a closed task');
SELECT isnt(public.dt_deleted_at(:'task_acct'), NULL::timestamptz,
  '...and the task is marked deleted');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_acct')),
  0, 'an active accountant still cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_acct'),
  '...and the task is still there (an active accountant)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_admin')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_admin')),
  1, 'an admin can delete a closed task');
SELECT isnt(public.dt_deleted_at(:'task_admin'), NULL::timestamptz,
  '...and the task is marked deleted');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_admin')),
  0, 'an admin still cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_admin'),
  '...and the task is still there (an admin)');

-- ═══ EVERYONE ELSE can neither delete nor DELETE ════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_am')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'an account manager cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (an account manager)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'an account manager cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (an account manager)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_dev')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'a developer cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (a developer)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'a developer cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (a developer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_viewer')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'a viewer cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (a viewer)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'a viewer cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (a viewer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_maint')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'a maintainer cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (a maintainer)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'a maintainer cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (a maintainer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_driver')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'a driver cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (a driver)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'a driver cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (a driver)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_acct_off')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'an inactive accountant cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (an inactive accountant)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'an inactive accountant cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (an inactive accountant)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_dt_norole')::text, true);
SELECT is(
  public.dt_rows_affected(format('UPDATE public."ArEventTasks" SET deleted_at = now() WHERE id = %L', :'task_denied')),
  0, 'a user with no role cannot delete a task');
SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  '...and the task is not marked (a user with no role)');
SELECT is(
  public.dt_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_denied')),
  0, 'a user with no role cannot DELETE a task (no row, no error)');
SELECT ok(public.dt_task_exists(:'task_denied'),
  '...and the task is still there (a user with no role)');

RESET ROLE;

SELECT is(public.dt_deleted_at(:'task_denied'), NULL::timestamptz,
  'after every role has tried, the shared task is exactly as it was');

-- ═══ THE SYSTEM'S FUNCTIONS (spec §1, §7): a deleted row never blocks and is never touched ═══

-- A booked event that owes money, whose only task is a deleted one: the open task is created.
SELECT public.dt_event('sync-created') AS ev_created \gset
SELECT public.dt_closed_task(:'ev_created', 'closed and deleted') AS task_created_old \gset
UPDATE public."ArEventTasks" SET deleted_at = '2026-11-01 12:00:00+00' WHERE id = :'task_created_old';
SELECT is(public.ar_sync_event_tasks(:'ev_created', '2026-11-11'::date), 'created',
  'ar_sync_event_tasks creates a task for an event whose only task is deleted');
SELECT is(
  (SELECT count(*)::int FROM public."ArEventTasks" WHERE event_uuid = :'ev_created' AND completed = false),
  1, '...and the new task is open');
SELECT is(public.dt_deleted_at(:'task_created_old'), '2026-11-01 12:00:00+00'::timestamptz,
  '...and the deleted row is exactly as it was');

-- A Lost event with an open task next to a deleted one: the open task is completed.
SELECT public.dt_event('sync-completed', 'lost') AS ev_completed \gset
SELECT public.dt_closed_task(:'ev_completed', 'closed and deleted') AS task_completed_old \gset
UPDATE public."ArEventTasks" SET deleted_at = '2026-11-02 12:00:00+00' WHERE id = :'task_completed_old';
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-11', 'open next to a deleted one', :'ev_completed')
RETURNING id AS task_completed_open \gset
SELECT is(public.ar_sync_event_tasks(:'ev_completed', '2026-11-11'::date), 'completed',
  'ar_sync_event_tasks completes the open task that sits next to a deleted one');
SELECT is((SELECT completed FROM public."ArEventTasks" WHERE id = :'task_completed_open'), true,
  '...and the open task is closed');
SELECT is(public.dt_deleted_at(:'task_completed_old'), '2026-11-02 12:00:00+00'::timestamptz,
  '...and the deleted row is exactly as it was');

SELECT * FROM finish();
ROLLBACK;
