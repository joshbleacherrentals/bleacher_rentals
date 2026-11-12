-- ============================================================================
-- Tests for the one function that keeps Collections tasks in step with the debt
-- Migration: 20261031120000_ar_task_sync.sql
-- Spec:      docs/specs/accountant-collections-11-task-sync.md (§3, §4, §6)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_task_sync.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- This file replaces ar_collection_tasks_cron.test.sql (spec 04) and
-- ar_task_completion_triggers.test.sql (spec 05); their cases live on, pointed at the new function.
--
-- The four triggers are DEFERRED: they fire at commit. pgTAP runs everything in one transaction, so
-- nothing fires until the test says so. st_fire() runs SET CONSTRAINTS ALL IMMEDIATE and puts them
-- back to DEFERRED: it plays the part of "the transaction commits". The signed-event case comes first,
-- before any SET CONSTRAINTS, so it sees the mode the triggers were created in. After it, the nightly
-- job and the function sections never fire them, so the probes there are changed only by the calls
-- under test; the sections after those call st_fire() after every step.
--
-- What it pins down:
--   * the nightly job: creates a task for an overdue booked event with none (also after a completed
--     one), completes the open task of a booked event whose Amount Due is 0 and of a Lost event
--     (also one an accountant dated in the future), leaves everything else alone, returns the counts,
--     and a second run returns 0 and 0. cron.job holds sync-ar-collection-tasks;
--   * the function: 'created' / 'completed' / 'none' for every status, deleted, an open task of any
--     date, a missing event; the second call changes nothing; anon and authenticated cannot run it;
--   * each source, in both directions: PaymentHistory, PaymentInstallments, EventLineItems and Events
--     create a task when a change leaves a debt and complete it when a change removes it; the payment
--     paths are the owner, the service role (Stripe), an accountant and an admin;
--   * a signed event: a price edit moves it to unsigned_changes in the same transaction and no task
--     is made; after the signature the task appears. (Mutation: make the triggers INITIALLY IMMEDIATE
--     and this case goes red.);
--   * several changes in one commit give one task; a half-saved schedule can show a task that the
--     last request of the save removes;
--   * nothing blocks a write: a calculation that raises, and a task update that raises, leave the
--     payment, the schedule save and the status change committed and the tasks as they were. The
--     WARNING the trigger raises is not a pgTAP result: run the file and look for
--     "ar_sync_tasks_trigger failed" in the output;
--   * the guard (spec §3.5): every table the Amount Due functions read has a trigger or is listed
--     with a reason; it goes red when a trigger is dropped, when a new table is read, and when an
--     exception is no longer read;
--   * shape: the four triggers, the three functions, and the old functions, triggers and job gone.
--
-- "A null Events.deleted counts as not deleted" is a guard in the code only: the column is NOT NULL.
-- The overlap of two nightly runs is a separate script: ar_task_sync.concurrency.sh.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(180);

-- ── Helpers (dropped by the ROLLBACK) ───────────────────────────────────────

-- Toronto's date, the function's "today".
CREATE FUNCTION public.st_today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'America/Toronto')::date;
$$;

-- "The transaction commits": fire every deferred trigger event queued so far, then defer again.
CREATE FUNCTION public.st_fire() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END;
$$;

-- A probe event with one 1000-cent line, no tax and no payment schedule. Starting today (the
-- default) its whole balance is already due: an event with no schedule falls due on the day it
-- starts (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md).
CREATE FUNCTION public.st_event(
  p_status event_status DEFAULT 'booked', p_start date DEFAULT NULL, p_deleted boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_start date := coalesce(p_start, public.st_today());
  v_id uuid;
BEGIN
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean,
                               event_status, deleted)
  VALUES ('ar sync probe', v_start, v_start + 1, false, false, p_status, p_deleted)
  RETURNING id INTO v_id;
  INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
  VALUES ('line', 'USD', 1000, 1, v_id);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.st_inst(p_event uuid, p_due date, p_bps int DEFAULT 10000) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
  VALUES (p_event, p_due, 'USD', p_bps)
  RETURNING id;
$$;

-- A payment written by the owner (no app user in the session).
CREATE FUNCTION public.st_pay(p_event uuid, p_cents int) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name)
  VALUES (p_event, p_cents, 'USD', 'succeeded', 'Probe')
  RETURNING id;
$$;

-- A manual payment as the app writes it (the INSERT policy needs entry_source = 'manual').
CREATE FUNCTION public.st_manual_sql(p_event uuid, p_by uuid, p_cents int) RETURNS text LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid) VALUES (%L, %s, ''USD'', ''succeeded'', ''Probe'', ''manual'', ''check'', %L)',
    p_event, p_cents, p_by);
$$;

CREATE FUNCTION public.st_task(
  p_event uuid, p_note text DEFAULT 'Call the customer', p_due date DEFAULT NULL,
  p_completed boolean DEFAULT false
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed)
  VALUES (coalesce(p_due, public.st_today()), p_note, p_event, p_completed);
$$;

CREATE FUNCTION public.st_open(p_event uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks" WHERE event_uuid = p_event AND completed = false;
$$;

CREATE FUNCTION public.st_done(p_event uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks" WHERE event_uuid = p_event AND completed = true;
$$;

-- "<open>|<completed>": the tasks an event has.
CREATE FUNCTION public.st_state(p_event uuid) RETURNS text LANGUAGE sql AS $$
  SELECT public.st_open(p_event) || '|' || public.st_done(p_event);
$$;

-- "<result>|<open>|<completed>" after one call of the function.
CREATE FUNCTION public.st_run(p_event uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_result text := public.ar_sync_event_tasks(p_event, public.st_today());
BEGIN
  RETURN v_result || '|' || public.st_state(p_event);
END;
$$;

CREATE FUNCTION public.st_total() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks";
$$;

-- ── Fixtures: an admin and an accountant ────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('St', 'Admin', 'st_admin@test.com', 'clerk_st_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('St', 'Acct', 'st_acct@test.com', 'clerk_st_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

-- ═══ A signed event: the price edit moves it to unsigned_changes in the same transaction ═══
-- This case is FIRST on purpose. No SET CONSTRAINTS has run yet, so the triggers are in the mode they
-- were created in. Setup, edit and commit are one transaction, as in production: the edit fires the
-- hash trigger, which invalidates the signature and moves the event to unsigned_changes. A trigger
-- that was INITIALLY IMMEDIATE would run before that move and leave an orphaned task: mutate the
-- migration to INITIALLY IMMEDIATE and this case goes red.

INSERT INTO public."TermsAndConditions" (id, name, html_content)
VALUES (gen_random_uuid(), 'St T&C', '<p>terms</p>')
RETURNING id AS terms \gset

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, event_status,
                             external_notes, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
VALUES ('ar sync signed', public.st_today(), public.st_today() + 1, false, false, 'booked',
        'note A', 0, 0, :'terms')
RETURNING id AS s_event \gset
INSERT INTO public."EventLineItems" (event_uuid, header, quantity, value_cents, currency,
                                     is_template, deleted)
VALUES (:'s_event', 'Item', 1, 1000, 'USD', false, false);
SELECT public.st_inst(:'s_event', public.st_today());
SELECT public.st_pay(:'s_event', 1000);
SELECT contract_hash AS s_hash FROM public."Events" WHERE id = :'s_event' \gset
INSERT INTO public."ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name, status,
                                         signed_contract_hash)
VALUES (gen_random_uuid(), :'s_event', :'terms', 'Jordan Ellis', 'active', :'s_hash');
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'s_event'), 'booked',
  'signed: the event is booked, signed and paid in full');

-- The edit, in the same transaction: 1000 becomes 2000, so 1000 is owed.
UPDATE public."EventLineItems" SET value_cents = 2000 WHERE event_uuid = :'s_event';
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'s_event'), 'unsigned_changes',
  'signed: the price edit moved the event to unsigned_changes');
