-- ============================================================================
-- Tests for the Postgres port of the Amount Due calculation
-- Migration: 20261028130000_ar_amount_due.sql
-- Spec:      docs/specs/accountant-collections-02-sql-amount-due.md (§3, §4, §6)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_amount_due.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- The functions are a port of resolvePaymentSchedule -> allocatePayments -> computeAmountDue
-- (src/features/quotesAndBookings/utils). Every expected number below was worked out by hand from
-- the TypeScript rules, not read back from the functions. A balance is written as the text
-- (total, received, remaining, amount due), all in cents.
--
-- What it pins down:
--   * the total: deleted lines ignored, a null quantity counts as 1, tax from a percent (a .5 rounds
--     up, and the multiplication order is the TypeScript's), a tax override wins, discounts bigger
--     than the items give 0, a missing event gives 0;
--   * the schedule: the extra cent goes to the largest remainder, ties to the earlier due date, and
--     the result does not depend on the order the rows were inserted; percentages that do not add
--     to 10000 round each amount on its own;
--   * the allocation: untargeted money fills the oldest installment first, targeted money stays on
--     its installment, the excess spills forwards, a refund un-fills the newest first, and a deleted,
--     pending or foreign-currency payment (or one aimed at another event's installment) changes
--     nothing it should not;
--   * the boundary: an installment due today is overdue, due tomorrow is not;
--   * no schedule: the whole balance falls due 7 days before event_start;
--   * the currency rule and the province rule;
--   * access: nobody but the owner and the service role can execute any of the functions.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(66);

-- ── Helpers (dropped by the ROLLBACK) ───────────────────────────────────────

CREATE FUNCTION public.t_event(
  p_start date DEFAULT '2027-06-01', p_office uuid DEFAULT NULL,
  p_tax_pct numeric DEFAULT NULL, p_tax_cents int DEFAULT NULL
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean,
                               sales_office_uuid, tax_percent, tax_amount_cents)
  VALUES ('ar_amount_due probe', p_start, p_start + 1, false, false, p_office, p_tax_pct, p_tax_cents)
  RETURNING id;
$$;

CREATE FUNCTION public.t_line(
  p_event uuid, p_cents int, p_qty int DEFAULT 1, p_deleted boolean DEFAULT false
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public."EventLineItems" (header, currency, value_cents, quantity, event_uuid, deleted)
  VALUES ('line', 'USD', p_cents, p_qty, p_event, p_deleted);
$$;

CREATE FUNCTION public.t_inst(p_event uuid, p_due date, p_bps int) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
  VALUES (p_event, p_due, 'USD', p_bps)
  RETURNING id;
$$;

CREATE FUNCTION public.t_pay(
  p_event uuid, p_cents int, p_inst uuid DEFAULT NULL,
  p_status text DEFAULT 'succeeded', p_currency text DEFAULT 'USD'
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public."PaymentHistory" (event_uuid, installment_id, amount_cents, currency, status, payer_name)
  VALUES (p_event, p_inst, p_cents, p_currency, p_status, 'Probe')
  RETURNING id;
$$;

-- The balance as one text, so a case shows all four numbers at once.
CREATE FUNCTION public.t_bal(p_event uuid, p_today date) RETURNS text LANGUAGE sql AS $$
  SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
  FROM public.ar_event_balances(p_event, p_today) b;
$$;

-- The n-th installment of an event, in due-date order.
CREATE FUNCTION public.t_nth(p_event uuid, p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public."PaymentInstallments" WHERE event_uuid = p_event
  ORDER BY due_date, id OFFSET p_n - 1 LIMIT 1;
$$;

-- The standard event of the allocation cases: total 3000, three installments of 1000 due
-- Oct 1, Nov 1 and Dec 1 2026 (3333 / 3333 / 3334 bps: 999.9 / 999.9 / 1000.2, the two extra cents
-- go to the larger remainders, so each is exactly 1000).
CREATE FUNCTION public.t_three(p_start date DEFAULT '2027-06-01') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE e uuid := public.t_event(p_start);
BEGIN
  PERFORM public.t_line(e, 3000);
  PERFORM public.t_inst(e, '2026-10-01', 3333);
  PERFORM public.t_inst(e, '2026-11-01', 3333);
  PERFORM public.t_inst(e, '2026-12-01', 3334);
  RETURN e;
END;
$$;

-- A user for the one soft-deleted payment (the table's check wants a manual, attributed row).
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'amt', 'aad_user@test.com', 'clerk_aad_user', true, false)
RETURNING id AS aad_user \gset

-- ── The total ───────────────────────────────────────────────────────────────

-- 2 x 1000 + a null quantity (counts as 1) x 500 = 2500; the deleted line is ignored; 13% tax = 325.
SELECT public.t_event(p_tax_pct => 13) AS e_total \gset
SELECT public.t_line(:'e_total', 1000, 2);
SELECT public.t_line(:'e_total', 500, NULL);
SELECT public.t_line(:'e_total', 9999, 1, true);
SELECT is(public.ar_event_total_cents(:'e_total'), 2825::bigint,
  'total: deleted lines ignored, null quantity counts as 1, 13% tax -> 2500 + 325');

-- 1050 at 5% = 52.5 -> rounds up to 53.
SELECT public.t_event(p_tax_pct => 5) AS e_half \gset
SELECT public.t_line(:'e_half', 1050);
SELECT is(public.ar_event_total_cents(:'e_half'), 1103::bigint,
  'total: a tax of 52.5 rounds up to 53');

-- 2000 at 9.975%: the TypeScript computes 2000 * (9.975 / 100) = 199.49999999999997 -> 199, while
-- 2000 * 9.975 / 100 = 199.5 -> 200. The port must follow the TypeScript order.
SELECT public.t_event(p_tax_pct => 9.975) AS e_order \gset
SELECT public.t_line(:'e_order', 2000);
SELECT is(public.ar_event_total_cents(:'e_order'), 2199::bigint,
  'total: the tax is lineTotal * (percent / 100) in double precision, exactly like the TypeScript');

SELECT public.t_event(p_tax_pct => 13, p_tax_cents => 100) AS e_over \gset
SELECT public.t_line(:'e_over', 1000);
SELECT is(public.ar_event_total_cents(:'e_over'), 1100::bigint,
  'total: a tax override wins over the percent');

SELECT public.t_event(p_tax_pct => 13) AS e_neg \gset
SELECT public.t_line(:'e_neg', 1000);
SELECT public.t_line(:'e_neg', -1500);
SELECT is(public.ar_event_total_cents(:'e_neg'), 0::bigint,
  'total: discounts bigger than the items give 0, not a negative');

SELECT public.t_event() AS e_notax \gset
SELECT public.t_line(:'e_notax', 700);
SELECT is(public.ar_event_total_cents(:'e_notax'), 700::bigint,
  'total: no percent and no override means no tax');

SELECT is(public.ar_event_total_cents(gen_random_uuid()), 0::bigint,
  'total: a missing event gives 0');

-- ── The schedule ────────────────────────────────────────────────────────────
-- With nothing paid, the Amount Due on a date is the sum of the installments due by then, so the
-- amounts can be read off one date at a time.

-- 10001 at 3333 / 3333 / 3334 bps: 3333.3333 / 3333.3333 / 3334.3334. The floors add to 10000, the
-- extra cent goes to the largest remainder (.3334, the third): 3333 / 3333 / 3335.
SELECT public.t_event() AS e_s3 \gset
SELECT public.t_line(:'e_s3', 10001);
SELECT public.t_inst(:'e_s3', '2026-10-01', 3333);
SELECT public.t_inst(:'e_s3', '2026-11-01', 3333);
SELECT public.t_inst(:'e_s3', '2026-12-01', 3334);
SELECT is(public.t_bal(:'e_s3', '2026-10-01'), '(10001,0,10001,3333)', 'schedule: first installment is 3333');
SELECT is(public.t_bal(:'e_s3', '2026-11-01'), '(10001,0,10001,6666)', 'schedule: first two are 6666');
SELECT is(public.t_bal(:'e_s3', '2026-12-01'), '(10001,0,10001,10001)', 'schedule: the extra cent landed on the third, all three are 10001');

-- 10001 at 5000 / 5000 bps: 5000.5 each, a tie. The earlier due date takes the extra cent, even
-- though the later installment is inserted first.
SELECT public.t_event() AS e_tie \gset
SELECT public.t_line(:'e_tie', 10001);
SELECT public.t_inst(:'e_tie', '2026-11-01', 5000);
SELECT public.t_inst(:'e_tie', '2026-10-01', 5000);
SELECT is(public.t_bal(:'e_tie', '2026-10-01'), '(10001,0,10001,5001)',
  'schedule: a tie in the remainders goes to the earlier due date, whatever the insert order');
SELECT is(public.t_bal(:'e_tie', '2026-11-01'), '(10001,0,10001,10001)', 'schedule: ...and the second is 5000');

-- 3333 + 3333 = 6666 is not 10000: each amount is rounded on its own, 3333.3333 -> 3333.
SELECT public.t_event() AS e_unb \gset
SELECT public.t_line(:'e_unb', 10001);
SELECT public.t_inst(:'e_unb', '2026-10-01', 3333);
SELECT public.t_inst(:'e_unb', '2026-11-01', 3333);
SELECT is(public.t_bal(:'e_unb', '2026-11-01'), '(10001,0,10001,6666)',
  'schedule: percentages that do not add to 10000 round each amount, nothing is apportioned');

-- 1001 at 5000 / 2000 bps (7000): 500.5 -> 501 and 200.2 -> 200.
SELECT public.t_event() AS e_unb2 \gset
SELECT public.t_line(:'e_unb2', 1001);
SELECT public.t_inst(:'e_unb2', '2026-10-01', 5000);
SELECT public.t_inst(:'e_unb2', '2026-11-01', 2000);
SELECT is(public.t_bal(:'e_unb2', '2026-10-01'), '(1001,0,1001,501)', 'schedule: an unbalanced 500.5 rounds up to 501');
SELECT is(public.t_bal(:'e_unb2', '2026-11-01'), '(1001,0,1001,701)', 'schedule: ...and 200.2 rounds to 200');

-- ── The allocation (standard event: 3 x 1000, due Oct 1, Nov 1, Dec 1; today Nov 15) ──

SELECT public.t_three() AS e_a0 \gset
SELECT is(public.t_bal(:'e_a0', '2026-11-15'), '(3000,0,3000,2000)',
  'allocation: nothing paid, two installments are due');

-- The worked example: 1000 aimed at the first and 1000 at the third. The second is still unpaid and
-- due. A "due minus received" formula would give 0 here.
SELECT public.t_three() AS e_a1 \gset
SELECT public.t_pay(:'e_a1', 1000, public.t_nth(:'e_a1', 1));
SELECT public.t_pay(:'e_a1', 1000, public.t_nth(:'e_a1', 3));
SELECT is(public.t_bal(:'e_a1', '2026-11-15'), '(3000,2000,1000,1000)',
  'allocation: the worked example, a prepaid third installment does not cover the unpaid second');

-- Untargeted money fills the oldest installment first: [1000, 500, 0], the second is 500 short.
SELECT public.t_three() AS e_a2 \gset
SELECT public.t_pay(:'e_a2', 1500);
SELECT is(public.t_bal(:'e_a2', '2026-11-15'), '(3000,1500,1500,500)',
  'allocation: untargeted money fills oldest first');

-- Two untargeted payments add up the same way.
SELECT public.t_three() AS e_a2b \gset
SELECT public.t_pay(:'e_a2b', 700);
SELECT public.t_pay(:'e_a2b', 800);
SELECT is(public.t_bal(:'e_a2b', '2026-11-15'), '(3000,1500,1500,500)',
  'allocation: only the sum of the untargeted payments matters');

-- 1500 aimed at the first: it holds 1000, the other 500 spills forwards onto the second.
SELECT public.t_three() AS e_a3 \gset
SELECT public.t_pay(:'e_a3', 1500, public.t_nth(:'e_a3', 1));
SELECT is(public.t_bal(:'e_a3', '2026-11-15'), '(3000,1500,1500,500)',
  'allocation: an overpayment on one installment spills forwards');

-- 2500 aimed at the first: 1000 stays, 1500 spills over the second (1000) and the third (500).
SELECT public.t_three() AS e_a4 \gset
SELECT public.t_pay(:'e_a4', 2500, public.t_nth(:'e_a4', 1));
SELECT is(public.t_bal(:'e_a4', '2026-11-15'), '(3000,2500,500,0)',
  'allocation: a big overpayment spills over several installments, nothing is due');

-- 600 aimed at the first stays on it; 1000 untargeted tops it up by 400 and puts 600 on the second.
SELECT public.t_three() AS e_a5 \gset
SELECT public.t_pay(:'e_a5', 600, public.t_nth(:'e_a5', 1));
SELECT public.t_pay(:'e_a5', 1000);
SELECT is(public.t_bal(:'e_a5', '2026-11-15'), '(3000,1600,1400,400)',
  'allocation: targeted money stays on its installment, the pool tops it up first');

-- A refund un-fills the newest installment first. All three paid, then -1000: the third is
-- reopened. On Nov 15 the third is not due yet (0); on Dec 15 it is (1000). Oldest-first un-filling
-- would give 1000 on Nov 15.
SELECT public.t_three() AS e_a6 \gset
SELECT public.t_pay(:'e_a6', 1000, public.t_nth(:'e_a6', 1));
SELECT public.t_pay(:'e_a6', 1000, public.t_nth(:'e_a6', 2));
SELECT public.t_pay(:'e_a6', 1000, public.t_nth(:'e_a6', 3));
SELECT public.t_pay(:'e_a6', -1000);
SELECT is(public.t_bal(:'e_a6', '2026-11-15'), '(3000,2000,1000,0)',
  'allocation: a refund reopens the newest installment, which is not due yet');
SELECT is(public.t_bal(:'e_a6', '2026-12-15'), '(3000,2000,1000,1000)',
  'allocation: ...and once it is due, it is what is owed');

-- More than the total: nothing remains, nothing is due, received is every cent.
SELECT public.t_three() AS e_a7 \gset
SELECT public.t_pay(:'e_a7', 4000);
SELECT is(public.t_bal(:'e_a7', '2026-12-15'), '(3000,4000,0,0)',
  'allocation: an overpayment past the total leaves nothing due');

-- A deleted payment, a pending one and one in the other currency change nothing: the worked
-- example plus three payments of 5000 that must all be ignored.
SELECT public.t_three() AS e_a8 \gset
SELECT public.t_pay(:'e_a8', 1000, public.t_nth(:'e_a8', 1));
SELECT public.t_pay(:'e_a8', 1000, public.t_nth(:'e_a8', 3));
SELECT public.t_pay(:'e_a8', 5000, NULL, 'pending');
SELECT public.t_pay(:'e_a8', 5000, NULL, 'succeeded', 'CAD');
INSERT INTO public."PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name,
  entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason)
VALUES (:'e_a8', 5000, 'USD', 'succeeded', 'Probe', 'manual', 'check', :'aad_user', now(), :'aad_user', 'typo');
SELECT is(public.t_bal(:'e_a8', '2026-11-15'), '(3000,2000,1000,1000)',
  'allocation: a pending, a CAD and a deleted payment are not counted anywhere');

-- A payment whose installment belongs to another event is untargeted for this one.
SELECT public.t_three() AS e_a9 \gset
SELECT public.t_event() AS e_other \gset
SELECT public.t_inst(:'e_other', '2026-10-01', 10000) AS i_other \gset
SELECT public.t_pay(:'e_a9', 1500, :'i_other');
SELECT is(public.t_bal(:'e_a9', '2026-11-15'), '(3000,1500,1500,500)',
  'allocation: a payment aimed at another event''s installment is untargeted here');

-- ── The boundary ────────────────────────────────────────────────────────────

SELECT public.t_event() AS e_b1 \gset
SELECT public.t_line(:'e_b1', 1000);
SELECT public.t_inst(:'e_b1', '2026-11-15', 10000);
SELECT is(public.t_bal(:'e_b1', '2026-11-15'), '(1000,0,1000,1000)', 'boundary: an installment due today is overdue');

SELECT public.t_event() AS e_b2 \gset
SELECT public.t_line(:'e_b2', 1000);
SELECT public.t_inst(:'e_b2', '2026-11-16', 10000);
SELECT is(public.t_bal(:'e_b2', '2026-11-15'), '(1000,0,1000,0)', 'boundary: an installment due tomorrow is not');

-- ── No payment schedule: the whole balance falls due 7 days before event_start ──

SELECT public.t_event(date '2026-11-22') AS e_n1 \gset
SELECT public.t_line(:'e_n1', 2000);
SELECT is(public.t_bal(:'e_n1', '2026-11-15'), '(2000,0,2000,2000)', 'no schedule: event_start = today + 7 is due today');

SELECT public.t_event(date '2026-11-23') AS e_n2 \gset
SELECT public.t_line(:'e_n2', 2000);
SELECT is(public.t_bal(:'e_n2', '2026-11-15'), '(2000,0,2000,0)', 'no schedule: event_start = today + 8 is not due yet');

SELECT public.t_event(date '2026-11-18') AS e_n3 \gset
SELECT public.t_line(:'e_n3', 2000);
SELECT is(public.t_bal(:'e_n3', '2026-11-15'), '(2000,0,2000,2000)',
  'no schedule: an event booked inside the 7 days (start = today + 3) is overdue at once');

SELECT public.t_pay(:'e_n3', 600);
SELECT is(public.t_bal(:'e_n3', '2026-11-15'), '(2000,600,1400,1400)', 'no schedule: a part-paid event owes only what is left');

SELECT public.t_event(date '2026-10-16') AS e_n4 \gset
SELECT public.t_line(:'e_n4', 2000);
SELECT is(public.t_bal(:'e_n4', '2026-11-15'), '(2000,0,2000,2000)', 'no schedule: an event that already started is overdue');

SELECT public.t_event(date '2026-11-23') AS e_n5 \gset
SELECT public.t_line(:'e_n5', 2000);
SELECT public.t_pay(:'e_n5', 600);
SELECT is(public.t_bal(:'e_n5', '2026-11-15'), '(2000,600,1400,0)', 'no schedule: not due yet stays 0 even with a balance left');

-- The function never reads the clock: the same event on the first day it falls due.
SELECT is(public.t_bal(:'e_n2', '2026-11-16'), '(2000,0,2000,2000)', 'no schedule: the date comes from the caller (today + 7 a day later)');

-- ── The province rule ───────────────────────────────────────────────────────

SELECT is(
  (SELECT array_agg(public.ar_is_canadian_province(v) ORDER BY ord)
   FROM unnest(ARRAY['ON', 'on', ' Ontario ', 'Québec', 'Quebec', 'newfoundland & labrador',
                     'Newfoundland', 'P.E.I.', 'PEI', 'British Columbia', 'Yukon',
                     'Texas', 'TX', '', '   ', NULL, 'ONT', 'Washington']) WITH ORDINALITY AS t(v, ord)),
  ARRAY[true, true, true, true, true, true, true, true, true, true, true,
        false, false, false, false, false, false, false],
  'province: codes, full names and aliases match after trimming and ignoring case; the rest do not');

SELECT is(
  (SELECT bool_and(public.ar_is_canadian_province(code))
   FROM unnest(ARRAY['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']) AS code),
  true, 'province: all thirteen codes');

SELECT is(
  (SELECT bool_and(public.ar_is_canadian_province(name))
   FROM unnest(ARRAY['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
                     'Nova Scotia', 'Northwest Territories', 'Nunavut', 'Ontario', 'Prince Edward Island',
                     'Quebec', 'Saskatchewan', 'Yukon']) AS name),
  true, 'province: all thirteen full names');

-- ── The currency rule ───────────────────────────────────────────────────────

INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Test St', 'Toronto', 'Ontario')
RETURNING id AS addr_on \gset
INSERT INTO public."Addresses" (street, city, state_province) VALUES ('1 Test St', 'Austin', 'Texas')
RETURNING id AS addr_tx \gset

-- One office per case: (QuickBooks currency, address)
INSERT INTO public."QboConnections" (display_name, encrypted_token_value, currency)
VALUES ('aad cad', 'x', 'CAD') RETURNING id AS q_cad \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value, currency)
VALUES ('aad usd padded', 'x', ' usd ') RETURNING id AS q_usd \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value, currency)
VALUES ('aad empty', 'x', NULL) RETURNING id AS q_null \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value, currency)
VALUES ('aad blank', 'x', '') RETURNING id AS q_blank \gset
INSERT INTO public."QboConnections" (display_name, encrypted_token_value, currency)
VALUES ('aad eur', 'x', 'EUR') RETURNING id AS q_eur \gset

INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o cad tx', :'addr_tx', :'q_cad')
RETURNING id AS o_cad_tx \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o usd on', :'addr_on', :'q_usd')
RETURNING id AS o_usd_on \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o null on', :'addr_on', :'q_null')
RETURNING id AS o_null_on \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o blank tx', :'addr_tx', :'q_blank')
RETURNING id AS o_blank_tx \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o eur on', :'addr_on', :'q_eur')
RETURNING id AS o_eur_on \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid) VALUES ('o null no address', NULL, :'q_null')
RETURNING id AS o_null_noaddr \gset
INSERT INTO public."SalesOffices" (name, address_uuid, quickbook_uuid, deleted)
VALUES ('o deleted', :'addr_on', :'q_cad', true) RETURNING id AS o_deleted \gset

