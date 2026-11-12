-- ============================================================================
-- Tests for ArEventTasks.finished_at: the column and the trigger that stamps it
-- Migration: 20261111120000_ar_event_tasks_finished_at.sql
-- Spec:      docs/specs/accountant-collections-18-task-finished-at.md (§1 D1 D2, §3, §5)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_task_finished_at.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end. now() is the start of that
-- transaction, so "stamped" reads as "equal to now()", and an old moment is always an explicit one.
--
-- What it pins down:
--   * the shape: the column is timestamptz, nullable, with no default; the trigger is a row-level
--     BEFORE INSERT OR UPDATE trigger;
--   * an open task has no finish time, also one an insert names as NULL (a PowerSync PUT sends
--     every column) and one whose note is edited;
--   * the stamp: an insert with completed = true and an update from open to closed get now();
--     a value that is already there (insert, or the update that closes the row) is kept;
--   * a later update of a closed row never changes the stamp, and never gives one to a closed row
--     that has none (D2: the tasks closed before the change). Such an old row is made here with the
--     trigger switched off for one statement;
--   * the system's path: ar_sync_event_tasks completes the open task of a Lost event and the row is
--     stamped; an accountant's own UPDATE that closes a task (the statement of Done / Next Task)
--     is stamped (the policies are unchanged).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(23);

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.ft_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- A fresh Event per scenario, so the one-open-task rule never crosses over.
CREATE FUNCTION public.ft_event(label text, status event_status DEFAULT 'booked') RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, event_status)
  VALUES ('finished_at probe ' || label, '2026-07-01', '2026-07-02', false, false, status)
  RETURNING id;
$$;

-- ── Fixture: an active accountant ───────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct', 'ft_acct@test.com', 'clerk_ft_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

-- ═══ SHAPE (spec §3) ════════════════════════════════════════════════════════

SELECT has_column('public', 'ArEventTasks', 'finished_at', 'ArEventTasks has the column finished_at');
SELECT col_type_is('public', 'ArEventTasks', 'finished_at', 'timestamp with time zone',
  'finished_at is timestamp with time zone');
SELECT col_is_null('public', 'ArEventTasks', 'finished_at', 'finished_at is nullable');
SELECT col_hasnt_default('public', 'ArEventTasks', 'finished_at', 'finished_at has no default');
SELECT has_function('public', 'ar_event_tasks_stamp_finished', ARRAY[]::text[],
  'the function ar_event_tasks_stamp_finished exists');
SELECT has_trigger('public', 'ArEventTasks', 'ar_event_tasks_stamp_finished',
  'the trigger ar_event_tasks_stamp_finished exists');
-- tgtype: 1 = row, 2 = before, 4 = insert, 16 = update.
SELECT is(
  (SELECT tgtype::int FROM pg_trigger
    WHERE tgrelid = 'public."ArEventTasks"'::regclass AND tgname = 'ar_event_tasks_stamp_finished'),
  1 + 2 + 4 + 16,
  'the trigger is a row-level BEFORE INSERT OR UPDATE trigger');

-- ═══ AN OPEN TASK HAS NO FINISH TIME ════════════════════════════════════════

SELECT public.ft_event('open') AS ev_open \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'open probe', :'ev_open')
RETURNING id AS task_open \gset
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_open'), NULL::timestamptz,
  'an open task has no finish time');

UPDATE public."ArEventTasks" SET note = 'open probe edited' WHERE id = :'task_open';
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_open'), NULL::timestamptz,
  'editing the note of an open task gives it no finish time');

SELECT public.ft_event('open-null') AS ev_open_null \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed, finished_at)
VALUES ('2026-11-01', 'put probe', :'ev_open_null', false, NULL)
RETURNING id AS task_open_null \gset
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_open_null'), NULL::timestamptz,
  'an open task inserted with finished_at named as NULL has no finish time');

-- ═══ THE STAMP ══════════════════════════════════════════════════════════════

