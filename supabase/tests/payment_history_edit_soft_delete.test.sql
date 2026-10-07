-- ============================================================================
-- Tests for editing and soft-deleting a manual payment (PaymentHistory)
-- Migration: 20261004160000_payment_history_edit_and_soft_delete.sql
-- Spec:      docs/specs/accountant-quotes-07-payments-soft-delete-db.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/payment_history_edit_soft_delete.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Two kinds of refusal, and the test tells them apart:
--   * the guard trigger and the CHECK RAISE (42501 / 23514) — asserted with throws_ok;
--   * the UPDATE policy merely FILTERS the row out (a caller who is not an admin, a Stripe row):
--     the statement matches no row and raises nothing — asserted as "0 rows affected".
-- Either way the row is read back afterwards: an update that was filtered out proves nothing about
-- the row on its own.
--
-- What it pins down:
--   * an admin edits each editable column of a manual row (and the row really changes); a zero
--     amount and a non-manual method are still refused by the existing CHECKs;
--   * an admin cannot change any immutable column of a manual row, nor edit or delete a Stripe row;
--   * a soft delete sets deleted_at / deleted_by_user_uuid (= the caller) / delete_reason, detaches
--     installment_id and leaves intended_installment_id; an installment only a deleted payment
--     pointed at can then be removed; the malformed deletions are refused;
--   * a deleted payment is frozen: no column changes and it cannot be restored;
--   * no DELETE removes a row for any role; no other role than an admin or an accountant edits or
--     deletes (the accountant since accountant-quotes-10; accountant_writes_payments.test.sql
--     asserts its side in full);
--   * a row cannot be inserted already deleted; the ordinary manual insert still works;
--   * the service role and the table owner are not blocked by the guard;
--   * edits and soft deletes leave the quote hashes of the event as they were;
--   * the table has exactly the columns the guard accounts for (a new column needs a decision).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(119);

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

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Admin', 'pe_admin@test.com', 'clerk_pe_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Lead', 'pe_lead@test.com', 'clerk_pe_lead', false, false)
RETURNING id AS user_lead \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_lead', true)
RETURNING id AS am_lead \gset
INSERT INTO public."Zones" (display_name) VALUES ('PaymentEdit lead zone')
RETURNING id AS zone \gset
INSERT INTO public."AccountManagerZones" (account_manager_uuid, zone_uuid, is_lead)
VALUES (:'am_lead', :'zone', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Junior', 'pe_junior@test.com', 'clerk_pe_junior', false, false)
RETURNING id AS user_junior \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_junior', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Viewer', 'pe_viewer@test.com', 'clerk_pe_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Maintainer', 'pe_maint@test.com', 'clerk_pe_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Pay', 'Accountant', 'pe_acct@test.com', 'clerk_pe_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'PaymentEdit probe A', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0)
RETURNING id AS event_a \gset
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'PaymentEdit probe B', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0)
RETURNING id AS event_b \gset

INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
VALUES (gen_random_uuid(), :'event_a', '2026-06-01', 3000, 'USD') RETURNING id AS inst_a \gset
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
VALUES (gen_random_uuid(), :'event_a', '2026-06-15', 3000, 'USD') RETURNING id AS inst_b \gset
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
VALUES (gen_random_uuid(), :'event_a', '2026-06-30', 4000, 'USD') RETURNING id AS inst_fk \gset

-- Manual rows, one per purpose, so that a refusal on one never disturbs another.
INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payer_email, payment_method_type, reference, notes, paid_at, entry_source, recorded_by_user_uuid)
SELECT :'event_a', :'inst_a', :'inst_a', v.amount, 'USD', 'succeeded', v.payer,
       'payer@example.test', v.method, 'ref-' || v.payer, 'note-' || v.payer,
       '2026-06-02 10:00:00+00', 'manual', :'user_admin'
