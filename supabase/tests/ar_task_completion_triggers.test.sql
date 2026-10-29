-- ============================================================================
-- Tests for the triggers that complete Collections tasks
-- Migration: 20261028150000_ar_task_completion_triggers.sql
-- Spec:      docs/specs/accountant-collections-05-completion-triggers.md (§1, §3, §4, §6)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_task_completion_triggers.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * a payment row (insert or update) that leaves the event's Amount Due at 0 completes EVERY open
--     task of that event: a full payment, a payment that covers only the overdue part, a Stripe-style
--     insert by the service role, a manual insert by an accountant and by an admin, an edit of the
--     amount. A partial payment completes nothing;
--   * "is 0 after this change", not a transition: an event whose Amount Due is already 0 and that has
--     an open task has it completed by any payment-row change;
--   * a soft delete that raises Amount Due completes nothing and creates nothing;
--   * a payment moved to another event checks both events (the moved row is moved by the table owner:
--     the guard of accountant-quotes-07 forbids an app user to change event_uuid);
--   * an event with no open task, and every other event, are untouched; the insert never errors;
--   * becoming lost completes the open tasks; unsigned_changes, quoted, draft, a soft delete and a
--     write of the same status complete nothing; leaving lost un-completes nothing;
--   * a failure inside either trigger never blocks the write: ar_event_amount_due is replaced by a
--     function that raises, and a BEFORE UPDATE trigger on ArEventTasks that raises is added; the
--     payment and the status change still succeed and the task stays open. The WARNING the trigger
--     raises is not a pgTAP result: run the file and look for "complete_ar_tasks_when_paid failed"
--     and "complete_ar_tasks_when_lost failed" in the output;
--   * shape: both functions are SECURITY DEFINER with search_path = public, neither can be executed by
--     anon or authenticated, and the triggers are AFTER, FOR EACH ROW, the lost one limited to
--     UPDATE OF event_status with its WHEN clause.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(62);

-- ── Helpers (dropped by the ROLLBACK) ───────────────────────────────────────

CREATE FUNCTION public.tc_today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'America/Toronto')::date;
$$;

-- A booked probe event with one 1000-cent line and no tax. Starting today (the default) and with no
-- schedule, its whole balance is already due; starting in 90 days it is not.
CREATE FUNCTION public.tc_event(
  p_status event_status DEFAULT 'booked', p_start date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_start date := coalesce(p_start, public.tc_today());
  v_id uuid;
BEGIN
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, event_status)
  VALUES ('ar completion probe', v_start, v_start + 1, false, false, p_status)
  RETURNING id INTO v_id;
  INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid)
  VALUES ('line', 'USD', 1000, 1, v_id);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.tc_inst(p_event uuid, p_due date, p_bps int DEFAULT 10000) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
  VALUES (p_event, p_due, 'USD', p_bps);
$$;

-- A payment written by the owner (no app user in the session).
CREATE FUNCTION public.tc_pay(p_event uuid, p_cents int) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name)
  VALUES (p_event, p_cents, 'USD', 'succeeded', 'Probe')
  RETURNING id;
$$;

-- A manual payment as the app writes it (the INSERT policy needs entry_source = 'manual').
CREATE FUNCTION public.tc_manual_sql(p_event uuid, p_by uuid, p_cents int) RETURNS text LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid) VALUES (%L, %s, ''USD'', ''succeeded'', ''Probe'', ''manual'', ''check'', %L)',
    p_event, p_cents, p_by);
$$;

CREATE FUNCTION public.tc_task(p_event uuid, p_completed boolean DEFAULT false) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed)
  VALUES (public.tc_today(), 'Call the customer', p_event, p_completed);
$$;

