-- ============================================================================
-- Tests for the Accountant recording, editing and soft-deleting manual payments
-- Migration: 20261004170000_accountant_writes_payments.sql
-- Spec:      docs/specs/accountant-quotes-10-accountant-writes-payments.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_writes_payments.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Only an admin and an accountant write PaymentHistory; nobody else. The rules of
-- accountant-quotes-07 (the guard, the immutable columns, the frozen deleted row, no hard delete) do
-- not look at the role, so this test repeats them for an accountant-only user: they are the reason
-- giving the accountant the policy is safe.
--
-- Two kinds of refusal, and the test tells them apart:
--   * RLS WITH CHECK, the guard trigger and the CHECKs RAISE (42501 / 23514) — asserted with
--     throws_ok;
--   * the UPDATE policy merely FILTERS the row out (a role that may not write, a Stripe row): the
--     statement matches no row and raises nothing — asserted as "0 rows affected".
-- Either way the row is read back afterwards: an update that was filtered out proves nothing about
-- the row on its own.
--
-- What it pins down:
--   * an accountant-only user inserts a manual row (and the row exists), but not a Stripe-style row
--     and not a row that is already deleted;
--   * an accountant edits each editable column and the row really changes; a zero amount and a
--     non-manual method are still refused; no immutable column changes; no Stripe row is edited;
--   * an accountant soft-deletes with a reason: caller recorded, installment detached, and every
--     malformed deletion refused; the deleted row is frozen and cannot be restored;
--   * no DELETE removes a row (an accountant included);
--   * on a quote that is not booked and on a deleted event an accountant writes the same (D1);
--   * an accountant who is also an account manager writes; an account manager alone (lead and
--     junior), a viewer and a maintainer still insert, edit and delete nothing; an admin still can.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(125);

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- The soft delete of a payment as the app writes it: four columns and nothing else.
CREATE FUNCTION public.test_del_sql(p_id uuid, p_by uuid, p_reason text) RETURNS text
LANGUAGE sql AS $$
  SELECT format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = %L, installment_id = NULL WHERE id = %L',
    p_by, p_reason, p_id);
$$;

-- A manual insert as the app writes it (the policy needs entry_source = ''manual'').
CREATE FUNCTION public.test_ins_sql(p_event uuid, p_by uuid, p_payer text) RETURNS text
LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid) VALUES (%L, 4200, ''USD'', ''succeeded'', %L, ''manual'', ''check'', %L)',
    p_event, p_payer, p_by);
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Admin', 'aw_admin@test.com', 'clerk_aw_admin', true, false)
RETURNING id AS user_admin \gset

-- An accountant and nothing else.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Only', 'aw_acct@test.com', 'clerk_aw_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

-- An accountant who is also an account manager (roles are additive).
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Both', 'aw_both@test.com', 'clerk_aw_both', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_both', true);

-- An account manager alone: a lead and a junior.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Lead', 'aw_lead@test.com', 'clerk_aw_lead', false, false)
RETURNING id AS user_lead \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_lead', true)
RETURNING id AS am_lead \gset
INSERT INTO public."Zones" (display_name) VALUES ('AccountantWrites lead zone')
RETURNING id AS zone \gset
INSERT INTO public."AccountManagerZones" (account_manager_uuid, zone_uuid, is_lead)
VALUES (:'am_lead', :'zone', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Junior', 'aw_junior@test.com', 'clerk_aw_junior', false, false)
RETURNING id AS user_junior \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_junior', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Viewer', 'aw_viewer@test.com', 'clerk_aw_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Acct', 'Maintainer', 'aw_maint@test.com', 'clerk_aw_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- Three events: a booking, a quote that was never booked, and a deleted event (D1: any event).
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'AccountantWrites booked', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0)
RETURNING id AS event_a \gset
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'AccountantWrites quoted', '2026-07-01', '2026-07-02', false, false,
        'quoted', 0, 0)
RETURNING id AS event_q \gset
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents, deleted)
VALUES (gen_random_uuid(), 'AccountantWrites deleted', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0, true)
RETURNING id AS event_d \gset

INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
VALUES (gen_random_uuid(), :'event_a', '2026-06-01', 5000, 'USD') RETURNING id AS inst_a \gset
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
VALUES (gen_random_uuid(), :'event_a', '2026-06-15', 5000, 'USD') RETURNING id AS inst_b \gset