SELECT is(public.ar_office_currency(:'o_cad_tx'), 'CAD', 'currency: QuickBooks CAD wins over a Texas address');
SELECT is(public.ar_office_currency(:'o_usd_on'), 'USD', 'currency: QuickBooks " usd " (trimmed, any case) wins over an Ontario address');
SELECT is(public.ar_office_currency(:'o_null_on'), 'CAD', 'currency: no QuickBooks currency and an Ontario address -> CAD');
SELECT is(public.ar_office_currency(:'o_blank_tx'), 'USD', 'currency: an empty QuickBooks currency and a Texas address -> USD');
SELECT is(public.ar_office_currency(:'o_eur_on'), 'CAD', 'currency: a QuickBooks currency that is neither CAD nor USD falls back to the province');
SELECT is(public.ar_office_currency(:'o_null_noaddr'), 'USD', 'currency: no QuickBooks currency and no address -> USD');
SELECT is(public.ar_office_currency(NULL), 'USD', 'currency: no office -> USD');
SELECT is(public.ar_office_currency(:'o_deleted'), 'USD', 'currency: a deleted office -> USD, even with a CAD connection');
SELECT is(public.ar_office_currency(gen_random_uuid()), 'USD', 'currency: an office that does not exist -> USD');

-- The currency decides which payments count: an Ontario office is CAD. 600 CAD and 100 " cad"
-- count; 700 USD does not. No schedule, event started: the rest of 2000 is due.
SELECT public.t_event(date '2026-10-16', :'o_null_on') AS e_cur \gset
SELECT public.t_line(:'e_cur', 2000);
SELECT public.t_pay(:'e_cur', 600, NULL, 'succeeded', 'CAD');
SELECT public.t_pay(:'e_cur', 100, NULL, 'succeeded', ' cad');
SELECT public.t_pay(:'e_cur', 700, NULL, 'succeeded', 'USD');
SELECT is(public.t_bal(:'e_cur', '2026-11-15'), '(2000,700,1300,1300)',
  'currency: in a CAD office only CAD payments count (case and spaces ignored)');