SELECT public.st_fire();
SELECT is(public.st_state(:'s_event'), '0|0',
  'signed: ...and no task was made, because the check saw the final status');

-- The client signs again: the event is booked and owes 1000.
SELECT contract_hash AS s_hash2 FROM public."Events" WHERE id = :'s_event' \gset
INSERT INTO public."ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name, status,
                                         signed_contract_hash)
VALUES (gen_random_uuid(), :'s_event', :'terms', 'Jordan Ellis', 'active', :'s_hash2');
UPDATE public."Events" SET event_status = 'booked' WHERE id = :'s_event';
SELECT public.st_fire();
SELECT is(public.st_state(:'s_event'), '1|0', 'signed: after the signature the event is booked again and the task is created');

-- ═══ The nightly job ═══════════════════════════════════════════════════════
-- It looks at EVERY booked event in the database, so a development database full of real bookings
-- would make "creates 4" meaningless. One run first settles whatever is there; the probes come
-- after it and the second run sees only them. On an empty database (CI) the settling does nothing.

SELECT count(*) AS settled FROM public.ar_sync_all_event_tasks() \gset

-- To be created.
SELECT public.st_event() AS n_over \gset
SELECT public.st_event(p_start => public.st_today() + 90) AS n_sched_today \gset
SELECT public.st_inst(:'n_sched_today', public.st_today());
SELECT public.st_event() AS n_done \gset
SELECT public.st_task(:'n_done', 'Call the customer', public.st_today() - 1, true);

-- Left alone.
SELECT public.st_event(p_start => public.st_today() + 1) AS n_1 \gset
SELECT public.st_event(p_start => public.st_today() + 7) AS n_7 \gset
SELECT public.st_event(p_start => public.st_today() + 8) AS n_8 \gset
SELECT public.st_event() AS n_notdue \gset
SELECT public.st_inst(:'n_notdue', public.st_today() + 1);
SELECT public.st_event() AS n_paid_nt \gset
SELECT public.st_pay(:'n_paid_nt', 1000);
SELECT public.st_event() AS n_has_task \gset
SELECT public.st_task(:'n_has_task', 'Wait for the cheque', public.st_today() + 10);
SELECT public.st_event('lost') AS n_lost_done \gset
SELECT public.st_task(:'n_lost_done', 'Call the customer', public.st_today() - 1, true);
SELECT public.st_event('quoted') AS n_quoted \gset
SELECT public.st_event('draft') AS n_draft \gset
SELECT public.st_event('unsigned_changes') AS n_unsigned \gset
SELECT public.st_event(NULL) AS n_nostatus \gset
SELECT public.st_event(p_deleted => true) AS n_deleted \gset

-- To be completed.
SELECT public.st_event() AS n_paid_stale \gset
SELECT public.st_pay(:'n_paid_stale', 1000);
SELECT public.st_task(:'n_paid_stale', 'Remind the customer about payment', public.st_today() - 5);
SELECT public.st_event(p_start => public.st_today() + 90) AS n_zero_future \gset
SELECT public.st_task(:'n_zero_future', 'Wait for the cheque', public.st_today() + 10);
SELECT public.st_event('lost') AS n_lost \gset
SELECT public.st_task(:'n_lost');

SELECT public.st_total() AS n0 \gset

SELECT created AS c1, completed AS d1 FROM public.ar_sync_all_event_tasks() \gset

SELECT is(:c1, 3, 'nightly: the first run reports the three tasks it made');
SELECT is(:d1, 3, 'nightly: ...and the three it completed');
SELECT is(public.st_total() - :n0, 3::bigint, 'nightly: no other task is made');

SELECT is(public.st_state(:'n_over'), '1|0', 'nightly creates: a booked event that owes');
SELECT is(
  (SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'n_over'),
  'Remind the customer about payment', 'nightly creates: the note is exactly the system''s');
SELECT is(
  (SELECT due_date FROM public."ArEventTasks" WHERE event_uuid = :'n_over'),
  public.st_today(), 'nightly creates: due_date is Toronto''s date');
SELECT ok(
  (SELECT created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
   FROM public."ArEventTasks" WHERE event_uuid = :'n_over'),
  'nightly creates: created_at is now');
SELECT is(public.st_state(:'n_sched_today'), '1|0', 'nightly creates: an installment due today is overdue');
SELECT is(public.st_state(:'n_done'), '1|1',
  'nightly creates: an event whose only task is completed gets a new open one, the old one untouched');

SELECT is(public.st_state(:'n_1'), '0|0', 'nightly skips: no schedule, starting tomorrow');
SELECT is(public.st_state(:'n_7'), '0|0', 'nightly skips: no schedule, starting in 7 days');
SELECT is(public.st_state(:'n_8'), '0|0', 'nightly skips: no schedule, starting in 8 days');
SELECT is(public.st_state(:'n_notdue'), '0|0', 'nightly skips: nothing due yet (installment tomorrow)');
SELECT is(public.st_state(:'n_paid_nt'), '0|0', 'nightly skips: fully paid and no task');
SELECT is(public.st_state(:'n_has_task'), '1|0', 'nightly skips: an open task of an owing event gets no second one');
SELECT is(
  (SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'n_has_task'),
  'Wait for the cheque', 'nightly skips: ...and keeps its note');
SELECT is(public.st_state(:'n_lost_done'), '0|1', 'nightly skips: a Lost event whose task is already completed');
SELECT is(public.st_state(:'n_quoted'), '0|0', 'nightly skips: status quoted');
SELECT is(public.st_state(:'n_draft'), '0|0', 'nightly skips: status draft');
SELECT is(public.st_state(:'n_unsigned'), '0|0', 'nightly skips: status unsigned_changes');
SELECT is(public.st_state(:'n_nostatus'), '0|0', 'nightly skips: no status');
SELECT is(public.st_state(:'n_deleted'), '0|0', 'nightly skips: a deleted booked event');

SELECT is(public.st_state(:'n_paid_stale'), '0|1', 'nightly completes: a booked event whose Amount Due is 0');
SELECT is(public.st_state(:'n_zero_future'), '0|1',
  'nightly completes: ...also a task an accountant dated in the future');