FROM (VALUES
  ('Edit Me',   10000, 'check'),
  ('Immutable',  7000, 'check'),
  ('Refuse Me',  6000, 'ach'),
  ('Refuse Too', 6500, 'check'),
  ('Other Role', 2000, 'check'),
  ('Service',    1500, 'check'),
  ('Acct Edit',  1300, 'check'),
  ('Acct Delete', 1400, 'check')
) AS v(payer, amount, method);
SELECT id AS p_edit  FROM public."PaymentHistory" WHERE payer_name = 'Edit Me' \gset
SELECT id AS p_imm   FROM public."PaymentHistory" WHERE payer_name = 'Immutable' \gset
SELECT id AS p_ref   FROM public."PaymentHistory" WHERE payer_name = 'Refuse Me' \gset
SELECT id AS p_ref2  FROM public."PaymentHistory" WHERE payer_name = 'Refuse Too' \gset
SELECT id AS p_other FROM public."PaymentHistory" WHERE payer_name = 'Other Role' \gset
SELECT id AS p_svc   FROM public."PaymentHistory" WHERE payer_name = 'Service' \gset
SELECT id AS p_aedit FROM public."PaymentHistory" WHERE payer_name = 'Acct Edit' \gset
SELECT id AS p_adel  FROM public."PaymentHistory" WHERE payer_name = 'Acct Delete' \gset

INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payment_method_type, paid_at, entry_source, recorded_by_user_uuid)
VALUES (:'event_a', :'inst_b', :'inst_b', 5000, 'USD', 'succeeded', 'Delete Me',
        'manual_credit_card', '2026-06-03 10:00:00+00', 'manual', :'user_admin')
RETURNING id AS p_del \gset

INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payment_method_type, paid_at, entry_source, recorded_by_user_uuid)
VALUES (:'event_a', :'inst_fk', :'inst_fk', 4000, 'USD', 'succeeded', 'Holds Installment',
        'check', '2026-06-04 10:00:00+00', 'manual', :'user_admin')
RETURNING id AS p_fk \gset

INSERT INTO public."PaymentHistory"
  (event_uuid, installment_id, intended_installment_id, amount_cents, currency, status, payer_name,
   payment_method_type, paid_at, entry_source, stripe_payment_intent_id,
   stripe_checkout_session_id)
VALUES (:'event_a', :'inst_a', :'inst_a', 3000, 'USD', 'succeeded', 'Stripe Payer',
        'card', '2026-06-05 10:00:00+00', 'stripe', 'pi_pe_1', 'cs_pe_1')
RETURNING id AS p_stripe \gset

-- What the rows look like before anything is tried on them.
SELECT to_jsonb(p)::text AS snap_imm    FROM public."PaymentHistory" p WHERE p.id = :'p_imm' \gset
SELECT to_jsonb(p)::text AS snap_ref    FROM public."PaymentHistory" p WHERE p.id = :'p_ref' \gset
SELECT to_jsonb(p)::text AS snap_ref2   FROM public."PaymentHistory" p WHERE p.id = :'p_ref2' \gset
SELECT to_jsonb(p)::text AS snap_other  FROM public."PaymentHistory" p WHERE p.id = :'p_other' \gset
SELECT to_jsonb(p)::text AS snap_stripe FROM public."PaymentHistory" p WHERE p.id = :'p_stripe' \gset
SELECT count(*) AS n_rows FROM public."PaymentHistory" \gset

-- The hashes the triggers computed for the event, to compare with after an edit and a delete.
SELECT content_hash AS hash_content, contract_hash AS hash_contract
  FROM public."Events" WHERE id = :'event_a' \gset

-- ═══ THE SHAPE OF THE TABLE ═════════════════════════════════════════════════

SELECT is(
  ARRAY(SELECT column_name::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'PaymentHistory'
         ORDER BY column_name COLLATE "C"),
  ARRAY(SELECT c FROM unnest(ARRAY[
    'amount_cents', 'created_at', 'currency', 'delete_reason', 'deleted_at',
    'deleted_by_user_uuid', 'entry_source', 'event_uuid', 'id', 'installment_id',
    'intended_installment_id', 'notes', 'paid_at', 'payer_email', 'payer_name',
    'payment_method_type', 'recorded_by_user_uuid', 'reference', 'status',
    'stripe_checkout_session_id', 'stripe_connection_uuid', 'stripe_payment_intent_id',
    'stripe_receipt_url'
  ]) AS c ORDER BY c COLLATE "C"),
  'PaymentHistory has exactly the 23 columns the guard accounts for (a new one needs a decision)');