-- ── A missing event ─────────────────────────────────────────────────────────

SELECT is(public.t_bal(gen_random_uuid(), '2026-11-15'), '(0,0,0,0)', 'missing event: all zeros');
SELECT is(public.ar_event_amount_due(gen_random_uuid(), '2026-11-15'), 0::bigint, 'missing event: amount due is 0');

-- ── ar_event_amount_due is the same figure ──────────────────────────────────

SELECT is(public.ar_event_amount_due(:'e_a1', '2026-11-15'), 1000::bigint,
  'amount due: the worked example through the short function');
SELECT is(public.ar_event_amount_due(:'e_n5', '2026-11-15'), 0::bigint,
  'amount due: no schedule, not due yet');

-- ── Shape of the functions ──────────────────────────────────────────────────

SELECT is(
  (SELECT string_agg(proname || ':' || provolatile::text, ',' ORDER BY proname) FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname IN
     ('ar_is_canadian_province', 'ar_office_currency', 'ar_event_total_cents', 'ar_event_balances', 'ar_event_amount_due')),
  'ar_event_amount_due:s,ar_event_balances:s,ar_event_total_cents:s,ar_is_canadian_province:i,ar_office_currency:s',
  'shape: the province rule is IMMUTABLE, the other four STABLE');

SELECT is(
  (SELECT count(*)::int FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND prosecdef
     AND proname IN ('ar_is_canadian_province', 'ar_office_currency', 'ar_event_total_cents', 'ar_event_balances', 'ar_event_amount_due')),
  0, 'shape: none is SECURITY DEFINER');