SELECT is(public.st_state(:'n_lost'), '0|1', 'nightly completes: a Lost event');

SELECT created AS c2, completed AS d2 FROM public.ar_sync_all_event_tasks() \gset
SELECT is(:c2, 0, 'nightly idempotent: a second run makes none');
SELECT is(:d2, 0, 'nightly idempotent: ...and completes none');
SELECT is(public.st_total() - :n0, 3::bigint, 'nightly idempotent: ...and adds no row');

SELECT is(
  (SELECT pg_get_function_result(p.oid) FROM pg_proc p
   WHERE p.proname = 'ar_sync_all_event_tasks' AND p.pronamespace = 'public'::regnamespace),
  'TABLE(created integer, completed integer)', 'nightly: it returns the two counts');

SELECT ok(NOT has_function_privilege('anon', 'public.ar_sync_all_event_tasks()', 'EXECUTE'),
  'nightly access: anon cannot execute it');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ar_sync_all_event_tasks()', 'EXECUTE'),
  'nightly access: authenticated cannot execute it');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.ar_sync_all_event_tasks()$$, '42501', NULL,
  'nightly access: a real call as anon is refused (42501)');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.ar_sync_all_event_tasks()$$, '42501', NULL,
  'nightly access: a real call as authenticated is refused (42501)');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'sync-ar-collection-tasks'),
  1, 'job: sync-ar-collection-tasks is scheduled once');
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'sync-ar-collection-tasks'),
  '20 5 * * *', 'job: it runs every day at 05:20 UTC');
SELECT is(
  (SELECT command FROM cron.job WHERE jobname = 'sync-ar-collection-tasks'),
  'SELECT * FROM public.ar_sync_all_event_tasks();', 'job: it calls the nightly function');
SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'create-ar-collection-tasks'),
  0, 'job: the old create-ar-collection-tasks is gone');

-- ═══ The function ══════════════════════════════════════════════════════════
-- Called directly, so no trigger is involved: st_run() is "<result>|<open>|<completed>".

SELECT public.st_event() AS f_ok \gset

SELECT is(public.st_run(:'f_ok'), 'created|1|0', 'function creates: a booked event that owes and has no task');
SELECT is(
  (SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'f_ok'),
  'Remind the customer about payment', 'function creates: the note is exactly the system''s');
SELECT is(
  (SELECT due_date FROM public."ArEventTasks" WHERE event_uuid = :'f_ok'),
  public.st_today(), 'function creates: due_date is Toronto''s date');
SELECT is(public.st_run(:'f_ok'), 'none|1|0', 'function: a second call changes nothing');

SELECT public.st_event() AS f_paid \gset
SELECT public.st_pay(:'f_paid', 1000);
SELECT is(public.st_run(:'f_paid'), 'none|0|0', 'function skips: Amount Due is 0 and there is no task');

SELECT public.st_event() AS f_notdue \gset
SELECT public.st_inst(:'f_notdue', public.st_today() + 1);
SELECT is(public.st_run(:'f_notdue'), 'none|0|0', 'function skips: nothing due yet');

SELECT public.st_event('quoted') AS f_quoted \gset
SELECT is(public.st_run(:'f_quoted'), 'none|0|0', 'function skips: status quoted');
SELECT public.st_event('draft') AS f_draft \gset
SELECT is(public.st_run(:'f_draft'), 'none|0|0', 'function skips: status draft');
SELECT public.st_event('unsigned_changes') AS f_unsigned \gset
SELECT is(public.st_run(:'f_unsigned'), 'none|0|0', 'function skips: status unsigned_changes');
SELECT public.st_event(NULL) AS f_nostatus \gset
SELECT is(public.st_run(:'f_nostatus'), 'none|0|0', 'function skips: no status');
SELECT public.st_event(p_deleted => true) AS f_deleted \gset
SELECT is(public.st_run(:'f_deleted'), 'none|0|0', 'function skips: a deleted booked event');

SELECT public.st_event() AS f_sys_past \gset
SELECT public.st_task(:'f_sys_past', 'Remind the customer about payment', public.st_today() - 5);
SELECT is(public.st_run(:'f_sys_past'), 'none|1|0',
  'function skips: an open system task dated in the past gets no second one');
SELECT public.st_event() AS f_acc_today \gset
SELECT public.st_task(:'f_acc_today', 'Call Dana, she promised Friday', public.st_today());
SELECT is(public.st_run(:'f_acc_today'), 'none|1|0',
  'function skips: an open accountant task dated today gets no second one');
SELECT public.st_event() AS f_acc_future \gset
SELECT public.st_task(:'f_acc_future', 'Wait for the cheque', public.st_today() + 10);
SELECT is(public.st_run(:'f_acc_future'), 'none|1|0',
  'function skips: an open accountant task dated in the future gets no second one');

SELECT public.st_event() AS f_zero \gset
SELECT public.st_pay(:'f_zero', 1000);
SELECT public.st_task(:'f_zero');
SELECT is(public.st_run(:'f_zero'), 'completed|0|1', 'function completes: an open task when Amount Due is 0');
SELECT is(public.st_run(:'f_zero'), 'none|0|1', 'function completes: ...and a second call changes nothing');

SELECT public.st_event('lost') AS f_lost \gset
SELECT public.st_task(:'f_lost', 'Call the customer', public.st_today() - 3, true);
SELECT public.st_task(:'f_lost');
SELECT is(public.st_run(:'f_lost'), 'completed|0|2', 'function completes: the open task of a Lost event');
SELECT public.st_event('lost') AS f_lost_none \gset
SELECT is(public.st_run(:'f_lost_none'), 'none|0|0', 'function skips: a Lost event with no open task');

UPDATE public."Events" SET event_status = 'booked' WHERE id = :'f_lost';
SELECT is(public.st_run(:'f_lost'), 'created|1|2',
  'function: lost back to booked un-completes nothing; the debt gets a new task');

SELECT public.st_event() AS f_again \gset
SELECT public.st_task(:'f_again', 'Call the customer', public.st_today() - 1, true);
SELECT is(public.st_run(:'f_again'), 'created|1|1', 'function creates: again after a completed task');

SELECT public.st_event('quoted') AS k_quoted \gset
SELECT public.st_task(:'k_quoted');
SELECT is(public.st_run(:'k_quoted'), 'none|1|0', 'function keeps the task: status quoted');
SELECT public.st_event('draft') AS k_draft \gset
SELECT public.st_task(:'k_draft');
SELECT is(public.st_run(:'k_draft'), 'none|1|0', 'function keeps the task: status draft');
SELECT public.st_event('unsigned_changes') AS k_unsigned \gset
SELECT public.st_task(:'k_unsigned');
SELECT is(public.st_run(:'k_unsigned'), 'none|1|0', 'function keeps the task: status unsigned_changes');
SELECT public.st_event(NULL) AS k_nostatus \gset
SELECT public.st_task(:'k_nostatus');
SELECT is(public.st_run(:'k_nostatus'), 'none|1|0', 'function keeps the task: no status');
SELECT public.st_event(p_deleted => true) AS k_deleted \gset
SELECT public.st_task(:'k_deleted');
SELECT is(public.st_run(:'k_deleted'), 'none|1|0', 'function keeps the task: a deleted event');