CREATE FUNCTION public.tc_open(p_event uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks" WHERE event_uuid = p_event AND completed = false;
$$;

CREATE FUNCTION public.tc_done(p_event uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks" WHERE event_uuid = p_event AND completed = true;
$$;

CREATE FUNCTION public.tc_total() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public."ArEventTasks";
$$;

-- ── Fixtures: an admin and an accountant ────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tc', 'Admin', 'tc_admin@test.com', 'clerk_tc_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Tc', 'Acct', 'tc_acct@test.com', 'clerk_tc_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

-- ═══ A full payment completes; the other events are untouched ═══════════════

SELECT public.tc_event() AS e_full \gset
SELECT public.tc_inst(:'e_full', public.tc_today());
SELECT public.tc_task(:'e_full');

-- Another event with its own open task: one still owing, one with nothing due at all.
SELECT public.tc_event() AS e_other_owing \gset
SELECT public.tc_inst(:'e_other_owing', public.tc_today());
SELECT public.tc_task(:'e_other_owing');
SELECT public.tc_event(p_start => public.tc_today() + 90) AS e_other_zero \gset
SELECT public.tc_task(:'e_other_zero');

SELECT public.tc_total() AS n0 \gset
SELECT public.tc_pay(:'e_full', 1000);

SELECT is(public.tc_open(:'e_full'), 0::bigint, 'full payment: the open task is gone');
SELECT is(public.tc_done(:'e_full'), 1::bigint, 'full payment: the task is completed, not removed');
SELECT is(public.tc_total() - :n0, 0::bigint, 'full payment: no task is created');
SELECT is(public.tc_open(:'e_other_owing'), 1::bigint,
  'another event: one that still owes keeps its open task');
SELECT is(public.tc_open(:'e_other_zero'), 1::bigint,
  'another event: one with nothing due is not completed by somebody else''s payment');

-- ═══ A partial payment does not ═════════════════════════════════════════════

SELECT public.tc_event() AS e_part \gset
SELECT public.tc_inst(:'e_part', public.tc_today());
SELECT public.tc_task(:'e_part');
SELECT public.tc_pay(:'e_part', 400);

SELECT is(public.tc_open(:'e_part'), 1::bigint, 'partial payment: the task stays open');
SELECT is(public.tc_done(:'e_part'), 0::bigint, 'partial payment: nothing is completed');

SELECT public.tc_pay(:'e_part', 600);

SELECT is(public.tc_open(:'e_part'), 0::bigint, 'partial payment: the payment that brings it to 0 completes the task');

-- ═══ A payment that covers only the overdue part ═══════════════════════════

SELECT public.tc_event(p_start => public.tc_today() + 90) AS e_overdue_part \gset
SELECT public.tc_inst(:'e_overdue_part', public.tc_today() - 1, 5000);
SELECT public.tc_inst(:'e_overdue_part', public.tc_today() + 30, 5000);
SELECT public.tc_task(:'e_overdue_part');
SELECT public.tc_pay(:'e_overdue_part', 500);

SELECT is(public.tc_open(:'e_overdue_part'), 0::bigint,
  'overdue part only: the task is completed when the overdue installment is paid');
SELECT ok(
  (SELECT remaining_cents > 0 FROM public.ar_event_balances(:'e_overdue_part', public.tc_today())),
  'overdue part only: ...although the event is not fully paid');

-- ═══ A Stripe-style insert by the service role ═════════════════════════════

SELECT public.tc_event() AS e_stripe \gset
SELECT public.tc_inst(:'e_stripe', public.tc_today());
SELECT public.tc_task(:'e_stripe');

SET LOCAL ROLE service_role;
SELECT lives_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, stripe_payment_intent_id, stripe_checkout_session_id) VALUES (%L, 1000, ''USD'', ''succeeded'', ''Stripe Payer'', ''stripe'', ''card'', ''pi_tc_1'', ''cs_tc_1'')',
    :'e_stripe'),
  'stripe: the service role records the payment');
RESET ROLE;

SELECT is(public.tc_open(:'e_stripe'), 0::bigint, 'stripe: the open task is completed');
SELECT is(public.tc_done(:'e_stripe'), 1::bigint, 'stripe: ...and kept as a completed task');

-- ═══ A manual insert by an accountant and by an admin ══════════════════════

SELECT public.tc_event() AS e_acct \gset
SELECT public.tc_inst(:'e_acct', public.tc_today());
SELECT public.tc_task(:'e_acct');
SELECT public.tc_event() AS e_admin \gset
SELECT public.tc_inst(:'e_admin', public.tc_today());
SELECT public.tc_task(:'e_admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tc_acct')::text, true);
SELECT lives_ok(public.tc_manual_sql(:'e_acct', :'user_acct', 1000),
  'accountant: records a manual payment that covers the event');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tc_admin')::text, true);
SELECT lives_ok(public.tc_manual_sql(:'e_admin', :'user_admin', 1000),
  'admin: records a manual payment that covers the event');
RESET ROLE;

SELECT is(public.tc_open(:'e_acct'), 0::bigint, 'accountant: the open task is completed');
SELECT is(public.tc_done(:'e_acct'), 1::bigint, 'accountant: ...and kept as a completed task');
SELECT is(public.tc_open(:'e_admin'), 0::bigint, 'admin: the open task is completed');
SELECT is(public.tc_done(:'e_admin'), 1::bigint, 'admin: ...and kept as a completed task');

