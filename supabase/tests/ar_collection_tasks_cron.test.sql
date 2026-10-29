-- ============================================================================
-- Tests for the daily job that creates Collections tasks
-- Migration: 20261028140000_ar_collection_tasks_cron.sql
-- Spec:      docs/specs/accountant-collections-04-cron.md (§3, §4, §6)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_collection_tasks_cron.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- create_ar_collection_tasks() looks at EVERY booked event in the database, so a development
-- database full of real bookings would make "returns 1" meaningless. The first thing the test
-- does is give each booked event that already exists an open task of its own; the function then
-- skips them and sees only the probes. On an empty database (CI) that step does nothing.
--
-- What it pins down:
--   * creates: a booked event whose Amount Due is above 0 and that has no open task gets exactly
--     one task: the system's note, due on Toronto's date, not completed; the function returns how
--     many it made, and no other event is touched;
--   * skips: nothing due yet, fully paid, every status but booked (quoted, draft, unsigned_changes,
--     lost, none), a deleted event, and an event that already has an open task, whether the system
--     wrote it or an accountant did and whether its date is past, today or future;
--   * after completion: an event whose only task is completed gets a new open one;
--   * idempotent: a second call returns 0 and adds nothing;
--   * no schedule: an event starting in 7 days is picked up, in 8 days is not; an installment due
--     today counts;
--   * access: anon and authenticated cannot execute it (42501);
--   * the job: cron.job holds create-ar-collection-tasks with the schedule 20 5 * * *.
--
-- "A null Events.deleted counts as not deleted" (spec §6) is a guard in the function only: the
-- column is NOT NULL, so no row can show it and the test cannot.
-- The overlap of two runs is a separate script: ar_collection_tasks_cron.concurrency.sh.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(38);

-- ── Helpers (dropped by the ROLLBACK) ───────────────────────────────────────

-- Toronto's date, the function's "today".
CREATE FUNCTION public.ct_today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'America/Toronto')::date;
$$;

-- A probe event with one 1000-cent line and no payment schedule. Starting today (the default) it is
-- inside the 7 days before its start, so its whole balance is already due.
CREATE FUNCTION public.ct_event(
  p_status event_status DEFAULT 'booked', p_start date DEFAULT NULL, p_deleted boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_start date := coalesce(p_start, public.ct_today());
  v_id uuid;
BEGIN
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean,
                               event_status, deleted)
  VALUES ('ar cron probe', v_start, v_start + 1, false, false, p_status, p_deleted)
  RETURNING id INTO v_id;
  INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
  VALUES ('line', 'USD', 1000, 1, v_id);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.ct_inst(p_event uuid, p_due date) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
  VALUES (p_event, p_due, 'USD', 10000);
$$;

CREATE FUNCTION public.ct_pay(p_event uuid, p_cents int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name)
  VALUES (p_event, p_cents, 'USD', 'succeeded', 'Probe');
$$;

CREATE FUNCTION public.ct_task(p_event uuid, p_note text, p_due date, p_completed boolean)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed)
  VALUES (p_due, p_note, p_event, p_completed);
$$;

CREATE FUNCTION public.ct_count(p_event uuid, p_completed boolean DEFAULT NULL) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks"
  WHERE event_uuid = p_event AND (p_completed IS NULL OR completed = p_completed);
$$;

CREATE FUNCTION public.ct_total() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks";
$$;

-- ── The database before the probes: every booked event already has an open task ─────────────

INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
SELECT public.ct_today(), 'baseline', e.id
FROM public."Events" e
WHERE e.event_status = 'booked' AND NOT e.deleted
  AND NOT EXISTS (SELECT 1 FROM public."ArEventTasks" t
                  WHERE t.event_uuid = e.id AND t.completed = false);

-- ── The probes of the first run ─────────────────────────────────────────────

-- The one that must get a task: booked, starts today, nothing paid, no tasks.
SELECT public.ct_event() AS e_ok \gset

-- Nothing due yet: an installment for tomorrow.
SELECT public.ct_event() AS e_notdue \gset
SELECT public.ct_inst(:'e_notdue', public.ct_today() + 1);

-- Fully paid.
SELECT public.ct_event() AS e_paid \gset
SELECT public.ct_pay(:'e_paid', 1000);

-- Every other status, no status, and a deleted booked event.
SELECT public.ct_event('quoted') AS e_quoted \gset
SELECT public.ct_event('draft') AS e_draft \gset
SELECT public.ct_event('unsigned_changes') AS e_unsigned \gset
SELECT public.ct_event('lost') AS e_lost \gset
SELECT public.ct_event(NULL) AS e_nostatus \gset
SELECT public.ct_event(p_deleted => true) AS e_deleted \gset

-- An open task already there: the system's note long past, an accountant's text today, another in
-- the future.
SELECT public.ct_event() AS e_sys_past \gset
SELECT public.ct_task(:'e_sys_past', 'Remind the customer about payment', public.ct_today() - 5, false);
SELECT public.ct_event() AS e_acc_today \gset
SELECT public.ct_task(:'e_acc_today', 'Call Dana, she promised Friday', public.ct_today(), false);
SELECT public.ct_event() AS e_acc_future \gset
SELECT public.ct_task(:'e_acc_future', 'Wait for the cheque', public.ct_today() + 10, false);

SELECT public.ct_total() AS n0 \gset

-- ── Run 1 ───────────────────────────────────────────────────────────────────

SELECT public.create_ar_collection_tasks() AS r1 \gset

SELECT is(:r1, 1, 'creates: the first run reports one task made');
SELECT is(public.ct_count(:'e_ok', false), 1::bigint, 'creates: the overdue booked event has one open task');
SELECT is(
  (SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'e_ok'),
  'Remind the customer about payment', 'creates: the note is exactly the system''s');