SELECT is(public.ar_sync_event_tasks(gen_random_uuid(), public.st_today()), 'none',
  'function: an event that does not exist gives none');

SELECT ok(NOT has_function_privilege('anon', 'public.ar_sync_event_tasks(uuid, date)', 'EXECUTE'),
  'function access: anon cannot execute it');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ar_sync_event_tasks(uuid, date)', 'EXECUTE'),
  'function access: authenticated cannot execute it');
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT public.ar_sync_event_tasks(%L, current_date)', :'f_ok'), '42501', NULL,
  'function access: a real call as anon is refused (42501)');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.ar_sync_event_tasks(%L, current_date)', :'f_ok'), '42501', NULL,
  'function access: a real call as authenticated is refused (42501)');
RESET ROLE;

-- ═══ From here on the triggers fire: everything queued so far fires now, then each step is
-- ═══ "write, commit (st_fire), look". A setup is committed too, so a probe that owes starts with
-- ═══ the system's task exactly as it would in production.

SELECT public.st_fire();

-- ═══ PaymentHistory ════════════════════════════════════════════════════════

-- A refund raises the debt: the newest installment is un-filled.
SELECT public.st_event() AS p_refund \gset
SELECT public.st_inst(:'p_refund', public.st_today());
SELECT public.st_pay(:'p_refund', 1000);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_refund'), '0|0', 'payment refund: paid in full, no task');
SELECT public.st_pay(:'p_refund', -200);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_refund'), '1|0', 'payment refund: a refund insert leaves a debt and creates the task');
SELECT is(
  (SELECT note || '|' || due_date FROM public."ArEventTasks" WHERE event_uuid = :'p_refund'),
  'Remind the customer about payment|' || public.st_today(), 'payment refund: the system''s note, due today');

-- A covering payment completes.
SELECT public.st_event() AS p_cover \gset
SELECT public.st_inst(:'p_cover', public.st_today());
SELECT public.st_fire();
SELECT is(public.st_state(:'p_cover'), '1|0', 'payment covers: an event that owes gets the task');
SELECT public.st_total() AS t0 \gset
SELECT public.st_pay(:'p_cover', 400);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_cover'), '1|0', 'payment covers: a partial payment leaves the task open');
SELECT public.st_pay(:'p_cover', 600);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_cover'), '0|1', 'payment covers: the payment that brings Amount Due to 0 completes it');
SELECT is(public.st_total() - :t0, 0::bigint, 'payment covers: ...and no task is created on the way');

-- A payment that covers only the overdue part.
SELECT public.st_event(p_start => public.st_today() + 90) AS p_part \gset
SELECT public.st_inst(:'p_part', public.st_today() - 1, 5000);
SELECT public.st_inst(:'p_part', public.st_today() + 30, 5000);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_part'), '1|0', 'payment overdue part: the overdue installment makes the task');
SELECT public.st_pay(:'p_part', 500);
SELECT public.st_fire();
SELECT is(public.st_state(:'p_part'), '0|1', 'payment overdue part: paying the overdue installment completes it');
SELECT ok(
  (SELECT remaining_cents > 0 FROM public.ar_event_balances(:'p_part', public.st_today())),
  'payment overdue part: ...although the event is not fully paid');

-- A Stripe-style insert by the service role; the commit happens in the same role.
SELECT public.st_event() AS p_stripe \gset
SELECT public.st_inst(:'p_stripe', public.st_today());
SELECT public.st_fire();
SET LOCAL ROLE service_role;
SELECT lives_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, stripe_payment_intent_id, stripe_checkout_session_id) VALUES (%L, 1000, ''USD'', ''succeeded'', ''Stripe Payer'', ''stripe'', ''card'', ''pi_st_1'', ''cs_st_1'')',
    :'p_stripe'),
  'payment stripe: the service role records the payment');
SELECT lives_ok('SELECT public.st_fire()', 'payment stripe: ...and its commit runs the triggers');
RESET ROLE;
SELECT is(public.st_state(:'p_stripe'), '0|1', 'payment stripe: the open task is completed and kept');

-- A manual insert by an accountant and by an admin.
SELECT public.st_event() AS p_acct \gset
SELECT public.st_inst(:'p_acct', public.st_today());
SELECT public.st_event() AS p_admin \gset
SELECT public.st_inst(:'p_admin', public.st_today());
SELECT public.st_fire();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_st_acct')::text, true);
SELECT lives_ok(public.st_manual_sql(:'p_acct', :'user_acct', 1000),
  'payment manual: an accountant records a payment that covers the event');
SELECT lives_ok('SELECT public.st_fire()', 'payment manual: ...and the commit runs the triggers');
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_st_admin')::text, true);
SELECT lives_ok(public.st_manual_sql(:'p_admin', :'user_admin', 1000),
  'payment manual: an admin records a payment that covers the event');
SELECT lives_ok('SELECT public.st_fire()', 'payment manual: ...and the commit runs the triggers');
RESET ROLE;
SELECT is(public.st_state(:'p_acct'), '0|1', 'payment manual: the accountant''s payment completes the task');
SELECT is(public.st_state(:'p_admin'), '0|1', 'payment manual: the admin''s payment completes the task');

-- A lower amount and a soft delete raise the debt.
SELECT public.st_event() AS p_edit \gset
SELECT public.st_inst(:'p_edit', public.st_today());
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid)
VALUES (:'p_edit', 1000, 'USD', 'succeeded', 'Edit Me', 'manual', 'check', :'user_acct')
RETURNING id AS pay_edit \gset
SELECT public.st_event() AS p_del \gset
SELECT public.st_inst(:'p_del', public.st_today());
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid)
VALUES (:'p_del', 1000, 'USD', 'succeeded', 'Delete Me', 'manual', 'check', :'user_acct')
RETURNING id AS pay_del \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'p_edit') || ' ' || public.st_state(:'p_del'), '0|0 0|0',
  'payment edit: both events are paid in full and have no task');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_st_acct')::text, true);
SELECT lives_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 600 WHERE id = %L', :'pay_edit'),
  'payment edit: an accountant lowers the amount');
SELECT lives_ok(
  format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''Entered twice'', installment_id = NULL WHERE id = %L',
    :'user_acct', :'pay_del'),
  'payment soft delete: an accountant deletes the payment');
SELECT lives_ok('SELECT public.st_fire()', 'payment edit: ...and the commit runs the triggers');
RESET ROLE;
SELECT is(public.st_state(:'p_edit'), '1|0', 'payment edit: the lower amount leaves a debt and creates the task');
SELECT is(public.st_state(:'p_del'), '1|0', 'payment soft delete: the debt is back and the task is created');