SELECT is(
  (SELECT count(*)::int FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('ar_is_canadian_province', 'ar_office_currency', 'ar_event_total_cents', 'ar_event_balances', 'ar_event_amount_due')
     AND proconfig @> ARRAY['search_path=public']),
  5, 'shape: all five pin search_path to public');

SELECT is(
  (SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND procost = 1000
     AND proname IN ('ar_is_canadian_province', 'ar_office_currency', 'ar_event_total_cents', 'ar_event_balances', 'ar_event_amount_due')),
  'ar_event_amount_due,ar_event_balances',
  'shape: only ar_event_balances and ar_event_amount_due carry COST 1000');

-- ── Access ──────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM (VALUES
     ('public.ar_is_canadian_province(text)'), ('public.ar_office_currency(uuid)'),
     ('public.ar_event_total_cents(uuid)'), ('public.ar_event_balances(uuid,date)'),
     ('public.ar_event_amount_due(uuid,date)')) AS f(sig)
   WHERE has_function_privilege('anon', f.sig, 'EXECUTE')),
  0, 'access: anon can execute none of the five functions');

SELECT is(
  (SELECT count(*)::int FROM (VALUES
     ('public.ar_is_canadian_province(text)'), ('public.ar_office_currency(uuid)'),
     ('public.ar_event_total_cents(uuid)'), ('public.ar_event_balances(uuid,date)'),
     ('public.ar_event_amount_due(uuid,date)')) AS f(sig)
   WHERE has_function_privilege('authenticated', f.sig, 'EXECUTE')),
  0, 'access: authenticated can execute none of the five functions');