SELECT is(
  (SELECT due_date FROM public."ArEventTasks" WHERE event_uuid = :'e_ok'),
  public.ct_today(), 'creates: due_date is Toronto''s date');
SELECT ok(
  (SELECT created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
   FROM public."ArEventTasks" WHERE event_uuid = :'e_ok'),
  'creates: created_at is now');
SELECT is(public.ct_total() - :n0, 1::bigint, 'creates: no other event is touched');

SELECT is(public.ct_count(:'e_notdue'), 0::bigint, 'skips: nothing due yet (installment tomorrow)');
SELECT is(public.ct_count(:'e_paid'), 0::bigint, 'skips: fully paid');
SELECT is(public.ct_count(:'e_quoted'), 0::bigint, 'skips: status quoted');
SELECT is(public.ct_count(:'e_draft'), 0::bigint, 'skips: status draft');
SELECT is(public.ct_count(:'e_unsigned'), 0::bigint, 'skips: status unsigned_changes');
SELECT is(public.ct_count(:'e_lost'), 0::bigint, 'skips: status lost');
SELECT is(public.ct_count(:'e_nostatus'), 0::bigint, 'skips: no status');
SELECT is(public.ct_count(:'e_deleted'), 0::bigint, 'skips: a deleted booked event');
SELECT is(public.ct_count(:'e_sys_past'), 1::bigint,
  'skips: an open system task dated in the past gets no second one');
SELECT is(public.ct_count(:'e_acc_today'), 1::bigint,
  'skips: an open accountant task dated today gets no second one');
SELECT is(public.ct_count(:'e_acc_future'), 1::bigint,
  'skips: an open accountant task dated in the future gets no second one');

-- ── Run 2: an event whose only task is completed ────────────────────────────

SELECT public.ct_event() AS e_done \gset
SELECT public.ct_task(:'e_done', 'Call the customer', public.ct_today() - 1, true);

SELECT public.create_ar_collection_tasks() AS r2 \gset

SELECT is(:r2, 1, 'after completion: the run reports the one new task');
SELECT is(public.ct_count(:'e_done'), 2::bigint, 'after completion: the event now has two tasks');
SELECT is(public.ct_count(:'e_done', false), 1::bigint, 'after completion: exactly one of them is open');
SELECT is(public.ct_count(:'e_done', true), 1::bigint, 'after completion: the completed one is untouched');

-- ── Run 3: again, nothing changed ───────────────────────────────────────────

SELECT public.ct_total() AS n2 \gset
SELECT public.create_ar_collection_tasks() AS r3 \gset

SELECT is(:r3, 0, 'idempotent: a second run reports 0');
SELECT is(public.ct_total() - :n2, 0::bigint, 'idempotent: a second run adds no row');

-- ── Run 4: no schedule and the 7-day boundary; an installment due today ─────

SELECT public.ct_event(p_start => public.ct_today() + 7) AS e_7 \gset
SELECT public.ct_event(p_start => public.ct_today() + 8) AS e_8 \gset
SELECT public.ct_event(p_start => public.ct_today() + 90) AS e_sched_today \gset
SELECT public.ct_inst(:'e_sched_today', public.ct_today());

SELECT public.create_ar_collection_tasks() AS r4 \gset

SELECT is(:r4, 2, 'no schedule: the run reports the two that are due');
SELECT is(public.ct_count(:'e_7', false), 1::bigint, 'no schedule: an event starting in 7 days is picked up');
SELECT is(public.ct_count(:'e_8'), 0::bigint, 'no schedule: an event starting in 8 days is not');
SELECT is(public.ct_count(:'e_sched_today', false), 1::bigint,
  'schedule: an installment due today is overdue and is picked up');

-- ── Run 5 ───────────────────────────────────────────────────────────────────

SELECT public.create_ar_collection_tasks() AS r5 \gset
SELECT is(:r5, 0, 'idempotent: after the new events a further run reports 0');

-- ── The function itself ─────────────────────────────────────────────────────

SELECT is(
  (SELECT pg_get_function_result(p.oid) FROM pg_proc p
   WHERE p.proname = 'create_ar_collection_tasks' AND p.pronamespace = 'public'::regnamespace),
  'integer', 'shape: it returns an integer, the number of tasks made');
SELECT ok(
  (SELECT p.prosecdef FROM pg_proc p
   WHERE p.proname = 'create_ar_collection_tasks' AND p.pronamespace = 'public'::regnamespace),
  'shape: it is SECURITY DEFINER');
SELECT ok(
  (SELECT 'search_path=public' = ANY (p.proconfig) FROM pg_proc p
   WHERE p.proname = 'create_ar_collection_tasks' AND p.pronamespace = 'public'::regnamespace),
  'shape: its search_path is pinned to public');

-- ── Access ──────────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.create_ar_collection_tasks()', 'EXECUTE'),
  'access: anon cannot execute it');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_ar_collection_tasks()', 'EXECUTE'),
  'access: authenticated cannot execute it');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.create_ar_collection_tasks()$$, '42501', NULL,
  'access: a real call as anon is refused (42501)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.create_ar_collection_tasks()$$, '42501', NULL,
  'access: a real call as authenticated is refused (42501)');
RESET ROLE;

-- ── The job ─────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'create-ar-collection-tasks'),
  1, 'job: create-ar-collection-tasks is scheduled once');
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'create-ar-collection-tasks'),
  '20 5 * * *', 'job: it runs every day at 05:20 UTC');
SELECT is(
  (SELECT command FROM cron.job WHERE jobname = 'create-ar-collection-tasks'),
  'SELECT public.create_ar_collection_tasks();', 'job: it calls the function');

SELECT * FROM finish();
ROLLBACK;