-- Manual rows, one per purpose, so that a refusal on one never disturbs another.
INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payer_email, payment_method_type, reference, notes, paid_at, entry_source, recorded_by_user_uuid)
SELECT :'event_a', :'inst_a', :'inst_a', v.amount, 'USD', 'succeeded', v.payer,
       'payer@example.test', v.method, 'ref-' || v.payer, 'note-' || v.payer,
       '2026-06-02 10:00:00+00', 'manual', :'user_admin'
FROM (VALUES
  ('Edit Me',      10000, 'check'),
  ('Immutable',     7000, 'check'),
  ('Refuse Me',     6000, 'ach'),
  ('Refuse Too',    6500, 'check'),
  ('Other Role',    2000, 'check'),
  ('Both Roles',    3000, 'check'),
  ('Admin Writes',  1100, 'check'),
  ('Admin Deleted', 1200, 'check')
) AS v(payer, amount, method);
SELECT id AS p_edit      FROM public."PaymentHistory" WHERE payer_name = 'Edit Me' \gset
SELECT id AS p_imm       FROM public."PaymentHistory" WHERE payer_name = 'Immutable' \gset
SELECT id AS p_ref       FROM public."PaymentHistory" WHERE payer_name = 'Refuse Me' \gset
SELECT id AS p_ref2      FROM public."PaymentHistory" WHERE payer_name = 'Refuse Too' \gset
SELECT id AS p_other     FROM public."PaymentHistory" WHERE payer_name = 'Other Role' \gset
SELECT id AS p_both      FROM public."PaymentHistory" WHERE payer_name = 'Both Roles' \gset
SELECT id AS p_admin     FROM public."PaymentHistory" WHERE payer_name = 'Admin Writes' \gset
SELECT id AS p_admindel  FROM public."PaymentHistory" WHERE payer_name = 'Admin Deleted' \gset

INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payment_method_type, paid_at, entry_source, recorded_by_user_uuid)
VALUES (:'event_a', :'inst_b', :'inst_b', 5000, 'USD', 'succeeded', 'Delete Me',
        'manual_credit_card', '2026-06-03 10:00:00+00', 'manual', :'user_admin')
RETURNING id AS p_del \gset

-- One manual row on the quote that was never booked and one on the deleted event (D1).
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, payment_method_type, paid_at,
   entry_source, recorded_by_user_uuid)
VALUES (:'event_q', 8000, 'USD', 'succeeded', 'On Quote', 'check', '2026-06-04 10:00:00+00',
        'manual', :'user_admin')
RETURNING id AS p_quote \gset
INSERT INTO public."PaymentHistory"
  (event_uuid, amount_cents, currency, status, payer_name, payment_method_type, paid_at,
   entry_source, recorded_by_user_uuid)
VALUES (:'event_d', 9000, 'USD', 'succeeded', 'On Deleted', 'check', '2026-06-05 10:00:00+00',
        'manual', :'user_admin')
RETURNING id AS p_dead \gset

INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payment_method_type, paid_at, entry_source, stripe_payment_intent_id,
   stripe_checkout_session_id)
VALUES (:'event_a', :'inst_a', :'inst_a', 3000, 'USD', 'succeeded', 'Stripe Payer',
        'card', '2026-06-06 10:00:00+00', 'stripe', 'pi_aw_1', 'cs_aw_1')
RETURNING id AS p_stripe \gset

-- What the rows look like before anything is tried on them.
SELECT to_jsonb(p)::text AS snap_imm    FROM public."PaymentHistory" p WHERE p.id = :'p_imm' \gset
SELECT to_jsonb(p)::text AS snap_ref    FROM public."PaymentHistory" p WHERE p.id = :'p_ref' \gset
SELECT to_jsonb(p)::text AS snap_ref2   FROM public."PaymentHistory" p WHERE p.id = :'p_ref2' \gset
SELECT to_jsonb(p)::text AS snap_other  FROM public."PaymentHistory" p WHERE p.id = :'p_other' \gset
SELECT to_jsonb(p)::text AS snap_stripe FROM public."PaymentHistory" p WHERE p.id = :'p_stripe' \gset

-- ═══ INSERT: an accountant records a manual payment ══════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_acct')::text, true);

SELECT is(
  public.test_rows_affected(public.test_ins_sql(:'event_a', :'user_acct', 'Acct Booked')),
  1, 'an accountant-only user inserts a manual row on a booking');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE payer_name = 'Acct Booked'), 1,
  '...and the row exists');
SELECT is((SELECT recorded_by_user_uuid FROM public."PaymentHistory" WHERE payer_name = 'Acct Booked'), :'user_acct'::uuid,
  '...and it names the accountant as its author');