SELECT is(
  (SELECT count(*)::int FROM public."PaymentHistory"
    WHERE deleted_at IS NOT NULL OR deleted_by_user_uuid IS NOT NULL OR delete_reason IS NOT NULL),
  0, 'rows that existed before the change (and every row inserted without them) have the three columns null');

-- ═══ EDIT: an admin changes each editable column of a manual row ═════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_admin')::text, true);

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 12345 WHERE id = %L', :'p_edit')),
  1, 'an admin can change the amount');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_edit'), 12345,
  '...and the amount really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET paid_at = %L WHERE id = %L', '2026-08-01 12:00:00+00', :'p_edit')),
  1, 'an admin can change the paid date');
SELECT is((SELECT paid_at FROM public."PaymentHistory" WHERE id = :'p_edit'), '2026-08-01 12:00:00+00'::timestamptz,
  '...and the paid date really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''manual_credit_card'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the method to manual_credit_card');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'manual_credit_card',
  '...and the method really changed to manual_credit_card');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''ach'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the method to ach');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'ach',
  '...and the method really changed to ach');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payment_method_type = ''check'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the method to check');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check',
  '...and the method really changed to check');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payer_name = ''Corrected Payer'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the payer');
SELECT is((SELECT payer_name FROM public."PaymentHistory" WHERE id = :'p_edit'), 'Corrected Payer',
  '...and the payer really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET reference = ''check 9999'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the reference');
SELECT is((SELECT reference FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check 9999',
  '...and the reference really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET notes = ''a corrected note'' WHERE id = %L', :'p_edit')),
  1, 'an admin can change the notes');
SELECT is((SELECT notes FROM public."PaymentHistory" WHERE id = :'p_edit'), 'a corrected note',
  '...and the notes really changed');

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET installment_id = %L WHERE id = %L', :'inst_b', :'p_edit')),
  1, 'an admin can move the payment to another installment');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), :'inst_b'::uuid,
  '...and installment_id really changed');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET installment_id = NULL WHERE id = %L', :'p_edit')),
  1, 'an admin can apply the payment to no installment');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), NULL::uuid,
  '...and installment_id really became null');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET intended_installment_id = %L WHERE id = %L', :'inst_b', :'p_edit')),
  1, 'an admin can change intended_installment_id');
SELECT is((SELECT intended_installment_id FROM public."PaymentHistory" WHERE id = :'p_edit'), :'inst_b'::uuid,
  '...and intended_installment_id really changed');

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 0 WHERE id = %L', :'p_edit'),
  '23514', NULL, 'a change to a zero amount is refused by the CHECK');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_edit'), 12345,
  '...and the amount is unchanged');

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payment_method_type = ''card'' WHERE id = %L', :'p_edit'),
  '23514', NULL, 'a change of method to card is refused by the CHECK');
SELECT is((SELECT payment_method_type FROM public."PaymentHistory" WHERE id = :'p_edit'), 'check',
  '...and the method is unchanged');

SELECT is((SELECT content_hash FROM public."Events" WHERE id = :'event_a'), :'hash_content',
  'edits leave the event content_hash as it was');
SELECT is((SELECT contract_hash FROM public."Events" WHERE id = :'event_a'), :'hash_contract',
  'edits leave the event contract_hash as it was');

-- ═══ IMMUTABLE COLUMNS: refused by the guard (42501), row unchanged ══════════

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET id = gen_random_uuid() WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET event_uuid = %L WHERE id = %L', :'event_b', :'p_imm'),
  '42501', NULL, 'an admin cannot change event_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET currency = ''CAD'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change currency');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET status = ''pending'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change status');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET entry_source = ''stripe'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change entry_source');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET recorded_by_user_uuid = %L WHERE id = %L', :'user_viewer', :'p_imm'),
  '42501', NULL, 'an admin cannot change recorded_by_user_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET created_at = now() - interval ''1 day'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change created_at');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payer_email = ''other@example.test'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change payer_email');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_payment_intent_id = ''pi_x'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change stripe_payment_intent_id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_checkout_session_id = ''cs_x'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change stripe_checkout_session_id');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_connection_uuid = gen_random_uuid() WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change stripe_connection_uuid');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET stripe_receipt_url = ''https://example.test/r'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'an admin cannot change stripe_receipt_url');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 1, currency = ''CAD'' WHERE id = %L', :'p_imm'),
  '42501', NULL, 'one update of an editable and an immutable column is refused as a whole');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_imm'), :'snap_imm',
  '...and the row is unchanged after every one of them');