-- ═══ Edit: changing the amount so that Amount Due becomes 0 ════════════════

SELECT public.tc_event() AS e_edit \gset
SELECT public.tc_inst(:'e_edit', public.tc_today());
SELECT public.tc_task(:'e_edit');
SELECT public.tc_pay(:'e_edit', 100);
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid)
VALUES (:'e_edit', 300, 'USD', 'succeeded', 'Edit Me', 'manual', 'check', :'user_acct')
RETURNING id AS p_edit \gset

SELECT is(public.tc_open(:'e_edit'), 1::bigint, 'edit: before the edit 400 of 1000 is paid and the task is open');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tc_acct')::text, true);
SELECT lives_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 900 WHERE id = %L', :'p_edit'),
  'edit: an accountant changes the amount');
RESET ROLE;

SELECT is(public.tc_open(:'e_edit'), 0::bigint, 'edit: the amount that makes Amount Due 0 completes the task');

-- ═══ Soft delete that raises Amount Due ════════════════════════════════════

SELECT public.tc_event() AS e_del \gset
SELECT public.tc_inst(:'e_del', public.tc_today());
SELECT public.tc_task(:'e_del');
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid)
VALUES (:'e_del', 400, 'USD', 'succeeded', 'Delete Me', 'manual', 'check', :'user_acct')
RETURNING id AS p_del \gset
SELECT public.tc_total() AS n1 \gset

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_tc_acct')::text, true);
SELECT lives_ok(
  format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''Entered twice'', installment_id = NULL WHERE id = %L',
    :'user_acct', :'p_del'),
  'soft delete: an accountant deletes the payment');
RESET ROLE;

SELECT is(public.tc_open(:'e_del'), 1::bigint, 'soft delete: Amount Due rose and the task stays open');
SELECT is(public.tc_done(:'e_del'), 0::bigint, 'soft delete: nothing is completed');
SELECT is(public.tc_total() - :n1, 0::bigint, 'soft delete: nothing is created');

-- ═══ "Is 0 after this change": Amount Due was already 0 ════════════════════

SELECT public.tc_event(p_start => public.tc_today() + 90) AS e_zero \gset
SELECT public.tc_inst(:'e_zero', public.tc_today() + 30);
SELECT public.tc_task(:'e_zero');

SELECT is(public.tc_open(:'e_zero'), 1::bigint, 'already 0: the future task is open before any payment');
SELECT public.tc_pay(:'e_zero', 100);
SELECT is(public.tc_open(:'e_zero'), 0::bigint,
  'already 0: any payment-row change completes the task (a state, not a transition)');

-- ═══ An event without an open task ═════════════════════════════════════════

SELECT public.tc_event() AS e_none \gset
SELECT public.tc_inst(:'e_none', public.tc_today());
SELECT public.tc_task(:'e_none', true);
SELECT public.tc_total() AS n2 \gset

SELECT lives_ok(format('SELECT public.tc_pay(%L, 1000)', :'e_none'),
  'no open task: the payment insert succeeds and raises no error');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE event_uuid = :'e_none'), 1,
  'no open task: ...and the payment exists');
SELECT is(public.tc_total() - :n2, 0::bigint, 'no open task: no task is created');
SELECT is(public.tc_done(:'e_none'), 1::bigint, 'no open task: the completed task is untouched');

-- ═══ A payment moved to another event checks both ══════════════════════════

-- The new event completes: B holds a payment of 1000 (nothing owed, no task yet); A owes 1000.
SELECT public.tc_event() AS e_to \gset
SELECT public.tc_inst(:'e_to', public.tc_today());
SELECT public.tc_event() AS e_from \gset
SELECT public.tc_inst(:'e_from', public.tc_today());
SELECT public.tc_pay(:'e_from', 1000) AS p_move \gset
SELECT public.tc_task(:'e_to');
SELECT public.tc_task(:'e_from');

UPDATE public."PaymentHistory" SET event_uuid = :'e_to' WHERE id = :'p_move';

SELECT is(public.tc_open(:'e_to'), 0::bigint, 'moved: the event that receives the payment gets its task completed');
SELECT is(public.tc_open(:'e_from'), 1::bigint, 'moved: the event that lost it owes again and keeps its task');