SELECT throws_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, stripe_payment_intent_id, stripe_checkout_session_id) VALUES (%L, 100, ''USD'', ''succeeded'', ''Acct Stripe'', ''stripe'', ''card'', ''pi_aw_x'', ''cs_aw_x'')',
    :'event_a'),
  '42501', NULL, 'an accountant cannot insert a Stripe-style row');
SELECT throws_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid) VALUES (%L, 100, ''USD'', ''succeeded'', ''Acct Claims'', ''stripe'', ''check'', %L)',
    :'event_a', :'user_acct'),
  '42501', NULL, 'an accountant cannot insert a row that claims to be Stripe, even with a manual method');
SELECT throws_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES (%L, 100, ''USD'', ''succeeded'', ''Acct Born deleted'', ''manual'', ''check'', %L, now(), %L, ''x'')',
    :'event_a', :'user_acct', :'user_acct'),
  '42501', NULL, 'an accountant cannot insert a row that is already deleted');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE payer_name IN ('Acct Stripe', 'Acct Claims', 'Acct Born deleted')), 0,
  '...and none of those three rows exists');

-- ═══ EDIT: an accountant changes each editable column of a manual row ════════

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 12345 WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the amount');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_edit'), 12345,
  '...and the amount really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET paid_at = %L WHERE id = %L', '2026-08-01 12:00:00+00', :'p_edit')),
  1, 'an accountant can change the paid date');
SELECT is((SELECT paid_at FROM public."PaymentHistory" WHERE id = :'p_edit'), '2026-08-01 12:00:00+00'::timestamptz,
  '...and the paid date really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''manual_credit_card'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the method to manual_credit_card');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'manual_credit_card',
  '...and the method really changed to manual_credit_card');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''ach'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the method to ach');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'ach',
  '...and the method really changed to ach');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''check'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the method to check');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check',
  '...and the method really changed to check');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payer_name = ''Corrected Payer'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the payer');
SELECT is((SELECT payer_name FROM public."PaymentHistory" WHERE id = :'p_edit'), 'Corrected Payer',
  '...and the payer really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET reference = ''check 9999'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the reference');
SELECT is((SELECT reference FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check 9999',
  '...and the reference really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET notes = ''a corrected note'' WHERE id = %L', :'p_edit')),
  1, 'an accountant can change the notes');
SELECT is((SELECT notes FROM public."PaymentHistory" WHERE id = :'p_edit'), 'a corrected note',
  '...and the notes really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET installment_id = %L WHERE id = %L', :'inst_b', :'p_edit')),
  1, 'an accountant can move the payment to another installment');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), :'inst_b'::uuid,
  '...and installment_id really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET installment_id = NULL WHERE id = %L', :'p_edit')),
  1, 'an accountant can apply the payment to no installment');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), NULL::uuid,
  '...and installment_id really became null');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET intended_installment_id = %L WHERE id = %L', :'inst_b', :'p_edit')),
  1, 'an accountant can change intended_installment_id');
SELECT is((SELECT intended_installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), :'inst_b'::uuid,
  '...and intended_installment_id really changed');

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 0 WHERE id = %L', :'p_edit'),
  '23514', NULL, 'an accountant: a change to a zero amount is refused by the CHECK');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_edit'), 12345,
  '...and the amount is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payment_method_type = ''card'' WHERE id = %L', :'p_edit'),
  '23514', NULL, 'an accountant: a change of method to card is refused by the CHECK');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check',
  '...and the method is unchanged');

-- ═══ IMMUTABLE COLUMNS: refused by the guard (42501), row unchanged ══════════

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET id = gen_random_uuid() WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET event_uuid = %L WHERE id = %L', :'event_q', :'p_imm'),
  '42501', NULL, 'an accountant cannot change event_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET currency = ''CAD'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change currency');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET status = ''pending'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change status');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET entry_source = ''stripe'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change entry_source');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET recorded_by_user_uuid = %L WHERE id = %L', :'user_viewer', :'p_imm'),
  '42501', NULL, 'an accountant cannot change recorded_by_user_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET created_at = now() - interval ''1 day'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change created_at');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payer_email = ''other@example.test'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change payer_email');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_payment_intent_id = ''pi_x'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change stripe_payment_intent_id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_checkout_session_id = ''cs_x'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change stripe_checkout_session_id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_connection_uuid = gen_random_uuid() WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change stripe_connection_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_receipt_url = ''https://example.test/r'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant cannot change stripe_receipt_url');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 1, currency = ''CAD'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an accountant: one update of an editable and an immutable column is refused as a whole');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_imm'), :'snap_imm',
  '...and the row is unchanged after every one of them');