-- ═══ STRIPE ROWS: neither edited nor deleted ═════════════════════════════════

SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET notes = ''edited'' WHERE id = %L', :'p_stripe')),
  0, 'an admin edits no Stripe row (the policy matches none)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_stripe'), :'snap_stripe',
  '...and the Stripe row is unchanged');
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''no'', installment_id = NULL WHERE id = %L',
    :'user_admin', :'p_stripe')),
  0, 'an admin soft-deletes no Stripe row (the policy matches none)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_stripe'), :'snap_stripe',
  '...and the Stripe row is still not deleted');

RESET ROLE;
SELECT throws_ok(
  format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''no'', installment_id = NULL WHERE id = %L',
    :'user_admin', :'p_stripe'),
  '23514', NULL, 'even the table owner cannot delete a Stripe row: the CHECK allows it for manual rows only');

-- ═══ SOFT DELETE ═════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_admin')::text, true);

SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''entered twice'', installment_id = NULL WHERE id = %L',
    :'user_admin', :'p_del')),
  1, 'an admin soft-deletes a manual row with a reason');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_del'), NULL::timestamptz,
  '...deleted_at is set');
SELECT is((SELECT deleted_by_user_uuid FROM public."PaymentHistory" WHERE id = :'p_del'), :'user_admin'::uuid,
  '...deleted_by_user_uuid is the caller');
SELECT is((SELECT delete_reason FROM public."PaymentHistory" WHERE id = :'p_del'), 'entered twice',
  '...delete_reason is kept');
SELECT is((SELECT installment_id FROM public."PaymentHistory" WHERE id = :'p_del'), NULL::uuid,
  '...installment_id became null (D7)');
SELECT is((SELECT intended_installment_id FROM public."PaymentHistory" WHERE id = :'p_del'), :'inst_b'::uuid,
  '...intended_installment_id is unchanged (D7)');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_del'), 5000,
  '...and so is the amount');

-- D7: the foreign key refuses to remove an installment a payment points at, and stops refusing once
-- that payment is soft-deleted. The control first, so the second half is not vacuous.
RESET ROLE;
SELECT throws_ok(
  format('DELETE FROM public."PaymentInstallments" WHERE id = %L', :'inst_fk'),
  '23503', NULL, 'an installment a payment still points at cannot be removed (the control)');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_admin')::text, true);
SELECT is(
  public.test_rows_affected(format(
    'UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''wrong quote'', installment_id = NULL WHERE id = %L',
    :'user_admin', :'p_fk')),
  1, 'an admin soft-deletes the payment that held the installment');

-- Checked here, before the installment is removed: removing an installment is a change to the
-- contract terms and moves contract_hash on its own, which is not what is being asserted.
SELECT is((SELECT content_hash FROM public."Events" WHERE id = :'event_a'), :'hash_content',
  'a soft delete leaves the event content_hash as it was');
SELECT is((SELECT contract_hash FROM public."Events" WHERE id = :'event_a'), :'hash_contract',
  'a soft delete leaves the event contract_hash as it was');

RESET ROLE;
SELECT lives_ok(
  format('DELETE FROM public."PaymentInstallments" WHERE id = %L', :'inst_fk'),
  'an installment that only a deleted payment pointed at can be removed');
SELECT is((SELECT count(*)::int FROM public."PaymentInstallments" WHERE id = :'inst_fk'), 0,
  '...and it is gone');