-- The old event completes: C holds 1000 and 300 (overpaid); the 300 moves to D, which still owes.
SELECT public.tc_event() AS e_old \gset
SELECT public.tc_inst(:'e_old', public.tc_today());
SELECT public.tc_pay(:'e_old', 1000);
SELECT public.tc_pay(:'e_old', 300) AS p_move2 \gset
SELECT public.tc_task(:'e_old');
SELECT public.tc_event() AS e_new \gset
SELECT public.tc_inst(:'e_new', public.tc_today());
SELECT public.tc_task(:'e_new');

UPDATE public."PaymentHistory" SET event_uuid = :'e_new' WHERE id = :'p_move2';

SELECT is(public.tc_open(:'e_old'), 0::bigint,
  'moved: the event the payment left is checked too and its task is completed');
SELECT is(public.tc_open(:'e_new'), 1::bigint,
  'moved: the receiving event still owes 700 and keeps its task');

-- ═══ Lost ══════════════════════════════════════════════════════════════════

SELECT public.tc_event() AS e_lost \gset
SELECT public.tc_task(:'e_lost');
SELECT public.tc_event() AS e_lost_other \gset
SELECT public.tc_task(:'e_lost_other');

UPDATE public."Events" SET event_status = 'lost' WHERE id = :'e_lost';

SELECT is(public.tc_open(:'e_lost'), 0::bigint, 'lost: booked to lost completes the open task');
SELECT is(public.tc_done(:'e_lost'), 1::bigint, 'lost: ...and keeps it as a completed task');
SELECT is(public.tc_open(:'e_lost_other'), 1::bigint, 'lost: another event keeps its open task');

UPDATE public."Events" SET event_status = 'booked' WHERE id = :'e_lost';

SELECT is(public.tc_done(:'e_lost'), 1::bigint, 'lost: lost back to booked un-completes nothing');
SELECT is(public.tc_open(:'e_lost'), 0::bigint, 'lost: ...and creates nothing');

SELECT public.tc_event('lost') AS e_lost_same \gset
SELECT public.tc_task(:'e_lost_same');
UPDATE public."Events" SET event_status = 'lost' WHERE id = :'e_lost_same';

SELECT is(public.tc_open(:'e_lost_same'), 1::bigint,
  'lost: writing lost over lost is not a change and completes nothing');

SELECT public.tc_event() AS e_unsigned \gset
SELECT public.tc_task(:'e_unsigned');
UPDATE public."Events" SET event_status = 'unsigned_changes' WHERE id = :'e_unsigned';
SELECT is(public.tc_open(:'e_unsigned'), 1::bigint, 'not lost: unsigned_changes keeps the open task');

SELECT public.tc_event() AS e_quoted \gset
SELECT public.tc_task(:'e_quoted');
UPDATE public."Events" SET event_status = 'quoted' WHERE id = :'e_quoted';
SELECT is(public.tc_open(:'e_quoted'), 1::bigint, 'not lost: quoted keeps the open task');

SELECT public.tc_event() AS e_draft \gset
SELECT public.tc_task(:'e_draft');
UPDATE public."Events" SET event_status = 'draft' WHERE id = :'e_draft';
SELECT is(public.tc_open(:'e_draft'), 1::bigint, 'not lost: draft keeps the open task');

SELECT public.tc_event() AS e_deleted \gset
SELECT public.tc_task(:'e_deleted');
UPDATE public."Events" SET deleted = true WHERE id = :'e_deleted';
SELECT is(public.tc_open(:'e_deleted'), 1::bigint, 'not lost: a deleted event keeps the open task');

-- ═══ A broken calculation or task update never blocks the write ═════════════

-- The open-task guard: a payment on an event with no open task does not even run the calculation.
-- A spy stands in for ar_event_amount_due and counts its calls (it answers 1, so nothing completes).
CREATE TABLE public.tc_calls (event_uuid uuid);
CREATE OR REPLACE FUNCTION public.ar_event_amount_due(p_event uuid, p_today date)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.tc_calls VALUES (p_event);
  RETURN 1;
END;
$$;

SELECT public.tc_event() AS e_spy_none \gset
SELECT public.tc_pay(:'e_spy_none', 100);
SELECT is((SELECT count(*)::int FROM public.tc_calls WHERE event_uuid = :'e_spy_none'), 0,
  'guard: a payment on an event with no open task does not run the calculation');

SELECT public.tc_event() AS e_spy_open \gset
SELECT public.tc_task(:'e_spy_open');
SELECT public.tc_pay(:'e_spy_open', 100);
SELECT is((SELECT count(*)::int FROM public.tc_calls WHERE event_uuid = :'e_spy_open'), 1,
  'guard: a payment on an event with an open task runs it once');