-- A payment moved to another event checks both events (moved by the owner: the guard of
-- accountant-quotes-07 forbids an app user to change event_uuid).
SELECT public.st_event() AS p_to \gset
SELECT public.st_inst(:'p_to', public.st_today());
SELECT public.st_event() AS p_from \gset
SELECT public.st_inst(:'p_from', public.st_today());
SELECT public.st_pay(:'p_from', 1000) AS pay_move \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'p_to') || ' ' || public.st_state(:'p_from'), '1|0 0|0',
  'payment moved: before the move one owes (with a task), the other is paid');
UPDATE public."PaymentHistory" SET event_uuid = :'p_to' WHERE id = :'pay_move';
SELECT public.st_fire();
SELECT is(public.st_state(:'p_to'), '0|1', 'payment moved: the event that receives the payment gets its task completed');
SELECT is(public.st_state(:'p_from'), '1|0', 'payment moved: the event that lost it owes again and gets a task');

-- ═══ PaymentInstallments ═══════════════════════════════════════════════════

-- A date moved earlier, then later.
SELECT public.st_event(p_start => public.st_today() + 90) AS i_date \gset
SELECT public.st_inst(:'i_date', public.st_today() + 30) AS inst_date \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'i_date'), '0|0', 'installment date: nothing due yet');
UPDATE public."PaymentInstallments" SET due_date = public.st_today() WHERE id = :'inst_date';
SELECT public.st_fire();
SELECT is(public.st_state(:'i_date'), '1|0', 'installment date: moved earlier it falls due and creates the task');
UPDATE public."PaymentInstallments" SET due_date = public.st_today() + 30 WHERE id = :'inst_date';
SELECT public.st_fire();
SELECT is(public.st_state(:'i_date'), '0|1', 'installment date: moved later the debt goes and the task completes');

-- A percentage raised.
SELECT public.st_event(p_start => public.st_today() + 90) AS i_pct \gset
SELECT public.st_inst(:'i_pct', public.st_today(), 5000) AS inst_pct \gset
SELECT public.st_inst(:'i_pct', public.st_today() + 30, 5000);
SELECT public.st_pay(:'i_pct', 500);
SELECT public.st_fire();
SELECT is(public.st_state(:'i_pct'), '0|0', 'installment percentage: the first half is paid');
UPDATE public."PaymentInstallments" SET percentage_bps = 8000 WHERE id = :'inst_pct';
SELECT public.st_fire();
SELECT is(public.st_state(:'i_pct'), '1|0', 'installment percentage: raised, the overdue part is no longer covered');

-- An installment added (the first one lowered in the same save).
SELECT public.st_event(p_start => public.st_today() + 90) AS i_add \gset
SELECT public.st_inst(:'i_add', public.st_today() + 30) AS inst_add \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'i_add'), '0|0', 'installment added: one installment, not due');
UPDATE public."PaymentInstallments" SET percentage_bps = 5000 WHERE id = :'inst_add';
SELECT public.st_inst(:'i_add', public.st_today(), 5000);
SELECT public.st_fire();
SELECT is(public.st_state(:'i_add'), '1|0', 'installment added: a due installment leaves a debt and creates the task');

-- An installment removed (DELETE).
SELECT public.st_event(p_start => public.st_today() + 90) AS i_del \gset
SELECT public.st_inst(:'i_del', public.st_today(), 5000);
SELECT public.st_inst(:'i_del', public.st_today(), 5000) AS inst_del \gset
SELECT public.st_pay(:'i_del', 500);
SELECT public.st_fire();
SELECT is(public.st_state(:'i_del'), '1|0', 'installment removed: the second half is overdue and unpaid');
DELETE FROM public."PaymentInstallments" WHERE id = :'inst_del';
SELECT public.st_fire();
SELECT is(public.st_state(:'i_del'), '0|1', 'installment removed: the debt goes with it and the task completes');

-- ═══ EventLineItems ════════════════════════════════════════════════════════

-- A line added, then raised.
SELECT public.st_event() AS l_add \gset
SELECT public.st_inst(:'l_add', public.st_today());
SELECT public.st_pay(:'l_add', 1000);
SELECT public.st_event() AS l_up \gset
SELECT public.st_inst(:'l_up', public.st_today());
SELECT public.st_pay(:'l_up', 1000);
SELECT public.st_fire();
SELECT is(public.st_state(:'l_add') || ' ' || public.st_state(:'l_up'), '0|0 0|0', 'line: both events are paid in full');
INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
VALUES ('extra', 'USD', 500, 1, :'l_add');
UPDATE public."EventLineItems" SET value_cents = 1500 WHERE event_uuid = :'l_up';
SELECT public.st_fire();
SELECT is(public.st_state(:'l_add'), '1|0', 'line added: the paid part no longer covers the price, the task is created');
SELECT is(public.st_state(:'l_up'), '1|0', 'line raised: the paid part no longer covers the price, the task is created');

-- A line lowered, then soft-deleted.
SELECT public.st_event() AS l_down \gset
SELECT public.st_inst(:'l_down', public.st_today());
SELECT public.st_pay(:'l_down', 600);
SELECT public.st_event() AS l_gone \gset
SELECT public.st_inst(:'l_gone', public.st_today());
SELECT public.st_fire();
SELECT is(public.st_state(:'l_down') || ' ' || public.st_state(:'l_gone'), '1|0 1|0', 'line: both events owe and have a task');
UPDATE public."EventLineItems" SET value_cents = 600 WHERE event_uuid = :'l_down';
UPDATE public."EventLineItems" SET deleted = true WHERE event_uuid = :'l_gone';
SELECT public.st_fire();
SELECT is(public.st_state(:'l_down'), '0|1', 'line lowered: the price falls to what was paid, the task completes');
SELECT is(public.st_state(:'l_gone'), '0|1', 'line soft-deleted: nothing left to pay, the task completes');

-- ═══ Events ════════════════════════════════════════════════════════════════

-- unsigned_changes back to booked with a debt.
SELECT public.st_event('unsigned_changes') AS v_unsigned \gset
SELECT public.st_inst(:'v_unsigned', public.st_today());
SELECT public.st_fire();
SELECT is(public.st_state(:'v_unsigned'), '0|0', 'event status: unsigned_changes gets no task');
UPDATE public."Events" SET event_status = 'booked' WHERE id = :'v_unsigned';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_unsigned'), '1|0', 'event status: unsigned_changes to booked with a debt creates the task');

-- lost back to booked with a debt.
SELECT public.st_event('lost') AS v_lost \gset
SELECT public.st_inst(:'v_lost', public.st_today());
SELECT public.st_fire();
UPDATE public."Events" SET event_status = 'booked' WHERE id = :'v_lost';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_lost'), '1|0', 'event status: lost reopened with a debt creates the task');

-- restored from deleted.
SELECT public.st_event(p_deleted => true) AS v_restored \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'v_restored'), '0|0', 'event deleted: a deleted event gets no task');
UPDATE public."Events" SET deleted = false WHERE id = :'v_restored';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_restored'), '1|0', 'event deleted: restored with a debt it gets the task');