-- ═══ STRIPE ROWS: neither edited nor deleted ═════════════════════════════════

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET notes = ''edited'' WHERE id = %L', :'p_stripe')),
  0, 'an accountant edits no Stripe row (the policy matches none)');
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_stripe', :'user_acct', 'no')),
  0, 'an accountant soft-deletes no Stripe row (the policy matches none)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_stripe'), :'snap_stripe',
  '...and the Stripe row is unchanged');

-- ═══ SOFT DELETE ═════════════════════════════════════════════════════════════

SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_del', :'user_acct', 'entered twice')),
  1, 'an accountant soft-deletes a manual row with a reason');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_del'), NULL::timestamptz,
  '...deleted_at is set');
SELECT is((SELECT deleted_by_user_uuid FROM public."PaymentHistory" WHERE id = :'p_del'), :'user_acct'::uuid,
  '...deleted_by_user_uuid is the caller');
SELECT is((SELECT delete_reason FROM public."PaymentHistory" WHERE id = :'p_del'), 'entered twice',
  '...delete_reason is kept');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_del'), NULL::uuid,
  '...installment_id became null');
SELECT is((SELECT intended_installment_id FROM public."PaymentHistory" WHERE id = :'p_del'), :'inst_b'::uuid,
  '...intended_installment_id is unchanged');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_del'), 5000,
  '...and so is the amount');

-- Refusals, each on a row that is not deleted, each followed by a read-back.
SELECT throws_ok(
  public.test_del_sql(:'p_ref', :'user_acct', NULL),
  '23514', NULL, 'an accountant: a deletion with a null reason is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  public.test_del_sql(:'p_ref', :'user_acct', ''),
  '23514', NULL, 'an accountant: a deletion with an empty reason is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  public.test_del_sql(:'p_ref', :'user_acct', '   '),
  '23514', NULL, 'an accountant: a deletion with a reason of spaces only is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  public.test_del_sql(:'p_ref', NULL, 'a reason'),
  '42501', NULL, 'an accountant: a deletion with no deleted_by_user_uuid is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  public.test_del_sql(:'p_ref', :'user_viewer', 'a reason'),
  '42501', NULL, 'an accountant: a deletion attributed to someone other than the caller is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'' WHERE id = %L', :'user_acct', :'p_ref'),
  '23514', NULL, 'an accountant: a deletion that leaves installment_id set is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'', installment_id = NULL, amount_cents = 1 WHERE id = %L', :'user_acct', :'p_ref'),
  '42501', NULL, 'an accountant: a deletion that also changes the amount is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'', installment_id = NULL, intended_installment_id = %L WHERE id = %L', :'user_acct', :'inst_b', :'p_ref2'),
  '42501', NULL, 'an accountant: a deletion that also changes intended_installment_id is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref2'), :'snap_ref2',
  '...and the row is unchanged');

-- ═══ FROZEN: a deleted payment changes in no column and does not come back ═══

SELECT to_jsonb(p)::text AS snap_del FROM public."PaymentHistory" p WHERE p.id = :'p_del' \gset

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the amount cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET paid_at = now() WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the paid date cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payment_method_type = ''ach'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the method cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payer_name = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the payer cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET reference = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the reference cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET notes = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: the notes cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET installment_id = %L WHERE id = %L', :'inst_a', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: installment_id cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET delete_reason = ''another reason'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment: delete_reason cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = NULL, deleted_by_user_uuid = NULL, delete_reason = NULL WHERE id = %L', :'p_del'),
  '42501', NULL, 'an accountant: a deleted payment cannot be restored');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_del'), :'snap_del',
  '...and the deleted row is unchanged after every one of them');

-- ═══ HARD DELETE: removes nothing, an accountant included ════════════════════

SELECT count(*) AS n_rows FROM public."PaymentHistory" \gset
SELECT is(
  public.test_rows_affected('DELETE FROM public."PaymentHistory"'),
  0, 'a DELETE by an accountant removes nothing');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory"), :n_rows::int,
  '...and the table has as many rows as before');

-- ═══ ANY EVENT (D1): a quote that was never booked, and a deleted event ══════

SELECT is(
  public.test_rows_affected(public.test_ins_sql(:'event_q', :'user_acct', 'Acct Quoted')),
  1, 'an accountant inserts a manual row on a quote that is not booked');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 8100 WHERE id = %L', :'p_quote')),
  1, 'an accountant edits a payment on a quote that is not booked');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_quote'), 8100,
  '...and the amount really changed');
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_quote', :'user_acct', 'wrong quote')),
  1, 'an accountant soft-deletes a payment on a quote that is not booked');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_quote'), NULL::timestamptz,
  '...and it is deleted');