-- The payment trigger: ar_event_amount_due raises.
SELECT public.tc_event() AS e_broken \gset
SELECT public.tc_inst(:'e_broken', public.tc_today());
SELECT public.tc_task(:'e_broken');

CREATE OR REPLACE FUNCTION public.ar_event_amount_due(p_event uuid, p_today date)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the calculation is broken';
END;
$$;

SELECT lives_ok(format('SELECT public.tc_pay(%L, 1000)', :'e_broken'),
  'broken calculation: the payment insert still succeeds');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE event_uuid = :'e_broken'), 1,
  'broken calculation: ...and the payment is recorded');
SELECT is(public.tc_open(:'e_broken'), 1::bigint, 'broken calculation: ...and the task stays open');

-- The lost trigger: the task update raises.
CREATE FUNCTION public.tc_refuse_task_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the task update is refused';
END;
$$;
CREATE TRIGGER tc_refuse_task_update BEFORE UPDATE ON public."ArEventTasks"
  FOR EACH ROW EXECUTE FUNCTION public.tc_refuse_task_update();

SELECT public.tc_event() AS e_broken_lost \gset
SELECT public.tc_task(:'e_broken_lost');

SELECT lives_ok(
  format('UPDATE public."Events" SET event_status = ''lost'' WHERE id = %L', :'e_broken_lost'),
  'broken task update: the status change to lost still succeeds');
SELECT is((SELECT event_status::text FROM public."Events" WHERE id = :'e_broken_lost'), 'lost',
  'broken task update: ...and the event is lost');
SELECT is(public.tc_open(:'e_broken_lost'), 1::bigint, 'broken task update: ...and the task stays open');

DROP TRIGGER tc_refuse_task_update ON public."ArEventTasks";

-- ═══ Shape ═════════════════════════════════════════════════════════════════

SELECT ok(
  coalesce((SELECT p.prosecdef FROM pg_proc p WHERE p.proname = 'complete_ar_tasks_when_paid'
            AND p.pronamespace = 'public'::regnamespace), false),
  'shape: complete_ar_tasks_when_paid is SECURITY DEFINER');
SELECT ok(
  coalesce((SELECT p.prosecdef FROM pg_proc p WHERE p.proname = 'complete_ar_tasks_when_lost'
            AND p.pronamespace = 'public'::regnamespace), false),
  'shape: complete_ar_tasks_when_lost is SECURITY DEFINER');
SELECT ok(
  coalesce((SELECT 'search_path=public' = ANY (p.proconfig) FROM pg_proc p
            WHERE p.proname = 'complete_ar_tasks_when_paid' AND p.pronamespace = 'public'::regnamespace), false),
  'shape: complete_ar_tasks_when_paid pins search_path to public');
SELECT ok(
  coalesce((SELECT 'search_path=public' = ANY (p.proconfig) FROM pg_proc p
            WHERE p.proname = 'complete_ar_tasks_when_lost' AND p.pronamespace = 'public'::regnamespace), false),
  'shape: complete_ar_tasks_when_lost pins search_path to public');
SELECT ok(
  coalesce((SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
            FROM pg_proc p WHERE p.proname = 'complete_ar_tasks_when_paid'
            AND p.pronamespace = 'public'::regnamespace), false),
  'access: anon and authenticated cannot execute complete_ar_tasks_when_paid');
SELECT ok(
  coalesce((SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
            FROM pg_proc p WHERE p.proname = 'complete_ar_tasks_when_lost'
            AND p.pronamespace = 'public'::regnamespace), false),
  'access: anon and authenticated cannot execute complete_ar_tasks_when_lost');
SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE TRIGGER complete_ar_tasks_when_paid AFTER INSERT OR UPDATE ON public."PaymentHistory" FOR EACH ROW%'
            FROM pg_trigger t WHERE t.tgname = 'complete_ar_tasks_when_paid' AND NOT t.tgisinternal), false),
  'shape: the payment trigger is AFTER INSERT OR UPDATE ... FOR EACH ROW');
SELECT ok(
  coalesce((SELECT pg_get_triggerdef(t.oid) LIKE 'CREATE TRIGGER complete_ar_tasks_when_lost AFTER UPDATE OF event_status ON public."Events" FOR EACH ROW WHEN%'
            FROM pg_trigger t WHERE t.tgname = 'complete_ar_tasks_when_lost' AND NOT t.tgisinternal), false),
  'shape: the lost trigger is AFTER UPDATE OF event_status ... FOR EACH ROW WHEN (...)');

SELECT * FROM finish();
ROLLBACK;