-- event_start moved (no schedule): it falls due on the day the event starts, not before.
SELECT public.st_event(p_start => public.st_today() + 30) AS v_start \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'v_start'), '0|0', 'event start: 30 days away, nothing due');
UPDATE public."Events" SET event_start = public.st_today() + 3, event_end = public.st_today() + 4 WHERE id = :'v_start';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_start'), '0|0', 'event start: moved 3 days ahead there is still nothing due');
UPDATE public."Events" SET event_start = public.st_today(), event_end = public.st_today() + 1 WHERE id = :'v_start';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_start'), '1|0', 'event start: moved to today it falls due and creates the task');
UPDATE public."Events" SET event_start = public.st_today() + 5, event_end = public.st_today() + 6 WHERE id = :'v_start';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_start'), '0|1', 'event start: moved later again it owes nothing and the task is completed');

-- A tax change that creates a debt, then removes it.
SELECT public.st_event() AS v_tax \gset
SELECT public.st_inst(:'v_tax', public.st_today());
SELECT public.st_pay(:'v_tax', 1000);
SELECT public.st_fire();
SELECT is(public.st_state(:'v_tax'), '0|0', 'event tax: paid in full');
UPDATE public."Events" SET tax_amount_cents = 100 WHERE id = :'v_tax';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_tax'), '1|0', 'event tax: a tax that raises the total creates the task');
UPDATE public."Events" SET tax_amount_cents = 0 WHERE id = :'v_tax';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_tax'), '0|1', 'event tax: taking it off completes the task');

-- To lost completes; unsigned_changes and a soft delete keep the task.
SELECT public.st_event() AS v_to_lost \gset
SELECT public.st_inst(:'v_to_lost', public.st_today());
SELECT public.st_event() AS v_to_unsigned \gset
SELECT public.st_inst(:'v_to_unsigned', public.st_today());
SELECT public.st_event() AS v_to_deleted \gset
SELECT public.st_inst(:'v_to_deleted', public.st_today());
SELECT public.st_fire();
SELECT is(
  public.st_state(:'v_to_lost') || ' ' || public.st_state(:'v_to_unsigned') || ' ' || public.st_state(:'v_to_deleted'),
  '1|0 1|0 1|0', 'event status: three owing events, each with a task');
UPDATE public."Events" SET event_status = 'lost' WHERE id = :'v_to_lost';
UPDATE public."Events" SET event_status = 'unsigned_changes' WHERE id = :'v_to_unsigned';
UPDATE public."Events" SET deleted = true WHERE id = :'v_to_deleted';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_to_lost'), '0|1', 'event status: booked to lost completes the task');
SELECT is(public.st_state(:'v_to_unsigned'), '1|0', 'event status: booked to unsigned_changes keeps the task');
SELECT is(public.st_state(:'v_to_deleted'), '1|0', 'event status: a soft delete keeps the task');

-- Lost is a state: any later change to a Lost event completes a task that was somehow left.
SELECT public.st_event('lost') AS v_lost_state \gset
SELECT public.st_fire();
SELECT public.st_task(:'v_lost_state');
UPDATE public."Events" SET event_name = 'renamed' WHERE id = :'v_lost_state';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_lost_state'), '0|1', 'event lost: any change to a Lost event completes its open task (a state, not a transition)');

-- A no-op update does nothing: an accountant completed the task and wrote no next one.
SELECT public.st_event() AS v_noop \gset
SELECT public.st_inst(:'v_noop', public.st_today());
SELECT public.st_fire();
UPDATE public."ArEventTasks" SET completed = true WHERE event_uuid = :'v_noop';
UPDATE public."Events" SET event_name = event_name WHERE id = :'v_noop';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_noop'), '0|1', 'event no-op: an update that changes nothing does not run the check');
UPDATE public."Events" SET event_name = 'changed' WHERE id = :'v_noop';
SELECT public.st_fire();
SELECT is(public.st_state(:'v_noop'), '1|1', 'event no-op: ...while a real change to the same event does');

-- ═══ Several changes in one commit ═════════════════════════════════════════

SELECT public.st_event() AS m_quote \gset
SELECT public.st_inst(:'m_quote', public.st_today());
SELECT public.st_pay(:'m_quote', 1000);
SELECT public.st_fire();
INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
SELECT 'extra ' || n, 'USD', 100, 1, :'m_quote'::uuid FROM generate_series(1, 5) n;
UPDATE public."Events" SET tax_amount_cents = 50 WHERE id = :'m_quote';
SELECT lives_ok('SELECT public.st_fire()', 'one commit: five new lines and a tax change run without an error');
SELECT is(public.st_state(:'m_quote'), '1|0', 'one commit: ...and make one task');

-- ═══ A half-saved schedule ═════════════════════════════════════════════════
-- A schedule is saved as several requests; each is its own commit here (st_fire between them).

SELECT public.st_event(p_start => public.st_today() + 90) AS h_gone \gset
SELECT public.st_inst(:'h_gone', public.st_today() + 30, 5000);
SELECT public.st_inst(:'h_gone', public.st_today() + 60, 5000) AS inst_gone \gset
SELECT public.st_event(p_start => public.st_today() + 90) AS h_stays \gset
SELECT public.st_inst(:'h_stays', public.st_today() + 30, 5000) AS inst_stays_1 \gset
SELECT public.st_inst(:'h_stays', public.st_today() + 60, 5000) AS inst_stays_2 \gset
SELECT public.st_fire();
SELECT is(public.st_state(:'h_gone') || ' ' || public.st_state(:'h_stays'), '0|0 0|0', 'half-saved: both schedules are in the future');

-- Request 1 of each save: the second installment is moved to today.
UPDATE public."PaymentInstallments" SET due_date = public.st_today() WHERE id IN (:'inst_gone', :'inst_stays_2');
SELECT public.st_fire();
SELECT is(public.st_state(:'h_gone') || ' ' || public.st_state(:'h_stays'), '1|0 1|0',
  'half-saved: the first request creates a task the final schedule may not justify');
SELECT id AS h_stays_task FROM public."ArEventTasks" WHERE event_uuid = :'h_stays' \gset

-- The last request: the first save puts the date back (final Amount Due 0); the second saves a schedule
-- that still owes.
UPDATE public."PaymentInstallments" SET due_date = public.st_today() + 60 WHERE id = :'inst_gone';
UPDATE public."PaymentInstallments" SET due_date = public.st_today() + 10 WHERE id = :'inst_stays_1';
SELECT public.st_fire();
SELECT is(public.st_state(:'h_gone'), '0|1', 'half-saved: the last request of the save, owing nothing, completes the task');
SELECT is(public.st_state(:'h_stays'), '1|0', 'half-saved: a final schedule that still owes keeps its task');
SELECT is((SELECT id FROM public."ArEventTasks" WHERE event_uuid = :'h_stays' AND completed = false), :'h_stays_task'::uuid,
  'half-saved: ...the same task, not a new one');