SELECT is(
  public.test_rows_affected(public.test_ins_sql(:'event_d', :'user_acct', 'Acct On Deleted')),
  1, 'an accountant inserts a manual row on a deleted event');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 9100 WHERE id = %L', :'p_dead')),
  1, 'an accountant edits a payment on a deleted event');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_dead'), 9100,
  '...and the amount really changed');
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_dead', :'user_acct', 'wrong event')),
  1, 'an accountant soft-deletes a payment on a deleted event');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_dead'), NULL::timestamptz,
  '...and it is deleted');

-- ═══ TWO WRITERS: a payment an admin deleted is frozen for an accountant ═════

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_admin')::text, true);
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_admindel', :'user_admin', 'admin removed it')),
  1, 'an admin soft-deletes a payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_acct')::text, true);
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_admindel'),
  '42501', NULL, 'an accountant cannot edit a payment an admin deleted');

-- ═══ AN ACCOUNTANT WHO IS ALSO AN ACCOUNT MANAGER: roles are additive ════════

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_both')::text, true);

SELECT is(
  public.test_rows_affected(public.test_ins_sql(:'event_a', :'user_both', 'Both Insert')),
  1, 'an accountant who is also an account manager inserts a manual row');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 3100 WHERE id = %L', :'p_both')),
  1, 'an accountant who is also an account manager edits a payment');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_both'), 3100,
  '...and the amount really changed');
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_both', :'user_both', 'both roles')),
  1, 'an accountant who is also an account manager soft-deletes a payment');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_both'), NULL::timestamptz,
  '...and it is deleted');

-- ═══ EVERYONE ELSE STILL WRITES NOTHING ══════════════════════════════════════

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_lead')::text, true);
SELECT throws_ok(public.test_ins_sql(:'event_a', :'user_lead', 'Lead Insert'),
  '42501', NULL, 'a lead account manager alone cannot insert a payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a lead account manager alone edits no payment');
SELECT is(public.test_rows_affected(public.test_del_sql(:'p_other', :'user_lead', 'x')), 0,
  'a lead account manager alone deletes no payment');
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a lead account manager alone hard-deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_junior')::text, true);
SELECT throws_ok(public.test_ins_sql(:'event_a', :'user_junior', 'Junior Insert'),
  '42501', NULL, 'a junior account manager alone cannot insert a payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a junior account manager alone edits no payment');
SELECT is(public.test_rows_affected(public.test_del_sql(:'p_other', :'user_junior', 'x')), 0,
  'a junior account manager alone deletes no payment');
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a junior account manager alone hard-deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_viewer')::text, true);
SELECT throws_ok(public.test_ins_sql(:'event_a', :'user_viewer', 'Viewer Insert'),
  '42501', NULL, 'a viewer cannot insert a payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a viewer edits no payment');
SELECT is(public.test_rows_affected(public.test_del_sql(:'p_other', :'user_viewer', 'x')), 0,
  'a viewer deletes no payment');
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a viewer hard-deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_maint')::text, true);
SELECT throws_ok(public.test_ins_sql(:'event_a', :'user_maint', 'Maintainer Insert'),
  '42501', NULL, 'a maintainer cannot insert a payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a maintainer edits no payment');
SELECT is(public.test_rows_affected(public.test_del_sql(:'p_other', :'user_maint', 'x')), 0,
  'a maintainer deletes no payment');
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a maintainer hard-deletes no payment');

RESET ROLE;
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_other'), :'snap_other',
  '...and the payment those roles tried on is unchanged');
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE payer_name IN ('Lead Insert', 'Junior Insert', 'Viewer Insert', 'Maintainer Insert')), 0,
  '...and none of their rows exists');

-- ═══ AN ADMIN STILL CAN ══════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aw_admin')::text, true);

SELECT is(
  public.test_rows_affected(public.test_ins_sql(:'event_a', :'user_admin', 'Admin Insert')),
  1, 'an admin still inserts a manual row');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1150 WHERE id = %L', :'p_admin')),
  1, 'an admin still edits a payment');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_admin'), 1150,
  '...and the amount really changed');
SELECT is(
  public.test_rows_affected(public.test_del_sql(:'p_admin', :'user_admin', 'admin test')),
  1, 'an admin still soft-deletes a payment');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_admin'), NULL::timestamptz,
  '...and it is deleted');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