-- Refusals, each on a row that is not deleted, each followed by a read-back. They share one row,
-- except the last: a refusal that wrongly succeeded would delete the row and freeze it, and the
-- refusals after it would then pass for the wrong reason.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_admin')::text, true);

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = NULL, installment_id = NULL WHERE id = %L', :'user_admin', :'p_ref'),
  '23514', NULL, 'a deletion with a null reason is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = '''', installment_id = NULL WHERE id = %L', :'user_admin', :'p_ref'),
  '23514', NULL, 'a deletion with an empty reason is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''   '', installment_id = NULL WHERE id = %L', :'user_admin', :'p_ref'),
  '23514', NULL, 'a deletion with a reason of spaces only is refused (D2)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = NULL, delete_reason = ''a reason'', installment_id = NULL WHERE id = %L', :'p_ref'),
  '42501', NULL, 'a deletion with no deleted_by_user_uuid is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'', installment_id = NULL WHERE id = %L', :'user_viewer', :'p_ref'),
  '42501', NULL, 'a deletion attributed to someone other than the caller is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'' WHERE id = %L', :'user_admin', :'p_ref'),
  '23514', NULL, 'a deletion that leaves installment_id set is refused (D7)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'', installment_id = NULL, amount_cents = 1 WHERE id = %L', :'user_admin', :'p_ref'),
  '42501', NULL, 'a deletion that also changes the amount is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref'), :'snap_ref',
  '...and the row is unchanged');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''a reason'', installment_id = NULL, intended_installment_id = %L WHERE id = %L', :'user_admin', :'inst_b', :'p_ref2'),
  '42501', NULL, 'a deletion that also changes intended_installment_id is refused');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_ref2'), :'snap_ref2',
  '...and the row is unchanged');

-- ═══ FROZEN: a deleted payment changes in no column and does not come back ═══

SELECT to_jsonb(p)::text AS snap_del FROM public."PaymentHistory" p WHERE p.id = :'p_del' \gset

SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the amount cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET paid_at = now() WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the paid date cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payment_method_type = ''ach'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the method cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET payer_name = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the payer cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET reference = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the reference cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET notes = ''x'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: the notes cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET installment_id = %L WHERE id = %L', :'inst_a', :'p_del'),
  '42501', NULL, 'a deleted payment: installment_id cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET intended_installment_id = %L WHERE id = %L', :'inst_a', :'p_del'),
  '42501', NULL, 'a deleted payment: intended_installment_id cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET delete_reason = ''another reason'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: delete_reason cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_by_user_uuid = %L WHERE id = %L', :'user_lead', :'p_del'),
  '42501', NULL, 'a deleted payment: deleted_by_user_uuid cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = now() + interval ''1 day'' WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment: deleted_at cannot change');
SELECT throws_ok(
  format('UPDATE public."PaymentHistory" SET deleted_at = NULL, deleted_by_user_uuid = NULL, delete_reason = NULL WHERE id = %L', :'p_del'),
  '42501', NULL, 'a deleted payment cannot be restored (D4)');
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_del'), :'snap_del',
  '...and the deleted row is unchanged after every one of them');

-- ═══ HARD DELETE: removes nothing, for any role ══════════════════════════════

SELECT is(
  public.test_rows_affected('DELETE FROM public."PaymentHistory"'),
  0, 'a DELETE by an admin removes nothing');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_lead')::text, true);
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a DELETE by a lead account manager removes nothing');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_junior')::text, true);
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a DELETE by a junior account manager removes nothing');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_viewer')::text, true);
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a DELETE by a viewer removes nothing');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_maint')::text, true);
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a DELETE by a maintainer removes nothing');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_acct')::text, true);
SELECT is(public.test_rows_affected('DELETE FROM public."PaymentHistory"'), 0,
  'a DELETE by an accountant removes nothing');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM public."PaymentHistory"), :n_rows::int,
  '...and the table has as many rows as before (no hard delete, deleted rows included)');

-- ═══ OTHER ROLES: cannot edit or delete (the accountant can since spec 10) ═══

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_lead')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a lead account manager edits no payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''x'', installment_id = NULL WHERE id = %L', :'user_lead', :'p_other')), 0,
  'a lead account manager deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_junior')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a junior account manager edits no payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''x'', installment_id = NULL WHERE id = %L', :'user_junior', :'p_other')), 0,
  'a junior account manager deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_viewer')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a viewer edits no payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''x'', installment_id = NULL WHERE id = %L', :'user_viewer', :'p_other')), 0,
  'a viewer deletes no payment');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_maint')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 1 WHERE id = %L', :'p_other')), 0,
  'a maintainer edits no payment');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''x'', installment_id = NULL WHERE id = %L', :'user_maint', :'p_other')), 0,
  'a maintainer deletes no payment');

-- The accountant is not among the roles that cannot: since accountant-quotes-10 it edits and
-- soft-deletes like an admin (accountant_writes_payments.test.sql asserts the whole of it). It is
-- shown here on rows of its own, so that the snapshot of p_other below still holds for the rest.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_acct')::text, true);
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET amount_cents = 2222 WHERE id = %L', :'p_aedit')), 1,
  'an accountant edits a payment (since spec 10)');
SELECT is((SELECT amount_cents FROM public."PaymentHistory" WHERE id = :'p_aedit'), 2222,
  '...and the amount really changed');
SELECT is(public.test_rows_affected(format('UPDATE public."PaymentHistory" SET deleted_at = now(), deleted_by_user_uuid = %L, delete_reason = ''x'', installment_id = NULL WHERE id = %L', :'user_acct', :'p_adel')), 1,
  'an accountant deletes a payment (since spec 10)');
SELECT isnt((SELECT deleted_at FROM public."PaymentHistory" WHERE id = :'p_adel'), NULL::timestamptz,
  '...and it is deleted');

RESET ROLE;
SELECT is((SELECT to_jsonb(p)::text FROM public."PaymentHistory" p WHERE p.id = :'p_other'), :'snap_other',
  '...and the payment is unchanged after all of them');

-- ═══ INSERT ══════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_pe_admin')::text, true);

SELECT throws_ok(
  format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES (%L, 100, ''USD'', ''succeeded'', ''Born deleted'', ''manual'', ''check'', %L, now(), %L, ''x'')',
    :'event_a', :'user_admin', :'user_admin'),
  '42501', NULL, 'an admin cannot insert a row that is already deleted');
SELECT is(
  public.test_rows_affected(format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid) VALUES (%L, 100, ''USD'', ''succeeded'', ''Ordinary'', ''manual'', ''check'', %L)',
    :'event_a', :'user_admin')),
  1, 'the ordinary manual insert by an admin still works');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM public."PaymentHistory" WHERE payer_name = 'Born deleted'), 0,
  '...and no row was inserted already deleted');

-- ═══ THE SERVICE ROLE AND THE TABLE OWNER: not blocked by the guard ══════════

SET LOCAL ROLE service_role;
SELECT is(
  public.test_rows_affected(format(
    'INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name, entry_source, payment_method_type, stripe_payment_intent_id, stripe_checkout_session_id) VALUES (%L, 2500, ''USD'', ''succeeded'', ''Webhook'', ''stripe'', ''card'', ''pi_pe_2'', ''cs_pe_2'')',
    :'event_a')),
  1, 'the service role inserts a Stripe-style row');
SELECT is(
  public.test_rows_affected(
    'UPDATE public."PaymentHistory" SET status = ''refunded'', stripe_receipt_url = ''https://pay.stripe.com/r'' WHERE stripe_payment_intent_id = ''pi_pe_2'''),
  1, 'the service role updates a Stripe row, immutable columns included');
SELECT is(
  public.test_rows_affected(format('UPDATE public."PaymentHistory" SET payer_email = ''set-by-service@example.test'' WHERE id = %L', :'p_svc')),
  1, 'the service role changes an immutable column of a manual row');
RESET ROLE;
SELECT is((SELECT payer_email FROM public."PaymentHistory" WHERE id = :'p_svc'), 'set-by-service@example.test',
  '...and it really changed');
SELECT is((SELECT status FROM public."PaymentHistory" WHERE stripe_payment_intent_id = 'pi_pe_2'), 'refunded',
  '...and so did the Stripe row');

SELECT * FROM finish();

ROLLBACK;