SELECT public.ft_event('insert-closed') AS ev_ins \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed)
VALUES ('2026-11-01', 'closed on insert', :'ev_ins', true)
RETURNING id AS task_ins \gset
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_ins'), now(),
  'an insert with completed = true and no value gets now()');

INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed, finished_at)
VALUES ('2026-11-01', 'closed on insert with a value', :'ev_ins', true, '2026-01-02 10:00:00+00')
RETURNING id AS task_ins_value \gset
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_ins_value'),
  '2026-01-02 10:00:00+00'::timestamptz,
  'an insert with completed = true and a value keeps the value');

SELECT public.ft_event('close') AS ev_close \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'to be closed', :'ev_close')
RETURNING id AS task_close \gset
UPDATE public."ArEventTasks" SET completed = true WHERE id = :'task_close';
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_close'), now(),
  'an update from open to closed gets now()');

SELECT public.ft_event('close-value') AS ev_close_value \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'to be closed with a value', :'ev_close_value')
RETURNING id AS task_close_value \gset
UPDATE public."ArEventTasks"
   SET completed = true, finished_at = '2026-02-03 11:30:00+00'
 WHERE id = :'task_close_value';
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_close_value'),
  '2026-02-03 11:30:00+00'::timestamptz,
  'the update that closes the row keeps a value it carries');

-- ═══ A LATER UPDATE NEVER CHANGES IT (spec §1 D2) ═══════════════════════════

-- A stamped closed row: an old moment, then edits.
UPDATE public."ArEventTasks" SET note = 'edited later', due_date = '2026-12-24'
 WHERE id = :'task_ins_value';
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_ins_value'),
  '2026-01-02 10:00:00+00'::timestamptz,
  'editing the note and the due date of a closed row leaves its finish time');
SELECT is((SELECT note FROM public."ArEventTasks" WHERE id = :'task_ins_value'), 'edited later',
  '...and the edit itself went through');

-- A closed row from before the change has none: made with the trigger off for one statement.
SELECT public.ft_event('legacy') AS ev_legacy \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'closed long ago', :'ev_legacy')
RETURNING id AS task_legacy \gset
ALTER TABLE public."ArEventTasks" DISABLE TRIGGER ar_event_tasks_stamp_finished;
UPDATE public."ArEventTasks" SET completed = true WHERE id = :'task_legacy';
ALTER TABLE public."ArEventTasks" ENABLE TRIGGER ar_event_tasks_stamp_finished;
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_legacy'), NULL::timestamptz,
  'a closed row from before the change has no finish time (the setup)');

UPDATE public."ArEventTasks" SET note = 'edited again', due_date = '2026-12-25'
 WHERE id = :'task_legacy';
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_legacy'), NULL::timestamptz,
  'editing a closed row that has none does not stamp it');
SELECT is((SELECT completed FROM public."ArEventTasks" WHERE id = :'task_legacy'), true,
  '...and the row is still closed');

-- ═══ THE SYSTEM'S PATH: ar_sync_event_tasks on a Lost event ═════════════════

SELECT public.ft_event('lost', 'lost') AS ev_lost \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'lost event task', :'ev_lost')
RETURNING id AS task_lost \gset
SELECT is(public.ar_sync_event_tasks(:'ev_lost', '2026-11-11'::date), 'completed',
  'ar_sync_event_tasks completes the open task of a Lost event');
SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_lost'), now(),
  '...and the row it completed has a finish time');

-- ═══ AN ACCOUNTANT'S OWN UPDATE (the statement of Done / Next Task) ═════════

SELECT public.ft_event('acct') AS ev_acct \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'accountant closes this', :'ev_acct')
RETURNING id AS task_acct \gset

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_ft_acct')::text, true);
SELECT is(
  public.ft_rows_affected(format('UPDATE public."ArEventTasks" SET completed = true WHERE event_uuid = %L AND completed = false', :'ev_acct')),
  1, 'an active accountant can close the open task of an event');
RESET ROLE;

SELECT is((SELECT finished_at FROM public."ArEventTasks" WHERE id = :'task_acct'), now(),
  '...and the task the accountant closed has a finish time');

SELECT * FROM finish();
ROLLBACK;