SELECT is(
  (SELECT count(*)::int FROM (VALUES
     ('public.ar_is_canadian_province(text)'), ('public.ar_office_currency(uuid)'),
     ('public.ar_event_total_cents(uuid)'), ('public.ar_event_balances(uuid,date)'),
     ('public.ar_event_amount_due(uuid,date)')) AS f(sig)
   WHERE has_function_privilege('service_role', f.sig, 'EXECUTE')),
  5, 'access: the service role can execute all five (the cron and the triggers run as the owner)');

SET LOCAL ROLE anon;
SELECT throws_ok(
  format('SELECT public.ar_event_amount_due(%L, %L)', :'e_a1', '2026-11-15'),
  '42501', NULL, 'access: a real call as anon is refused (42501)');
SELECT throws_ok(
  format('SELECT * FROM public.ar_event_balances(%L, %L)', :'e_a1', '2026-11-15'),
  '42501', NULL, 'access: ar_event_balances as anon is refused (42501)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.ar_event_amount_due(%L, %L)', :'e_a1', '2026-11-15'),
  '42501', NULL, 'access: a real call as authenticated is refused (42501)');
SELECT throws_ok(
  format('SELECT public.ar_office_currency(%L)', :'o_cad_tx'),
  '42501', NULL, 'access: ar_office_currency as authenticated is refused (42501)');
SELECT throws_ok(
  format('SELECT public.ar_event_total_cents(%L)', :'e_total'),
  '42501', NULL, 'access: ar_event_total_cents as authenticated is refused (42501)');
SELECT throws_ok(
  $$SELECT public.ar_is_canadian_province('ON')$$,
  '42501', NULL, 'access: ar_is_canadian_province as authenticated is refused (42501)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