-- ═══ The new rule at the deploy (spec 24) ══════════════════════════════════
-- Under the old rule an event with no schedule that starts in 1 to 7 days owed its whole balance and
-- had an open task. Under the new rule its Amount Due is 0: ar_sync_event_tasks completes that task
-- (and the trigger of spec 18 stamps finished_at), and so does the one pass that migration
-- 20261111140000_ar_no_schedule_due_on_start_day.sql runs at the deploy. No trigger is fired
-- between the inserts and the calls, so only the calls under test change a task.

SELECT public.st_event(p_start => public.st_today() + 3) AS z_stale \gset
SELECT public.st_event(p_start => public.st_today() + 3) AS z_stale2 \gset
SELECT public.st_event() AS z_live \gset
SELECT public.st_fire();
-- The firing gave z_live (it starts today, so it owes) its open task and the other two none. The tasks
-- the old rule made for the stale ones are written by hand.
SELECT public.st_task(:'z_stale', 'Remind the customer about payment');
SELECT public.st_task(:'z_stale2', 'Remind the customer about payment');

SELECT is(public.st_run(:'z_stale'), 'completed|0|1',
  'stale task: an event with no schedule that starts in 3 days has its open task completed');
SELECT ok(
  (SELECT finished_at IS NOT NULL FROM public."ArEventTasks" WHERE event_uuid = :'z_stale'),
  'stale task: ...and its finished_at is set');

SELECT public.st_total() AS z0 \gset

-- The closing pass of the migration, copied word for word (migration 20261111140000).
DO $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_event uuid;
BEGIN
  FOR v_event IN
    SELECT DISTINCT t.event_uuid FROM public."ArEventTasks" t WHERE t.completed = false
  LOOP
    PERFORM public.ar_sync_event_tasks(v_event, v_today);
  END LOOP;
END;
$$;

SELECT is(public.st_state(:'z_stale2'), '0|1', 'closing pass: the open task of an event that is not overdue is closed');
SELECT ok(
  (SELECT finished_at IS NOT NULL FROM public."ArEventTasks" WHERE event_uuid = :'z_stale2'),
  'closing pass: ...with finished_at set');
SELECT is(public.st_state(:'z_live'), '1|0', 'closing pass: an open task of an event that is overdue stays open');
SELECT is(public.st_total() - :z0, 0::bigint, 'closing pass: it creates no task');

-- ═══ Nothing blocks a write ════════════════════════════════════════════════
-- A calculation that raises. The calculation is replaced for the rest of the test.

SELECT public.st_event() AS b_pay \gset
SELECT public.st_inst(:'b_pay', public.st_today());
SELECT public.st_event(p_start => public.st_today() + 90) AS b_sched \gset
SELECT public.st_inst(:'b_sched', public.st_today() + 30) AS inst_b \gset
SELECT public.st_event('unsigned_changes') AS b_status \gset
SELECT public.st_inst(:'b_status', public.st_today());
SELECT public.st_fire();
SELECT is(public.st_state(:'b_pay') || ' ' || public.st_state(:'b_sched') || ' ' || public.st_state(:'b_status'),
  '1|0 0|0 0|0', 'broken calculation: a task, a schedule not yet due, and an event that is not booked');

CREATE OR REPLACE FUNCTION public.ar_event_amount_due(p_event uuid, p_today date)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the calculation is broken';
END;
$$;

SELECT lives_ok(format('SELECT public.st_pay(%L, 1000)', :'b_pay'),
  'broken calculation: the payment insert succeeds');
UPDATE public."PaymentInstallments" SET due_date = public.st_today() WHERE id = :'inst_b';
UPDATE public."Events" SET event_status = 'booked' WHERE id = :'b_status';
SELECT lives_ok('SELECT public.st_fire()', 'broken calculation: ...and the commit with the schedule save and the status change succeeds');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE event_uuid = :'b_pay'), 1,
  'broken calculation: ...and the payment is recorded');
SELECT is((SELECT due_date FROM public."PaymentInstallments" WHERE id = :'inst_b'), public.st_today(),
  'broken calculation: ...and the schedule change is saved');
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'b_status'), 'booked',
  'broken calculation: ...and the status change is saved');
SELECT is(public.st_state(:'b_pay') || ' ' || public.st_state(:'b_sched') || ' ' || public.st_state(:'b_status'),
  '1|0 0|0 0|0', 'broken calculation: the tasks are as they were');

-- A task update that raises: the Lost branch writes to ArEventTasks and never calls the calculation.
CREATE FUNCTION public.st_refuse_task_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the task update is refused';
END;
$$;
CREATE TRIGGER st_refuse_task_update BEFORE UPDATE ON public."ArEventTasks"
  FOR EACH ROW EXECUTE FUNCTION public.st_refuse_task_update();

SELECT public.st_event() AS b_lost \gset
SELECT public.st_task(:'b_lost');
SELECT lives_ok(
  format('UPDATE public."Events" SET event_status = ''lost'' WHERE id = %L', :'b_lost'),
  'broken task update: the status change to lost succeeds');
SELECT lives_ok('SELECT public.st_fire()', 'broken task update: ...and so does its commit');
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'b_lost'), 'lost',
  'broken task update: ...and the event is lost');
SELECT is(public.st_state(:'b_lost'), '1|0', 'broken task update: ...and the task stays open');

DROP TRIGGER st_refuse_task_update ON public."ArEventTasks";

-- ═══ The guard against a forgotten table (spec §3.5) ═══════════════════════
-- The test's own copy of the rule: every table named in the definition of an ar_* function (the
-- Amount Due calculation) except ar_sync_*, minus the listed exceptions, needs a deferred constraint
-- trigger bound to ar_sync_tasks_trigger.

CREATE TABLE public.st_guard_exceptions (tbl text PRIMARY KEY, reason text NOT NULL);
INSERT INTO public.st_guard_exceptions VALUES
  ('SalesOffices',   'office currency, covered by the nightly run (spec 11 D4)'),
  ('QboConnections', 'office currency, covered by the nightly run (spec 11 D4)'),
  ('Addresses',      'office currency, covered by the nightly run (spec 11 D4)');

CREATE FUNCTION public.st_guard_read() RETURNS SETOF text LANGUAGE sql AS $$
  SELECT DISTINCT m[1]
  FROM pg_proc p, LATERAL regexp_matches(pg_get_functiondef(p.oid), '"([^"]+)"', 'g') AS m
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'ar\_%' AND p.proname NOT LIKE 'ar\_sync\_%'
    AND EXISTS (SELECT 1 FROM pg_class c
                WHERE c.relnamespace = 'public'::regnamespace AND c.relname = m[1] AND c.relkind IN ('r', 'p'));
$$;

-- A table the calculation reads that has neither a trigger nor a reason.
CREATE FUNCTION public.st_guard_missing() RETURNS SETOF text LANGUAGE sql AS $$
  SELECT r FROM public.st_guard_read() r
  WHERE r NOT IN (SELECT tbl FROM public.st_guard_exceptions)
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger g
      WHERE g.tgrelid = format('public.%I', r)::regclass
        AND g.tgfoid = 'public.ar_sync_tasks_trigger'::regproc
        AND g.tgconstraint <> 0 AND g.tgdeferrable AND g.tginitdeferred AND NOT g.tgisinternal)
  ORDER BY 1;
$$;

-- An exception that no function reads any more.
CREATE FUNCTION public.st_guard_stale() RETURNS SETOF text LANGUAGE sql AS $$
  SELECT tbl FROM public.st_guard_exceptions
  WHERE tbl NOT IN (SELECT public.st_guard_read())
  ORDER BY 1;
$$;

SELECT is(
  (SELECT array_agg(r ORDER BY r COLLATE "C") FROM public.st_guard_read() r),
  ARRAY['Addresses', 'EventLineItems', 'Events', 'PaymentHistory', 'PaymentInstallments',
        'QboConnections', 'SalesOffices'],
  'guard: the calculation reads these seven tables');
SELECT is_empty('SELECT * FROM public.st_guard_missing()', 'guard: every table it reads has a trigger or an exception');
SELECT is_empty('SELECT * FROM public.st_guard_stale()', 'guard: every exception is still read');

-- Red when a trigger is dropped.
SELECT pg_get_triggerdef(oid) AS guard_def FROM pg_trigger WHERE tgname = 'ar_sync_tasks_on_event_line_items' \gset
DROP TRIGGER ar_sync_tasks_on_event_line_items ON public."EventLineItems";
SELECT is((SELECT string_agg(t, ',') FROM public.st_guard_missing() t), 'EventLineItems',
  'guard: dropping the line-items trigger names EventLineItems');
SELECT :'guard_def' \gexec
SELECT is_empty('SELECT * FROM public.st_guard_missing()', 'guard: ...and is green again once it is back');

-- Red when a new table is read.
CREATE TABLE public."ArGuardProbe" (id int);
CREATE FUNCTION public.ar_guard_probe() RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public."ArGuardProbe";
$$;
SELECT is((SELECT string_agg(t, ',') FROM public.st_guard_missing() t), 'ArGuardProbe',
  'guard: a new ar_* function that reads a new table names it');
INSERT INTO public.st_guard_exceptions VALUES ('ArGuardProbe', 'a probe, with a reason');
SELECT is_empty('SELECT * FROM public.st_guard_missing()', 'guard: ...and is green again once the table is listed with a reason');

-- Red when an exception is no longer read.
DROP FUNCTION public.ar_guard_probe();
SELECT is((SELECT string_agg(t, ',') FROM public.st_guard_stale() t), 'ArGuardProbe',
  'guard: an exception that nothing reads any more is named');
DROP TABLE public."ArGuardProbe";
DELETE FROM public.st_guard_exceptions WHERE tbl = 'ArGuardProbe';
SELECT is_empty('SELECT * FROM public.st_guard_stale()', 'guard: ...and is green again once it is removed');

-- ═══ Shape ═════════════════════════════════════════════════════════════════

SELECT is(
  (SELECT count(*)::int FROM pg_trigger g
   WHERE g.tgfoid = 'public.ar_sync_tasks_trigger'::regproc AND NOT g.tgisinternal
     AND g.tgconstraint <> 0 AND g.tgdeferrable AND g.tginitdeferred AND (g.tgtype & 1) = 1),
  4, 'shape: exactly four triggers use ar_sync_tasks_trigger, each a deferred row-level constraint trigger');

SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_payment_history AFTER INSERT OR DELETE OR UPDATE ON public."PaymentHistory" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION%'
            FROM pg_trigger t WHERE t.tgname = 'ar_sync_tasks_on_payment_history'), false),
  'shape: ar_sync_tasks_on_payment_history is AFTER INSERT OR UPDATE OR DELETE on PaymentHistory, no column list');
SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_payment_installments AFTER INSERT OR DELETE OR UPDATE ON public."PaymentInstallments" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION%'
            FROM pg_trigger t WHERE t.tgname = 'ar_sync_tasks_on_payment_installments'), false),
  'shape: ar_sync_tasks_on_payment_installments is AFTER INSERT OR UPDATE OR DELETE on PaymentInstallments');
SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_event_line_items AFTER INSERT OR DELETE OR UPDATE ON public."EventLineItems" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION%'
            FROM pg_trigger t WHERE t.tgname = 'ar_sync_tasks_on_event_line_items'), false),
  'shape: ar_sync_tasks_on_event_line_items is AFTER INSERT OR UPDATE OR DELETE on EventLineItems');
SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE CONSTRAINT TRIGGER ar_sync_tasks_on_events AFTER UPDATE ON public."Events" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (%to_jsonb(old.*) IS DISTINCT FROM to_jsonb(new.*)%) EXECUTE FUNCTION%'
            FROM pg_trigger t WHERE t.tgname = 'ar_sync_tasks_on_events'), false),
  'shape: ar_sync_tasks_on_events is AFTER UPDATE on Events with the to_jsonb WHEN clause, no column list');
SELECT is(
  (SELECT string_agg(replace(tgname, 'ar_sync_tasks_on_', '') || '=' || replace(encode(tgargs, 'escape'), '\000', ''),
                     ',' ORDER BY tgname COLLATE "C")
   FROM pg_trigger WHERE tgfoid = 'public.ar_sync_tasks_trigger'::regproc AND NOT tgisinternal),
  'event_line_items=event_uuid,events=id,payment_history=event_uuid,payment_installments=event_uuid',
  'shape: the Events trigger reads id, the other three event_uuid');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('ar_sync_event_tasks', 'ar_sync_all_event_tasks', 'ar_sync_tasks_trigger')
     AND p.prosecdef),
  3, 'shape: the three functions are SECURITY DEFINER');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('ar_sync_event_tasks', 'ar_sync_all_event_tasks', 'ar_sync_tasks_trigger')
     AND 'search_path=public' = ANY (p.proconfig)),
  3, 'shape: ...with search_path pinned to public');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('ar_sync_event_tasks', 'ar_sync_all_event_tasks', 'ar_sync_tasks_trigger')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  3, 'shape: ...and EXECUTE revoked from anon and authenticated');
SELECT is(
  (SELECT pg_get_function_result(p.oid) FROM pg_proc p
   WHERE p.proname = 'ar_sync_event_tasks' AND p.pronamespace = 'public'::regnamespace),
  'text', 'shape: ar_sync_event_tasks returns text');

SELECT is(to_regprocedure('public.create_ar_collection_tasks()') IS NULL, true,
  'old: create_ar_collection_tasks() is gone');
SELECT is(to_regprocedure('public.complete_ar_tasks_when_paid()') IS NULL, true,
  'old: complete_ar_tasks_when_paid() is gone');
SELECT is(to_regprocedure('public.complete_ar_tasks_when_lost()') IS NULL, true,
  'old: complete_ar_tasks_when_lost() is gone');
SELECT is(
  (SELECT count(*)::int FROM pg_trigger
   WHERE tgname IN ('complete_ar_tasks_when_paid', 'complete_ar_tasks_when_lost') AND NOT tgisinternal),
  0, 'old: the two completion triggers are gone');

SELECT * FROM finish();
ROLLBACK;
