-- ============================================================================
-- GENERATED FILE. Do not edit by hand.
--
-- Parity of the TypeScript twin and the Postgres port of the Amount Due calculation.
-- Spec:    docs/specs/accountant-collections-03-ts-twin-and-parity.md
-- Source:  src/features/accountantCollections/utils/amountDueCases.ts
-- Builder: src/features/accountantCollections/utils/amountDueParitySql.ts
-- Regenerate (only when a rule changed on purpose, and the SQL was changed to match):
--   UPDATE_PARITY=1 npx vitest run amountDueParity
--
-- Every case builds one event with its line items, installments and payments, then compares
-- (total, received, remaining, amount due) from public.ar_event_balances(event, today) with the
-- numbers of the case. The hand cases carry numbers worked out by hand; the fuzz cases carry the
-- TypeScript twin's numbers, so a failure there means the SQL is wrong, not that the file should
-- be regenerated.
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_amount_due_parity.test.sql
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(354);

-- The one user a soft-deleted payment is attributed to (the table wants a manual, attributed row).
INSERT INTO public."Users" (id, first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('f0000000-0000-4000-8000-000000000001', 'T', 'parity', 'ar_parity_user@test.com', 'clerk_ar_parity_user', true, false);

-- Offices: one per distinct (QuickBooks currency, province).
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000001', 'parity qbo', 'x', NULL);
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000001', '1 Test St', 'Parity', 'Ontario');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000001', 'parity office', '0add0000-0000-4000-8000-000000000001', '0b0b0000-0000-4000-8000-000000000001');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000002', 'parity qbo', 'x', 'CAD');
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000002', '1 Test St', 'Parity', 'Texas');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000002', 'parity office', '0add0000-0000-4000-8000-000000000002', '0b0b0000-0000-4000-8000-000000000002');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000003', 'parity qbo', 'x', ' usd ');
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000003', '1 Test St', 'Parity', 'Ontario');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000003', 'parity office', '0add0000-0000-4000-8000-000000000003', '0b0b0000-0000-4000-8000-000000000003');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000004', 'parity qbo', 'x', NULL);
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000004', '1 Test St', 'Parity', 'Texas');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000004', 'parity office', '0add0000-0000-4000-8000-000000000004', '0b0b0000-0000-4000-8000-000000000004');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000005', 'parity qbo', 'x', 'EUR');
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000005', '1 Test St', 'Parity', 'Ontario');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000005', 'parity office', '0add0000-0000-4000-8000-000000000005', '0b0b0000-0000-4000-8000-000000000005');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000006', 'parity qbo', 'x', 'CAD');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000006', 'parity office', NULL, '0b0b0000-0000-4000-8000-000000000006');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000007', 'parity qbo', 'x', 'EUR');
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000007', '1 Test St', 'Parity', 'Quebec');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000007', 'parity office', '0add0000-0000-4000-8000-000000000007', '0b0b0000-0000-4000-8000-000000000007');
INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)
VALUES ('0b0b0000-0000-4000-8000-000000000008', 'parity qbo', 'x', 'USD');
INSERT INTO public."Addresses" (id, street, city, state_province)
VALUES ('0add0000-0000-4000-8000-000000000008', '1 Test St', 'Parity', 'Ontario');
INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)
VALUES ('0ff1ce00-0000-4000-8000-000000000008', 'parity office', '0add0000-0000-4000-8000-000000000008', '0b0b0000-0000-4000-8000-000000000008');

-- ── case 0: total: deleted lines ignored, null quantity counts as 1, 13% tax ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000000-0000-4000-8000-000000000001', 'parity case 0', '2027-06-01', '2027-06-02', false, false, NULL, 13, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000000-0000-4000-8000-000000000001', 'line', 'USD', 1000, 2, '10000000-0000-4000-8000-000000000001', false),
  ('30000000-0000-4000-8000-000000000002', 'line', 'USD', 500, NULL, '10000000-0000-4000-8000-000000000001', false),
  ('30000000-0000-4000-8000-000000000003', 'line', 'USD', 9999, 1, '10000000-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000000-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2825,0,2825,0)',
  'case 0: total: deleted lines ignored, null quantity counts as 1, 13% tax'
);

-- ── case 1: total: a tax of 52.5 rounds up to 53 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000001-0000-4000-8000-000000000001', 'parity case 1', '2027-06-01', '2027-06-02', false, false, NULL, 5, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000001-0000-4000-8000-000000000001', 'line', 'USD', 1050, 1, '10000001-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000001-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1103,0,1103,0)',
  'case 1: total: a tax of 52.5 rounds up to 53'
);

-- ── case 2: total: the tax is lineTotal * (percent / 100) in double precision ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000002-0000-4000-8000-000000000001', 'parity case 2', '2027-06-01', '2027-06-02', false, false, NULL, 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000002-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000002-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000002-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2199,0,2199,0)',
  'case 2: total: the tax is lineTotal * (percent / 100) in double precision'
);

-- ── case 3: total: a tax override wins over the percent ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000003-0000-4000-8000-000000000001', 'parity case 3', '2027-06-01', '2027-06-02', false, false, NULL, 13, 100, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000003-0000-4000-8000-000000000001', 'line', 'USD', 1000, 1, '10000003-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000003-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1100,0,1100,0)',
  'case 3: total: a tax override wins over the percent'
);

-- ── case 4: total: discounts bigger than the items give 0 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000004-0000-4000-8000-000000000001', 'parity case 4', '2027-06-01', '2027-06-02', false, false, NULL, 13, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000004-0000-4000-8000-000000000001', 'line', 'USD', 1000, 1, '10000004-0000-4000-8000-000000000001', false),
  ('30000004-0000-4000-8000-000000000002', 'line', 'USD', -1500, 1, '10000004-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000004-0000-4000-8000-000000000001', '2026-11-15') b),
  '(0,0,0,0)',
  'case 4: total: discounts bigger than the items give 0'
);

-- ── case 5: total: no percent and no override means no tax ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000005-0000-4000-8000-000000000001', 'parity case 5', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000005-0000-4000-8000-000000000001', 'line', 'USD', 700, 1, '10000005-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000005-0000-4000-8000-000000000001', '2026-11-15') b),
  '(700,0,700,0)',
  'case 5: total: no percent and no override means no tax'
);

-- ── case 6: schedule: 10001 in thirds, the extra cent lands on the third (due by Oct 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000006-0000-4000-8000-000000000001', 'parity case 6', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000006-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '10000006-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000006-0000-4000-8000-000000000001', '10000006-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000006-0000-4000-8000-000000000002', '10000006-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000006-0000-4000-8000-000000000003', '10000006-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000006-0000-4000-8000-000000000001', '2026-10-01') b),
  '(10001,0,10001,3333)',
  'case 6: schedule: 10001 in thirds, the extra cent lands on the third (due by Oct 1)'
);

-- ── case 7: schedule: 10001 in thirds, the extra cent lands on the third (due by Nov 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000007-0000-4000-8000-000000000001', 'parity case 7', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000007-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '10000007-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000007-0000-4000-8000-000000000001', '10000007-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000007-0000-4000-8000-000000000002', '10000007-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000007-0000-4000-8000-000000000003', '10000007-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000007-0000-4000-8000-000000000001', '2026-11-01') b),
  '(10001,0,10001,6666)',
  'case 7: schedule: 10001 in thirds, the extra cent lands on the third (due by Nov 1)'
);

-- ── case 8: schedule: 10001 in thirds, the extra cent lands on the third (due by Dec 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000008-0000-4000-8000-000000000001', 'parity case 8', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000008-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '10000008-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000008-0000-4000-8000-000000000001', '10000008-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000008-0000-4000-8000-000000000002', '10000008-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000008-0000-4000-8000-000000000003', '10000008-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000008-0000-4000-8000-000000000001', '2026-12-01') b),
  '(10001,0,10001,10001)',
  'case 8: schedule: 10001 in thirds, the extra cent lands on the third (due by Dec 1)'
);

-- ── case 9: schedule: a tie goes to the earlier due date (due by Oct 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000009-0000-4000-8000-000000000001', 'parity case 9', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000009-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '10000009-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000009-0000-4000-8000-000000000001', '10000009-0000-4000-8000-000000000001', '2026-11-01', 'USD', 5000),
  ('20000009-0000-4000-8000-000000000002', '10000009-0000-4000-8000-000000000001', '2026-10-01', 'USD', 5000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000009-0000-4000-8000-000000000001', '2026-10-01') b),
  '(10001,0,10001,5001)',
  'case 9: schedule: a tie goes to the earlier due date (due by Oct 1)'
);

-- ── case 10: schedule: ...and the second is 5000 (due by Nov 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000a-0000-4000-8000-000000000001', 'parity case 10', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000a-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '1000000a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000a-0000-4000-8000-000000000001', '1000000a-0000-4000-8000-000000000001', '2026-11-01', 'USD', 5000),
  ('2000000a-0000-4000-8000-000000000002', '1000000a-0000-4000-8000-000000000001', '2026-10-01', 'USD', 5000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000a-0000-4000-8000-000000000001', '2026-11-01') b),
  '(10001,0,10001,10001)',
  'case 10: schedule: ...and the second is 5000 (due by Nov 1)'
);

-- ── case 11: schedule: percentages that do not add to 10000 round each amount ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000b-0000-4000-8000-000000000001', 'parity case 11', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000b-0000-4000-8000-000000000001', 'line', 'USD', 10001, 1, '1000000b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000b-0000-4000-8000-000000000001', '1000000b-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000000b-0000-4000-8000-000000000002', '1000000b-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000b-0000-4000-8000-000000000001', '2026-11-01') b),
  '(10001,0,10001,6666)',
  'case 11: schedule: percentages that do not add to 10000 round each amount'
);

-- ── case 12: schedule: an unbalanced 500.5 rounds up to 501 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000c-0000-4000-8000-000000000001', 'parity case 12', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000c-0000-4000-8000-000000000001', 'line', 'USD', 1001, 1, '1000000c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000c-0000-4000-8000-000000000001', '1000000c-0000-4000-8000-000000000001', '2026-10-01', 'USD', 5000),
  ('2000000c-0000-4000-8000-000000000002', '1000000c-0000-4000-8000-000000000001', '2026-11-01', 'USD', 2000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000c-0000-4000-8000-000000000001', '2026-10-01') b),
  '(1001,0,1001,501)',
  'case 12: schedule: an unbalanced 500.5 rounds up to 501'
);

-- ── case 13: schedule: ...and 200.2 rounds to 200 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000d-0000-4000-8000-000000000001', 'parity case 13', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000d-0000-4000-8000-000000000001', 'line', 'USD', 1001, 1, '1000000d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000d-0000-4000-8000-000000000001', '1000000d-0000-4000-8000-000000000001', '2026-10-01', 'USD', 5000),
  ('2000000d-0000-4000-8000-000000000002', '1000000d-0000-4000-8000-000000000001', '2026-11-01', 'USD', 2000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000d-0000-4000-8000-000000000001', '2026-11-01') b),
  '(1001,0,1001,701)',
  'case 13: schedule: ...and 200.2 rounds to 200'
);

-- ── case 14: cent split: 100 in thirds, the third gets the extra cent (due by Nov 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000e-0000-4000-8000-000000000001', 'parity case 14', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000e-0000-4000-8000-000000000001', 'line', 'USD', 100, 1, '1000000e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000e-0000-4000-8000-000000000001', '1000000e-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000000e-0000-4000-8000-000000000002', '1000000e-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000000e-0000-4000-8000-000000000003', '1000000e-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000e-0000-4000-8000-000000000001', '2026-11-01') b),
  '(100,0,100,66)',
  'case 14: cent split: 100 in thirds, the third gets the extra cent (due by Nov 1)'
);

-- ── case 15: cent split: ...and all three are 100 (due by Dec 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000000f-0000-4000-8000-000000000001', 'parity case 15', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000000f-0000-4000-8000-000000000001', 'line', 'USD', 100, 1, '1000000f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000000f-0000-4000-8000-000000000001', '1000000f-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000000f-0000-4000-8000-000000000002', '1000000f-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000000f-0000-4000-8000-000000000003', '1000000f-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000000f-0000-4000-8000-000000000001', '2026-12-01') b),
  '(100,0,100,100)',
  'case 15: cent split: ...and all three are 100 (due by Dec 1)'
);

-- ── case 16: cent split: 100 with the big share first, the first gets the extra cent (due by Oct 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000010-0000-4000-8000-000000000001', 'parity case 16', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000010-0000-4000-8000-000000000001', 'line', 'USD', 100, 1, '10000010-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000010-0000-4000-8000-000000000001', '10000010-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3334),
  ('20000010-0000-4000-8000-000000000002', '10000010-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000010-0000-4000-8000-000000000003', '10000010-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3333);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000010-0000-4000-8000-000000000001', '2026-10-01') b),
  '(100,0,100,34)',
  'case 16: cent split: 100 with the big share first, the first gets the extra cent (due by Oct 1)'
);

-- ── case 17: cent split: ...and 67 after the second (due by Nov 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000011-0000-4000-8000-000000000001', 'parity case 17', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000011-0000-4000-8000-000000000001', 'line', 'USD', 100, 1, '10000011-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000011-0000-4000-8000-000000000001', '10000011-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3334),
  ('20000011-0000-4000-8000-000000000002', '10000011-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000011-0000-4000-8000-000000000003', '10000011-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3333);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000011-0000-4000-8000-000000000001', '2026-11-01') b),
  '(100,0,100,67)',
  'case 17: cent split: ...and 67 after the second (due by Nov 1)'
);

-- ── case 18: cent split: a tie of two among three goes to the earlier due date (due by Oct 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000012-0000-4000-8000-000000000001', 'parity case 18', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000012-0000-4000-8000-000000000001', 'line', 'USD', 1002, 1, '10000012-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000012-0000-4000-8000-000000000001', '10000012-0000-4000-8000-000000000001', '2026-12-01', 'USD', 5000),
  ('20000012-0000-4000-8000-000000000002', '10000012-0000-4000-8000-000000000001', '2026-11-01', 'USD', 2500),
  ('20000012-0000-4000-8000-000000000003', '10000012-0000-4000-8000-000000000001', '2026-10-01', 'USD', 2500);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000012-0000-4000-8000-000000000001', '2026-10-01') b),
  '(1002,0,1002,251)',
  'case 18: cent split: a tie of two among three goes to the earlier due date (due by Oct 1)'
);

-- ── case 19: cent split: ...Nov is 250 (due by Nov 1) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000013-0000-4000-8000-000000000001', 'parity case 19', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000013-0000-4000-8000-000000000001', 'line', 'USD', 1002, 1, '10000013-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000013-0000-4000-8000-000000000001', '10000013-0000-4000-8000-000000000001', '2026-12-01', 'USD', 5000),
  ('20000013-0000-4000-8000-000000000002', '10000013-0000-4000-8000-000000000001', '2026-11-01', 'USD', 2500),
  ('20000013-0000-4000-8000-000000000003', '10000013-0000-4000-8000-000000000001', '2026-10-01', 'USD', 2500);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000013-0000-4000-8000-000000000001', '2026-11-01') b),
  '(1002,0,1002,501)',
  'case 19: cent split: ...Nov is 250 (due by Nov 1)'
);

-- ── case 20: allocation: nothing paid, two installments are due ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000014-0000-4000-8000-000000000001', 'parity case 20', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000014-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000014-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000014-0000-4000-8000-000000000001', '10000014-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000014-0000-4000-8000-000000000002', '10000014-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000014-0000-4000-8000-000000000003', '10000014-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000014-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,0,3000,2000)',
  'case 20: allocation: nothing paid, two installments are due'
);

-- ── case 21: allocation: the worked example, a prepaid third does not cover the unpaid second ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000015-0000-4000-8000-000000000001', 'parity case 21', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000015-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000015-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000015-0000-4000-8000-000000000001', '10000015-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000015-0000-4000-8000-000000000002', '10000015-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000015-0000-4000-8000-000000000003', '10000015-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000015-0000-4000-8000-000000000001', '10000015-0000-4000-8000-000000000001', '20000015-0000-4000-8000-000000000001', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000015-0000-4000-8000-000000000002', '10000015-0000-4000-8000-000000000001', '20000015-0000-4000-8000-000000000003', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000015-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,2000,1000,1000)',
  'case 21: allocation: the worked example, a prepaid third does not cover the unpaid second'
);

-- ── case 22: allocation: untargeted money fills oldest first ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000016-0000-4000-8000-000000000001', 'parity case 22', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000016-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000016-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000016-0000-4000-8000-000000000001', '10000016-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000016-0000-4000-8000-000000000002', '10000016-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000016-0000-4000-8000-000000000003', '10000016-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000016-0000-4000-8000-000000000001', '10000016-0000-4000-8000-000000000001', NULL, 1500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000016-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1500,1500,500)',
  'case 22: allocation: untargeted money fills oldest first'
);

-- ── case 23: allocation: only the sum of the untargeted payments matters ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000017-0000-4000-8000-000000000001', 'parity case 23', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000017-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000017-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000017-0000-4000-8000-000000000001', '10000017-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000017-0000-4000-8000-000000000002', '10000017-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000017-0000-4000-8000-000000000003', '10000017-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000017-0000-4000-8000-000000000001', '10000017-0000-4000-8000-000000000001', NULL, 700, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000017-0000-4000-8000-000000000002', '10000017-0000-4000-8000-000000000001', NULL, 800, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000017-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1500,1500,500)',
  'case 23: allocation: only the sum of the untargeted payments matters'
);

-- ── case 24: allocation: an overpayment on one installment spills forwards ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000018-0000-4000-8000-000000000001', 'parity case 24', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000018-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000018-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000018-0000-4000-8000-000000000001', '10000018-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000018-0000-4000-8000-000000000002', '10000018-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000018-0000-4000-8000-000000000003', '10000018-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000018-0000-4000-8000-000000000001', '10000018-0000-4000-8000-000000000001', '20000018-0000-4000-8000-000000000001', 1500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000018-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1500,1500,500)',
  'case 24: allocation: an overpayment on one installment spills forwards'
);

-- ── case 25: allocation: a big overpayment spills over several installments ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000019-0000-4000-8000-000000000001', 'parity case 25', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000019-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000019-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000019-0000-4000-8000-000000000001', '10000019-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000019-0000-4000-8000-000000000002', '10000019-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000019-0000-4000-8000-000000000003', '10000019-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000019-0000-4000-8000-000000000001', '10000019-0000-4000-8000-000000000001', '20000019-0000-4000-8000-000000000001', 2500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000019-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,2500,500,0)',
  'case 25: allocation: a big overpayment spills over several installments'
);

-- ── case 26: allocation: targeted money stays on its installment, the pool tops it up first ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001a-0000-4000-8000-000000000001', 'parity case 26', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001a-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001a-0000-4000-8000-000000000001', '1000001a-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001a-0000-4000-8000-000000000002', '1000001a-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001a-0000-4000-8000-000000000003', '1000001a-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001a-0000-4000-8000-000000000001', '1000001a-0000-4000-8000-000000000001', '2000001a-0000-4000-8000-000000000001', 600, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001a-0000-4000-8000-000000000002', '1000001a-0000-4000-8000-000000000001', NULL, 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001a-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1600,1400,400)',
  'case 26: allocation: targeted money stays on its installment, the pool tops it up first'
);

-- ── case 27: allocation: a refund reopens the newest installment, which is not due yet ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001b-0000-4000-8000-000000000001', 'parity case 27', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001b-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001b-0000-4000-8000-000000000001', '1000001b-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001b-0000-4000-8000-000000000002', '1000001b-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001b-0000-4000-8000-000000000003', '1000001b-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001b-0000-4000-8000-000000000001', '1000001b-0000-4000-8000-000000000001', '2000001b-0000-4000-8000-000000000001', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001b-0000-4000-8000-000000000002', '1000001b-0000-4000-8000-000000000001', '2000001b-0000-4000-8000-000000000002', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001b-0000-4000-8000-000000000003', '1000001b-0000-4000-8000-000000000001', '2000001b-0000-4000-8000-000000000003', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001b-0000-4000-8000-000000000004', '1000001b-0000-4000-8000-000000000001', NULL, -1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001b-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,2000,1000,0)',
  'case 27: allocation: a refund reopens the newest installment, which is not due yet'
);

-- ── case 28: allocation: ...and once it is due, it is what is owed ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001c-0000-4000-8000-000000000001', 'parity case 28', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001c-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001c-0000-4000-8000-000000000001', '1000001c-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001c-0000-4000-8000-000000000002', '1000001c-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001c-0000-4000-8000-000000000003', '1000001c-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001c-0000-4000-8000-000000000001', '1000001c-0000-4000-8000-000000000001', '2000001c-0000-4000-8000-000000000001', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001c-0000-4000-8000-000000000002', '1000001c-0000-4000-8000-000000000001', '2000001c-0000-4000-8000-000000000002', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001c-0000-4000-8000-000000000003', '1000001c-0000-4000-8000-000000000001', '2000001c-0000-4000-8000-000000000003', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001c-0000-4000-8000-000000000004', '1000001c-0000-4000-8000-000000000001', NULL, -1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001c-0000-4000-8000-000000000001', '2026-12-15') b),
  '(3000,2000,1000,1000)',
  'case 28: allocation: ...and once it is due, it is what is owed'
);

-- ── case 29: allocation: an overpayment past the total leaves nothing due ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001d-0000-4000-8000-000000000001', 'parity case 29', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001d-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001d-0000-4000-8000-000000000001', '1000001d-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001d-0000-4000-8000-000000000002', '1000001d-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001d-0000-4000-8000-000000000003', '1000001d-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001d-0000-4000-8000-000000000001', '1000001d-0000-4000-8000-000000000001', NULL, 4000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001d-0000-4000-8000-000000000001', '2026-12-15') b),
  '(3000,4000,0,0)',
  'case 29: allocation: an overpayment past the total leaves nothing due'
);

-- ── case 30: allocation: a pending, a CAD and a deleted payment are not counted anywhere ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001e-0000-4000-8000-000000000001', 'parity case 30', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001e-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001e-0000-4000-8000-000000000001', '1000001e-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001e-0000-4000-8000-000000000002', '1000001e-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001e-0000-4000-8000-000000000003', '1000001e-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001e-0000-4000-8000-000000000001', '1000001e-0000-4000-8000-000000000001', '2000001e-0000-4000-8000-000000000001', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001e-0000-4000-8000-000000000002', '1000001e-0000-4000-8000-000000000001', '2000001e-0000-4000-8000-000000000003', 1000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001e-0000-4000-8000-000000000003', '1000001e-0000-4000-8000-000000000001', NULL, 5000, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001e-0000-4000-8000-000000000004', '1000001e-0000-4000-8000-000000000001', NULL, 5000, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000001e-0000-4000-8000-000000000005', '1000001e-0000-4000-8000-000000000001', NULL, 5000, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001e-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,2000,1000,1000)',
  'case 30: allocation: a pending, a CAD and a deleted payment are not counted anywhere'
);

-- ── case 31: allocation: a payment aimed at another event's installment is untargeted here ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000001f-0000-4000-8000-000000000001', 'parity case 31', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000001f-0000-4000-8000-000000000001', 'parity case 31 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000001f-0000-4000-8000-000000000001', '5000001f-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000001f-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '1000001f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000001f-0000-4000-8000-000000000001', '1000001f-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('2000001f-0000-4000-8000-000000000002', '1000001f-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('2000001f-0000-4000-8000-000000000003', '1000001f-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000001f-0000-4000-8000-000000000001', '1000001f-0000-4000-8000-000000000001', '6000001f-0000-4000-8000-000000000001', 1500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000001f-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1500,1500,500)',
  'case 31: allocation: a payment aimed at another event''s installment is untargeted here'
);

-- ── case 32: allocation: a partly paid overdue installment still owes the rest of it ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000020-0000-4000-8000-000000000001', 'parity case 32', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000020-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000020-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000020-0000-4000-8000-000000000001', '10000020-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000020-0000-4000-8000-000000000002', '10000020-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000020-0000-4000-8000-000000000003', '10000020-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000020-0000-4000-8000-000000000001', '10000020-0000-4000-8000-000000000001', '20000020-0000-4000-8000-000000000001', 600, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000020-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,600,2400,1400)',
  'case 32: allocation: a partly paid overdue installment still owes the rest of it'
);

-- ── case 33: allocation: an overdue installment paid in full by a later payment owes nothing ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000021-0000-4000-8000-000000000001', 'parity case 33', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000021-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000021-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000021-0000-4000-8000-000000000001', '10000021-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000021-0000-4000-8000-000000000002', '10000021-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000021-0000-4000-8000-000000000003', '10000021-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000021-0000-4000-8000-000000000001', '10000021-0000-4000-8000-000000000001', '20000021-0000-4000-8000-000000000001', 400, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000021-0000-4000-8000-000000000002', '10000021-0000-4000-8000-000000000001', '20000021-0000-4000-8000-000000000001', 600, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000021-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,1000,2000,1000)',
  'case 33: allocation: an overdue installment paid in full by a later payment owes nothing'
);

-- ── case 34: allocation: a refund after full payment, the reopened third is not due yet ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000022-0000-4000-8000-000000000001', 'parity case 34', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000022-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000022-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000022-0000-4000-8000-000000000001', '10000022-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000022-0000-4000-8000-000000000002', '10000022-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000022-0000-4000-8000-000000000003', '10000022-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000022-0000-4000-8000-000000000001', '10000022-0000-4000-8000-000000000001', NULL, 3000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000022-0000-4000-8000-000000000002', '10000022-0000-4000-8000-000000000001', NULL, -500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000022-0000-4000-8000-000000000001', '2026-11-15') b),
  '(3000,2500,500,0)',
  'case 34: allocation: a refund after full payment, the reopened third is not due yet'
);

-- ── case 35: allocation: a refund after full payment, the reopened third is due ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000023-0000-4000-8000-000000000001', 'parity case 35', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000023-0000-4000-8000-000000000001', 'line', 'USD', 3000, 1, '10000023-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000023-0000-4000-8000-000000000001', '10000023-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3333),
  ('20000023-0000-4000-8000-000000000002', '10000023-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3333),
  ('20000023-0000-4000-8000-000000000003', '10000023-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3334);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000023-0000-4000-8000-000000000001', '10000023-0000-4000-8000-000000000001', NULL, 3000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000023-0000-4000-8000-000000000002', '10000023-0000-4000-8000-000000000001', NULL, -500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000023-0000-4000-8000-000000000001', '2026-12-15') b),
  '(3000,2500,500,500)',
  'case 35: allocation: a refund after full payment, the reopened third is due'
);

-- ── case 36: boundary: an installment due today is overdue ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000024-0000-4000-8000-000000000001', 'parity case 36', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000024-0000-4000-8000-000000000001', 'line', 'USD', 1000, 1, '10000024-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000024-0000-4000-8000-000000000001', '10000024-0000-4000-8000-000000000001', '2026-11-15', 'USD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000024-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1000,0,1000,1000)',
  'case 36: boundary: an installment due today is overdue'
);

-- ── case 37: boundary: an installment due tomorrow is not ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000025-0000-4000-8000-000000000001', 'parity case 37', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000025-0000-4000-8000-000000000001', 'line', 'USD', 1000, 1, '10000025-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000025-0000-4000-8000-000000000001', '10000025-0000-4000-8000-000000000001', '2026-11-16', 'USD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000025-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1000,0,1000,0)',
  'case 37: boundary: an installment due tomorrow is not'
);

-- ── case 38: no schedule: event_start = today + 7 is due today ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000026-0000-4000-8000-000000000001', 'parity case 38', '2026-11-22', '2026-11-23', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000026-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000026-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000026-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,0,2000,2000)',
  'case 38: no schedule: event_start = today + 7 is due today'
);

-- ── case 39: no schedule: event_start = today + 8 is not due yet ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000027-0000-4000-8000-000000000001', 'parity case 39', '2026-11-23', '2026-11-24', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000027-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000027-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000027-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,0,2000,0)',
  'case 39: no schedule: event_start = today + 8 is not due yet'
);

-- ── case 40: no schedule: an event booked inside the 7 days is overdue at once ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000028-0000-4000-8000-000000000001', 'parity case 40', '2026-11-18', '2026-11-19', false, false, NULL, NULL, NULL, '2026-11-13T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000028-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000028-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000028-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,0,2000,2000)',
  'case 40: no schedule: an event booked inside the 7 days is overdue at once'
);

-- ── case 41: no schedule: a part-paid event owes only what is left ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000029-0000-4000-8000-000000000001', 'parity case 41', '2026-11-18', '2026-11-19', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000029-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000029-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000029-0000-4000-8000-000000000001', '10000029-0000-4000-8000-000000000001', NULL, 600, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000029-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,600,1400,1400)',
  'case 41: no schedule: a part-paid event owes only what is left'
);

-- ── case 42: no schedule: an event that already started is overdue ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002a-0000-4000-8000-000000000001', 'parity case 42', '2026-10-16', '2026-10-17', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002a-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '1000002a-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002a-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,0,2000,2000)',
  'case 42: no schedule: an event that already started is overdue'
);

-- ── case 43: no schedule: not due yet stays 0 even with a balance left ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002b-0000-4000-8000-000000000001', 'parity case 43', '2026-11-23', '2026-11-24', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002b-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '1000002b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000002b-0000-4000-8000-000000000001', '1000002b-0000-4000-8000-000000000001', NULL, 600, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002b-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,600,1400,0)',
  'case 43: no schedule: not due yet stays 0 even with a balance left'
);

-- ── case 44: no schedule: the date comes from the caller (today + 7 a day later) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002c-0000-4000-8000-000000000001', 'parity case 44', '2026-11-23', '2026-11-24', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002c-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '1000002c-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002c-0000-4000-8000-000000000001', '2026-11-16') b),
  '(2000,0,2000,2000)',
  'case 44: no schedule: the date comes from the caller (today + 7 a day later)'
);

-- ── case 45: no schedule: fully paid owes nothing ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002d-0000-4000-8000-000000000001', 'parity case 45', '2026-10-16', '2026-10-17', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002d-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '1000002d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000002d-0000-4000-8000-000000000001', '1000002d-0000-4000-8000-000000000001', NULL, 2000, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002d-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,2000,0,0)',
  'case 45: no schedule: fully paid owes nothing'
);

-- ── case 46: currency: Ontario office, no QuickBooks currency: CAD counts (case and spaces ignored) ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002e-0000-4000-8000-000000000001', 'parity case 46', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002e-0000-4000-8000-000000000001', 'line', 'CAD', 2000, 1, '1000002e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000002e-0000-4000-8000-000000000001', '1000002e-0000-4000-8000-000000000001', NULL, 600, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000002e-0000-4000-8000-000000000002', '1000002e-0000-4000-8000-000000000001', NULL, 100, ' cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000002e-0000-4000-8000-000000000003', '1000002e-0000-4000-8000-000000000001', NULL, 700, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002e-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,700,1300,1300)',
  'case 46: currency: Ontario office, no QuickBooks currency: CAD counts (case and spaces ignored)'
);

-- ── case 47: currency: QuickBooks CAD wins over a Texas address ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000002f-0000-4000-8000-000000000001', 'parity case 47', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000002f-0000-4000-8000-000000000001', 'line', 'CAD', 2000, 1, '1000002f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000002f-0000-4000-8000-000000000001', '1000002f-0000-4000-8000-000000000001', NULL, 300, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000002f-0000-4000-8000-000000000002', '1000002f-0000-4000-8000-000000000001', NULL, 500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000002f-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,300,1700,1700)',
  'case 47: currency: QuickBooks CAD wins over a Texas address'
);

-- ── case 48: currency: QuickBooks ' usd ' wins over an Ontario address ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000030-0000-4000-8000-000000000001', 'parity case 48', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000003', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000030-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000030-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000030-0000-4000-8000-000000000001', '10000030-0000-4000-8000-000000000001', NULL, 500, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000030-0000-4000-8000-000000000002', '10000030-0000-4000-8000-000000000001', NULL, 300, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000030-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,500,1500,1500)',
  'case 48: currency: QuickBooks '' usd '' wins over an Ontario address'
);

-- ── case 49: currency: no QuickBooks currency and a Texas address is USD ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000031-0000-4000-8000-000000000001', 'parity case 49', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000031-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000031-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000031-0000-4000-8000-000000000001', '10000031-0000-4000-8000-000000000001', NULL, 100, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000031-0000-4000-8000-000000000002', '10000031-0000-4000-8000-000000000001', NULL, 100, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000031-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,100,1900,1900)',
  'case 49: currency: no QuickBooks currency and a Texas address is USD'
);

-- ── case 50: currency: a QuickBooks currency that is neither falls back to the province ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000032-0000-4000-8000-000000000001', 'parity case 50', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000005', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000032-0000-4000-8000-000000000001', 'line', 'CAD', 2000, 1, '10000032-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000032-0000-4000-8000-000000000001', '10000032-0000-4000-8000-000000000001', NULL, 400, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000032-0000-4000-8000-000000000002', '10000032-0000-4000-8000-000000000001', NULL, 400, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000032-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,400,1600,1600)',
  'case 50: currency: a QuickBooks currency that is neither falls back to the province'
);

-- ── case 51: currency: no office is USD ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000033-0000-4000-8000-000000000001', 'parity case 51', '2026-10-16', '2026-10-17', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000033-0000-4000-8000-000000000001', 'line', 'USD', 2000, 1, '10000033-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000033-0000-4000-8000-000000000001', '10000033-0000-4000-8000-000000000001', NULL, 400, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000033-0000-4000-8000-000000000002', '10000033-0000-4000-8000-000000000001', NULL, 400, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000033-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,400,1600,1600)',
  'case 51: currency: no office is USD'
);

-- ── case 52: currency: a CAD event ignores a USD payment against its installment ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000034-0000-4000-8000-000000000001', 'parity case 52', '2027-06-01', '2027-06-02', false, false, '0ff1ce00-0000-4000-8000-000000000006', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000034-0000-4000-8000-000000000001', 'line', 'CAD', 2000, 1, '10000034-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000034-0000-4000-8000-000000000001', '10000034-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000034-0000-4000-8000-000000000001', '10000034-0000-4000-8000-000000000001', NULL, 800, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000034-0000-4000-8000-000000000002', '10000034-0000-4000-8000-000000000001', NULL, 500, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000034-0000-4000-8000-000000000001', '2026-11-15') b),
  '(2000,500,1500,1500)',
  'case 52: currency: a CAD event ignores a USD payment against its installment'
);

-- ── case 53: deleted: an event whose only payment is deleted still owes everything ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000035-0000-4000-8000-000000000001', 'parity case 53', '2027-06-01', '2027-06-02', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000035-0000-4000-8000-000000000001', 'line', 'USD', 1000, 1, '10000035-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000035-0000-4000-8000-000000000001', '10000035-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000035-0000-4000-8000-000000000001', '10000035-0000-4000-8000-000000000001', NULL, 1000, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000035-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1000,0,1000,1000)',
  'case 53: deleted: an event whose only payment is deleted still owes everything'
);

-- ── case 54: fuzz 20261028/0 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000036-0000-4000-8000-000000000001', 'parity case 54', '2026-10-09', '2026-10-10', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-09-20T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000036-0000-4000-8000-000000000001', '10000036-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000036-0000-4000-8000-000000000002', '10000036-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000036-0000-4000-8000-000000000003', '10000036-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000036-0000-4000-8000-000000000004', '10000036-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000036-0000-4000-8000-000000000005', '10000036-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000036-0000-4000-8000-000000000006', '10000036-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000036-0000-4000-8000-000000000001', '2026-10-19') b),
  '(0,5,0,0)',
  'case 54: fuzz 20261028/0'
);

-- ── case 55: fuzz 20261028/1 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000037-0000-4000-8000-000000000001', 'parity case 55', '2026-11-27', '2026-11-28', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-12T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000037-0000-4000-8000-000000000001', '10000037-0000-4000-8000-000000000001', '2026-10-07', 'CAD', 802),
  ('20000037-0000-4000-8000-000000000002', '10000037-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 3491),
  ('20000037-0000-4000-8000-000000000003', '10000037-0000-4000-8000-000000000001', '2026-09-18', 'CAD', 5707);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000037-0000-4000-8000-000000000001', '10000037-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000037-0000-4000-8000-000000000002', '10000037-0000-4000-8000-000000000001', '20000037-0000-4000-8000-000000000002', 2, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000037-0000-4000-8000-000000000003', '10000037-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000037-0000-4000-8000-000000000004', '10000037-0000-4000-8000-000000000001', '20000037-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000037-0000-4000-8000-000000000005', '10000037-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000037-0000-4000-8000-000000000001', '2026-11-14') b),
  '(0,2,0,0)',
  'case 55: fuzz 20261028/1'
);

-- ── case 56: fuzz 20261028/2 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000038-0000-4000-8000-000000000001', 'parity case 56', '2026-11-21', '2026-11-22', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-02T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000038-0000-4000-8000-000000000001', 'line', 'CAD', 72992, 5, '10000038-0000-4000-8000-000000000001', false),
  ('30000038-0000-4000-8000-000000000002', 'line', 'CAD', 24623, 5, '10000038-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000038-0000-4000-8000-000000000001', '10000038-0000-4000-8000-000000000001', NULL, 288245, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000038-0000-4000-8000-000000000002', '10000038-0000-4000-8000-000000000001', NULL, 11883, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000038-0000-4000-8000-000000000003', '10000038-0000-4000-8000-000000000001', NULL, 219028, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000038-0000-4000-8000-000000000001', '2026-10-21') b),
  '(488075,219028,269047,0)',
  'case 56: fuzz 20261028/2'
);

-- ── case 57: fuzz 20261028/3 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000039-0000-4000-8000-000000000001', 'parity case 57', '2026-10-26', '2026-10-27', false, false, NULL, NULL, NULL, '2026-10-26T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000039-0000-4000-8000-000000000001', 'parity case 57 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000039-0000-4000-8000-000000000001', '50000039-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000039-0000-4000-8000-000000000001', '10000039-0000-4000-8000-000000000001', '2026-11-25', 'USD', 6681),
  ('20000039-0000-4000-8000-000000000002', '10000039-0000-4000-8000-000000000001', '2026-12-18', 'USD', 876),
  ('20000039-0000-4000-8000-000000000003', '10000039-0000-4000-8000-000000000001', '2026-10-07', 'USD', 2443);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000039-0000-4000-8000-000000000001', '10000039-0000-4000-8000-000000000001', '20000039-0000-4000-8000-000000000002', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000039-0000-4000-8000-000000000002', '10000039-0000-4000-8000-000000000001', '60000039-0000-4000-8000-000000000001', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000039-0000-4000-8000-000000000003', '10000039-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000039-0000-4000-8000-000000000004', '10000039-0000-4000-8000-000000000001', '20000039-0000-4000-8000-000000000003', 2, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000039-0000-4000-8000-000000000005', '10000039-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000039-0000-4000-8000-000000000006', '10000039-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000039-0000-4000-8000-000000000007', '10000039-0000-4000-8000-000000000001', '20000039-0000-4000-8000-000000000003', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000039-0000-4000-8000-000000000008', '10000039-0000-4000-8000-000000000001', '20000039-0000-4000-8000-000000000003', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000039-0000-4000-8000-000000000001', '2026-11-07') b),
  '(0,5,0,0)',
  'case 57: fuzz 20261028/3'
);

-- ── case 58: fuzz 20261028/4 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003a-0000-4000-8000-000000000001', 'parity case 58', '2026-08-25', '2026-08-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', 9.975, NULL, '2026-07-29T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000003a-0000-4000-8000-000000000001', 'line', 'CAD', 136840, NULL, '1000003a-0000-4000-8000-000000000001', false),
  ('3000003a-0000-4000-8000-000000000002', 'line', 'CAD', 10653, 5, '1000003a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000003a-0000-4000-8000-000000000001', '1000003a-0000-4000-8000-000000000001', '2026-12-11', 'CAD', 8820),
  ('2000003a-0000-4000-8000-000000000002', '1000003a-0000-4000-8000-000000000001', '2026-12-17', 'CAD', 1180);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003a-0000-4000-8000-000000000001', '2026-10-21') b),
  '(209068,0,209068,0)',
  'case 58: fuzz 20261028/4'
);

-- ── case 59: fuzz 20261028/5 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003b-0000-4000-8000-000000000001', 'parity case 59', '2026-12-18', '2026-12-19', false, false, NULL, 7.5, 1169, '2026-12-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000003b-0000-4000-8000-000000000001', 'line', 'USD', 80429, 1, '1000003b-0000-4000-8000-000000000001', true),
  ('3000003b-0000-4000-8000-000000000002', 'line', 'USD', 136700, 5, '1000003b-0000-4000-8000-000000000001', false),
  ('3000003b-0000-4000-8000-000000000003', 'line', 'USD', -37484, 5, '1000003b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000003b-0000-4000-8000-000000000001', '1000003b-0000-4000-8000-000000000001', '2026-12-02', 'USD', 3850),
  ('2000003b-0000-4000-8000-000000000002', '1000003b-0000-4000-8000-000000000001', '2026-10-20', 'USD', 6150);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000003b-0000-4000-8000-000000000001', '1000003b-0000-4000-8000-000000000001', NULL, 239008, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003b-0000-4000-8000-000000000002', '1000003b-0000-4000-8000-000000000001', '2000003b-0000-4000-8000-000000000001', 78530, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003b-0000-4000-8000-000000000003', '1000003b-0000-4000-8000-000000000001', NULL, 112081, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003b-0000-4000-8000-000000000001', '2026-10-24') b),
  '(497249,429619,67630,0)',
  'case 59: fuzz 20261028/5'
);

-- ── case 60: fuzz 20261028/6 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003c-0000-4000-8000-000000000001', 'parity case 60', '2026-12-16', '2026-12-17', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-15T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000003c-0000-4000-8000-000000000001', '1000003c-0000-4000-8000-000000000001', '2026-09-16', 'CAD', 1866),
  ('2000003c-0000-4000-8000-000000000002', '1000003c-0000-4000-8000-000000000001', '2026-10-14', 'CAD', 1925),
  ('2000003c-0000-4000-8000-000000000003', '1000003c-0000-4000-8000-000000000001', '2026-09-14', 'CAD', 589),
  ('2000003c-0000-4000-8000-000000000004', '1000003c-0000-4000-8000-000000000001', '2026-09-19', 'CAD', 5620);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000003c-0000-4000-8000-000000000001', '1000003c-0000-4000-8000-000000000001', NULL, 2, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003c-0000-4000-8000-000000000002', '1000003c-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000003c-0000-4000-8000-000000000003', '1000003c-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003c-0000-4000-8000-000000000004', '1000003c-0000-4000-8000-000000000001', '2000003c-0000-4000-8000-000000000001', -2, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003c-0000-4000-8000-000000000005', '1000003c-0000-4000-8000-000000000001', '2000003c-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003c-0000-4000-8000-000000000006', '1000003c-0000-4000-8000-000000000001', '2000003c-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003c-0000-4000-8000-000000000007', '1000003c-0000-4000-8000-000000000001', '2000003c-0000-4000-8000-000000000004', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003c-0000-4000-8000-000000000001', '2026-10-27') b),
  '(0,6,0,0)',
  'case 60: fuzz 20261028/6'
);

-- ── case 61: fuzz 20261028/7 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003d-0000-4000-8000-000000000001', 'parity case 61', '2026-09-13', '2026-09-14', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000003d-0000-4000-8000-000000000001', 'line', 'USD', 33298, NULL, '1000003d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000003d-0000-4000-8000-000000000001', '1000003d-0000-4000-8000-000000000001', '2026-09-24', 'USD', 5928),
  ('2000003d-0000-4000-8000-000000000002', '1000003d-0000-4000-8000-000000000001', '2026-11-06', 'USD', 3696),
  ('2000003d-0000-4000-8000-000000000003', '1000003d-0000-4000-8000-000000000001', '2026-10-29', 'USD', 376);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000003d-0000-4000-8000-000000000001', '1000003d-0000-4000-8000-000000000001', '2000003d-0000-4000-8000-000000000001', 20427, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003d-0000-4000-8000-000000000002', '1000003d-0000-4000-8000-000000000001', NULL, 15022, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003d-0000-4000-8000-000000000003', '1000003d-0000-4000-8000-000000000001', NULL, 12643, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003d-0000-4000-8000-000000000004', '1000003d-0000-4000-8000-000000000001', NULL, 31702, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000003d-0000-4000-8000-000000000005', '1000003d-0000-4000-8000-000000000001', '2000003d-0000-4000-8000-000000000002', 5569, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003d-0000-4000-8000-000000000001', '2026-10-30') b),
  '(33298,49914,0,0)',
  'case 61: fuzz 20261028/7'
);

-- ── case 62: fuzz 20261028/8 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003e-0000-4000-8000-000000000001', 'parity case 62', '2026-10-26', '2026-10-27', false, false, NULL, NULL, NULL, '2026-10-24T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000003e-0000-4000-8000-000000000001', '1000003e-0000-4000-8000-000000000001', '2026-10-08', 'USD', 918),
  ('2000003e-0000-4000-8000-000000000002', '1000003e-0000-4000-8000-000000000001', '2026-10-25', 'USD', 9082);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003e-0000-4000-8000-000000000001', '2026-11-20') b),
  '(0,0,0,0)',
  'case 62: fuzz 20261028/8'
);

-- ── case 63: fuzz 20261028/9 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000003f-0000-4000-8000-000000000001', 'parity case 63', '2026-11-04', '2026-11-05', false, false, '0ff1ce00-0000-4000-8000-000000000002', 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000003f-0000-4000-8000-000000000001', 'line', 'CAD', 73173, 5, '1000003f-0000-4000-8000-000000000001', false),
  ('3000003f-0000-4000-8000-000000000002', 'line', 'CAD', -18800, NULL, '1000003f-0000-4000-8000-000000000001', true),
  ('3000003f-0000-4000-8000-000000000003', 'line', 'CAD', 142087, 5, '1000003f-0000-4000-8000-000000000001', false),
  ('3000003f-0000-4000-8000-000000000004', 'line', 'CAD', 129178, 3, '1000003f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000003f-0000-4000-8000-000000000001', '1000003f-0000-4000-8000-000000000001', NULL, -178500, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000003f-0000-4000-8000-000000000001', '2026-10-23') b),
  '(1609851,-178500,1788351,0)',
  'case 63: fuzz 20261028/9'
);

-- ── case 64: fuzz 20261028/10 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000040-0000-4000-8000-000000000001', 'parity case 64', '2026-11-12', '2026-11-13', false, false, NULL, NULL, NULL, '2026-10-24T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000040-0000-4000-8000-000000000001', 'line', 'USD', -26436, NULL, '10000040-0000-4000-8000-000000000001', true),
  ('30000040-0000-4000-8000-000000000002', 'line', 'USD', 15998, 5, '10000040-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000040-0000-4000-8000-000000000001', '10000040-0000-4000-8000-000000000001', '2026-09-28', 'USD', 60),
  ('20000040-0000-4000-8000-000000000002', '10000040-0000-4000-8000-000000000001', '2026-10-09', 'USD', 3765),
  ('20000040-0000-4000-8000-000000000003', '10000040-0000-4000-8000-000000000001', '2026-10-13', 'USD', 1754),
  ('20000040-0000-4000-8000-000000000004', '10000040-0000-4000-8000-000000000001', '2026-12-22', 'USD', 1614),
  ('20000040-0000-4000-8000-000000000005', '10000040-0000-4000-8000-000000000001', '2026-08-31', 'USD', 2807);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000040-0000-4000-8000-000000000001', '10000040-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000002', '10000040-0000-4000-8000-000000000001', '20000040-0000-4000-8000-000000000002', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000003', '10000040-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000004', '10000040-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000005', '10000040-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000006', '10000040-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000040-0000-4000-8000-000000000007', '10000040-0000-4000-8000-000000000001', NULL, -2, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000040-0000-4000-8000-000000000001', '2026-10-27') b),
  '(0,7,0,0)',
  'case 64: fuzz 20261028/10'
);

-- ── case 65: fuzz 20261028/11 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000041-0000-4000-8000-000000000001', 'parity case 65', '2026-12-26', '2026-12-27', false, false, '0ff1ce00-0000-4000-8000-000000000002', 5, NULL, '2026-11-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000041-0000-4000-8000-000000000001', 'line', 'CAD', 48603, 3, '10000041-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000041-0000-4000-8000-000000000001', '2026-11-27') b),
  '(153099,0,153099,0)',
  'case 65: fuzz 20261028/11'
);

-- ── case 66: fuzz 20261028/12 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000042-0000-4000-8000-000000000001', 'parity case 66', '2026-10-21', '2026-10-22', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-09-23T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000042-0000-4000-8000-000000000001', 'line', 'USD', 131261, 3, '10000042-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000042-0000-4000-8000-000000000001', '10000042-0000-4000-8000-000000000001', '2026-11-18', 'USD', 6523),
  ('20000042-0000-4000-8000-000000000002', '10000042-0000-4000-8000-000000000001', '2026-11-01', 'USD', 3240),
  ('20000042-0000-4000-8000-000000000003', '10000042-0000-4000-8000-000000000001', '2026-10-31', 'USD', 237);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000042-0000-4000-8000-000000000001', '10000042-0000-4000-8000-000000000001', NULL, 186535, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000002', '10000042-0000-4000-8000-000000000001', NULL, 179416, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000003', '10000042-0000-4000-8000-000000000001', '20000042-0000-4000-8000-000000000001', 42855, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000004', '10000042-0000-4000-8000-000000000001', '20000042-0000-4000-8000-000000000003', -37396, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000005', '10000042-0000-4000-8000-000000000001', '20000042-0000-4000-8000-000000000001', -284235, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000006', '10000042-0000-4000-8000-000000000001', '20000042-0000-4000-8000-000000000002', 22327, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000042-0000-4000-8000-000000000007', '10000042-0000-4000-8000-000000000001', '20000042-0000-4000-8000-000000000003', 3372, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000042-0000-4000-8000-000000000001', '2026-11-13') b),
  '(393783,434505,0,0)',
  'case 66: fuzz 20261028/12'
);

-- ── case 67: fuzz 20261028/13 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000043-0000-4000-8000-000000000001', 'parity case 67', '2026-11-17', '2026-11-18', false, false, NULL, NULL, NULL, '2026-10-28T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000043-0000-4000-8000-000000000001', 'parity case 67 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000043-0000-4000-8000-000000000001', '50000043-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000043-0000-4000-8000-000000000001', 'line', 'USD', -13158, 1, '10000043-0000-4000-8000-000000000001', false),
  ('30000043-0000-4000-8000-000000000002', 'line', 'USD', 90332, NULL, '10000043-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000043-0000-4000-8000-000000000001', '10000043-0000-4000-8000-000000000001', NULL, 68583, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000043-0000-4000-8000-000000000002', '10000043-0000-4000-8000-000000000001', NULL, 32192, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000043-0000-4000-8000-000000000003', '10000043-0000-4000-8000-000000000001', NULL, 48044, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000043-0000-4000-8000-000000000004', '10000043-0000-4000-8000-000000000001', '60000043-0000-4000-8000-000000000001', 40538, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000043-0000-4000-8000-000000000005', '10000043-0000-4000-8000-000000000001', NULL, -36225, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000043-0000-4000-8000-000000000006', '10000043-0000-4000-8000-000000000001', NULL, 47467, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000043-0000-4000-8000-000000000001', '2026-11-14') b),
  '(77174,127869,0,0)',
  'case 67: fuzz 20261028/13'
);

-- ── case 68: fuzz 20261028/14 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000044-0000-4000-8000-000000000001', 'parity case 68', '2026-11-19', '2026-11-20', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-10-31T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000044-0000-4000-8000-000000000001', 'line', 'CAD', -46072, 5, '10000044-0000-4000-8000-000000000001', false),
  ('30000044-0000-4000-8000-000000000002', 'line', 'CAD', 7392, 1, '10000044-0000-4000-8000-000000000001', true),
  ('30000044-0000-4000-8000-000000000003', 'line', 'CAD', 106153, 2, '10000044-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000044-0000-4000-8000-000000000001', '10000044-0000-4000-8000-000000000001', '2026-10-03', 'CAD', 6682),
  ('20000044-0000-4000-8000-000000000002', '10000044-0000-4000-8000-000000000001', '2026-10-03', 'CAD', 3318);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000044-0000-4000-8000-000000000001', '10000044-0000-4000-8000-000000000001', NULL, 1, 'USD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000044-0000-4000-8000-000000000002', '10000044-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000044-0000-4000-8000-000000000001', '2026-10-28') b),
  '(0,0,0,0)',
  'case 68: fuzz 20261028/14'
);

-- ── case 69: fuzz 20261028/15 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000045-0000-4000-8000-000000000001', 'parity case 69', '2026-11-27', '2026-11-28', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-11-13T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000045-0000-4000-8000-000000000001', 'parity case 69 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000045-0000-4000-8000-000000000001', '50000045-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000045-0000-4000-8000-000000000001', 'line', 'USD', 23818, 3, '10000045-0000-4000-8000-000000000001', false),
  ('30000045-0000-4000-8000-000000000002', 'line', 'USD', 100911, 3, '10000045-0000-4000-8000-000000000001', false),
  ('30000045-0000-4000-8000-000000000003', 'line', 'USD', 11156, 5, '10000045-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000045-0000-4000-8000-000000000001', '10000045-0000-4000-8000-000000000001', NULL, 155335, 'USD', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000045-0000-4000-8000-000000000002', '10000045-0000-4000-8000-000000000001', '60000045-0000-4000-8000-000000000001', 40070, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000045-0000-4000-8000-000000000003', '10000045-0000-4000-8000-000000000001', '60000045-0000-4000-8000-000000000001', 283373, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000045-0000-4000-8000-000000000004', '10000045-0000-4000-8000-000000000001', NULL, 108034, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000045-0000-4000-8000-000000000005', '10000045-0000-4000-8000-000000000001', NULL, 99782, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000045-0000-4000-8000-000000000006', '10000045-0000-4000-8000-000000000001', NULL, -203767, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000045-0000-4000-8000-000000000001', '2026-11-21') b),
  '(374187,4049,370138,370138)',
  'case 69: fuzz 20261028/15'
);

-- ── case 70: fuzz 20261028/16 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000046-0000-4000-8000-000000000001', 'parity case 70', '2026-10-20', '2026-10-21', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 2362, '2026-09-20T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000046-0000-4000-8000-000000000001', 'line', 'USD', -43955, 2, '10000046-0000-4000-8000-000000000001', false),
  ('30000046-0000-4000-8000-000000000002', 'line', 'USD', -39690, 3, '10000046-0000-4000-8000-000000000001', false),
  ('30000046-0000-4000-8000-000000000003', 'line', 'USD', 5754, 2, '10000046-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000046-0000-4000-8000-000000000001', '10000046-0000-4000-8000-000000000001', '2026-11-24', 'USD', 5134),
  ('20000046-0000-4000-8000-000000000002', '10000046-0000-4000-8000-000000000001', '2026-10-22', 'USD', 2383),
  ('20000046-0000-4000-8000-000000000003', '10000046-0000-4000-8000-000000000001', '2026-09-08', 'USD', 4281),
  ('20000046-0000-4000-8000-000000000004', '10000046-0000-4000-8000-000000000001', '2026-10-04', 'USD', 5497);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000046-0000-4000-8000-000000000001', '10000046-0000-4000-8000-000000000001', '20000046-0000-4000-8000-000000000001', 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000046-0000-4000-8000-000000000002', '10000046-0000-4000-8000-000000000001', NULL, 2, 'usd', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000046-0000-4000-8000-000000000003', '10000046-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000046-0000-4000-8000-000000000004', '10000046-0000-4000-8000-000000000001', '20000046-0000-4000-8000-000000000004', 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000046-0000-4000-8000-000000000005', '10000046-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000046-0000-4000-8000-000000000006', '10000046-0000-4000-8000-000000000001', '20000046-0000-4000-8000-000000000002', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000046-0000-4000-8000-000000000001', '2026-11-04') b),
  '(0,5,0,0)',
  'case 70: fuzz 20261028/16'
);

-- ── case 71: fuzz 20261028/17 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000047-0000-4000-8000-000000000001', 'parity case 71', '2026-11-23', '2026-11-24', false, false, '0ff1ce00-0000-4000-8000-000000000007', 9.975, NULL, '2026-11-08T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000047-0000-4000-8000-000000000001', 'line', 'CAD', 17786, 5, '10000047-0000-4000-8000-000000000001', true),
  ('30000047-0000-4000-8000-000000000002', 'line', 'CAD', -25715, 1, '10000047-0000-4000-8000-000000000001', false),
  ('30000047-0000-4000-8000-000000000003', 'line', 'CAD', 12055, 4, '10000047-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000047-0000-4000-8000-000000000001', '10000047-0000-4000-8000-000000000001', '2026-09-19', 'CAD', 2545),
  ('20000047-0000-4000-8000-000000000002', '10000047-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 244),
  ('20000047-0000-4000-8000-000000000003', '10000047-0000-4000-8000-000000000001', '2027-01-02', 'CAD', 19),
  ('20000047-0000-4000-8000-000000000004', '10000047-0000-4000-8000-000000000001', '2026-12-29', 'CAD', 1173),
  ('20000047-0000-4000-8000-000000000005', '10000047-0000-4000-8000-000000000001', '2026-10-12', 'CAD', 6019);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000047-0000-4000-8000-000000000001', '10000047-0000-4000-8000-000000000001', '20000047-0000-4000-8000-000000000002', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000047-0000-4000-8000-000000000002', '10000047-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000047-0000-4000-8000-000000000003', '10000047-0000-4000-8000-000000000001', '20000047-0000-4000-8000-000000000002', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000047-0000-4000-8000-000000000004', '10000047-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000047-0000-4000-8000-000000000005', '10000047-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000047-0000-4000-8000-000000000006', '10000047-0000-4000-8000-000000000001', '20000047-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000047-0000-4000-8000-000000000001', '2026-11-11') b),
  '(0,3,0,0)',
  'case 71: fuzz 20261028/17'
);

-- ── case 72: fuzz 20261028/18 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000048-0000-4000-8000-000000000001', 'parity case 72', '2026-12-17', '2026-12-18', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-03T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000048-0000-4000-8000-000000000001', 'line', 'CAD', 55934, 1, '10000048-0000-4000-8000-000000000001', false),
  ('30000048-0000-4000-8000-000000000002', 'line', 'CAD', 146591, 5, '10000048-0000-4000-8000-000000000001', false),
  ('30000048-0000-4000-8000-000000000003', 'line', 'CAD', 147908, 4, '10000048-0000-4000-8000-000000000001', false),
  ('30000048-0000-4000-8000-000000000004', 'line', 'CAD', -32630, 4, '10000048-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000048-0000-4000-8000-000000000001', '10000048-0000-4000-8000-000000000001', '2026-09-07', 'CAD', 5172),
  ('20000048-0000-4000-8000-000000000002', '10000048-0000-4000-8000-000000000001', '2026-10-30', 'CAD', 4828);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000048-0000-4000-8000-000000000001', '10000048-0000-4000-8000-000000000001', NULL, 6327, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000048-0000-4000-8000-000000000002', '10000048-0000-4000-8000-000000000001', '20000048-0000-4000-8000-000000000001', 269571, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000048-0000-4000-8000-000000000003', '10000048-0000-4000-8000-000000000001', '20000048-0000-4000-8000-000000000001', 198029, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000048-0000-4000-8000-000000000001', '2026-11-06') b),
  '(1250001,6327,1243674,1243674)',
  'case 72: fuzz 20261028/18'
);

-- ── case 73: fuzz 20261028/19 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000049-0000-4000-8000-000000000001', 'parity case 73', '2026-11-27', '2026-11-28', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000049-0000-4000-8000-000000000001', 'line', 'CAD', 59948, 3, '10000049-0000-4000-8000-000000000001', false),
  ('30000049-0000-4000-8000-000000000002', 'line', 'CAD', 58396, 4, '10000049-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000049-0000-4000-8000-000000000001', '10000049-0000-4000-8000-000000000001', '2026-10-27', 'CAD', 5412),
  ('20000049-0000-4000-8000-000000000002', '10000049-0000-4000-8000-000000000001', '2026-11-07', 'CAD', 5157),
  ('20000049-0000-4000-8000-000000000003', '10000049-0000-4000-8000-000000000001', '2026-11-25', 'CAD', 2909),
  ('20000049-0000-4000-8000-000000000004', '10000049-0000-4000-8000-000000000001', '2026-11-26', 'CAD', 681),
  ('20000049-0000-4000-8000-000000000005', '10000049-0000-4000-8000-000000000001', '2027-01-27', 'CAD', 3271);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000049-0000-4000-8000-000000000001', '10000049-0000-4000-8000-000000000001', NULL, 83068, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000049-0000-4000-8000-000000000002', '10000049-0000-4000-8000-000000000001', '20000049-0000-4000-8000-000000000005', 67095, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000049-0000-4000-8000-000000000003', '10000049-0000-4000-8000-000000000001', '20000049-0000-4000-8000-000000000004', 151601, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000049-0000-4000-8000-000000000004', '10000049-0000-4000-8000-000000000001', NULL, -72048, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000049-0000-4000-8000-000000000005', '10000049-0000-4000-8000-000000000001', '20000049-0000-4000-8000-000000000001', 58600, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000049-0000-4000-8000-000000000001', '2026-12-06') b),
  '(179844,360364,0,0)',
  'case 73: fuzz 20261028/19'
);

-- ── case 74: fuzz 20261028/20 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004a-0000-4000-8000-000000000001', 'parity case 74', '2026-09-12', '2026-09-13', false, false, NULL, NULL, NULL, '2026-08-27T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000004a-0000-4000-8000-000000000001', 'parity case 74 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000004a-0000-4000-8000-000000000001', '5000004a-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004a-0000-4000-8000-000000000001', 'line', 'USD', 112478, 3, '1000004a-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004a-0000-4000-8000-000000000001', '1000004a-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000002', '1000004a-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000003', '1000004a-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000004', '1000004a-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000005', '1000004a-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000006', '1000004a-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004a-0000-4000-8000-000000000007', '1000004a-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000004a-0000-4000-8000-000000000008', '1000004a-0000-4000-8000-000000000001', '6000004a-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004a-0000-4000-8000-000000000001', '2026-10-30') b),
  '(0,7,0,0)',
  'case 74: fuzz 20261028/20'
);

-- ── case 75: fuzz 20261028/21 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004b-0000-4000-8000-000000000001', 'parity case 75', '2026-11-01', '2026-11-02', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000004b-0000-4000-8000-000000000001', 'parity case 75 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000004b-0000-4000-8000-000000000001', '5000004b-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004b-0000-4000-8000-000000000001', 'line', 'USD', -45070, 1, '1000004b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004b-0000-4000-8000-000000000001', '1000004b-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004b-0000-4000-8000-000000000002', '1000004b-0000-4000-8000-000000000001', '6000004b-0000-4000-8000-000000000001', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004b-0000-4000-8000-000000000003', '1000004b-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000004b-0000-4000-8000-000000000004', '1000004b-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004b-0000-4000-8000-000000000001', '2026-11-09') b),
  '(0,1,0,0)',
  'case 75: fuzz 20261028/21'
);

-- ── case 76: fuzz 20261028/22 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004c-0000-4000-8000-000000000001', 'parity case 76', '2026-10-11', '2026-10-12', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004c-0000-4000-8000-000000000001', 'line', 'CAD', 55553, 2, '1000004c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000004c-0000-4000-8000-000000000001', '1000004c-0000-4000-8000-000000000001', '2026-09-20', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004c-0000-4000-8000-000000000001', '1000004c-0000-4000-8000-000000000001', NULL, 84483, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000002', '1000004c-0000-4000-8000-000000000001', NULL, 42526, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000003', '1000004c-0000-4000-8000-000000000001', '2000004c-0000-4000-8000-000000000001', 75701, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000004', '1000004c-0000-4000-8000-000000000001', '2000004c-0000-4000-8000-000000000001', -92917, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000005', '1000004c-0000-4000-8000-000000000001', '2000004c-0000-4000-8000-000000000001', 102807, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000006', '1000004c-0000-4000-8000-000000000001', NULL, 21612, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000007', '1000004c-0000-4000-8000-000000000001', '2000004c-0000-4000-8000-000000000001', 94227, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004c-0000-4000-8000-000000000008', '1000004c-0000-4000-8000-000000000001', NULL, 48484, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004c-0000-4000-8000-000000000001', '2026-10-20') b),
  '(111106,189633,0,0)',
  'case 76: fuzz 20261028/22'
);

-- ── case 77: fuzz 20261028/23 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004d-0000-4000-8000-000000000001', 'parity case 77', '2026-10-22', '2026-10-23', false, false, '0ff1ce00-0000-4000-8000-000000000007', 15, NULL, '2026-09-30T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004d-0000-4000-8000-000000000001', 'line', 'CAD', 145007, 4, '1000004d-0000-4000-8000-000000000001', false),
  ('3000004d-0000-4000-8000-000000000002', 'line', 'CAD', 86686, 2, '1000004d-0000-4000-8000-000000000001', true),
  ('3000004d-0000-4000-8000-000000000003', 'line', 'CAD', 77871, 4, '1000004d-0000-4000-8000-000000000001', false),
  ('3000004d-0000-4000-8000-000000000004', 'line', 'CAD', 46871, 4, '1000004d-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000004d-0000-4000-8000-000000000001', '1000004d-0000-4000-8000-000000000001', '2026-11-06', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004d-0000-4000-8000-000000000001', '1000004d-0000-4000-8000-000000000001', NULL, -285332, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004d-0000-4000-8000-000000000002', '1000004d-0000-4000-8000-000000000001', NULL, 82645, 'CAD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000004d-0000-4000-8000-000000000003', '1000004d-0000-4000-8000-000000000001', '2000004d-0000-4000-8000-000000000001', -285543, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004d-0000-4000-8000-000000000004', '1000004d-0000-4000-8000-000000000001', '2000004d-0000-4000-8000-000000000001', 11554, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004d-0000-4000-8000-000000000001', '2026-11-22') b),
  '(1025239,-273778,1299017,1025239)',
  'case 77: fuzz 20261028/23'
);

-- ── case 78: fuzz 20261028/24 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004e-0000-4000-8000-000000000001', 'parity case 78', '2026-09-23', '2026-09-24', false, false, '0ff1ce00-0000-4000-8000-000000000008', 9.975, 461, '2026-08-30T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000004e-0000-4000-8000-000000000001', 'parity case 78 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000004e-0000-4000-8000-000000000001', '5000004e-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004e-0000-4000-8000-000000000001', 'line', 'USD', 134932, 1, '1000004e-0000-4000-8000-000000000001', true),
  ('3000004e-0000-4000-8000-000000000002', 'line', 'USD', 74677, 5, '1000004e-0000-4000-8000-000000000001', false),
  ('3000004e-0000-4000-8000-000000000003', 'line', 'USD', 66909, 1, '1000004e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004e-0000-4000-8000-000000000001', '1000004e-0000-4000-8000-000000000001', NULL, -11758, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004e-0000-4000-8000-000000000002', '1000004e-0000-4000-8000-000000000001', '6000004e-0000-4000-8000-000000000001', -48954, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004e-0000-4000-8000-000000000003', '1000004e-0000-4000-8000-000000000001', NULL, -72735, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004e-0000-4000-8000-000000000001', '2026-10-29') b),
  '(440755,-133447,574202,574202)',
  'case 78: fuzz 20261028/24'
);

-- ── case 79: fuzz 20261028/25 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000004f-0000-4000-8000-000000000001', 'parity case 79', '2026-09-05', '2026-09-06', false, false, '0ff1ce00-0000-4000-8000-000000000004', 15, 1703, '2026-08-05T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000004f-0000-4000-8000-000000000001', 'line', 'USD', -7738, 3, '1000004f-0000-4000-8000-000000000001', false),
  ('3000004f-0000-4000-8000-000000000002', 'line', 'USD', 147310, 1, '1000004f-0000-4000-8000-000000000001', false),
  ('3000004f-0000-4000-8000-000000000003', 'line', 'USD', 107724, 2, '1000004f-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000004f-0000-4000-8000-000000000001', '1000004f-0000-4000-8000-000000000001', '2026-10-11', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000004f-0000-4000-8000-000000000001', '1000004f-0000-4000-8000-000000000001', '2000004f-0000-4000-8000-000000000001', 75052, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004f-0000-4000-8000-000000000002', '1000004f-0000-4000-8000-000000000001', '2000004f-0000-4000-8000-000000000001', 116847, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004f-0000-4000-8000-000000000003', '1000004f-0000-4000-8000-000000000001', NULL, 45439, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004f-0000-4000-8000-000000000004', '1000004f-0000-4000-8000-000000000001', NULL, 5711, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000004f-0000-4000-8000-000000000005', '1000004f-0000-4000-8000-000000000001', '2000004f-0000-4000-8000-000000000001', 99853, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004f-0000-4000-8000-000000000006', '1000004f-0000-4000-8000-000000000001', '2000004f-0000-4000-8000-000000000001', 73344, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000004f-0000-4000-8000-000000000007', '1000004f-0000-4000-8000-000000000001', NULL, 110725, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000004f-0000-4000-8000-000000000001', '2026-10-22') b),
  '(125799,421407,0,0)',
  'case 79: fuzz 20261028/25'
);

-- ── case 80: fuzz 20261028/26 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000050-0000-4000-8000-000000000001', 'parity case 80', '2026-12-04', '2026-12-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-11-26T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000050-0000-4000-8000-000000000001', '10000050-0000-4000-8000-000000000001', '2026-11-04', 'CAD', 4319),
  ('20000050-0000-4000-8000-000000000002', '10000050-0000-4000-8000-000000000001', '2026-10-18', 'CAD', 3818),
  ('20000050-0000-4000-8000-000000000003', '10000050-0000-4000-8000-000000000001', '2026-10-30', 'CAD', 1863);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000050-0000-4000-8000-000000000001', '10000050-0000-4000-8000-000000000001', '20000050-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000050-0000-4000-8000-000000000002', '10000050-0000-4000-8000-000000000001', '20000050-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000050-0000-4000-8000-000000000003', '10000050-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000050-0000-4000-8000-000000000004', '10000050-0000-4000-8000-000000000001', '20000050-0000-4000-8000-000000000001', 2, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000050-0000-4000-8000-000000000005', '10000050-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000050-0000-4000-8000-000000000006', '10000050-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000050-0000-4000-8000-000000000001', '2026-11-18') b),
  '(0,5,0,0)',
  'case 80: fuzz 20261028/26'
);

-- ── case 81: fuzz 20261028/27 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000051-0000-4000-8000-000000000001', 'parity case 81', '2026-12-14', '2026-12-15', false, false, '0ff1ce00-0000-4000-8000-000000000001', 0, 2389, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000051-0000-4000-8000-000000000001', '10000051-0000-4000-8000-000000000001', '2026-12-05', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000051-0000-4000-8000-000000000001', '10000051-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000051-0000-4000-8000-000000000002', '10000051-0000-4000-8000-000000000001', '20000051-0000-4000-8000-000000000001', 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000051-0000-4000-8000-000000000003', '10000051-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000051-0000-4000-8000-000000000004', '10000051-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000051-0000-4000-8000-000000000005', '10000051-0000-4000-8000-000000000001', '20000051-0000-4000-8000-000000000001', -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000051-0000-4000-8000-000000000001', '2026-11-03') b),
  '(2389,3,2386,0)',
  'case 81: fuzz 20261028/27'
);

-- ── case 82: fuzz 20261028/28 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000052-0000-4000-8000-000000000001', 'parity case 82', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-01T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000052-0000-4000-8000-000000000001', 'parity case 82 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000052-0000-4000-8000-000000000001', '50000052-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000052-0000-4000-8000-000000000001', 'line', 'USD', 49958, 4, '10000052-0000-4000-8000-000000000001', true),
  ('30000052-0000-4000-8000-000000000002', 'line', 'USD', 132008, 2, '10000052-0000-4000-8000-000000000001', false),
  ('30000052-0000-4000-8000-000000000003', 'line', 'USD', 54701, 1, '10000052-0000-4000-8000-000000000001', false),
  ('30000052-0000-4000-8000-000000000004', 'line', 'USD', 39425, 2, '10000052-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000052-0000-4000-8000-000000000001', '10000052-0000-4000-8000-000000000001', '2026-10-30', 'USD', 835),
  ('20000052-0000-4000-8000-000000000002', '10000052-0000-4000-8000-000000000001', '2026-09-18', 'USD', 2533),
  ('20000052-0000-4000-8000-000000000003', '10000052-0000-4000-8000-000000000001', '2026-09-16', 'USD', 1909),
  ('20000052-0000-4000-8000-000000000004', '10000052-0000-4000-8000-000000000001', '2026-11-22', 'USD', 2193),
  ('20000052-0000-4000-8000-000000000005', '10000052-0000-4000-8000-000000000001', '2026-12-05', 'USD', 2530);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000052-0000-4000-8000-000000000001', '10000052-0000-4000-8000-000000000001', '60000052-0000-4000-8000-000000000001', -24040, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000052-0000-4000-8000-000000000002', '10000052-0000-4000-8000-000000000001', NULL, 6100, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000052-0000-4000-8000-000000000003', '10000052-0000-4000-8000-000000000001', NULL, -282151, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000052-0000-4000-8000-000000000004', '10000052-0000-4000-8000-000000000001', '20000052-0000-4000-8000-000000000005', 89563, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000052-0000-4000-8000-000000000005', '10000052-0000-4000-8000-000000000001', NULL, 180531, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000052-0000-4000-8000-000000000001', '2026-11-06') b),
  '(397567,276194,121373,23166)',
  'case 82: fuzz 20261028/28'
);

-- ── case 83: fuzz 20261028/29 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000053-0000-4000-8000-000000000001', 'parity case 83', '2027-01-07', '2027-01-08', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 1333, '2026-12-14T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000053-0000-4000-8000-000000000001', 'line', 'CAD', 23676, 3, '10000053-0000-4000-8000-000000000001', false),
  ('30000053-0000-4000-8000-000000000002', 'line', 'CAD', -4793, 1, '10000053-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000053-0000-4000-8000-000000000001', '10000053-0000-4000-8000-000000000001', '2026-09-20', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000053-0000-4000-8000-000000000001', '10000053-0000-4000-8000-000000000001', '20000053-0000-4000-8000-000000000001', -5880, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000053-0000-4000-8000-000000000002', '10000053-0000-4000-8000-000000000001', NULL, -9569, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000053-0000-4000-8000-000000000001', '2026-11-10') b),
  '(67568,-5880,73448,67568)',
  'case 83: fuzz 20261028/29'
);

-- ── case 84: fuzz 20261028/30 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000054-0000-4000-8000-000000000001', 'parity case 84', '2026-12-12', '2026-12-13', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-11-20T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000054-0000-4000-8000-000000000001', '10000054-0000-4000-8000-000000000001', '2026-08-23', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000054-0000-4000-8000-000000000001', '10000054-0000-4000-8000-000000000001', '20000054-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000054-0000-4000-8000-000000000001', '2026-10-21') b),
  '(0,1,0,0)',
  'case 84: fuzz 20261028/30'
);

-- ── case 85: fuzz 20261028/31 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000055-0000-4000-8000-000000000001', 'parity case 85', '2026-12-03', '2026-12-04', false, false, '0ff1ce00-0000-4000-8000-000000000008', 13, NULL, '2026-11-03T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000055-0000-4000-8000-000000000001', 'parity case 85 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000055-0000-4000-8000-000000000001', '50000055-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000055-0000-4000-8000-000000000001', 'line', 'USD', 42496, NULL, '10000055-0000-4000-8000-000000000001', true),
  ('30000055-0000-4000-8000-000000000002', 'line', 'USD', -6629, 4, '10000055-0000-4000-8000-000000000001', false),
  ('30000055-0000-4000-8000-000000000003', 'line', 'USD', 78510, 1, '10000055-0000-4000-8000-000000000001', false),
  ('30000055-0000-4000-8000-000000000004', 'line', 'USD', 123955, 3, '10000055-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000055-0000-4000-8000-000000000001', '10000055-0000-4000-8000-000000000001', '2026-11-07', 'USD', 3106),
  ('20000055-0000-4000-8000-000000000002', '10000055-0000-4000-8000-000000000001', '2026-10-25', 'USD', 6894);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000055-0000-4000-8000-000000000001', '10000055-0000-4000-8000-000000000001', '20000055-0000-4000-8000-000000000002', -62205, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000055-0000-4000-8000-000000000002', '10000055-0000-4000-8000-000000000001', '60000055-0000-4000-8000-000000000001', 26017, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000055-0000-4000-8000-000000000001', '2026-11-27') b),
  '(478961,-62205,541166,478961)',
  'case 85: fuzz 20261028/31'
);

-- ── case 86: fuzz 20261028/32 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000056-0000-4000-8000-000000000001', 'parity case 86', '2026-10-25', '2026-10-26', false, false, NULL, NULL, NULL, '2026-10-24T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000056-0000-4000-8000-000000000001', 'line', 'USD', 137618, 5, '10000056-0000-4000-8000-000000000001', false),
  ('30000056-0000-4000-8000-000000000002', 'line', 'USD', 84095, 5, '10000056-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000056-0000-4000-8000-000000000001', '10000056-0000-4000-8000-000000000001', '2026-10-08', 'USD', 1310),
  ('20000056-0000-4000-8000-000000000002', '10000056-0000-4000-8000-000000000001', '2027-01-13', 'USD', 8690);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000056-0000-4000-8000-000000000001', '10000056-0000-4000-8000-000000000001', NULL, 26605, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000002', '10000056-0000-4000-8000-000000000001', NULL, -48791, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000003', '10000056-0000-4000-8000-000000000001', '20000056-0000-4000-8000-000000000002', 144700, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000004', '10000056-0000-4000-8000-000000000001', NULL, 40933, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000005', '10000056-0000-4000-8000-000000000001', NULL, 117352, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000006', '10000056-0000-4000-8000-000000000001', NULL, 152590, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000056-0000-4000-8000-000000000007', '10000056-0000-4000-8000-000000000001', '20000056-0000-4000-8000-000000000001', -44297, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000056-0000-4000-8000-000000000001', '2026-11-30') b),
  '(1108565,323895,784670,0)',
  'case 86: fuzz 20261028/32'
);

-- ── case 87: fuzz 20261028/33 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000057-0000-4000-8000-000000000001', 'parity case 87', '2026-10-31', '2026-11-01', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-31T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000057-0000-4000-8000-000000000001', 'line', 'CAD', 113261, NULL, '10000057-0000-4000-8000-000000000001', false),
  ('30000057-0000-4000-8000-000000000002', 'line', 'CAD', 92541, 1, '10000057-0000-4000-8000-000000000001', false),
  ('30000057-0000-4000-8000-000000000003', 'line', 'CAD', -39739, 3, '10000057-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000057-0000-4000-8000-000000000001', '10000057-0000-4000-8000-000000000001', NULL, 78980, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000057-0000-4000-8000-000000000002', '10000057-0000-4000-8000-000000000001', NULL, 46484, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000057-0000-4000-8000-000000000003', '10000057-0000-4000-8000-000000000001', NULL, 73444, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000057-0000-4000-8000-000000000001', '2026-11-08') b),
  '(86585,119928,0,0)',
  'case 87: fuzz 20261028/33'
);

-- ── case 88: fuzz 20261028/34 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000058-0000-4000-8000-000000000001', 'parity case 88', '2026-12-24', '2026-12-25', false, false, '0ff1ce00-0000-4000-8000-000000000004', 0, 2155, '2026-12-16T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000058-0000-4000-8000-000000000001', 'line', 'USD', -20108, 4, '10000058-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000058-0000-4000-8000-000000000001', '10000058-0000-4000-8000-000000000001', '2026-10-19', 'USD', 2516);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000058-0000-4000-8000-000000000001', '10000058-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000058-0000-4000-8000-000000000002', '10000058-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000058-0000-4000-8000-000000000003', '10000058-0000-4000-8000-000000000001', '20000058-0000-4000-8000-000000000001', 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000058-0000-4000-8000-000000000004', '10000058-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000058-0000-4000-8000-000000000005', '10000058-0000-4000-8000-000000000001', '20000058-0000-4000-8000-000000000001', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000058-0000-4000-8000-000000000006', '10000058-0000-4000-8000-000000000001', '20000058-0000-4000-8000-000000000001', 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000058-0000-4000-8000-000000000001', '2026-11-06') b),
  '(0,8,0,0)',
  'case 88: fuzz 20261028/34'
);

-- ── case 89: fuzz 20261028/35 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000059-0000-4000-8000-000000000001', 'parity case 89', '2027-01-21', '2027-01-22', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-12-19T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000059-0000-4000-8000-000000000001', 'parity case 89 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000059-0000-4000-8000-000000000001', '50000059-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000059-0000-4000-8000-000000000001', 'line', 'CAD', 127287, 2, '10000059-0000-4000-8000-000000000001', false),
  ('30000059-0000-4000-8000-000000000002', 'line', 'CAD', 140969, NULL, '10000059-0000-4000-8000-000000000001', false),
  ('30000059-0000-4000-8000-000000000003', 'line', 'CAD', 113996, 3, '10000059-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000059-0000-4000-8000-000000000001', '10000059-0000-4000-8000-000000000001', '60000059-0000-4000-8000-000000000001', 35562, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000002', '10000059-0000-4000-8000-000000000001', NULL, 730, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000003', '10000059-0000-4000-8000-000000000001', NULL, 86792, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000004', '10000059-0000-4000-8000-000000000001', NULL, -224900, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000005', '10000059-0000-4000-8000-000000000001', '60000059-0000-4000-8000-000000000001', 169722, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000006', '10000059-0000-4000-8000-000000000001', NULL, 207302, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000007', '10000059-0000-4000-8000-000000000001', NULL, 193133, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000059-0000-4000-8000-000000000008', '10000059-0000-4000-8000-000000000001', NULL, 236595, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000059-0000-4000-8000-000000000001', '2026-12-11') b),
  '(395543,635742,0,0)',
  'case 89: fuzz 20261028/35'
);

-- ── case 90: fuzz 20261028/36 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005a-0000-4000-8000-000000000001', 'parity case 90', '2026-12-09', '2026-12-10', false, false, '0ff1ce00-0000-4000-8000-000000000007', 5, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000005a-0000-4000-8000-000000000001', 'parity case 90 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000005a-0000-4000-8000-000000000001', '5000005a-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005a-0000-4000-8000-000000000001', 'line', 'CAD', 47043, NULL, '1000005a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000005a-0000-4000-8000-000000000001', '1000005a-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 5815),
  ('2000005a-0000-4000-8000-000000000002', '1000005a-0000-4000-8000-000000000001', '2026-11-13', 'CAD', 3300),
  ('2000005a-0000-4000-8000-000000000003', '1000005a-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 5327),
  ('2000005a-0000-4000-8000-000000000004', '1000005a-0000-4000-8000-000000000001', '2027-01-02', 'CAD', 1448),
  ('2000005a-0000-4000-8000-000000000005', '1000005a-0000-4000-8000-000000000001', '2026-11-22', 'CAD', 4270);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000005a-0000-4000-8000-000000000001', '1000005a-0000-4000-8000-000000000001', NULL, 16247, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000002', '1000005a-0000-4000-8000-000000000001', '2000005a-0000-4000-8000-000000000002', 32119, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000003', '1000005a-0000-4000-8000-000000000001', NULL, -40601, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000004', '1000005a-0000-4000-8000-000000000001', NULL, 12169, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000005', '1000005a-0000-4000-8000-000000000001', '2000005a-0000-4000-8000-000000000005', 25738, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000006', '1000005a-0000-4000-8000-000000000001', '6000005a-0000-4000-8000-000000000001', 6701, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000007', '1000005a-0000-4000-8000-000000000001', NULL, 16487, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005a-0000-4000-8000-000000000008', '1000005a-0000-4000-8000-000000000001', '2000005a-0000-4000-8000-000000000005', 15184, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005a-0000-4000-8000-000000000001', '2026-11-21') b),
  '(49395,62159,0,0)',
  'case 90: fuzz 20261028/36'
);

-- ── case 91: fuzz 20261028/37 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005b-0000-4000-8000-000000000001', 'parity case 91', '2026-12-10', '2026-12-11', false, false, NULL, 9.975, NULL, '2026-11-17T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005b-0000-4000-8000-000000000001', 'line', 'USD', 25082, 4, '1000005b-0000-4000-8000-000000000001', false),
  ('3000005b-0000-4000-8000-000000000002', 'line', 'USD', 149262, 1, '1000005b-0000-4000-8000-000000000001', false),
  ('3000005b-0000-4000-8000-000000000003', 'line', 'USD', -22398, NULL, '1000005b-0000-4000-8000-000000000001', false),
  ('3000005b-0000-4000-8000-000000000004', 'line', 'USD', 8320, 4, '1000005b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000005b-0000-4000-8000-000000000001', '1000005b-0000-4000-8000-000000000001', '2027-01-04', 'USD', 4055),
  ('2000005b-0000-4000-8000-000000000002', '1000005b-0000-4000-8000-000000000001', '2026-09-24', 'USD', 2099),
  ('2000005b-0000-4000-8000-000000000003', '1000005b-0000-4000-8000-000000000001', '2026-12-16', 'USD', 3427),
  ('2000005b-0000-4000-8000-000000000004', '1000005b-0000-4000-8000-000000000001', '2026-10-20', 'USD', 4314);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000005b-0000-4000-8000-000000000001', '1000005b-0000-4000-8000-000000000001', NULL, 114332, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005b-0000-4000-8000-000000000002', '1000005b-0000-4000-8000-000000000001', NULL, -23881, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005b-0000-4000-8000-000000000003', '1000005b-0000-4000-8000-000000000001', '2000005b-0000-4000-8000-000000000002', -17840, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005b-0000-4000-8000-000000000004', '1000005b-0000-4000-8000-000000000001', '2000005b-0000-4000-8000-000000000001', -89419, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005b-0000-4000-8000-000000000005', '1000005b-0000-4000-8000-000000000001', NULL, 163301, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005b-0000-4000-8000-000000000006', '1000005b-0000-4000-8000-000000000001', '2000005b-0000-4000-8000-000000000004', 232061, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005b-0000-4000-8000-000000000001', '2026-11-10') b),
  '(286454,235912,50542,0)',
  'case 91: fuzz 20261028/37'
);

-- ── case 92: fuzz 20261028/38 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005c-0000-4000-8000-000000000001', 'parity case 92', '2026-09-27', '2026-09-28', false, false, '0ff1ce00-0000-4000-8000-000000000002', 13, NULL, '2026-08-22T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000005c-0000-4000-8000-000000000001', 'parity case 92 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000005c-0000-4000-8000-000000000001', '5000005c-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005c-0000-4000-8000-000000000001', 'line', 'CAD', 62335, 3, '1000005c-0000-4000-8000-000000000001', false),
  ('3000005c-0000-4000-8000-000000000002', 'line', 'CAD', 71912, NULL, '1000005c-0000-4000-8000-000000000001', false),
  ('3000005c-0000-4000-8000-000000000003', 'line', 'CAD', 4846, 1, '1000005c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000005c-0000-4000-8000-000000000001', '1000005c-0000-4000-8000-000000000001', '2026-10-22', 'CAD', 1334),
  ('2000005c-0000-4000-8000-000000000002', '1000005c-0000-4000-8000-000000000001', '2026-09-09', 'CAD', 512),
  ('2000005c-0000-4000-8000-000000000003', '1000005c-0000-4000-8000-000000000001', '2026-12-01', 'CAD', 664),
  ('2000005c-0000-4000-8000-000000000004', '1000005c-0000-4000-8000-000000000001', '2026-11-08', 'CAD', 4319),
  ('2000005c-0000-4000-8000-000000000005', '1000005c-0000-4000-8000-000000000001', '2026-10-04', 'CAD', 3171);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000005c-0000-4000-8000-000000000001', '1000005c-0000-4000-8000-000000000001', NULL, 27277, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000005c-0000-4000-8000-000000000002', '1000005c-0000-4000-8000-000000000001', '2000005c-0000-4000-8000-000000000003', 243945, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005c-0000-4000-8000-000000000003', '1000005c-0000-4000-8000-000000000001', '6000005c-0000-4000-8000-000000000001', 105418, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005c-0000-4000-8000-000000000004', '1000005c-0000-4000-8000-000000000001', '2000005c-0000-4000-8000-000000000003', 152121, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005c-0000-4000-8000-000000000005', '1000005c-0000-4000-8000-000000000001', NULL, 62536, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005c-0000-4000-8000-000000000006', '1000005c-0000-4000-8000-000000000001', '2000005c-0000-4000-8000-000000000003', 32096, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005c-0000-4000-8000-000000000007', '1000005c-0000-4000-8000-000000000001', '2000005c-0000-4000-8000-000000000001', -121911, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005c-0000-4000-8000-000000000001', '2026-10-30') b),
  '(298052,368787,0,0)',
  'case 92: fuzz 20261028/38'
);

-- ── case 93: fuzz 20261028/39 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005d-0000-4000-8000-000000000001', 'parity case 93', '2026-12-30', '2026-12-31', false, false, '0ff1ce00-0000-4000-8000-000000000007', 9.975, NULL, '2026-12-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005d-0000-4000-8000-000000000001', 'line', 'CAD', 8534, NULL, '1000005d-0000-4000-8000-000000000001', false),
  ('3000005d-0000-4000-8000-000000000002', 'line', 'CAD', 113726, 4, '1000005d-0000-4000-8000-000000000001', false),
  ('3000005d-0000-4000-8000-000000000003', 'line', 'CAD', 7706, 2, '1000005d-0000-4000-8000-000000000001', false),
  ('3000005d-0000-4000-8000-000000000004', 'line', 'CAD', 95567, 3, '1000005d-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000005d-0000-4000-8000-000000000001', '1000005d-0000-4000-8000-000000000001', '2027-01-28', 'CAD', 512),
  ('2000005d-0000-4000-8000-000000000002', '1000005d-0000-4000-8000-000000000001', '2027-02-02', 'CAD', 1477),
  ('2000005d-0000-4000-8000-000000000003', '1000005d-0000-4000-8000-000000000001', '2026-11-28', 'CAD', 381),
  ('2000005d-0000-4000-8000-000000000004', '1000005d-0000-4000-8000-000000000001', '2026-10-23', 'CAD', 3148),
  ('2000005d-0000-4000-8000-000000000005', '1000005d-0000-4000-8000-000000000001', '2026-12-06', 'CAD', 4482);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000005d-0000-4000-8000-000000000001', '1000005d-0000-4000-8000-000000000001', NULL, -207059, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005d-0000-4000-8000-000000000002', '1000005d-0000-4000-8000-000000000001', NULL, 52330, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005d-0000-4000-8000-000000000003', '1000005d-0000-4000-8000-000000000001', '2000005d-0000-4000-8000-000000000001', 166578, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005d-0000-4000-8000-000000000004', '1000005d-0000-4000-8000-000000000001', NULL, 226658, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000005d-0000-4000-8000-000000000005', '1000005d-0000-4000-8000-000000000001', NULL, -214884, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000005d-0000-4000-8000-000000000006', '1000005d-0000-4000-8000-000000000001', NULL, -242981, 'CAD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000005d-0000-4000-8000-000000000007', '1000005d-0000-4000-8000-000000000001', NULL, 2199, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005d-0000-4000-8000-000000000001', '2026-12-09') b),
  '(526615,-40481,567096,421871)',
  'case 93: fuzz 20261028/39'
);

-- ── case 94: fuzz 20261028/40 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005e-0000-4000-8000-000000000001', 'parity case 94', '2026-11-01', '2026-11-02', false, false, '0ff1ce00-0000-4000-8000-000000000002', 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005e-0000-4000-8000-000000000001', 'line', 'CAD', 47846, 5, '1000005e-0000-4000-8000-000000000001', false),
  ('3000005e-0000-4000-8000-000000000002', 'line', 'CAD', 28641, 5, '1000005e-0000-4000-8000-000000000001', false),
  ('3000005e-0000-4000-8000-000000000003', 'line', 'CAD', 25589, 1, '1000005e-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005e-0000-4000-8000-000000000001', '2026-11-04') b),
  '(469126,0,469126,469126)',
  'case 94: fuzz 20261028/40'
);

-- ── case 95: fuzz 20261028/41 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000005f-0000-4000-8000-000000000001', 'parity case 95', '2026-12-19', '2026-12-20', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000005f-0000-4000-8000-000000000001', 'line', 'USD', 14480, NULL, '1000005f-0000-4000-8000-000000000001', false),
  ('3000005f-0000-4000-8000-000000000002', 'line', 'USD', 149862, 2, '1000005f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000005f-0000-4000-8000-000000000001', '1000005f-0000-4000-8000-000000000001', '2026-12-14', 'USD', 3124),
  ('2000005f-0000-4000-8000-000000000002', '1000005f-0000-4000-8000-000000000001', '2026-11-27', 'USD', 6876);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000005f-0000-4000-8000-000000000001', '1000005f-0000-4000-8000-000000000001', '2000005f-0000-4000-8000-000000000002', 56702, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000005f-0000-4000-8000-000000000002', '1000005f-0000-4000-8000-000000000001', '2000005f-0000-4000-8000-000000000002', 66274, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000005f-0000-4000-8000-000000000001', '2026-12-07') b),
  '(314204,66274,247930,149773)',
  'case 95: fuzz 20261028/41'
);

-- ── case 96: fuzz 20261028/42 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000060-0000-4000-8000-000000000001', 'parity case 96', '2026-09-26', '2026-09-27', false, false, NULL, 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000060-0000-4000-8000-000000000001', 'line', 'USD', 106418, 3, '10000060-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000060-0000-4000-8000-000000000001', '10000060-0000-4000-8000-000000000001', '2026-11-02', 'USD', 2340),
  ('20000060-0000-4000-8000-000000000002', '10000060-0000-4000-8000-000000000001', '2026-11-07', 'USD', 931),
  ('20000060-0000-4000-8000-000000000003', '10000060-0000-4000-8000-000000000001', '2026-11-03', 'USD', 3214),
  ('20000060-0000-4000-8000-000000000004', '10000060-0000-4000-8000-000000000001', '2026-11-21', 'USD', 385),
  ('20000060-0000-4000-8000-000000000005', '10000060-0000-4000-8000-000000000001', '2026-10-07', 'USD', 3130);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000060-0000-4000-8000-000000000001', '10000060-0000-4000-8000-000000000001', '20000060-0000-4000-8000-000000000003', 156954, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000060-0000-4000-8000-000000000002', '10000060-0000-4000-8000-000000000001', NULL, 55868, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000060-0000-4000-8000-000000000001', '2026-11-02') b),
  '(367062,55868,311194,144915)',
  'case 96: fuzz 20261028/42'
);

-- ── case 97: fuzz 20261028/43 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000061-0000-4000-8000-000000000001', 'parity case 97', '2027-01-12', '2027-01-13', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-12-20T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000061-0000-4000-8000-000000000001', '10000061-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000061-0000-4000-8000-000000000002', '10000061-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000003', '10000061-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000004', '10000061-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000005', '10000061-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000006', '10000061-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000007', '10000061-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000061-0000-4000-8000-000000000008', '10000061-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000061-0000-4000-8000-000000000001', '2026-12-13') b),
  '(0,7,0,0)',
  'case 97: fuzz 20261028/43'
);

-- ── case 98: fuzz 20261028/44 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000062-0000-4000-8000-000000000001', 'parity case 98', '2026-12-16', '2026-12-17', false, false, NULL, NULL, NULL, '2026-11-15T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000062-0000-4000-8000-000000000001', '10000062-0000-4000-8000-000000000001', '2026-10-31', 'USD', 251),
  ('20000062-0000-4000-8000-000000000002', '10000062-0000-4000-8000-000000000001', '2026-11-18', 'USD', 7955),
  ('20000062-0000-4000-8000-000000000003', '10000062-0000-4000-8000-000000000001', '2026-11-30', 'USD', 379),
  ('20000062-0000-4000-8000-000000000004', '10000062-0000-4000-8000-000000000001', '2027-01-18', 'USD', 1415);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000062-0000-4000-8000-000000000001', '10000062-0000-4000-8000-000000000001', '20000062-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000002', '10000062-0000-4000-8000-000000000001', '20000062-0000-4000-8000-000000000002', -1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000003', '10000062-0000-4000-8000-000000000001', '20000062-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000004', '10000062-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000005', '10000062-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000006', '10000062-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000007', '10000062-0000-4000-8000-000000000001', '20000062-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000062-0000-4000-8000-000000000008', '10000062-0000-4000-8000-000000000001', '20000062-0000-4000-8000-000000000002', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000062-0000-4000-8000-000000000001', '2026-11-30') b),
  '(0,7,0,0)',
  'case 98: fuzz 20261028/44'
);

-- ── case 99: fuzz 20261028/45 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000063-0000-4000-8000-000000000001', 'parity case 99', '2026-10-19', '2026-10-20', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000063-0000-4000-8000-000000000001', 'line', 'USD', -20897, 2, '10000063-0000-4000-8000-000000000001', false),
  ('30000063-0000-4000-8000-000000000002', 'line', 'USD', 46298, 1, '10000063-0000-4000-8000-000000000001', true),
  ('30000063-0000-4000-8000-000000000003', 'line', 'USD', 96505, 3, '10000063-0000-4000-8000-000000000001', false),
  ('30000063-0000-4000-8000-000000000004', 'line', 'USD', 136273, 4, '10000063-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000063-0000-4000-8000-000000000001', '10000063-0000-4000-8000-000000000001', '2026-09-02', 'USD', 426),
  ('20000063-0000-4000-8000-000000000002', '10000063-0000-4000-8000-000000000001', '2026-10-12', 'USD', 2463),
  ('20000063-0000-4000-8000-000000000003', '10000063-0000-4000-8000-000000000001', '2026-10-23', 'USD', 7111);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000063-0000-4000-8000-000000000001', '10000063-0000-4000-8000-000000000001', '20000063-0000-4000-8000-000000000001', -2797, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000002', '10000063-0000-4000-8000-000000000001', '20000063-0000-4000-8000-000000000002', 299176, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000003', '10000063-0000-4000-8000-000000000001', '20000063-0000-4000-8000-000000000002', 296809, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000004', '10000063-0000-4000-8000-000000000001', '20000063-0000-4000-8000-000000000002', 201148, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000005', '10000063-0000-4000-8000-000000000001', '20000063-0000-4000-8000-000000000002', -202985, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000006', '10000063-0000-4000-8000-000000000001', NULL, 93041, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000063-0000-4000-8000-000000000007', '10000063-0000-4000-8000-000000000001', NULL, 207901, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000063-0000-4000-8000-000000000001', '2026-10-27') b),
  '(792813,304092,488721,488721)',
  'case 99: fuzz 20261028/45'
);

-- ── case 100: fuzz 20261028/46 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000064-0000-4000-8000-000000000001', 'parity case 100', '2027-02-04', '2027-02-05', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2027-01-06T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000064-0000-4000-8000-000000000001', 'line', 'CAD', 68965, NULL, '10000064-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000064-0000-4000-8000-000000000001', '10000064-0000-4000-8000-000000000001', '2026-12-02', 'CAD', 882),
  ('20000064-0000-4000-8000-000000000002', '10000064-0000-4000-8000-000000000001', '2026-12-09', 'CAD', 1699),
  ('20000064-0000-4000-8000-000000000003', '10000064-0000-4000-8000-000000000001', '2026-12-16', 'CAD', 4043),
  ('20000064-0000-4000-8000-000000000004', '10000064-0000-4000-8000-000000000001', '2026-12-27', 'CAD', 1326),
  ('20000064-0000-4000-8000-000000000005', '10000064-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 2050);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000064-0000-4000-8000-000000000001', '10000064-0000-4000-8000-000000000001', '20000064-0000-4000-8000-000000000001', 17631, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000064-0000-4000-8000-000000000001', '2026-12-14') b),
  '(68965,17631,51334,169)',
  'case 100: fuzz 20261028/46'
);

-- ── case 101: fuzz 20261028/47 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000065-0000-4000-8000-000000000001', 'parity case 101', '2026-11-01', '2026-11-02', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000065-0000-4000-8000-000000000001', 'line', 'USD', 113132, 1, '10000065-0000-4000-8000-000000000001', false),
  ('30000065-0000-4000-8000-000000000002', 'line', 'USD', 11257, 1, '10000065-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000065-0000-4000-8000-000000000001', '10000065-0000-4000-8000-000000000001', NULL, -42764, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000065-0000-4000-8000-000000000001', '2026-11-28') b),
  '(124389,0,124389,124389)',
  'case 101: fuzz 20261028/47'
);

-- ── case 102: fuzz 20261028/48 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000066-0000-4000-8000-000000000001', 'parity case 102', '2026-12-04', '2026-12-05', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000066-0000-4000-8000-000000000001', 'line', 'CAD', -32195, 3, '10000066-0000-4000-8000-000000000001', false),
  ('30000066-0000-4000-8000-000000000002', 'line', 'CAD', -17212, 2, '10000066-0000-4000-8000-000000000001', false),
  ('30000066-0000-4000-8000-000000000003', 'line', 'CAD', 25925, 1, '10000066-0000-4000-8000-000000000001', false),
  ('30000066-0000-4000-8000-000000000004', 'line', 'CAD', 19569, 3, '10000066-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000066-0000-4000-8000-000000000001', '10000066-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 2279),
  ('20000066-0000-4000-8000-000000000002', '10000066-0000-4000-8000-000000000001', '2026-11-07', 'CAD', 6394),
  ('20000066-0000-4000-8000-000000000003', '10000066-0000-4000-8000-000000000001', '2026-12-09', 'CAD', 1327);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000066-0000-4000-8000-000000000001', '10000066-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000066-0000-4000-8000-000000000002', '10000066-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000066-0000-4000-8000-000000000003', '10000066-0000-4000-8000-000000000001', '20000066-0000-4000-8000-000000000003', -1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000066-0000-4000-8000-000000000004', '10000066-0000-4000-8000-000000000001', '20000066-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000066-0000-4000-8000-000000000001', '2026-12-01') b),
  '(0,2,0,0)',
  'case 102: fuzz 20261028/48'
);

-- ── case 103: fuzz 20261028/49 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000067-0000-4000-8000-000000000001', 'parity case 103', '2026-10-02', '2026-10-03', false, false, NULL, NULL, NULL, '2026-09-25T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000067-0000-4000-8000-000000000001', 'line', 'USD', 82650, 5, '10000067-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000067-0000-4000-8000-000000000001', '10000067-0000-4000-8000-000000000001', '2026-09-24', 'USD', 397),
  ('20000067-0000-4000-8000-000000000002', '10000067-0000-4000-8000-000000000001', '2026-12-08', 'USD', 2104),
  ('20000067-0000-4000-8000-000000000003', '10000067-0000-4000-8000-000000000001', '2026-10-24', 'USD', 390),
  ('20000067-0000-4000-8000-000000000004', '10000067-0000-4000-8000-000000000001', '2026-11-30', 'USD', 6099),
  ('20000067-0000-4000-8000-000000000005', '10000067-0000-4000-8000-000000000001', '2026-09-29', 'USD', 1010);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000067-0000-4000-8000-000000000001', '2026-10-29') b),
  '(413250,0,413250,74261)',
  'case 103: fuzz 20261028/49'
);

-- ── case 104: fuzz 20261028/50 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000068-0000-4000-8000-000000000001', 'parity case 104', '2026-09-29', '2026-09-30', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-09-28T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000068-0000-4000-8000-000000000001', 'line', 'USD', 85570, 2, '10000068-0000-4000-8000-000000000001', false),
  ('30000068-0000-4000-8000-000000000002', 'line', 'USD', -28611, NULL, '10000068-0000-4000-8000-000000000001', false),
  ('30000068-0000-4000-8000-000000000003', 'line', 'USD', 36304, 4, '10000068-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000068-0000-4000-8000-000000000001', '10000068-0000-4000-8000-000000000001', '2026-10-15', 'USD', 6206),
  ('20000068-0000-4000-8000-000000000002', '10000068-0000-4000-8000-000000000001', '2026-10-21', 'USD', 2814),
  ('20000068-0000-4000-8000-000000000003', '10000068-0000-4000-8000-000000000001', '2026-12-07', 'USD', 980);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000068-0000-4000-8000-000000000001', '2026-11-11') b),
  '(287745,0,287745,259546)',
  'case 104: fuzz 20261028/50'
);

-- ── case 105: fuzz 20261028/51 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000069-0000-4000-8000-000000000001', 'parity case 105', '2026-10-24', '2026-10-25', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000069-0000-4000-8000-000000000001', 'parity case 105 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000069-0000-4000-8000-000000000001', '50000069-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000069-0000-4000-8000-000000000001', 'line', 'CAD', 144988, NULL, '10000069-0000-4000-8000-000000000001', false),
  ('30000069-0000-4000-8000-000000000002', 'line', 'CAD', 37239, 5, '10000069-0000-4000-8000-000000000001', false),
  ('30000069-0000-4000-8000-000000000003', 'line', 'CAD', 142487, 5, '10000069-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000069-0000-4000-8000-000000000001', '10000069-0000-4000-8000-000000000001', NULL, 210142, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000069-0000-4000-8000-000000000002', '10000069-0000-4000-8000-000000000001', '60000069-0000-4000-8000-000000000001', 187908, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000069-0000-4000-8000-000000000003', '10000069-0000-4000-8000-000000000001', NULL, 161427, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000069-0000-4000-8000-000000000004', '10000069-0000-4000-8000-000000000001', NULL, 4630, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000069-0000-4000-8000-000000000005', '10000069-0000-4000-8000-000000000001', NULL, 114317, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000069-0000-4000-8000-000000000006', '10000069-0000-4000-8000-000000000001', '60000069-0000-4000-8000-000000000001', 233644, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000069-0000-4000-8000-000000000001', '2026-11-20') b),
  '(331183,468282,0,0)',
  'case 105: fuzz 20261028/51'
);

-- ── case 106: fuzz 20261028/52 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006a-0000-4000-8000-000000000001', 'parity case 106', '2026-08-27', '2026-08-28', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-07-30T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000006a-0000-4000-8000-000000000001', 'line', 'USD', -15242, NULL, '1000006a-0000-4000-8000-000000000001', false),
  ('3000006a-0000-4000-8000-000000000002', 'line', 'USD', 56465, 4, '1000006a-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000006a-0000-4000-8000-000000000001', '1000006a-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000002', '1000006a-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000003', '1000006a-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000004', '1000006a-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000005', '1000006a-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000006', '1000006a-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000007', '1000006a-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006a-0000-4000-8000-000000000008', '1000006a-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006a-0000-4000-8000-000000000001', '2026-10-16') b),
  '(0,9,0,0)',
  'case 106: fuzz 20261028/52'
);

-- ── case 107: fuzz 20261028/53 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006b-0000-4000-8000-000000000001', 'parity case 107', '2026-11-25', '2026-11-26', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000006b-0000-4000-8000-000000000001', '1000006b-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000002', '1000006b-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000003', '1000006b-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000004', '1000006b-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000005', '1000006b-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000006', '1000006b-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006b-0000-4000-8000-000000000007', '1000006b-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000006b-0000-4000-8000-000000000008', '1000006b-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006b-0000-4000-8000-000000000001', '2026-11-05') b),
  '(0,12,0,0)',
  'case 107: fuzz 20261028/53'
);

-- ── case 108: fuzz 20261028/54 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006c-0000-4000-8000-000000000001', 'parity case 108', '2026-09-07', '2026-09-08', false, false, NULL, NULL, NULL, '2026-07-30T23:45:00+00:00');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006c-0000-4000-8000-000000000001', '2026-10-29') b),
  '(0,0,0,0)',
  'case 108: fuzz 20261028/54'
);

-- ── case 109: fuzz 20261028/55 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006d-0000-4000-8000-000000000001', 'parity case 109', '2026-12-10', '2026-12-11', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-19T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000006d-0000-4000-8000-000000000001', 'line', 'CAD', -8018, 3, '1000006d-0000-4000-8000-000000000001', false),
  ('3000006d-0000-4000-8000-000000000002', 'line', 'CAD', -41363, 3, '1000006d-0000-4000-8000-000000000001', false),
  ('3000006d-0000-4000-8000-000000000003', 'line', 'CAD', 135918, 5, '1000006d-0000-4000-8000-000000000001', false),
  ('3000006d-0000-4000-8000-000000000004', 'line', 'CAD', -26648, NULL, '1000006d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000006d-0000-4000-8000-000000000001', '1000006d-0000-4000-8000-000000000001', '2026-11-03', 'CAD', 1410),
  ('2000006d-0000-4000-8000-000000000002', '1000006d-0000-4000-8000-000000000001', '2026-09-22', 'CAD', 8262),
  ('2000006d-0000-4000-8000-000000000003', '1000006d-0000-4000-8000-000000000001', '2026-09-13', 'CAD', 328);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000006d-0000-4000-8000-000000000001', '1000006d-0000-4000-8000-000000000001', NULL, 236303, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006d-0000-4000-8000-000000000002', '1000006d-0000-4000-8000-000000000001', '2000006d-0000-4000-8000-000000000003', 171294, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006d-0000-4000-8000-000000000003', '1000006d-0000-4000-8000-000000000001', NULL, 60554, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006d-0000-4000-8000-000000000004', '1000006d-0000-4000-8000-000000000001', '2000006d-0000-4000-8000-000000000003', 242025, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006d-0000-4000-8000-000000000005', '1000006d-0000-4000-8000-000000000001', '2000006d-0000-4000-8000-000000000003', 246111, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006d-0000-4000-8000-000000000001', '2026-10-19') b),
  '(504799,956287,0,0)',
  'case 109: fuzz 20261028/55'
);

-- ── case 110: fuzz 20261028/56 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006e-0000-4000-8000-000000000001', 'parity case 110', '2026-09-22', '2026-09-23', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 1699, '2026-09-19T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000006e-0000-4000-8000-000000000001', '1000006e-0000-4000-8000-000000000001', '2026-09-18', 'USD', 5268),
  ('2000006e-0000-4000-8000-000000000002', '1000006e-0000-4000-8000-000000000001', '2026-12-24', 'USD', 2764),
  ('2000006e-0000-4000-8000-000000000003', '1000006e-0000-4000-8000-000000000001', '2026-11-30', 'USD', 1968);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000006e-0000-4000-8000-000000000001', '1000006e-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006e-0000-4000-8000-000000000002', '1000006e-0000-4000-8000-000000000001', '2000006e-0000-4000-8000-000000000003', 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006e-0000-4000-8000-000000000003', '1000006e-0000-4000-8000-000000000001', NULL, 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006e-0000-4000-8000-000000000004', '1000006e-0000-4000-8000-000000000001', '2000006e-0000-4000-8000-000000000003', -1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006e-0000-4000-8000-000000000005', '1000006e-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006e-0000-4000-8000-000000000001', '2026-11-07') b),
  '(1699,4,1695,892)',
  'case 110: fuzz 20261028/56'
);

-- ── case 111: fuzz 20261028/57 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000006f-0000-4000-8000-000000000001', 'parity case 111', '2026-10-26', '2026-10-27', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-20T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000006f-0000-4000-8000-000000000001', 'line', 'CAD', 67817, NULL, '1000006f-0000-4000-8000-000000000001', false),
  ('3000006f-0000-4000-8000-000000000002', 'line', 'CAD', 68382, 2, '1000006f-0000-4000-8000-000000000001', false),
  ('3000006f-0000-4000-8000-000000000003', 'line', 'CAD', 97038, 5, '1000006f-0000-4000-8000-000000000001', false),
  ('3000006f-0000-4000-8000-000000000004', 'line', 'CAD', -9113, 4, '1000006f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000006f-0000-4000-8000-000000000001', '1000006f-0000-4000-8000-000000000001', '2026-12-30', 'CAD', 3128),
  ('2000006f-0000-4000-8000-000000000002', '1000006f-0000-4000-8000-000000000001', '2027-02-10', 'CAD', 6872);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000006f-0000-4000-8000-000000000001', '1000006f-0000-4000-8000-000000000001', '2000006f-0000-4000-8000-000000000001', 264542, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000002', '1000006f-0000-4000-8000-000000000001', NULL, -97842, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000003', '1000006f-0000-4000-8000-000000000001', '2000006f-0000-4000-8000-000000000001', 158006, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000004', '1000006f-0000-4000-8000-000000000001', '2000006f-0000-4000-8000-000000000001', 154632, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000005', '1000006f-0000-4000-8000-000000000001', '2000006f-0000-4000-8000-000000000002', 118559, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000006', '1000006f-0000-4000-8000-000000000001', NULL, 199063, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000007', '1000006f-0000-4000-8000-000000000001', '2000006f-0000-4000-8000-000000000002', 37260, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000006f-0000-4000-8000-000000000008', '1000006f-0000-4000-8000-000000000001', NULL, 101646, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000006f-0000-4000-8000-000000000001', '2026-12-12') b),
  '(653319,574993,78326,0)',
  'case 111: fuzz 20261028/57'
);

-- ── case 112: fuzz 20261028/58 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000070-0000-4000-8000-000000000001', 'parity case 112', '2027-01-30', '2027-01-31', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2027-01-25T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000070-0000-4000-8000-000000000001', 'line', 'CAD', 148797, 2, '10000070-0000-4000-8000-000000000001', false),
  ('30000070-0000-4000-8000-000000000002', 'line', 'CAD', 84410, 2, '10000070-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000070-0000-4000-8000-000000000001', '2026-12-12') b),
  '(466414,0,466414,0)',
  'case 112: fuzz 20261028/58'
);

-- ── case 113: fuzz 20261028/59 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000071-0000-4000-8000-000000000001', 'parity case 113', '2027-01-04', '2027-01-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2027-01-03T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000071-0000-4000-8000-000000000001', 'line', 'CAD', 14079, NULL, '10000071-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000071-0000-4000-8000-000000000001', '2026-11-24') b),
  '(14079,0,14079,0)',
  'case 113: fuzz 20261028/59'
);

-- ── case 114: fuzz 20261028/60 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000072-0000-4000-8000-000000000001', 'parity case 114', '2026-11-24', '2026-11-25', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 655, '2026-10-27T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000072-0000-4000-8000-000000000001', 'parity case 114 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000072-0000-4000-8000-000000000001', '50000072-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000072-0000-4000-8000-000000000001', 'line', 'CAD', -21898, 3, '10000072-0000-4000-8000-000000000001', false),
  ('30000072-0000-4000-8000-000000000002', 'line', 'CAD', -18359, 2, '10000072-0000-4000-8000-000000000001', false),
  ('30000072-0000-4000-8000-000000000003', 'line', 'CAD', 37969, 2, '10000072-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000072-0000-4000-8000-000000000001', '10000072-0000-4000-8000-000000000001', '2026-08-28', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000072-0000-4000-8000-000000000001', '10000072-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000072-0000-4000-8000-000000000002', '10000072-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000072-0000-4000-8000-000000000003', '10000072-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000072-0000-4000-8000-000000000004', '10000072-0000-4000-8000-000000000001', '20000072-0000-4000-8000-000000000001', -2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000072-0000-4000-8000-000000000005', '10000072-0000-4000-8000-000000000001', NULL, -1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000072-0000-4000-8000-000000000006', '10000072-0000-4000-8000-000000000001', '60000072-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000072-0000-4000-8000-000000000007', '10000072-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000072-0000-4000-8000-000000000008', '10000072-0000-4000-8000-000000000001', '60000072-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000072-0000-4000-8000-000000000001', '2026-10-21') b),
  '(0,0,0,0)',
  'case 114: fuzz 20261028/60'
);

-- ── case 115: fuzz 20261028/61 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000073-0000-4000-8000-000000000001', 'parity case 115', '2026-12-16', '2026-12-17', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-11-24T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000073-0000-4000-8000-000000000001', 'line', 'USD', 124690, 4, '10000073-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000073-0000-4000-8000-000000000001', '10000073-0000-4000-8000-000000000001', '2026-10-15', 'USD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000073-0000-4000-8000-000000000001', '2026-11-21') b),
  '(498760,0,498760,498760)',
  'case 115: fuzz 20261028/61'
);

-- ── case 116: fuzz 20261028/62 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000074-0000-4000-8000-000000000001', 'parity case 116', '2026-08-29', '2026-08-30', false, false, NULL, NULL, 2865, '2026-08-02T03:15:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000074-0000-4000-8000-000000000001', '10000074-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000074-0000-4000-8000-000000000002', '10000074-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000074-0000-4000-8000-000000000003', '10000074-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000074-0000-4000-8000-000000000004', '10000074-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000074-0000-4000-8000-000000000001', '2026-10-21') b),
  '(2865,5,2860,2860)',
  'case 116: fuzz 20261028/62'
);

-- ── case 117: fuzz 20261028/63 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000075-0000-4000-8000-000000000001', 'parity case 117', '2026-12-18', '2026-12-19', false, false, '0ff1ce00-0000-4000-8000-000000000008', 14.975, NULL, '2026-12-09T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000075-0000-4000-8000-000000000001', '10000075-0000-4000-8000-000000000001', '2026-10-21', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000075-0000-4000-8000-000000000001', '10000075-0000-4000-8000-000000000001', '20000075-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000075-0000-4000-8000-000000000002', '10000075-0000-4000-8000-000000000001', '20000075-0000-4000-8000-000000000001', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000075-0000-4000-8000-000000000003', '10000075-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000075-0000-4000-8000-000000000004', '10000075-0000-4000-8000-000000000001', NULL, 2, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000075-0000-4000-8000-000000000001', '2026-11-06') b),
  '(0,-1,1,0)',
  'case 117: fuzz 20261028/63'
);

-- ── case 118: fuzz 20261028/64 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000076-0000-4000-8000-000000000001', 'parity case 118', '2026-10-24', '2026-10-25', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000076-0000-4000-8000-000000000001', 'line', 'CAD', 52820, NULL, '10000076-0000-4000-8000-000000000001', false),
  ('30000076-0000-4000-8000-000000000002', 'line', 'CAD', 1424, 2, '10000076-0000-4000-8000-000000000001', false),
  ('30000076-0000-4000-8000-000000000003', 'line', 'CAD', 130575, 1, '10000076-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000076-0000-4000-8000-000000000001', '10000076-0000-4000-8000-000000000001', '2026-12-08', 'CAD', 1171),
  ('20000076-0000-4000-8000-000000000002', '10000076-0000-4000-8000-000000000001', '2026-10-27', 'CAD', 1898),
  ('20000076-0000-4000-8000-000000000003', '10000076-0000-4000-8000-000000000001', '2026-11-14', 'CAD', 446),
  ('20000076-0000-4000-8000-000000000004', '10000076-0000-4000-8000-000000000001', '2026-12-01', 'CAD', 3057),
  ('20000076-0000-4000-8000-000000000005', '10000076-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 1222);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000076-0000-4000-8000-000000000001', '10000076-0000-4000-8000-000000000001', '20000076-0000-4000-8000-000000000003', 38194, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000076-0000-4000-8000-000000000002', '10000076-0000-4000-8000-000000000001', NULL, -115131, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000076-0000-4000-8000-000000000003', '10000076-0000-4000-8000-000000000001', '20000076-0000-4000-8000-000000000003', 15969, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000076-0000-4000-8000-000000000004', '10000076-0000-4000-8000-000000000001', '20000076-0000-4000-8000-000000000002', -170399, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000076-0000-4000-8000-000000000005', '10000076-0000-4000-8000-000000000001', NULL, 45607, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000076-0000-4000-8000-000000000006', '10000076-0000-4000-8000-000000000001', '20000076-0000-4000-8000-000000000001', -75185, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000076-0000-4000-8000-000000000007', '10000076-0000-4000-8000-000000000001', NULL, 85387, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000076-0000-4000-8000-000000000001', '2026-11-18') b),
  '(186243,-23436,209679,43655)',
  'case 118: fuzz 20261028/64'
);

-- ── case 119: fuzz 20261028/65 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000077-0000-4000-8000-000000000001', 'parity case 119', '2026-09-25', '2026-09-26', false, false, '0ff1ce00-0000-4000-8000-000000000007', 13, NULL, '2026-09-03T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000077-0000-4000-8000-000000000001', 'line', 'CAD', 79015, 1, '10000077-0000-4000-8000-000000000001', false),
  ('30000077-0000-4000-8000-000000000002', 'line', 'CAD', 109341, 2, '10000077-0000-4000-8000-000000000001', true),
  ('30000077-0000-4000-8000-000000000003', 'line', 'CAD', 93607, 1, '10000077-0000-4000-8000-000000000001', true),
  ('30000077-0000-4000-8000-000000000004', 'line', 'CAD', 33222, 1, '10000077-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000077-0000-4000-8000-000000000001', '10000077-0000-4000-8000-000000000001', '2026-10-23', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000077-0000-4000-8000-000000000001', '10000077-0000-4000-8000-000000000001', NULL, 13057, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000002', '10000077-0000-4000-8000-000000000001', NULL, 49623, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000003', '10000077-0000-4000-8000-000000000001', NULL, -69670, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000004', '10000077-0000-4000-8000-000000000001', '20000077-0000-4000-8000-000000000001', 47305, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000005', '10000077-0000-4000-8000-000000000001', NULL, 7616, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000006', '10000077-0000-4000-8000-000000000001', '20000077-0000-4000-8000-000000000001', 103677, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000077-0000-4000-8000-000000000007', '10000077-0000-4000-8000-000000000001', NULL, 96860, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000077-0000-4000-8000-000000000001', '2026-10-25') b),
  '(126828,235411,0,0)',
  'case 119: fuzz 20261028/65'
);

-- ── case 120: fuzz 20261028/66 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000078-0000-4000-8000-000000000001', 'parity case 120', '2026-11-20', '2026-11-21', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000078-0000-4000-8000-000000000001', 'line', 'CAD', -26605, 3, '10000078-0000-4000-8000-000000000001', false),
  ('30000078-0000-4000-8000-000000000002', 'line', 'CAD', 138273, NULL, '10000078-0000-4000-8000-000000000001', false),
  ('30000078-0000-4000-8000-000000000003', 'line', 'CAD', 51184, 1, '10000078-0000-4000-8000-000000000001', false),
  ('30000078-0000-4000-8000-000000000004', 'line', 'CAD', -13184, 1, '10000078-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000078-0000-4000-8000-000000000001', '10000078-0000-4000-8000-000000000001', NULL, 8115, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000078-0000-4000-8000-000000000002', '10000078-0000-4000-8000-000000000001', NULL, -41592, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000078-0000-4000-8000-000000000003', '10000078-0000-4000-8000-000000000001', NULL, 92944, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000078-0000-4000-8000-000000000001', '2026-12-06') b),
  '(96458,59467,36991,36991)',
  'case 120: fuzz 20261028/66'
);

-- ── case 121: fuzz 20261028/67 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000079-0000-4000-8000-000000000001', 'parity case 121', '2026-09-22', '2026-09-23', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-04T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000079-0000-4000-8000-000000000001', 'line', 'CAD', 37230, 5, '10000079-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000079-0000-4000-8000-000000000001', '10000079-0000-4000-8000-000000000001', NULL, 31654, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000079-0000-4000-8000-000000000002', '10000079-0000-4000-8000-000000000001', NULL, -85059, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000079-0000-4000-8000-000000000003', '10000079-0000-4000-8000-000000000001', NULL, 29529, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000079-0000-4000-8000-000000000004', '10000079-0000-4000-8000-000000000001', NULL, 160874, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000079-0000-4000-8000-000000000005', '10000079-0000-4000-8000-000000000001', NULL, 78531, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000079-0000-4000-8000-000000000001', '2026-11-10') b),
  '(186150,136998,49152,49152)',
  'case 121: fuzz 20261028/67'
);

-- ── case 122: fuzz 20261028/68 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007a-0000-4000-8000-000000000001', 'parity case 122', '2026-11-11', '2026-11-12', false, false, '0ff1ce00-0000-4000-8000-000000000002', 7.5, NULL, '2026-10-03T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000007a-0000-4000-8000-000000000001', 'line', 'CAD', 114878, 5, '1000007a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000007a-0000-4000-8000-000000000001', '1000007a-0000-4000-8000-000000000001', '2026-09-23', 'CAD', 4336),
  ('2000007a-0000-4000-8000-000000000002', '1000007a-0000-4000-8000-000000000001', '2026-10-12', 'CAD', 5664);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000007a-0000-4000-8000-000000000001', '1000007a-0000-4000-8000-000000000001', '2000007a-0000-4000-8000-000000000001', 202314, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007a-0000-4000-8000-000000000001', '2026-11-10') b),
  '(617469,202314,415155,415155)',
  'case 122: fuzz 20261028/68'
);

-- ── case 123: fuzz 20261028/69 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007b-0000-4000-8000-000000000001', 'parity case 123', '2026-09-17', '2026-09-18', false, false, '0ff1ce00-0000-4000-8000-000000000004', 0, NULL, '2026-09-17T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000007b-0000-4000-8000-000000000001', 'line', 'USD', -14973, 2, '1000007b-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007b-0000-4000-8000-000000000001', '2026-10-18') b),
  '(0,0,0,0)',
  'case 123: fuzz 20261028/69'
);

-- ── case 124: fuzz 20261028/70 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007c-0000-4000-8000-000000000001', 'parity case 124', '2026-11-09', '2026-11-10', false, false, '0ff1ce00-0000-4000-8000-000000000002', 7.5, NULL, '2026-10-20T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000007c-0000-4000-8000-000000000001', '1000007c-0000-4000-8000-000000000001', '2026-11-26', 'CAD', 9204),
  ('2000007c-0000-4000-8000-000000000002', '1000007c-0000-4000-8000-000000000001', '2026-10-22', 'CAD', 796);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000007c-0000-4000-8000-000000000001', '1000007c-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007c-0000-4000-8000-000000000002', '1000007c-0000-4000-8000-000000000001', '2000007c-0000-4000-8000-000000000002', 2, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007c-0000-4000-8000-000000000001', '2026-10-24') b),
  '(0,0,0,0)',
  'case 124: fuzz 20261028/70'
);

-- ── case 125: fuzz 20261028/71 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007d-0000-4000-8000-000000000001', 'parity case 125', '2027-01-24', '2027-01-25', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-12-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000007d-0000-4000-8000-000000000001', 'line', 'USD', 129137, 4, '1000007d-0000-4000-8000-000000000001', true),
  ('3000007d-0000-4000-8000-000000000002', 'line', 'USD', 31124, 2, '1000007d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000007d-0000-4000-8000-000000000001', '1000007d-0000-4000-8000-000000000001', NULL, -56820, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007d-0000-4000-8000-000000000002', '1000007d-0000-4000-8000-000000000001', NULL, 36930, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000007d-0000-4000-8000-000000000003', '1000007d-0000-4000-8000-000000000001', NULL, 57308, 'USD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000007d-0000-4000-8000-000000000004', '1000007d-0000-4000-8000-000000000001', NULL, 26307, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007d-0000-4000-8000-000000000001', '2026-11-26') b),
  '(62248,-30513,92761,0)',
  'case 125: fuzz 20261028/71'
);

-- ── case 126: fuzz 20261028/72 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007e-0000-4000-8000-000000000001', 'parity case 126', '2026-11-10', '2026-11-11', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-10-20T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000007e-0000-4000-8000-000000000001', 'line', 'CAD', 28216, 1, '1000007e-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000007e-0000-4000-8000-000000000001', '1000007e-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007e-0000-4000-8000-000000000002', '1000007e-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007e-0000-4000-8000-000000000001', '2026-12-01') b),
  '(0,1,0,0)',
  'case 126: fuzz 20261028/72'
);

-- ── case 127: fuzz 20261028/73 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000007f-0000-4000-8000-000000000001', 'parity case 127', '2027-01-04', '2027-01-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, 744, '2026-11-30T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000007f-0000-4000-8000-000000000001', 'line', 'CAD', 6111, 3, '1000007f-0000-4000-8000-000000000001', false),
  ('3000007f-0000-4000-8000-000000000002', 'line', 'CAD', 7312, 5, '1000007f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000007f-0000-4000-8000-000000000001', '1000007f-0000-4000-8000-000000000001', '2026-12-23', 'CAD', 1498),
  ('2000007f-0000-4000-8000-000000000002', '1000007f-0000-4000-8000-000000000001', '2026-12-23', 'CAD', 824),
  ('2000007f-0000-4000-8000-000000000003', '1000007f-0000-4000-8000-000000000001', '2027-01-09', 'CAD', 7678);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000007f-0000-4000-8000-000000000001', '1000007f-0000-4000-8000-000000000001', NULL, 49732, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000007f-0000-4000-8000-000000000002', '1000007f-0000-4000-8000-000000000001', '2000007f-0000-4000-8000-000000000001', 30650, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007f-0000-4000-8000-000000000003', '1000007f-0000-4000-8000-000000000001', NULL, 3108, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007f-0000-4000-8000-000000000004', '1000007f-0000-4000-8000-000000000001', NULL, 11114, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000007f-0000-4000-8000-000000000005', '1000007f-0000-4000-8000-000000000001', '2000007f-0000-4000-8000-000000000003', 26687, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000007f-0000-4000-8000-000000000001', '2026-11-10') b),
  '(55637,40909,14728,0)',
  'case 127: fuzz 20261028/73'
);

-- ── case 128: fuzz 20261028/74 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000080-0000-4000-8000-000000000001', 'parity case 128', '2026-10-03', '2026-10-04', false, false, '0ff1ce00-0000-4000-8000-000000000004', 15, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000080-0000-4000-8000-000000000001', '10000080-0000-4000-8000-000000000001', '2026-10-27', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000080-0000-4000-8000-000000000001', '10000080-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000080-0000-4000-8000-000000000002', '10000080-0000-4000-8000-000000000001', '20000080-0000-4000-8000-000000000001', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000080-0000-4000-8000-000000000003', '10000080-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000080-0000-4000-8000-000000000004', '10000080-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000080-0000-4000-8000-000000000005', '10000080-0000-4000-8000-000000000001', '20000080-0000-4000-8000-000000000001', 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000080-0000-4000-8000-000000000001', '2026-11-26') b),
  '(0,7,0,0)',
  'case 128: fuzz 20261028/74'
);

-- ── case 129: fuzz 20261028/75 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000081-0000-4000-8000-000000000001', 'parity case 129', '2027-01-06', '2027-01-07', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-06T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000081-0000-4000-8000-000000000001', 'parity case 129 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000081-0000-4000-8000-000000000001', '50000081-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000081-0000-4000-8000-000000000001', 'line', 'CAD', 21, 4, '10000081-0000-4000-8000-000000000001', false),
  ('30000081-0000-4000-8000-000000000002', 'line', 'CAD', 148362, NULL, '10000081-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000081-0000-4000-8000-000000000001', '10000081-0000-4000-8000-000000000001', NULL, 81190, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000002', '10000081-0000-4000-8000-000000000001', NULL, 47745, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000003', '10000081-0000-4000-8000-000000000001', NULL, 1818, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000004', '10000081-0000-4000-8000-000000000001', NULL, 144363, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000005', '10000081-0000-4000-8000-000000000001', NULL, 138725, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000006', '10000081-0000-4000-8000-000000000001', '60000081-0000-4000-8000-000000000001', 118164, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000081-0000-4000-8000-000000000007', '10000081-0000-4000-8000-000000000001', NULL, 121498, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000081-0000-4000-8000-000000000001', '2026-11-08') b),
  '(148446,467033,0,0)',
  'case 129: fuzz 20261028/75'
);

-- ── case 130: fuzz 20261028/76 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000082-0000-4000-8000-000000000001', 'parity case 130', '2027-01-08', '2027-01-09', false, false, '0ff1ce00-0000-4000-8000-000000000002', 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000082-0000-4000-8000-000000000001', 'line', 'CAD', 27588, NULL, '10000082-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000082-0000-4000-8000-000000000001', '10000082-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000082-0000-4000-8000-000000000001', '10000082-0000-4000-8000-000000000001', '20000082-0000-4000-8000-000000000001', 27313, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000002', '10000082-0000-4000-8000-000000000001', '20000082-0000-4000-8000-000000000001', 11791, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000003', '10000082-0000-4000-8000-000000000001', '20000082-0000-4000-8000-000000000001', 24255, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000004', '10000082-0000-4000-8000-000000000001', '20000082-0000-4000-8000-000000000001', 23266, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000005', '10000082-0000-4000-8000-000000000001', NULL, 16770, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000006', '10000082-0000-4000-8000-000000000001', NULL, 23026, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000082-0000-4000-8000-000000000007', '10000082-0000-4000-8000-000000000001', '20000082-0000-4000-8000-000000000001', 5427, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000082-0000-4000-8000-000000000001', '2026-11-24') b),
  '(30340,99108,0,0)',
  'case 130: fuzz 20261028/76'
);

-- ── case 131: fuzz 20261028/77 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000083-0000-4000-8000-000000000001', 'parity case 131', '2026-11-22', '2026-11-23', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000083-0000-4000-8000-000000000001', 'line', 'USD', 4975, NULL, '10000083-0000-4000-8000-000000000001', true),
  ('30000083-0000-4000-8000-000000000002', 'line', 'USD', 144261, 4, '10000083-0000-4000-8000-000000000001', false),
  ('30000083-0000-4000-8000-000000000003', 'line', 'USD', 67939, NULL, '10000083-0000-4000-8000-000000000001', false),
  ('30000083-0000-4000-8000-000000000004', 'line', 'USD', 73430, 5, '10000083-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000083-0000-4000-8000-000000000001', '10000083-0000-4000-8000-000000000001', '2026-09-04', 'USD', 1372),
  ('20000083-0000-4000-8000-000000000002', '10000083-0000-4000-8000-000000000001', '2026-11-10', 'USD', 4538),
  ('20000083-0000-4000-8000-000000000003', '10000083-0000-4000-8000-000000000001', '2026-11-03', 'USD', 2312),
  ('20000083-0000-4000-8000-000000000004', '10000083-0000-4000-8000-000000000001', '2026-08-22', 'USD', 1778);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000083-0000-4000-8000-000000000001', '2026-10-18') b),
  '(1012133,0,1012133,318822)',
  'case 131: fuzz 20261028/77'
);

-- ── case 132: fuzz 20261028/78 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000084-0000-4000-8000-000000000001', 'parity case 132', '2026-12-17', '2026-12-18', false, false, NULL, NULL, NULL, '2026-12-12T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000084-0000-4000-8000-000000000001', 'line', 'USD', 54499, NULL, '10000084-0000-4000-8000-000000000001', false),
  ('30000084-0000-4000-8000-000000000002', 'line', 'USD', 90333, 3, '10000084-0000-4000-8000-000000000001', false),
  ('30000084-0000-4000-8000-000000000003', 'line', 'USD', -9716, 2, '10000084-0000-4000-8000-000000000001', true),
  ('30000084-0000-4000-8000-000000000004', 'line', 'USD', 124717, 4, '10000084-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000084-0000-4000-8000-000000000001', '10000084-0000-4000-8000-000000000001', NULL, 229952, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000084-0000-4000-8000-000000000002', '10000084-0000-4000-8000-000000000001', NULL, 132197, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000084-0000-4000-8000-000000000003', '10000084-0000-4000-8000-000000000001', NULL, 18838, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000084-0000-4000-8000-000000000004', '10000084-0000-4000-8000-000000000001', NULL, 132038, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000084-0000-4000-8000-000000000005', '10000084-0000-4000-8000-000000000001', NULL, 245184, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000084-0000-4000-8000-000000000001', '2026-11-04') b),
  '(824366,150876,673490,0)',
  'case 132: fuzz 20261028/78'
);

-- ── case 133: fuzz 20261028/79 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000085-0000-4000-8000-000000000001', 'parity case 133', '2026-11-24', '2026-11-25', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-10-24T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000085-0000-4000-8000-000000000001', 'line', 'USD', 85474, 4, '10000085-0000-4000-8000-000000000001', true),
  ('30000085-0000-4000-8000-000000000002', 'line', 'USD', 20198, 4, '10000085-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000085-0000-4000-8000-000000000001', '10000085-0000-4000-8000-000000000001', '2027-01-13', 'USD', 7293),
  ('20000085-0000-4000-8000-000000000002', '10000085-0000-4000-8000-000000000001', '2027-01-24', 'USD', 2707);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000085-0000-4000-8000-000000000001', '10000085-0000-4000-8000-000000000001', '20000085-0000-4000-8000-000000000002', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000002', '10000085-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000003', '10000085-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000004', '10000085-0000-4000-8000-000000000001', '20000085-0000-4000-8000-000000000002', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000005', '10000085-0000-4000-8000-000000000001', '20000085-0000-4000-8000-000000000002', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000006', '10000085-0000-4000-8000-000000000001', NULL, -1, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000085-0000-4000-8000-000000000007', '10000085-0000-4000-8000-000000000001', '20000085-0000-4000-8000-000000000001', 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000085-0000-4000-8000-000000000001', '2026-12-15') b),
  '(0,8,0,0)',
  'case 133: fuzz 20261028/79'
);

-- ── case 134: fuzz 20261028/80 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000086-0000-4000-8000-000000000001', 'parity case 134', '2026-11-08', '2026-11-09', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000086-0000-4000-8000-000000000001', 'line', 'USD', 46192, 2, '10000086-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000086-0000-4000-8000-000000000001', '10000086-0000-4000-8000-000000000001', '2026-10-02', 'USD', 3585),
  ('20000086-0000-4000-8000-000000000002', '10000086-0000-4000-8000-000000000001', '2026-11-12', 'USD', 1843),
  ('20000086-0000-4000-8000-000000000003', '10000086-0000-4000-8000-000000000001', '2027-01-13', 'USD', 4572);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000086-0000-4000-8000-000000000001', '2026-11-24') b),
  '(92384,0,92384,50146)',
  'case 134: fuzz 20261028/80'
);

-- ── case 135: fuzz 20261028/81 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000087-0000-4000-8000-000000000001', 'parity case 135', '2026-11-09', '2026-11-10', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-10-16T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000087-0000-4000-8000-000000000001', 'line', 'CAD', 115209, 2, '10000087-0000-4000-8000-000000000001', false),
  ('30000087-0000-4000-8000-000000000002', 'line', 'CAD', 46843, 4, '10000087-0000-4000-8000-000000000001', false),
  ('30000087-0000-4000-8000-000000000003', 'line', 'CAD', 147707, 3, '10000087-0000-4000-8000-000000000001', false),
  ('30000087-0000-4000-8000-000000000004', 'line', 'CAD', 58771, 5, '10000087-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000087-0000-4000-8000-000000000001', '2026-11-13') b),
  '(1154766,0,1154766,1154766)',
  'case 135: fuzz 20261028/81'
);

-- ── case 136: fuzz 20261028/82 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000088-0000-4000-8000-000000000001', 'parity case 136', '2026-12-16', '2026-12-17', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-23T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000088-0000-4000-8000-000000000001', 'line', 'CAD', 124930, 2, '10000088-0000-4000-8000-000000000001', false),
  ('30000088-0000-4000-8000-000000000002', 'line', 'CAD', 95965, 1, '10000088-0000-4000-8000-000000000001', false),
  ('30000088-0000-4000-8000-000000000003', 'line', 'CAD', 142692, 5, '10000088-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000088-0000-4000-8000-000000000001', '10000088-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 421),
  ('20000088-0000-4000-8000-000000000002', '10000088-0000-4000-8000-000000000001', '2026-11-10', 'CAD', 5936),
  ('20000088-0000-4000-8000-000000000003', '10000088-0000-4000-8000-000000000001', '2027-01-14', 'CAD', 3643);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000088-0000-4000-8000-000000000001', '10000088-0000-4000-8000-000000000001', NULL, 259245, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000088-0000-4000-8000-000000000002', '10000088-0000-4000-8000-000000000001', '20000088-0000-4000-8000-000000000002', -213915, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000088-0000-4000-8000-000000000003', '10000088-0000-4000-8000-000000000001', NULL, -251986, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000088-0000-4000-8000-000000000004', '10000088-0000-4000-8000-000000000001', '20000088-0000-4000-8000-000000000003', 202508, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000088-0000-4000-8000-000000000005', '10000088-0000-4000-8000-000000000001', '20000088-0000-4000-8000-000000000001', 272155, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000088-0000-4000-8000-000000000006', '10000088-0000-4000-8000-000000000001', '20000088-0000-4000-8000-000000000003', 67114, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000088-0000-4000-8000-000000000001', '2026-11-24') b),
  '(345825,481922,0,0)',
  'case 136: fuzz 20261028/82'
);

-- ── case 137: fuzz 20261028/83 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000089-0000-4000-8000-000000000001', 'parity case 137', '2026-12-14', '2026-12-15', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, NULL, '2026-12-05T23:45:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000089-0000-4000-8000-000000000001', '10000089-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000089-0000-4000-8000-000000000002', '10000089-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000089-0000-4000-8000-000000000003', '10000089-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000089-0000-4000-8000-000000000004', '10000089-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000089-0000-4000-8000-000000000001', '2026-10-30') b),
  '(0,3,0,0)',
  'case 137: fuzz 20261028/83'
);

-- ── case 138: fuzz 20261028/84 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008a-0000-4000-8000-000000000001', 'parity case 138', '2026-12-30', '2026-12-31', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-11-28T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000008a-0000-4000-8000-000000000001', 'parity case 138 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000008a-0000-4000-8000-000000000001', '5000008a-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008a-0000-4000-8000-000000000001', 'line', 'USD', -46856, 1, '1000008a-0000-4000-8000-000000000001', false),
  ('3000008a-0000-4000-8000-000000000002', 'line', 'USD', 85225, 2, '1000008a-0000-4000-8000-000000000001', false),
  ('3000008a-0000-4000-8000-000000000003', 'line', 'USD', 52190, NULL, '1000008a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000008a-0000-4000-8000-000000000001', '1000008a-0000-4000-8000-000000000001', '2026-10-10', 'USD', 1249),
  ('2000008a-0000-4000-8000-000000000002', '1000008a-0000-4000-8000-000000000001', '2026-10-05', 'USD', 5945);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000008a-0000-4000-8000-000000000001', '1000008a-0000-4000-8000-000000000001', NULL, -36604, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000002', '1000008a-0000-4000-8000-000000000001', '2000008a-0000-4000-8000-000000000002', 123596, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000003', '1000008a-0000-4000-8000-000000000001', '6000008a-0000-4000-8000-000000000001', -53873, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000004', '1000008a-0000-4000-8000-000000000001', '2000008a-0000-4000-8000-000000000002', 37813, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000005', '1000008a-0000-4000-8000-000000000001', '2000008a-0000-4000-8000-000000000002', 137713, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000006', '1000008a-0000-4000-8000-000000000001', '2000008a-0000-4000-8000-000000000001', 104013, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008a-0000-4000-8000-000000000007', '1000008a-0000-4000-8000-000000000001', NULL, 46934, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008a-0000-4000-8000-000000000001', '2026-11-30') b),
  '(175784,221879,0,0)',
  'case 138: fuzz 20261028/84'
);

-- ── case 139: fuzz 20261028/85 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008b-0000-4000-8000-000000000001', 'parity case 139', '2026-12-10', '2026-12-11', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-11-02T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008b-0000-4000-8000-000000000001', 'line', 'USD', 34886, 3, '1000008b-0000-4000-8000-000000000001', false),
  ('3000008b-0000-4000-8000-000000000002', 'line', 'USD', 121499, 1, '1000008b-0000-4000-8000-000000000001', false),
  ('3000008b-0000-4000-8000-000000000003', 'line', 'USD', 14894, NULL, '1000008b-0000-4000-8000-000000000001', false),
  ('3000008b-0000-4000-8000-000000000004', 'line', 'USD', 55358, 2, '1000008b-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008b-0000-4000-8000-000000000001', '2026-11-29') b),
  '(241051,0,241051,0)',
  'case 139: fuzz 20261028/85'
);

-- ── case 140: fuzz 20261028/86 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008c-0000-4000-8000-000000000001', 'parity case 140', '2026-11-15', '2026-11-16', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-11-13T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008c-0000-4000-8000-000000000001', 'line', 'CAD', 116181, 3, '1000008c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000008c-0000-4000-8000-000000000001', '1000008c-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 3813),
  ('2000008c-0000-4000-8000-000000000002', '1000008c-0000-4000-8000-000000000001', '2026-11-03', 'CAD', 6187);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000008c-0000-4000-8000-000000000001', '1000008c-0000-4000-8000-000000000001', '2000008c-0000-4000-8000-000000000001', 106461, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008c-0000-4000-8000-000000000002', '1000008c-0000-4000-8000-000000000001', NULL, 238764, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008c-0000-4000-8000-000000000003', '1000008c-0000-4000-8000-000000000001', '2000008c-0000-4000-8000-000000000002', 134244, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008c-0000-4000-8000-000000000001', '2026-11-18') b),
  '(348543,345225,3318,0)',
  'case 140: fuzz 20261028/86'
);

-- ── case 141: fuzz 20261028/87 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008d-0000-4000-8000-000000000001', 'parity case 141', '2026-11-20', '2026-11-21', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-10-28T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000008d-0000-4000-8000-000000000001', 'parity case 141 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000008d-0000-4000-8000-000000000001', '5000008d-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008d-0000-4000-8000-000000000001', 'line', 'USD', 91750, 2, '1000008d-0000-4000-8000-000000000001', false),
  ('3000008d-0000-4000-8000-000000000002', 'line', 'USD', -30209, 1, '1000008d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000008d-0000-4000-8000-000000000001', '1000008d-0000-4000-8000-000000000001', '2027-01-17', 'USD', 2809),
  ('2000008d-0000-4000-8000-000000000002', '1000008d-0000-4000-8000-000000000001', '2026-09-27', 'USD', 2887),
  ('2000008d-0000-4000-8000-000000000003', '1000008d-0000-4000-8000-000000000001', '2026-11-23', 'USD', 2435),
  ('2000008d-0000-4000-8000-000000000004', '1000008d-0000-4000-8000-000000000001', '2026-10-17', 'USD', 1131),
  ('2000008d-0000-4000-8000-000000000005', '1000008d-0000-4000-8000-000000000001', '2026-11-07', 'USD', 738);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000008d-0000-4000-8000-000000000001', '1000008d-0000-4000-8000-000000000001', '6000008d-0000-4000-8000-000000000001', 129745, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008d-0000-4000-8000-000000000002', '1000008d-0000-4000-8000-000000000001', '2000008d-0000-4000-8000-000000000001', -6005, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008d-0000-4000-8000-000000000003', '1000008d-0000-4000-8000-000000000001', NULL, 41924, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008d-0000-4000-8000-000000000004', '1000008d-0000-4000-8000-000000000001', '2000008d-0000-4000-8000-000000000003', -148358, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008d-0000-4000-8000-000000000001', '2026-11-19') b),
  '(153291,-112439,265730,72905)',
  'case 141: fuzz 20261028/87'
);

-- ── case 142: fuzz 20261028/88 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008e-0000-4000-8000-000000000001', 'parity case 142', '2026-09-15', '2026-09-16', false, false, '0ff1ce00-0000-4000-8000-000000000002', 13, NULL, '2026-09-09T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008e-0000-4000-8000-000000000001', 'line', 'CAD', -45939, 5, '1000008e-0000-4000-8000-000000000001', false),
  ('3000008e-0000-4000-8000-000000000002', 'line', 'CAD', 128596, 5, '1000008e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000008e-0000-4000-8000-000000000001', '1000008e-0000-4000-8000-000000000001', '2026-10-03', 'CAD', 512),
  ('2000008e-0000-4000-8000-000000000002', '1000008e-0000-4000-8000-000000000001', '2026-11-23', 'CAD', 4498),
  ('2000008e-0000-4000-8000-000000000003', '1000008e-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 805),
  ('2000008e-0000-4000-8000-000000000004', '1000008e-0000-4000-8000-000000000001', '2026-10-04', 'CAD', 377),
  ('2000008e-0000-4000-8000-000000000005', '1000008e-0000-4000-8000-000000000001', '2026-09-13', 'CAD', 3808);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000008e-0000-4000-8000-000000000001', '1000008e-0000-4000-8000-000000000001', '2000008e-0000-4000-8000-000000000001', 41177, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008e-0000-4000-8000-000000000002', '1000008e-0000-4000-8000-000000000001', '2000008e-0000-4000-8000-000000000005', 151247, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008e-0000-4000-8000-000000000003', '1000008e-0000-4000-8000-000000000001', '2000008e-0000-4000-8000-000000000003', 5988, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008e-0000-4000-8000-000000000004', '1000008e-0000-4000-8000-000000000001', NULL, 251205, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008e-0000-4000-8000-000000000001', '2026-10-29') b),
  '(467012,157235,309777,68108)',
  'case 142: fuzz 20261028/88'
);

-- ── case 143: fuzz 20261028/89 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000008f-0000-4000-8000-000000000001', 'parity case 143', '2026-12-21', '2026-12-22', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000008f-0000-4000-8000-000000000001', 'line', 'CAD', 103904, 5, '1000008f-0000-4000-8000-000000000001', false),
  ('3000008f-0000-4000-8000-000000000002', 'line', 'CAD', 128475, 2, '1000008f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000008f-0000-4000-8000-000000000001', '1000008f-0000-4000-8000-000000000001', '2026-11-14', 'CAD', 3799),
  ('2000008f-0000-4000-8000-000000000002', '1000008f-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 3366),
  ('2000008f-0000-4000-8000-000000000003', '1000008f-0000-4000-8000-000000000001', '2026-12-17', 'CAD', 414),
  ('2000008f-0000-4000-8000-000000000004', '1000008f-0000-4000-8000-000000000001', '2026-11-22', 'CAD', 2421);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000008f-0000-4000-8000-000000000001', '1000008f-0000-4000-8000-000000000001', NULL, 290774, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000008f-0000-4000-8000-000000000002', '1000008f-0000-4000-8000-000000000001', '2000008f-0000-4000-8000-000000000003', 229989, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000008f-0000-4000-8000-000000000001', '2026-11-24') b),
  '(776470,520763,255707,0)',
  'case 143: fuzz 20261028/89'
);

-- ── case 144: fuzz 20261028/90 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000090-0000-4000-8000-000000000001', 'parity case 144', '2026-09-25', '2026-09-26', false, false, '0ff1ce00-0000-4000-8000-000000000002', 9.975, NULL, '2026-08-20T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000090-0000-4000-8000-000000000001', 'parity case 144 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000090-0000-4000-8000-000000000001', '50000090-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000090-0000-4000-8000-000000000001', 'line', 'CAD', 82368, 1, '10000090-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000090-0000-4000-8000-000000000001', '10000090-0000-4000-8000-000000000001', '2026-10-20', 'CAD', 1663),
  ('20000090-0000-4000-8000-000000000002', '10000090-0000-4000-8000-000000000001', '2026-09-26', 'CAD', 7533),
  ('20000090-0000-4000-8000-000000000003', '10000090-0000-4000-8000-000000000001', '2026-10-05', 'CAD', 166),
  ('20000090-0000-4000-8000-000000000004', '10000090-0000-4000-8000-000000000001', '2026-11-12', 'CAD', 638);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000090-0000-4000-8000-000000000001', '10000090-0000-4000-8000-000000000001', '60000090-0000-4000-8000-000000000001', -39899, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000090-0000-4000-8000-000000000001', '2026-10-18') b),
  '(90584,-39899,130483,69741)',
  'case 144: fuzz 20261028/90'
);

-- ── case 145: fuzz 20261028/91 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000091-0000-4000-8000-000000000001', 'parity case 145', '2026-12-09', '2026-12-10', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-17T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000091-0000-4000-8000-000000000001', 'line', 'CAD', 79257, 3, '10000091-0000-4000-8000-000000000001', false),
  ('30000091-0000-4000-8000-000000000002', 'line', 'CAD', -22923, 2, '10000091-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000091-0000-4000-8000-000000000001', '10000091-0000-4000-8000-000000000001', '2026-09-27', 'CAD', 2186),
  ('20000091-0000-4000-8000-000000000002', '10000091-0000-4000-8000-000000000001', '2026-12-31', 'CAD', 4402),
  ('20000091-0000-4000-8000-000000000003', '10000091-0000-4000-8000-000000000001', '2026-09-21', 'CAD', 1325),
  ('20000091-0000-4000-8000-000000000004', '10000091-0000-4000-8000-000000000001', '2026-12-14', 'CAD', 1230);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000091-0000-4000-8000-000000000001', '10000091-0000-4000-8000-000000000001', '20000091-0000-4000-8000-000000000004', 81012, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000091-0000-4000-8000-000000000002', '10000091-0000-4000-8000-000000000001', '20000091-0000-4000-8000-000000000001', 89248, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000091-0000-4000-8000-000000000003', '10000091-0000-4000-8000-000000000001', '20000091-0000-4000-8000-000000000003', 60213, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000091-0000-4000-8000-000000000004', '10000091-0000-4000-8000-000000000001', '20000091-0000-4000-8000-000000000001', 58668, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000091-0000-4000-8000-000000000005', '10000091-0000-4000-8000-000000000001', NULL, 105306, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000091-0000-4000-8000-000000000001', '2026-11-18') b),
  '(237771,228928,8843,0)',
  'case 145: fuzz 20261028/91'
);

-- ── case 146: fuzz 20261028/92 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000092-0000-4000-8000-000000000001', 'parity case 146', '2027-01-30', '2027-01-31', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2027-01-26T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000092-0000-4000-8000-000000000001', 'line', 'USD', 71364, 2, '10000092-0000-4000-8000-000000000001', true),
  ('30000092-0000-4000-8000-000000000002', 'line', 'USD', 75705, 5, '10000092-0000-4000-8000-000000000001', false),
  ('30000092-0000-4000-8000-000000000003', 'line', 'USD', 101871, 1, '10000092-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000092-0000-4000-8000-000000000001', '10000092-0000-4000-8000-000000000001', '2026-10-19', 'USD', 912),
  ('20000092-0000-4000-8000-000000000002', '10000092-0000-4000-8000-000000000001', '2026-12-11', 'USD', 4339),
  ('20000092-0000-4000-8000-000000000003', '10000092-0000-4000-8000-000000000001', '2026-11-15', 'USD', 3198),
  ('20000092-0000-4000-8000-000000000004', '10000092-0000-4000-8000-000000000001', '2026-11-01', 'USD', 5727);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000092-0000-4000-8000-000000000001', '2026-12-05') b),
  '(480396,0,480396,472566)',
  'case 146: fuzz 20261028/92'
);

-- ── case 147: fuzz 20261028/93 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000093-0000-4000-8000-000000000001', 'parity case 147', '2026-10-10', '2026-10-11', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000093-0000-4000-8000-000000000001', 'parity case 147 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000093-0000-4000-8000-000000000001', '50000093-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000093-0000-4000-8000-000000000001', '10000093-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000093-0000-4000-8000-000000000002', '10000093-0000-4000-8000-000000000001', '60000093-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000093-0000-4000-8000-000000000003', '10000093-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000093-0000-4000-8000-000000000004', '10000093-0000-4000-8000-000000000001', NULL, -1, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000093-0000-4000-8000-000000000005', '10000093-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000093-0000-4000-8000-000000000006', '10000093-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000093-0000-4000-8000-000000000007', '10000093-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000093-0000-4000-8000-000000000008', '10000093-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000093-0000-4000-8000-000000000001', '2026-10-28') b),
  '(0,3,0,0)',
  'case 147: fuzz 20261028/93'
);

-- ── case 148: fuzz 20261028/94 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000094-0000-4000-8000-000000000001', 'parity case 148', '2026-09-03', '2026-09-04', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-08-14T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000094-0000-4000-8000-000000000001', 'line', 'USD', 54173, 5, '10000094-0000-4000-8000-000000000001', true),
  ('30000094-0000-4000-8000-000000000002', 'line', 'USD', -48511, 4, '10000094-0000-4000-8000-000000000001', false),
  ('30000094-0000-4000-8000-000000000003', 'line', 'USD', 112342, NULL, '10000094-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000094-0000-4000-8000-000000000001', '10000094-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000094-0000-4000-8000-000000000002', '10000094-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000094-0000-4000-8000-000000000003', '10000094-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000094-0000-4000-8000-000000000004', '10000094-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000094-0000-4000-8000-000000000005', '10000094-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000094-0000-4000-8000-000000000001', '2026-10-29') b),
  '(0,5,0,0)',
  'case 148: fuzz 20261028/94'
);

-- ── case 149: fuzz 20261028/95 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000095-0000-4000-8000-000000000001', 'parity case 149', '2026-12-01', '2026-12-02', false, false, '0ff1ce00-0000-4000-8000-000000000002', 5, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000095-0000-4000-8000-000000000001', 'line', 'CAD', 125041, 4, '10000095-0000-4000-8000-000000000001', false),
  ('30000095-0000-4000-8000-000000000002', 'line', 'CAD', -42545, 2, '10000095-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000095-0000-4000-8000-000000000001', '10000095-0000-4000-8000-000000000001', '2026-10-13', 'CAD', 3011),
  ('20000095-0000-4000-8000-000000000002', '10000095-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 4691);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000095-0000-4000-8000-000000000001', '10000095-0000-4000-8000-000000000001', NULL, -146357, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000095-0000-4000-8000-000000000002', '10000095-0000-4000-8000-000000000001', '20000095-0000-4000-8000-000000000002', 173562, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000095-0000-4000-8000-000000000003', '10000095-0000-4000-8000-000000000001', '20000095-0000-4000-8000-000000000002', 26449, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000095-0000-4000-8000-000000000004', '10000095-0000-4000-8000-000000000001', NULL, 200927, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000095-0000-4000-8000-000000000001', '2026-11-14') b),
  '(435828,53654,382174,131228)',
  'case 149: fuzz 20261028/95'
);

-- ── case 150: fuzz 20261028/96 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000096-0000-4000-8000-000000000001', 'parity case 150', '2027-01-18', '2027-01-19', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2027-01-06T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000096-0000-4000-8000-000000000001', 'line', 'CAD', 87183, 5, '10000096-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000096-0000-4000-8000-000000000001', '10000096-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 223),
  ('20000096-0000-4000-8000-000000000002', '10000096-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 2362);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000096-0000-4000-8000-000000000001', '10000096-0000-4000-8000-000000000001', '20000096-0000-4000-8000-000000000001', 51573, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000096-0000-4000-8000-000000000002', '10000096-0000-4000-8000-000000000001', '20000096-0000-4000-8000-000000000001', 193232, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000096-0000-4000-8000-000000000003', '10000096-0000-4000-8000-000000000001', NULL, 72604, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000096-0000-4000-8000-000000000001', '2026-12-05') b),
  '(435915,244805,191110,0)',
  'case 150: fuzz 20261028/96'
);

-- ── case 151: fuzz 20261028/97 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000097-0000-4000-8000-000000000001', 'parity case 151', '2027-01-25', '2027-01-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', 0, NULL, '2026-12-28T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000097-0000-4000-8000-000000000001', 'line', 'CAD', 7859, 5, '10000097-0000-4000-8000-000000000001', false),
  ('30000097-0000-4000-8000-000000000002', 'line', 'CAD', 16826, 1, '10000097-0000-4000-8000-000000000001', false),
  ('30000097-0000-4000-8000-000000000003', 'line', 'CAD', -37368, NULL, '10000097-0000-4000-8000-000000000001', true),
  ('30000097-0000-4000-8000-000000000004', 'line', 'CAD', 132479, 4, '10000097-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000097-0000-4000-8000-000000000001', '10000097-0000-4000-8000-000000000001', '2027-02-07', 'CAD', 8458),
  ('20000097-0000-4000-8000-000000000002', '10000097-0000-4000-8000-000000000001', '2026-11-12', 'CAD', 392),
  ('20000097-0000-4000-8000-000000000003', '10000097-0000-4000-8000-000000000001', '2026-11-26', 'CAD', 1150);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000097-0000-4000-8000-000000000001', '2026-12-13') b),
  '(586037,0,586037,90367)',
  'case 151: fuzz 20261028/97'
);

-- ── case 152: fuzz 20261028/98 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000098-0000-4000-8000-000000000001', 'parity case 152', '2026-10-26', '2026-10-27', false, false, NULL, NULL, NULL, '2026-10-02T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000098-0000-4000-8000-000000000001', 'line', 'USD', 54841, 2, '10000098-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000098-0000-4000-8000-000000000001', '10000098-0000-4000-8000-000000000001', NULL, -24225, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000098-0000-4000-8000-000000000002', '10000098-0000-4000-8000-000000000001', NULL, 50480, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000098-0000-4000-8000-000000000003', '10000098-0000-4000-8000-000000000001', NULL, 96149, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000098-0000-4000-8000-000000000004', '10000098-0000-4000-8000-000000000001', NULL, 80655, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000098-0000-4000-8000-000000000005', '10000098-0000-4000-8000-000000000001', NULL, -12761, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000098-0000-4000-8000-000000000001', '2026-11-23') b),
  '(109682,139818,0,0)',
  'case 152: fuzz 20261028/98'
);

-- ── case 153: fuzz 20261028/99 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000099-0000-4000-8000-000000000001', 'parity case 153', '2026-09-20', '2026-09-21', false, false, NULL, NULL, NULL, '2026-09-20T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000099-0000-4000-8000-000000000001', 'line', 'USD', 70600, 3, '10000099-0000-4000-8000-000000000001', false),
  ('30000099-0000-4000-8000-000000000002', 'line', 'USD', 39084, 1, '10000099-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000099-0000-4000-8000-000000000001', '10000099-0000-4000-8000-000000000001', NULL, -118003, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000099-0000-4000-8000-000000000002', '10000099-0000-4000-8000-000000000001', NULL, -150267, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000003', '10000099-0000-4000-8000-000000000001', NULL, 60839, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000004', '10000099-0000-4000-8000-000000000001', NULL, -26264, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000005', '10000099-0000-4000-8000-000000000001', NULL, 4479, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000006', '10000099-0000-4000-8000-000000000001', NULL, 120581, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000007', '10000099-0000-4000-8000-000000000001', NULL, 208124, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000099-0000-4000-8000-000000000008', '10000099-0000-4000-8000-000000000001', NULL, 170777, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000099-0000-4000-8000-000000000001', '2026-11-08') b),
  '(250884,212603,38281,38281)',
  'case 153: fuzz 20261028/99'
);

-- ── case 154: fuzz 20261028/100 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009a-0000-4000-8000-000000000001', 'parity case 154', '2026-11-09', '2026-11-10', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000009a-0000-4000-8000-000000000001', 'line', 'CAD', 34861, 2, '1000009a-0000-4000-8000-000000000001', false),
  ('3000009a-0000-4000-8000-000000000002', 'line', 'CAD', 68869, NULL, '1000009a-0000-4000-8000-000000000001', false),
  ('3000009a-0000-4000-8000-000000000003', 'line', 'CAD', 109330, 1, '1000009a-0000-4000-8000-000000000001', false),
  ('3000009a-0000-4000-8000-000000000004', 'line', 'CAD', 50967, NULL, '1000009a-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000009a-0000-4000-8000-000000000001', '1000009a-0000-4000-8000-000000000001', NULL, 171151, 'CAD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000009a-0000-4000-8000-000000000002', '1000009a-0000-4000-8000-000000000001', NULL, 139220, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009a-0000-4000-8000-000000000003', '1000009a-0000-4000-8000-000000000001', NULL, 205267, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009a-0000-4000-8000-000000000001', '2026-10-23') b),
  '(247921,139220,108701,0)',
  'case 154: fuzz 20261028/100'
);

-- ── case 155: fuzz 20261028/101 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009b-0000-4000-8000-000000000001', 'parity case 155', '2026-10-15', '2026-10-16', false, false, '0ff1ce00-0000-4000-8000-000000000008', 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000009b-0000-4000-8000-000000000001', 'line', 'USD', 107482, 1, '1000009b-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000009b-0000-4000-8000-000000000001', '1000009b-0000-4000-8000-000000000001', '2026-09-30', 'USD', 44),
  ('2000009b-0000-4000-8000-000000000002', '1000009b-0000-4000-8000-000000000001', '2026-11-12', 'USD', 2223),
  ('2000009b-0000-4000-8000-000000000003', '1000009b-0000-4000-8000-000000000001', '2026-12-05', 'USD', 7733);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000009b-0000-4000-8000-000000000001', '1000009b-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000009b-0000-4000-8000-000000000002', '1000009b-0000-4000-8000-000000000001', NULL, -1, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009b-0000-4000-8000-000000000003', '1000009b-0000-4000-8000-000000000001', '2000009b-0000-4000-8000-000000000002', -1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009b-0000-4000-8000-000000000004', '1000009b-0000-4000-8000-000000000001', '2000009b-0000-4000-8000-000000000002', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009b-0000-4000-8000-000000000001', '2026-11-04') b),
  '(0,-1,1,0)',
  'case 155: fuzz 20261028/101'
);

-- ── case 156: fuzz 20261028/102 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009c-0000-4000-8000-000000000001', 'parity case 156', '2026-09-17', '2026-09-18', false, false, '0ff1ce00-0000-4000-8000-000000000004', 7.5, NULL, '2026-08-18T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000009c-0000-4000-8000-000000000001', 'line', 'USD', 12123, 4, '1000009c-0000-4000-8000-000000000001', false),
  ('3000009c-0000-4000-8000-000000000002', 'line', 'USD', 5205, 4, '1000009c-0000-4000-8000-000000000001', false),
  ('3000009c-0000-4000-8000-000000000003', 'line', 'USD', 46054, 4, '1000009c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000009c-0000-4000-8000-000000000001', '1000009c-0000-4000-8000-000000000001', '2026-10-02', 'USD', 6921),
  ('2000009c-0000-4000-8000-000000000002', '1000009c-0000-4000-8000-000000000001', '2026-10-26', 'USD', 3079);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000009c-0000-4000-8000-000000000001', '1000009c-0000-4000-8000-000000000001', NULL, 84958, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000009c-0000-4000-8000-000000000002', '1000009c-0000-4000-8000-000000000001', '2000009c-0000-4000-8000-000000000002', -17725, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000003', '1000009c-0000-4000-8000-000000000001', '2000009c-0000-4000-8000-000000000001', 221566, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000004', '1000009c-0000-4000-8000-000000000001', '2000009c-0000-4000-8000-000000000002', 134678, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000005', '1000009c-0000-4000-8000-000000000001', NULL, -28797, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000006', '1000009c-0000-4000-8000-000000000001', '2000009c-0000-4000-8000-000000000002', -55342, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000007', '1000009c-0000-4000-8000-000000000001', NULL, 81550, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009c-0000-4000-8000-000000000008', '1000009c-0000-4000-8000-000000000001', NULL, 129838, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009c-0000-4000-8000-000000000001', '2026-10-30') b),
  '(272543,439560,0,0)',
  'case 156: fuzz 20261028/102'
);

-- ── case 157: fuzz 20261028/103 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009d-0000-4000-8000-000000000001', 'parity case 157', '2026-11-02', '2026-11-03', false, false, '0ff1ce00-0000-4000-8000-000000000007', 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000009d-0000-4000-8000-000000000001', 'line', 'CAD', -13355, 4, '1000009d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000009d-0000-4000-8000-000000000001', '1000009d-0000-4000-8000-000000000001', '2026-12-17', 'CAD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009d-0000-4000-8000-000000000001', '2026-11-08') b),
  '(0,0,0,0)',
  'case 157: fuzz 20261028/103'
);

-- ── case 158: fuzz 20261028/104 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009e-0000-4000-8000-000000000001', 'parity case 158', '2027-01-15', '2027-01-16', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-12-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000009e-0000-4000-8000-000000000001', 'line', 'USD', 143740, 1, '1000009e-0000-4000-8000-000000000001', false),
  ('3000009e-0000-4000-8000-000000000002', 'line', 'USD', 127629, 4, '1000009e-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000009e-0000-4000-8000-000000000001', '1000009e-0000-4000-8000-000000000001', '2026-12-14', 'USD', 5227),
  ('2000009e-0000-4000-8000-000000000002', '1000009e-0000-4000-8000-000000000001', '2027-01-17', 'USD', 3352),
  ('2000009e-0000-4000-8000-000000000003', '1000009e-0000-4000-8000-000000000001', '2026-11-30', 'USD', 1421);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000009e-0000-4000-8000-000000000001', '1000009e-0000-4000-8000-000000000001', NULL, 40574, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000002', '1000009e-0000-4000-8000-000000000001', '2000009e-0000-4000-8000-000000000003', -8530, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000003', '1000009e-0000-4000-8000-000000000001', NULL, 48140, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000004', '1000009e-0000-4000-8000-000000000001', '2000009e-0000-4000-8000-000000000003', 73745, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000005', '1000009e-0000-4000-8000-000000000001', NULL, 11807, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000006', '1000009e-0000-4000-8000-000000000001', NULL, 122328, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000009e-0000-4000-8000-000000000007', '1000009e-0000-4000-8000-000000000001', NULL, 11248, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009e-0000-4000-8000-000000000001', '2026-12-02') b),
  '(143740,219128,0,0)',
  'case 158: fuzz 20261028/104'
);

-- ── case 159: fuzz 20261028/105 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000009f-0000-4000-8000-000000000001', 'parity case 159', '2026-10-14', '2026-10-15', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-07T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000009f-0000-4000-8000-000000000001', '1000009f-0000-4000-8000-000000000001', '2026-10-06', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000009f-0000-4000-8000-000000000001', '1000009f-0000-4000-8000-000000000001', '2000009f-0000-4000-8000-000000000001', -1, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000009f-0000-4000-8000-000000000001', '2026-11-12') b),
  '(0,0,0,0)',
  'case 159: fuzz 20261028/105'
);

-- ── case 160: fuzz 20261028/106 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a0-0000-4000-8000-000000000001', 'parity case 160', '2027-01-02', '2027-01-03', false, false, '0ff1ce00-0000-4000-8000-000000000007', 0, 2451, '2026-12-02T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a0-0000-4000-8000-000000000001', 'line', 'CAD', -36004, 2, '100000a0-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a0-0000-4000-8000-000000000001', '100000a0-0000-4000-8000-000000000001', '2026-10-08', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a0-0000-4000-8000-000000000001', '100000a0-0000-4000-8000-000000000001', '200000a0-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a0-0000-4000-8000-000000000002', '100000a0-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a0-0000-4000-8000-000000000003', '100000a0-0000-4000-8000-000000000001', NULL, -1, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000a0-0000-4000-8000-000000000004', '100000a0-0000-4000-8000-000000000001', '200000a0-0000-4000-8000-000000000001', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a0-0000-4000-8000-000000000001', '2026-11-12') b),
  '(0,4,0,0)',
  'case 160: fuzz 20261028/106'
);

-- ── case 161: fuzz 20261028/107 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a1-0000-4000-8000-000000000001', 'parity case 161', '2026-11-21', '2026-11-22', false, false, NULL, 7.5, NULL, '2026-10-31T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a1-0000-4000-8000-000000000001', 'line', 'USD', 104885, 1, '100000a1-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a1-0000-4000-8000-000000000001', '100000a1-0000-4000-8000-000000000001', '2026-10-26', 'USD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a1-0000-4000-8000-000000000001', '2026-11-21') b),
  '(112751,0,112751,112751)',
  'case 161: fuzz 20261028/107'
);

-- ── case 162: fuzz 20261028/108 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a2-0000-4000-8000-000000000001', 'parity case 162', '2026-10-17', '2026-10-18', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-09-20T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a2-0000-4000-8000-000000000001', 'line', 'CAD', 46374, NULL, '100000a2-0000-4000-8000-000000000001', false),
  ('300000a2-0000-4000-8000-000000000002', 'line', 'CAD', 93621, 3, '100000a2-0000-4000-8000-000000000001', false),
  ('300000a2-0000-4000-8000-000000000003', 'line', 'CAD', 145250, 5, '100000a2-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a2-0000-4000-8000-000000000001', '2026-12-03') b),
  '(1053487,0,1053487,1053487)',
  'case 162: fuzz 20261028/108'
);

-- ── case 163: fuzz 20261028/109 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a3-0000-4000-8000-000000000001', 'parity case 163', '2026-09-29', '2026-09-30', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-08-23T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a3-0000-4000-8000-000000000001', 'line', 'USD', -5308, 5, '100000a3-0000-4000-8000-000000000001', false),
  ('300000a3-0000-4000-8000-000000000002', 'line', 'USD', 55704, 1, '100000a3-0000-4000-8000-000000000001', false),
  ('300000a3-0000-4000-8000-000000000003', 'line', 'USD', 43643, 2, '100000a3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a3-0000-4000-8000-000000000001', '100000a3-0000-4000-8000-000000000001', '2026-12-17', 'USD', 9367),
  ('200000a3-0000-4000-8000-000000000002', '100000a3-0000-4000-8000-000000000001', '2026-09-30', 'USD', 633);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a3-0000-4000-8000-000000000001', '100000a3-0000-4000-8000-000000000001', '200000a3-0000-4000-8000-000000000002', 9560, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000002', '100000a3-0000-4000-8000-000000000001', NULL, 77549, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000003', '100000a3-0000-4000-8000-000000000001', NULL, 36421, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000004', '100000a3-0000-4000-8000-000000000001', '200000a3-0000-4000-8000-000000000001', -28711, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000005', '100000a3-0000-4000-8000-000000000001', NULL, -74328, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000006', '100000a3-0000-4000-8000-000000000001', NULL, 6398, 'CAD', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000a3-0000-4000-8000-000000000007', '100000a3-0000-4000-8000-000000000001', '200000a3-0000-4000-8000-000000000002', 14338, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a3-0000-4000-8000-000000000008', '100000a3-0000-4000-8000-000000000001', NULL, 85812, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a3-0000-4000-8000-000000000001', '2026-11-24') b),
  '(116450,-14009,130459,7371)',
  'case 163: fuzz 20261028/109'
);

-- ── case 164: fuzz 20261028/110 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a4-0000-4000-8000-000000000001', 'parity case 164', '2026-11-24', '2026-11-25', false, false, NULL, NULL, NULL, '2026-10-18T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a4-0000-4000-8000-000000000001', '100000a4-0000-4000-8000-000000000001', '2026-12-18', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a4-0000-4000-8000-000000000001', '100000a4-0000-4000-8000-000000000001', '200000a4-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000002', '100000a4-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000003', '100000a4-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000004', '100000a4-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000005', '100000a4-0000-4000-8000-000000000001', NULL, -2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000006', '100000a4-0000-4000-8000-000000000001', NULL, -2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a4-0000-4000-8000-000000000007', '100000a4-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a4-0000-4000-8000-000000000001', '2026-11-11') b),
  '(0,3,0,0)',
  'case 164: fuzz 20261028/110'
);

-- ── case 165: fuzz 20261028/111 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a5-0000-4000-8000-000000000001', 'parity case 165', '2026-11-26', '2026-11-27', false, false, '0ff1ce00-0000-4000-8000-000000000004', 13, NULL, '2026-10-17T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a5-0000-4000-8000-000000000001', '100000a5-0000-4000-8000-000000000001', NULL, -2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a5-0000-4000-8000-000000000002', '100000a5-0000-4000-8000-000000000001', NULL, 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a5-0000-4000-8000-000000000003', '100000a5-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a5-0000-4000-8000-000000000004', '100000a5-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a5-0000-4000-8000-000000000005', '100000a5-0000-4000-8000-000000000001', NULL, 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a5-0000-4000-8000-000000000001', '2026-11-03') b),
  '(0,-1,1,0)',
  'case 165: fuzz 20261028/111'
);

-- ── case 166: fuzz 20261028/112 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a6-0000-4000-8000-000000000001', 'parity case 166', '2026-11-10', '2026-11-11', false, false, NULL, NULL, NULL, '2026-11-05T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000a6-0000-4000-8000-000000000001', 'parity case 166 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000a6-0000-4000-8000-000000000001', '500000a6-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a6-0000-4000-8000-000000000001', 'line', 'USD', -2717, 1, '100000a6-0000-4000-8000-000000000001', false),
  ('300000a6-0000-4000-8000-000000000002', 'line', 'USD', -6742, 2, '100000a6-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a6-0000-4000-8000-000000000001', '100000a6-0000-4000-8000-000000000001', '2026-12-02', 'USD', 755);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a6-0000-4000-8000-000000000001', '100000a6-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a6-0000-4000-8000-000000000002', '100000a6-0000-4000-8000-000000000001', '200000a6-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a6-0000-4000-8000-000000000003', '100000a6-0000-4000-8000-000000000001', '600000a6-0000-4000-8000-000000000001', -2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a6-0000-4000-8000-000000000004', '100000a6-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a6-0000-4000-8000-000000000001', '2026-11-09') b),
  '(0,0,0,0)',
  'case 166: fuzz 20261028/112'
);

-- ── case 167: fuzz 20261028/113 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a7-0000-4000-8000-000000000001', 'parity case 167', '2026-09-17', '2026-09-18', false, false, '0ff1ce00-0000-4000-8000-000000000002', 0, NULL, '2026-09-08T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000a7-0000-4000-8000-000000000001', 'parity case 167 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000a7-0000-4000-8000-000000000001', '500000a7-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a7-0000-4000-8000-000000000001', 'line', 'CAD', 66520, 3, '100000a7-0000-4000-8000-000000000001', false),
  ('300000a7-0000-4000-8000-000000000002', 'line', 'CAD', 115044, 1, '100000a7-0000-4000-8000-000000000001', false),
  ('300000a7-0000-4000-8000-000000000003', 'line', 'CAD', 77306, NULL, '100000a7-0000-4000-8000-000000000001', false),
  ('300000a7-0000-4000-8000-000000000004', 'line', 'CAD', 111804, 2, '100000a7-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a7-0000-4000-8000-000000000001', '100000a7-0000-4000-8000-000000000001', NULL, 229830, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000002', '100000a7-0000-4000-8000-000000000001', '600000a7-0000-4000-8000-000000000001', 116773, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000003', '100000a7-0000-4000-8000-000000000001', NULL, 235686, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000004', '100000a7-0000-4000-8000-000000000001', NULL, 216216, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000005', '100000a7-0000-4000-8000-000000000001', NULL, 100939, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000006', '100000a7-0000-4000-8000-000000000001', NULL, 74675, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a7-0000-4000-8000-000000000007', '100000a7-0000-4000-8000-000000000001', NULL, 123309, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a7-0000-4000-8000-000000000001', '2026-11-05') b),
  '(391910,757903,0,0)',
  'case 167: fuzz 20261028/113'
);

-- ── case 168: fuzz 20261028/114 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a8-0000-4000-8000-000000000001', 'parity case 168', '2027-01-21', '2027-01-22', false, false, '0ff1ce00-0000-4000-8000-000000000001', 0, NULL, '2026-12-28T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000a8-0000-4000-8000-000000000001', 'line', 'CAD', -16191, 5, '100000a8-0000-4000-8000-000000000001', false),
  ('300000a8-0000-4000-8000-000000000002', 'line', 'CAD', 12005, 3, '100000a8-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a8-0000-4000-8000-000000000001', '100000a8-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a8-0000-4000-8000-000000000002', '100000a8-0000-4000-8000-000000000001', NULL, -1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a8-0000-4000-8000-000000000003', '100000a8-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a8-0000-4000-8000-000000000004', '100000a8-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a8-0000-4000-8000-000000000005', '100000a8-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a8-0000-4000-8000-000000000006', '100000a8-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a8-0000-4000-8000-000000000001', '2026-11-23') b),
  '(0,4,0,0)',
  'case 168: fuzz 20261028/114'
);

-- ── case 169: fuzz 20261028/115 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000a9-0000-4000-8000-000000000001', 'parity case 169', '2026-11-19', '2026-11-20', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-18T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000a9-0000-4000-8000-000000000001', '100000a9-0000-4000-8000-000000000001', '2026-10-22', 'USD', 986),
  ('200000a9-0000-4000-8000-000000000002', '100000a9-0000-4000-8000-000000000001', '2026-12-14', 'USD', 1248),
  ('200000a9-0000-4000-8000-000000000003', '100000a9-0000-4000-8000-000000000001', '2026-12-17', 'USD', 237),
  ('200000a9-0000-4000-8000-000000000004', '100000a9-0000-4000-8000-000000000001', '2026-11-29', 'USD', 1241),
  ('200000a9-0000-4000-8000-000000000005', '100000a9-0000-4000-8000-000000000001', '2026-12-17', 'USD', 6288);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000a9-0000-4000-8000-000000000001', '100000a9-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a9-0000-4000-8000-000000000002', '100000a9-0000-4000-8000-000000000001', '200000a9-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a9-0000-4000-8000-000000000003', '100000a9-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000a9-0000-4000-8000-000000000004', '100000a9-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a9-0000-4000-8000-000000000005', '100000a9-0000-4000-8000-000000000001', '200000a9-0000-4000-8000-000000000002', 1, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a9-0000-4000-8000-000000000006', '100000a9-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000a9-0000-4000-8000-000000000007', '100000a9-0000-4000-8000-000000000001', '200000a9-0000-4000-8000-000000000004', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000a9-0000-4000-8000-000000000008', '100000a9-0000-4000-8000-000000000001', '200000a9-0000-4000-8000-000000000001', 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000a9-0000-4000-8000-000000000001', '2026-11-19') b),
  '(0,2,0,0)',
  'case 169: fuzz 20261028/115'
);

-- ── case 170: fuzz 20261028/116 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000aa-0000-4000-8000-000000000001', 'parity case 170', '2026-10-12', '2026-10-13', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-10-04T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000aa-0000-4000-8000-000000000001', 'line', 'CAD', 56660, 5, '100000aa-0000-4000-8000-000000000001', false),
  ('300000aa-0000-4000-8000-000000000002', 'line', 'CAD', 37401, 1, '100000aa-0000-4000-8000-000000000001', false),
  ('300000aa-0000-4000-8000-000000000003', 'line', 'CAD', 135033, 1, '100000aa-0000-4000-8000-000000000001', false),
  ('300000aa-0000-4000-8000-000000000004', 'line', 'CAD', 130036, 5, '100000aa-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000aa-0000-4000-8000-000000000001', '100000aa-0000-4000-8000-000000000001', '2026-11-07', 'CAD', 3979),
  ('200000aa-0000-4000-8000-000000000002', '100000aa-0000-4000-8000-000000000001', '2026-10-24', 'CAD', 1169),
  ('200000aa-0000-4000-8000-000000000003', '100000aa-0000-4000-8000-000000000001', '2026-09-22', 'CAD', 1061),
  ('200000aa-0000-4000-8000-000000000004', '100000aa-0000-4000-8000-000000000001', '2026-09-27', 'CAD', 1067),
  ('200000aa-0000-4000-8000-000000000005', '100000aa-0000-4000-8000-000000000001', '2026-11-01', 'CAD', 2724);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000aa-0000-4000-8000-000000000001', '2026-10-30') b),
  '(1105914,0,1105914,364620)',
  'case 170: fuzz 20261028/116'
);

-- ── case 171: fuzz 20261028/117 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ab-0000-4000-8000-000000000001', 'parity case 171', '2027-01-17', '2027-01-18', false, false, '0ff1ce00-0000-4000-8000-000000000004', 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ab-0000-4000-8000-000000000001', 'line', 'USD', -41092, NULL, '100000ab-0000-4000-8000-000000000001', false),
  ('300000ab-0000-4000-8000-000000000002', 'line', 'USD', 45168, 1, '100000ab-0000-4000-8000-000000000001', false),
  ('300000ab-0000-4000-8000-000000000003', 'line', 'USD', 124616, NULL, '100000ab-0000-4000-8000-000000000001', false),
  ('300000ab-0000-4000-8000-000000000004', 'line', 'USD', 143659, 4, '100000ab-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ab-0000-4000-8000-000000000001', '100000ab-0000-4000-8000-000000000001', '2027-01-04', 'USD', 2081);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ab-0000-4000-8000-000000000001', '100000ab-0000-4000-8000-000000000001', '200000ab-0000-4000-8000-000000000001', 8811, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ab-0000-4000-8000-000000000001', '2026-12-03') b),
  '(773485,8811,764674,0)',
  'case 171: fuzz 20261028/117'
);

-- ── case 172: fuzz 20261028/118 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ac-0000-4000-8000-000000000001', 'parity case 172', '2026-11-24', '2026-11-25', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-10-15T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000ac-0000-4000-8000-000000000001', 'parity case 172 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000ac-0000-4000-8000-000000000001', '500000ac-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ac-0000-4000-8000-000000000001', '100000ac-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000002', '100000ac-0000-4000-8000-000000000001', '600000ac-0000-4000-8000-000000000001', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000003', '100000ac-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000004', '100000ac-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000005', '100000ac-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000006', '100000ac-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000007', '100000ac-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ac-0000-4000-8000-000000000008', '100000ac-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ac-0000-4000-8000-000000000001', '2026-11-20') b),
  '(0,9,0,0)',
  'case 172: fuzz 20261028/118'
);

-- ── case 173: fuzz 20261028/119 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ad-0000-4000-8000-000000000001', 'parity case 173', '2027-01-18', '2027-01-19', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2027-01-02T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000ad-0000-4000-8000-000000000001', 'parity case 173 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000ad-0000-4000-8000-000000000001', '500000ad-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ad-0000-4000-8000-000000000001', 'line', 'CAD', 55282, 1, '100000ad-0000-4000-8000-000000000001', false),
  ('300000ad-0000-4000-8000-000000000002', 'line', 'CAD', -40815, 5, '100000ad-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ad-0000-4000-8000-000000000001', '100000ad-0000-4000-8000-000000000001', '2027-01-14', 'CAD', 7440),
  ('200000ad-0000-4000-8000-000000000002', '100000ad-0000-4000-8000-000000000001', '2026-12-12', 'CAD', 2560);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ad-0000-4000-8000-000000000001', '100000ad-0000-4000-8000-000000000001', '200000ad-0000-4000-8000-000000000002', 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000002', '100000ad-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000ad-0000-4000-8000-000000000003', '100000ad-0000-4000-8000-000000000001', NULL, 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000004', '100000ad-0000-4000-8000-000000000001', '200000ad-0000-4000-8000-000000000002', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000005', '100000ad-0000-4000-8000-000000000001', '600000ad-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000006', '100000ad-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000007', '100000ad-0000-4000-8000-000000000001', '200000ad-0000-4000-8000-000000000002', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ad-0000-4000-8000-000000000008', '100000ad-0000-4000-8000-000000000001', '200000ad-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ad-0000-4000-8000-000000000001', '2026-12-15') b),
  '(0,8,0,0)',
  'case 173: fuzz 20261028/119'
);

-- ── case 174: fuzz 20261028/120 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ae-0000-4000-8000-000000000001', 'parity case 174', '2027-01-22', '2027-01-23', false, false, '0ff1ce00-0000-4000-8000-000000000008', 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ae-0000-4000-8000-000000000001', 'line', 'USD', 61115, 3, '100000ae-0000-4000-8000-000000000001', false),
  ('300000ae-0000-4000-8000-000000000002', 'line', 'USD', -23883, 2, '100000ae-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ae-0000-4000-8000-000000000001', '100000ae-0000-4000-8000-000000000001', '2026-12-24', 'USD', 7980),
  ('200000ae-0000-4000-8000-000000000002', '100000ae-0000-4000-8000-000000000001', '2026-11-03', 'USD', 2020);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ae-0000-4000-8000-000000000001', '100000ae-0000-4000-8000-000000000001', NULL, 25487, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ae-0000-4000-8000-000000000002', '100000ae-0000-4000-8000-000000000001', NULL, 121571, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ae-0000-4000-8000-000000000003', '100000ae-0000-4000-8000-000000000001', NULL, 31864, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ae-0000-4000-8000-000000000001', '2026-12-04') b),
  '(155882,57351,98531,0)',
  'case 174: fuzz 20261028/120'
);

-- ── case 175: fuzz 20261028/121 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000af-0000-4000-8000-000000000001', 'parity case 175', '2026-11-09', '2026-11-10', false, false, '0ff1ce00-0000-4000-8000-000000000002', 9.975, 794, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000af-0000-4000-8000-000000000001', 'line', 'CAD', 67601, 1, '100000af-0000-4000-8000-000000000001', false),
  ('300000af-0000-4000-8000-000000000002', 'line', 'CAD', 12160, 1, '100000af-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000af-0000-4000-8000-000000000001', '100000af-0000-4000-8000-000000000001', NULL, 1695, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000af-0000-4000-8000-000000000002', '100000af-0000-4000-8000-000000000001', NULL, 31657, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000af-0000-4000-8000-000000000003', '100000af-0000-4000-8000-000000000001', NULL, 5413, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000af-0000-4000-8000-000000000004', '100000af-0000-4000-8000-000000000001', NULL, 16485, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000af-0000-4000-8000-000000000005', '100000af-0000-4000-8000-000000000001', NULL, 50125, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000af-0000-4000-8000-000000000006', '100000af-0000-4000-8000-000000000001', NULL, 1814, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000af-0000-4000-8000-000000000001', '2026-12-12') b),
  '(68395,57064,11331,11331)',
  'case 175: fuzz 20261028/121'
);

-- ── case 176: fuzz 20261028/122 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b0-0000-4000-8000-000000000001', 'parity case 176', '2026-10-07', '2026-10-08', false, false, '0ff1ce00-0000-4000-8000-000000000002', 5, 2911, '2026-09-12T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b0-0000-4000-8000-000000000001', 'line', 'CAD', 114605, 4, '100000b0-0000-4000-8000-000000000001', false),
  ('300000b0-0000-4000-8000-000000000002', 'line', 'CAD', 50795, 3, '100000b0-0000-4000-8000-000000000001', false),
  ('300000b0-0000-4000-8000-000000000003', 'line', 'CAD', 62857, NULL, '100000b0-0000-4000-8000-000000000001', false),
  ('300000b0-0000-4000-8000-000000000004', 'line', 'CAD', -31320, 4, '100000b0-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b0-0000-4000-8000-000000000001', '100000b0-0000-4000-8000-000000000001', '2026-12-29', 'CAD', 1208),
  ('200000b0-0000-4000-8000-000000000002', '100000b0-0000-4000-8000-000000000001', '2026-11-04', 'CAD', 1422),
  ('200000b0-0000-4000-8000-000000000003', '100000b0-0000-4000-8000-000000000001', '2026-10-12', 'CAD', 2595),
  ('200000b0-0000-4000-8000-000000000004', '100000b0-0000-4000-8000-000000000001', '2026-12-02', 'CAD', 2251),
  ('200000b0-0000-4000-8000-000000000005', '100000b0-0000-4000-8000-000000000001', '2026-09-17', 'CAD', 2524);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b0-0000-4000-8000-000000000001', '100000b0-0000-4000-8000-000000000001', NULL, 166888, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000002', '100000b0-0000-4000-8000-000000000001', NULL, 37790, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000003', '100000b0-0000-4000-8000-000000000001', '200000b0-0000-4000-8000-000000000004', 254907, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000004', '100000b0-0000-4000-8000-000000000001', NULL, 122547, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000005', '100000b0-0000-4000-8000-000000000001', NULL, -134930, 'CAD', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000b0-0000-4000-8000-000000000006', '100000b0-0000-4000-8000-000000000001', '200000b0-0000-4000-8000-000000000001', 132532, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000007', '100000b0-0000-4000-8000-000000000001', '200000b0-0000-4000-8000-000000000005', -69238, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b0-0000-4000-8000-000000000008', '100000b0-0000-4000-8000-000000000001', '200000b0-0000-4000-8000-000000000004', 205479, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b0-0000-4000-8000-000000000001', '2026-11-14') b),
  '(551293,882353,0,0)',
  'case 176: fuzz 20261028/122'
);

-- ── case 177: fuzz 20261028/123 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b1-0000-4000-8000-000000000001', 'parity case 177', '2026-10-28', '2026-10-29', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 1594, '2026-09-24T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b1-0000-4000-8000-000000000001', 'line', 'USD', 112126, 3, '100000b1-0000-4000-8000-000000000001', false),
  ('300000b1-0000-4000-8000-000000000002', 'line', 'USD', 67964, 5, '100000b1-0000-4000-8000-000000000001', true),
  ('300000b1-0000-4000-8000-000000000003', 'line', 'USD', 22197, 3, '100000b1-0000-4000-8000-000000000001', false),
  ('300000b1-0000-4000-8000-000000000004', 'line', 'USD', 105178, 2, '100000b1-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b1-0000-4000-8000-000000000001', '100000b1-0000-4000-8000-000000000001', '2026-12-27', 'USD', 458),
  ('200000b1-0000-4000-8000-000000000002', '100000b1-0000-4000-8000-000000000001', '2026-09-14', 'USD', 3257),
  ('200000b1-0000-4000-8000-000000000003', '100000b1-0000-4000-8000-000000000001', '2026-09-26', 'USD', 4442),
  ('200000b1-0000-4000-8000-000000000004', '100000b1-0000-4000-8000-000000000001', '2026-11-13', 'USD', 1843);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b1-0000-4000-8000-000000000001', '100000b1-0000-4000-8000-000000000001', NULL, 18411, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b1-0000-4000-8000-000000000002', '100000b1-0000-4000-8000-000000000001', NULL, 90034, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b1-0000-4000-8000-000000000003', '100000b1-0000-4000-8000-000000000001', '200000b1-0000-4000-8000-000000000004', 80003, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b1-0000-4000-8000-000000000004', '100000b1-0000-4000-8000-000000000001', NULL, -191724, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b1-0000-4000-8000-000000000001', '2026-11-06') b),
  '(614919,108445,506474,364981)',
  'case 177: fuzz 20261028/123'
);

-- ── case 178: fuzz 20261028/124 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b2-0000-4000-8000-000000000001', 'parity case 178', '2026-10-15', '2026-10-16', false, false, '0ff1ce00-0000-4000-8000-000000000004', 14.975, NULL, '2026-09-10T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000b2-0000-4000-8000-000000000001', 'parity case 178 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000b2-0000-4000-8000-000000000001', '500000b2-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b2-0000-4000-8000-000000000001', 'line', 'USD', 4845, 1, '100000b2-0000-4000-8000-000000000001', false),
  ('300000b2-0000-4000-8000-000000000002', 'line', 'USD', 27762, 5, '100000b2-0000-4000-8000-000000000001', true),
  ('300000b2-0000-4000-8000-000000000003', 'line', 'USD', 88607, 1, '100000b2-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b2-0000-4000-8000-000000000001', '100000b2-0000-4000-8000-000000000001', '2026-10-31', 'USD', 4939),
  ('200000b2-0000-4000-8000-000000000002', '100000b2-0000-4000-8000-000000000001', '2026-12-03', 'USD', 644),
  ('200000b2-0000-4000-8000-000000000003', '100000b2-0000-4000-8000-000000000001', '2026-12-25', 'USD', 3292),
  ('200000b2-0000-4000-8000-000000000004', '100000b2-0000-4000-8000-000000000001', '2026-10-09', 'USD', 230),
  ('200000b2-0000-4000-8000-000000000005', '100000b2-0000-4000-8000-000000000001', '2026-11-22', 'USD', 895);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b2-0000-4000-8000-000000000001', '100000b2-0000-4000-8000-000000000001', '600000b2-0000-4000-8000-000000000001', 1980, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b2-0000-4000-8000-000000000001', '2026-10-28') b),
  '(5571,1980,3591,0)',
  'case 178: fuzz 20261028/124'
);

-- ── case 179: fuzz 20261028/125 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b3-0000-4000-8000-000000000001', 'parity case 179', '2026-11-25', '2026-11-26', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 2550, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b3-0000-4000-8000-000000000001', 'line', 'USD', 9716, 4, '100000b3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b3-0000-4000-8000-000000000001', '100000b3-0000-4000-8000-000000000001', '2026-11-14', 'USD', 3817),
  ('200000b3-0000-4000-8000-000000000002', '100000b3-0000-4000-8000-000000000001', '2026-12-29', 'USD', 3327),
  ('200000b3-0000-4000-8000-000000000003', '100000b3-0000-4000-8000-000000000001', '2027-01-08', 'USD', 2856);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b3-0000-4000-8000-000000000001', '100000b3-0000-4000-8000-000000000001', NULL, 24597, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000b3-0000-4000-8000-000000000002', '100000b3-0000-4000-8000-000000000001', NULL, 38553, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b3-0000-4000-8000-000000000003', '100000b3-0000-4000-8000-000000000001', '200000b3-0000-4000-8000-000000000001', 34048, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b3-0000-4000-8000-000000000004', '100000b3-0000-4000-8000-000000000001', '200000b3-0000-4000-8000-000000000001', 38686, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b3-0000-4000-8000-000000000001', '2026-12-12') b),
  '(41414,111287,0,0)',
  'case 179: fuzz 20261028/125'
);

-- ── case 180: fuzz 20261028/126 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b4-0000-4000-8000-000000000001', 'parity case 180', '2026-11-05', '2026-11-06', false, false, '0ff1ce00-0000-4000-8000-000000000007', 9.975, NULL, '2026-10-07T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000b4-0000-4000-8000-000000000001', 'parity case 180 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000b4-0000-4000-8000-000000000001', '500000b4-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b4-0000-4000-8000-000000000001', 'line', 'CAD', 5566, NULL, '100000b4-0000-4000-8000-000000000001', false),
  ('300000b4-0000-4000-8000-000000000002', 'line', 'CAD', 40463, NULL, '100000b4-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b4-0000-4000-8000-000000000001', '100000b4-0000-4000-8000-000000000001', '2026-08-29', 'CAD', 34),
  ('200000b4-0000-4000-8000-000000000002', '100000b4-0000-4000-8000-000000000001', '2026-08-30', 'CAD', 1415),
  ('200000b4-0000-4000-8000-000000000003', '100000b4-0000-4000-8000-000000000001', '2026-09-11', 'CAD', 8551);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b4-0000-4000-8000-000000000001', '100000b4-0000-4000-8000-000000000001', NULL, -2479, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000002', '100000b4-0000-4000-8000-000000000001', '200000b4-0000-4000-8000-000000000003', 24722, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000003', '100000b4-0000-4000-8000-000000000001', NULL, 21186, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000004', '100000b4-0000-4000-8000-000000000001', '600000b4-0000-4000-8000-000000000001', 31406, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000005', '100000b4-0000-4000-8000-000000000001', NULL, 5031, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000006', '100000b4-0000-4000-8000-000000000001', NULL, -42973, 'cad', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000b4-0000-4000-8000-000000000007', '100000b4-0000-4000-8000-000000000001', NULL, 22014, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b4-0000-4000-8000-000000000008', '100000b4-0000-4000-8000-000000000001', '200000b4-0000-4000-8000-000000000003', 20842, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b4-0000-4000-8000-000000000001', '2026-10-19') b),
  '(50620,79866,0,0)',
  'case 180: fuzz 20261028/126'
);

-- ── case 181: fuzz 20261028/127 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b5-0000-4000-8000-000000000001', 'parity case 181', '2026-11-26', '2026-11-27', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 2605, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b5-0000-4000-8000-000000000001', 'line', 'CAD', 59695, 2, '100000b5-0000-4000-8000-000000000001', false),
  ('300000b5-0000-4000-8000-000000000002', 'line', 'CAD', -34062, 2, '100000b5-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b5-0000-4000-8000-000000000001', '100000b5-0000-4000-8000-000000000001', '2026-12-14', 'CAD', 2277),
  ('200000b5-0000-4000-8000-000000000002', '100000b5-0000-4000-8000-000000000001', '2026-09-14', 'CAD', 5210),
  ('200000b5-0000-4000-8000-000000000003', '100000b5-0000-4000-8000-000000000001', '2026-12-12', 'CAD', 3546),
  ('200000b5-0000-4000-8000-000000000004', '100000b5-0000-4000-8000-000000000001', '2026-11-20', 'CAD', 5533),
  ('200000b5-0000-4000-8000-000000000005', '100000b5-0000-4000-8000-000000000001', '2026-08-20', 'CAD', 3243);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b5-0000-4000-8000-000000000001', '100000b5-0000-4000-8000-000000000001', NULL, 50863, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b5-0000-4000-8000-000000000002', '100000b5-0000-4000-8000-000000000001', NULL, 43874, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b5-0000-4000-8000-000000000001', '2026-10-19') b),
  '(53871,94737,0,0)',
  'case 181: fuzz 20261028/127'
);

-- ── case 182: fuzz 20261028/128 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b6-0000-4000-8000-000000000001', 'parity case 182', '2026-10-15', '2026-10-16', false, false, '0ff1ce00-0000-4000-8000-000000000008', 5, NULL, '2026-10-12T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b6-0000-4000-8000-000000000001', '100000b6-0000-4000-8000-000000000001', '2026-09-19', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b6-0000-4000-8000-000000000001', '100000b6-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b6-0000-4000-8000-000000000002', '100000b6-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b6-0000-4000-8000-000000000003', '100000b6-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b6-0000-4000-8000-000000000004', '100000b6-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b6-0000-4000-8000-000000000005', '100000b6-0000-4000-8000-000000000001', '200000b6-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b6-0000-4000-8000-000000000001', '2026-10-27') b),
  '(0,8,0,0)',
  'case 182: fuzz 20261028/128'
);

-- ── case 183: fuzz 20261028/129 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b7-0000-4000-8000-000000000001', 'parity case 183', '2027-01-08', '2027-01-09', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-12-18T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b7-0000-4000-8000-000000000001', 'line', 'CAD', 145108, NULL, '100000b7-0000-4000-8000-000000000001', false),
  ('300000b7-0000-4000-8000-000000000002', 'line', 'CAD', 57036, 3, '100000b7-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b7-0000-4000-8000-000000000001', '100000b7-0000-4000-8000-000000000001', '2026-11-15', 'CAD', 163),
  ('200000b7-0000-4000-8000-000000000002', '100000b7-0000-4000-8000-000000000001', '2027-02-09', 'CAD', 4825),
  ('200000b7-0000-4000-8000-000000000003', '100000b7-0000-4000-8000-000000000001', '2027-01-12', 'CAD', 5020),
  ('200000b7-0000-4000-8000-000000000004', '100000b7-0000-4000-8000-000000000001', '2027-02-06', 'CAD', 3048);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b7-0000-4000-8000-000000000001', '2026-12-11') b),
  '(316216,0,316216,5154)',
  'case 183: fuzz 20261028/129'
);

-- ── case 184: fuzz 20261028/130 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b8-0000-4000-8000-000000000001', 'parity case 184', '2026-11-06', '2026-11-07', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, 511, '2026-11-04T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b8-0000-4000-8000-000000000001', 'line', 'USD', 136914, NULL, '100000b8-0000-4000-8000-000000000001', false),
  ('300000b8-0000-4000-8000-000000000002', 'line', 'USD', 85113, 4, '100000b8-0000-4000-8000-000000000001', false),
  ('300000b8-0000-4000-8000-000000000003', 'line', 'USD', 46290, 5, '100000b8-0000-4000-8000-000000000001', false),
  ('300000b8-0000-4000-8000-000000000004', 'line', 'USD', 62347, NULL, '100000b8-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b8-0000-4000-8000-000000000001', '100000b8-0000-4000-8000-000000000001', '2026-10-19', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000b8-0000-4000-8000-000000000001', '100000b8-0000-4000-8000-000000000001', '200000b8-0000-4000-8000-000000000001', 135142, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b8-0000-4000-8000-000000000002', '100000b8-0000-4000-8000-000000000001', '200000b8-0000-4000-8000-000000000001', 253867, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b8-0000-4000-8000-000000000003', '100000b8-0000-4000-8000-000000000001', NULL, 58341, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b8-0000-4000-8000-000000000004', '100000b8-0000-4000-8000-000000000001', '200000b8-0000-4000-8000-000000000001', 291189, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000b8-0000-4000-8000-000000000005', '100000b8-0000-4000-8000-000000000001', '200000b8-0000-4000-8000-000000000001', 193571, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b8-0000-4000-8000-000000000001', '2026-10-23') b),
  '(771674,312208,459466,459466)',
  'case 184: fuzz 20261028/130'
);

-- ── case 185: fuzz 20261028/131 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000b9-0000-4000-8000-000000000001', 'parity case 185', '2026-11-18', '2026-11-19', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-12T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000b9-0000-4000-8000-000000000001', 'line', 'CAD', 67686, NULL, '100000b9-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000b9-0000-4000-8000-000000000001', '100000b9-0000-4000-8000-000000000001', '2026-11-10', 'CAD', 2576),
  ('200000b9-0000-4000-8000-000000000002', '100000b9-0000-4000-8000-000000000001', '2026-11-04', 'CAD', 3188),
  ('200000b9-0000-4000-8000-000000000003', '100000b9-0000-4000-8000-000000000001', '2026-12-17', 'CAD', 4236);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000b9-0000-4000-8000-000000000001', '2026-12-14') b),
  '(67686,0,67686,39014)',
  'case 185: fuzz 20261028/131'
);

-- ── case 186: fuzz 20261028/132 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ba-0000-4000-8000-000000000001', 'parity case 186', '2026-11-12', '2026-11-13', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-10-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ba-0000-4000-8000-000000000001', 'line', 'CAD', 16587, NULL, '100000ba-0000-4000-8000-000000000001', false),
  ('300000ba-0000-4000-8000-000000000002', 'line', 'CAD', 139816, 1, '100000ba-0000-4000-8000-000000000001', true),
  ('300000ba-0000-4000-8000-000000000003', 'line', 'CAD', 66116, 4, '100000ba-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ba-0000-4000-8000-000000000001', '100000ba-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 3222),
  ('200000ba-0000-4000-8000-000000000002', '100000ba-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 3109),
  ('200000ba-0000-4000-8000-000000000003', '100000ba-0000-4000-8000-000000000001', '2026-10-21', 'CAD', 708),
  ('200000ba-0000-4000-8000-000000000004', '100000ba-0000-4000-8000-000000000001', '2026-12-08', 'CAD', 2961);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ba-0000-4000-8000-000000000001', '100000ba-0000-4000-8000-000000000001', '200000ba-0000-4000-8000-000000000003', -214614, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ba-0000-4000-8000-000000000002', '100000ba-0000-4000-8000-000000000001', '200000ba-0000-4000-8000-000000000003', 35802, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ba-0000-4000-8000-000000000001', '2026-11-14') b),
  '(281051,-178812,459863,19898)',
  'case 186: fuzz 20261028/132'
);

-- ── case 187: fuzz 20261028/133 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000bb-0000-4000-8000-000000000001', 'parity case 187', '2026-11-28', '2026-11-29', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000bb-0000-4000-8000-000000000001', 'line', 'USD', 19531, 2, '100000bb-0000-4000-8000-000000000001', false),
  ('300000bb-0000-4000-8000-000000000002', 'line', 'USD', 56876, 3, '100000bb-0000-4000-8000-000000000001', false),
  ('300000bb-0000-4000-8000-000000000003', 'line', 'USD', -19303, 3, '100000bb-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000bb-0000-4000-8000-000000000001', '100000bb-0000-4000-8000-000000000001', '2026-12-29', 'USD', 3392),
  ('200000bb-0000-4000-8000-000000000002', '100000bb-0000-4000-8000-000000000001', '2026-10-05', 'USD', 1921),
  ('200000bb-0000-4000-8000-000000000003', '100000bb-0000-4000-8000-000000000001', '2026-11-22', 'USD', 4687);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000bb-0000-4000-8000-000000000001', '100000bb-0000-4000-8000-000000000001', '200000bb-0000-4000-8000-000000000001', 5345, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000002', '100000bb-0000-4000-8000-000000000001', NULL, 108332, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000003', '100000bb-0000-4000-8000-000000000001', NULL, -53279, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000004', '100000bb-0000-4000-8000-000000000001', NULL, -56389, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000005', '100000bb-0000-4000-8000-000000000001', NULL, 72992, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000006', '100000bb-0000-4000-8000-000000000001', '200000bb-0000-4000-8000-000000000003', 5056, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bb-0000-4000-8000-000000000007', '100000bb-0000-4000-8000-000000000001', NULL, -151535, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000bb-0000-4000-8000-000000000001', '2026-12-01') b),
  '(151781,76712,75069,23585)',
  'case 187: fuzz 20261028/133'
);

-- ── case 188: fuzz 20261028/134 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000bc-0000-4000-8000-000000000001', 'parity case 188', '2026-09-27', '2026-09-28', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-09-13T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000bc-0000-4000-8000-000000000001', 'parity case 188 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000bc-0000-4000-8000-000000000001', '500000bc-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000bc-0000-4000-8000-000000000001', 'line', 'CAD', 93200, 5, '100000bc-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000bc-0000-4000-8000-000000000001', '100000bc-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bc-0000-4000-8000-000000000002', '100000bc-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bc-0000-4000-8000-000000000003', '100000bc-0000-4000-8000-000000000001', '600000bc-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bc-0000-4000-8000-000000000004', '100000bc-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bc-0000-4000-8000-000000000005', '100000bc-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000bc-0000-4000-8000-000000000001', '2026-11-09') b),
  '(0,7,0,0)',
  'case 188: fuzz 20261028/134'
);

-- ── case 189: fuzz 20261028/135 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000bd-0000-4000-8000-000000000001', 'parity case 189', '2026-10-05', '2026-10-06', false, false, NULL, NULL, NULL, '2026-09-11T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000bd-0000-4000-8000-000000000001', 'line', 'USD', 129003, 3, '100000bd-0000-4000-8000-000000000001', true),
  ('300000bd-0000-4000-8000-000000000002', 'line', 'USD', 128874, 4, '100000bd-0000-4000-8000-000000000001', true),
  ('300000bd-0000-4000-8000-000000000003', 'line', 'USD', 58966, 3, '100000bd-0000-4000-8000-000000000001', false),
  ('300000bd-0000-4000-8000-000000000004', 'line', 'USD', 52818, 3, '100000bd-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000bd-0000-4000-8000-000000000001', '100000bd-0000-4000-8000-000000000001', '2026-11-20', 'USD', 5303),
  ('200000bd-0000-4000-8000-000000000002', '100000bd-0000-4000-8000-000000000001', '2026-10-09', 'USD', 2981),
  ('200000bd-0000-4000-8000-000000000003', '100000bd-0000-4000-8000-000000000001', '2026-12-30', 'USD', 928),
  ('200000bd-0000-4000-8000-000000000004', '100000bd-0000-4000-8000-000000000001', '2026-11-06', 'USD', 722),
  ('200000bd-0000-4000-8000-000000000005', '100000bd-0000-4000-8000-000000000001', '2026-10-22', 'USD', 66);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000bd-0000-4000-8000-000000000001', '100000bd-0000-4000-8000-000000000001', '200000bd-0000-4000-8000-000000000004', 271423, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bd-0000-4000-8000-000000000002', '100000bd-0000-4000-8000-000000000001', NULL, 91877, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bd-0000-4000-8000-000000000003', '100000bd-0000-4000-8000-000000000001', NULL, -59886, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bd-0000-4000-8000-000000000004', '100000bd-0000-4000-8000-000000000001', NULL, 270890, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bd-0000-4000-8000-000000000005', '100000bd-0000-4000-8000-000000000001', NULL, 186008, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000bd-0000-4000-8000-000000000001', '2026-11-08') b),
  '(335352,211004,124348,0)',
  'case 189: fuzz 20261028/135'
);

-- ── case 190: fuzz 20261028/136 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000be-0000-4000-8000-000000000001', 'parity case 190', '2026-09-26', '2026-09-27', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-08-21T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000be-0000-4000-8000-000000000001', 'line', 'CAD', 66301, 4, '100000be-0000-4000-8000-000000000001', false),
  ('300000be-0000-4000-8000-000000000002', 'line', 'CAD', 2938, 1, '100000be-0000-4000-8000-000000000001', false),
  ('300000be-0000-4000-8000-000000000003', 'line', 'CAD', 120401, NULL, '100000be-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000be-0000-4000-8000-000000000001', '100000be-0000-4000-8000-000000000001', NULL, -175438, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000be-0000-4000-8000-000000000002', '100000be-0000-4000-8000-000000000001', NULL, 40973, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000be-0000-4000-8000-000000000003', '100000be-0000-4000-8000-000000000001', NULL, -99625, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000be-0000-4000-8000-000000000004', '100000be-0000-4000-8000-000000000001', NULL, -156258, ' CAD ', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000be-0000-4000-8000-000000000005', '100000be-0000-4000-8000-000000000001', NULL, 196930, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000be-0000-4000-8000-000000000006', '100000be-0000-4000-8000-000000000001', NULL, 11151, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000be-0000-4000-8000-000000000007', '100000be-0000-4000-8000-000000000001', NULL, 180678, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000be-0000-4000-8000-000000000008', '100000be-0000-4000-8000-000000000001', NULL, 209979, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000be-0000-4000-8000-000000000001', '2026-11-05') b),
  '(388543,-164287,552830,552830)',
  'case 190: fuzz 20261028/136'
);

-- ── case 191: fuzz 20261028/137 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000bf-0000-4000-8000-000000000001', 'parity case 191', '2026-11-29', '2026-11-30', false, false, '0ff1ce00-0000-4000-8000-000000000004', 13, NULL, '2026-11-08T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000bf-0000-4000-8000-000000000001', 'line', 'USD', 52529, 1, '100000bf-0000-4000-8000-000000000001', false),
  ('300000bf-0000-4000-8000-000000000002', 'line', 'USD', 112155, 4, '100000bf-0000-4000-8000-000000000001', true),
  ('300000bf-0000-4000-8000-000000000003', 'line', 'USD', 107737, 5, '100000bf-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000bf-0000-4000-8000-000000000001', '100000bf-0000-4000-8000-000000000001', '2027-01-17', 'USD', 826),
  ('200000bf-0000-4000-8000-000000000002', '100000bf-0000-4000-8000-000000000001', '2026-11-25', 'USD', 5351),
  ('200000bf-0000-4000-8000-000000000003', '100000bf-0000-4000-8000-000000000001', '2026-10-19', 'USD', 3823);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000bf-0000-4000-8000-000000000001', '100000bf-0000-4000-8000-000000000001', '200000bf-0000-4000-8000-000000000001', -77428, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bf-0000-4000-8000-000000000002', '100000bf-0000-4000-8000-000000000001', '200000bf-0000-4000-8000-000000000001', 39942, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bf-0000-4000-8000-000000000003', '100000bf-0000-4000-8000-000000000001', '200000bf-0000-4000-8000-000000000001', 147548, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bf-0000-4000-8000-000000000004', '100000bf-0000-4000-8000-000000000001', '200000bf-0000-4000-8000-000000000001', 9386, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bf-0000-4000-8000-000000000005', '100000bf-0000-4000-8000-000000000001', '200000bf-0000-4000-8000-000000000002', 198354, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000bf-0000-4000-8000-000000000006', '100000bf-0000-4000-8000-000000000001', NULL, -169830, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000bf-0000-4000-8000-000000000001', '2026-11-28') b),
  '(668072,277860,390212,390212)',
  'case 191: fuzz 20261028/137'
);

-- ── case 192: fuzz 20261028/138 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c0-0000-4000-8000-000000000001', 'parity case 192', '2026-11-04', '2026-11-05', false, false, NULL, 0, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c0-0000-4000-8000-000000000001', '100000c0-0000-4000-8000-000000000001', '2026-10-26', 'USD', 1579),
  ('200000c0-0000-4000-8000-000000000002', '100000c0-0000-4000-8000-000000000001', '2026-10-05', 'USD', 8421);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c0-0000-4000-8000-000000000001', '100000c0-0000-4000-8000-000000000001', '200000c0-0000-4000-8000-000000000002', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c0-0000-4000-8000-000000000002', '100000c0-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c0-0000-4000-8000-000000000003', '100000c0-0000-4000-8000-000000000001', '200000c0-0000-4000-8000-000000000002', -2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c0-0000-4000-8000-000000000004', '100000c0-0000-4000-8000-000000000001', '200000c0-0000-4000-8000-000000000002', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c0-0000-4000-8000-000000000005', '100000c0-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c0-0000-4000-8000-000000000006', '100000c0-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c0-0000-4000-8000-000000000001', '2026-10-27') b),
  '(0,3,0,0)',
  'case 192: fuzz 20261028/138'
);

-- ── case 193: fuzz 20261028/139 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c1-0000-4000-8000-000000000001', 'parity case 193', '2026-10-28', '2026-10-29', false, false, '0ff1ce00-0000-4000-8000-000000000002', 15, 1818, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000c1-0000-4000-8000-000000000001', 'parity case 193 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000c1-0000-4000-8000-000000000001', '500000c1-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c1-0000-4000-8000-000000000001', '100000c1-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 645),
  ('200000c1-0000-4000-8000-000000000002', '100000c1-0000-4000-8000-000000000001', '2026-12-27', 'CAD', 1569),
  ('200000c1-0000-4000-8000-000000000003', '100000c1-0000-4000-8000-000000000001', '2026-11-05', 'CAD', 293),
  ('200000c1-0000-4000-8000-000000000004', '100000c1-0000-4000-8000-000000000001', '2026-12-12', 'CAD', 85),
  ('200000c1-0000-4000-8000-000000000005', '100000c1-0000-4000-8000-000000000001', '2027-01-04', 'CAD', 7408);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c1-0000-4000-8000-000000000001', '100000c1-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000002', '100000c1-0000-4000-8000-000000000001', '200000c1-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000003', '100000c1-0000-4000-8000-000000000001', '200000c1-0000-4000-8000-000000000004', -1, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000004', '100000c1-0000-4000-8000-000000000001', '200000c1-0000-4000-8000-000000000004', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000005', '100000c1-0000-4000-8000-000000000001', '600000c1-0000-4000-8000-000000000001', 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000006', '100000c1-0000-4000-8000-000000000001', NULL, -1, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c1-0000-4000-8000-000000000007', '100000c1-0000-4000-8000-000000000001', '200000c1-0000-4000-8000-000000000003', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c1-0000-4000-8000-000000000001', '2026-12-04') b),
  '(1818,3,1815,167)',
  'case 193: fuzz 20261028/139'
);

-- ── case 194: fuzz 20261028/140 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c2-0000-4000-8000-000000000001', 'parity case 194', '2027-02-09', '2027-02-10', false, false, NULL, 15, NULL, '2027-01-22T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000c2-0000-4000-8000-000000000001', 'line', 'USD', 71098, 2, '100000c2-0000-4000-8000-000000000001', false),
  ('300000c2-0000-4000-8000-000000000002', 'line', 'USD', 67749, 5, '100000c2-0000-4000-8000-000000000001', false),
  ('300000c2-0000-4000-8000-000000000003', 'line', 'USD', 14072, 1, '100000c2-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c2-0000-4000-8000-000000000001', '100000c2-0000-4000-8000-000000000001', '2026-11-22', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c2-0000-4000-8000-000000000001', '100000c2-0000-4000-8000-000000000001', '200000c2-0000-4000-8000-000000000001', -117166, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c2-0000-4000-8000-000000000002', '100000c2-0000-4000-8000-000000000001', NULL, 261255, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c2-0000-4000-8000-000000000003', '100000c2-0000-4000-8000-000000000001', NULL, 5352, ' USD ', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000c2-0000-4000-8000-000000000004', '100000c2-0000-4000-8000-000000000001', '200000c2-0000-4000-8000-000000000001', 87513, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c2-0000-4000-8000-000000000005', '100000c2-0000-4000-8000-000000000001', '200000c2-0000-4000-8000-000000000001', 96324, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c2-0000-4000-8000-000000000006', '100000c2-0000-4000-8000-000000000001', NULL, 174191, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c2-0000-4000-8000-000000000001', '2026-12-11') b),
  '(569265,502117,67148,67148)',
  'case 194: fuzz 20261028/140'
);

-- ── case 195: fuzz 20261028/141 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c3-0000-4000-8000-000000000001', 'parity case 195', '2026-11-18', '2026-11-19', false, false, '0ff1ce00-0000-4000-8000-000000000007', 14.975, NULL, '2026-11-14T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000c3-0000-4000-8000-000000000001', 'line', 'CAD', 92093, 4, '100000c3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c3-0000-4000-8000-000000000001', '100000c3-0000-4000-8000-000000000001', NULL, 271543, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c3-0000-4000-8000-000000000001', '2026-12-04') b),
  '(423536,271543,151993,151993)',
  'case 195: fuzz 20261028/141'
);

-- ── case 196: fuzz 20261028/142 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c4-0000-4000-8000-000000000001', 'parity case 196', '2026-11-13', '2026-11-14', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000c4-0000-4000-8000-000000000001', 'line', 'CAD', 128284, 5, '100000c4-0000-4000-8000-000000000001', false),
  ('300000c4-0000-4000-8000-000000000002', 'line', 'CAD', -6656, 5, '100000c4-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c4-0000-4000-8000-000000000001', '100000c4-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 7942),
  ('200000c4-0000-4000-8000-000000000002', '100000c4-0000-4000-8000-000000000001', '2026-11-01', 'CAD', 2058);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c4-0000-4000-8000-000000000001', '2026-11-04') b),
  '(724805,0,724805,724805)',
  'case 196: fuzz 20261028/142'
);

-- ── case 197: fuzz 20261028/143 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c5-0000-4000-8000-000000000001', 'parity case 197', '2026-09-27', '2026-09-28', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 2258, '2026-09-06T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000c5-0000-4000-8000-000000000001', 'line', 'USD', 27944, 1, '100000c5-0000-4000-8000-000000000001', true),
  ('300000c5-0000-4000-8000-000000000002', 'line', 'USD', 34527, 2, '100000c5-0000-4000-8000-000000000001', true),
  ('300000c5-0000-4000-8000-000000000003', 'line', 'USD', 134322, 1, '100000c5-0000-4000-8000-000000000001', false),
  ('300000c5-0000-4000-8000-000000000004', 'line', 'USD', 99848, 5, '100000c5-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c5-0000-4000-8000-000000000001', '100000c5-0000-4000-8000-000000000001', '2027-01-09', 'USD', 444),
  ('200000c5-0000-4000-8000-000000000002', '100000c5-0000-4000-8000-000000000001', '2026-11-03', 'USD', 4844),
  ('200000c5-0000-4000-8000-000000000003', '100000c5-0000-4000-8000-000000000001', '2026-12-18', 'USD', 4712);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c5-0000-4000-8000-000000000001', '100000c5-0000-4000-8000-000000000001', '200000c5-0000-4000-8000-000000000002', 275733, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c5-0000-4000-8000-000000000002', '100000c5-0000-4000-8000-000000000001', NULL, 12983, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c5-0000-4000-8000-000000000001', '2026-11-16') b),
  '(635820,288716,347104,19275)',
  'case 197: fuzz 20261028/143'
);

-- ── case 198: fuzz 20261028/144 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c6-0000-4000-8000-000000000001', 'parity case 198', '2026-09-07', '2026-09-08', false, false, NULL, NULL, NULL, '2026-08-29T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c6-0000-4000-8000-000000000001', '100000c6-0000-4000-8000-000000000001', '2026-10-08', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c6-0000-4000-8000-000000000001', '100000c6-0000-4000-8000-000000000001', '200000c6-0000-4000-8000-000000000001', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000002', '100000c6-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000c6-0000-4000-8000-000000000003', '100000c6-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000004', '100000c6-0000-4000-8000-000000000001', NULL, -2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000005', '100000c6-0000-4000-8000-000000000001', '200000c6-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000006', '100000c6-0000-4000-8000-000000000001', '200000c6-0000-4000-8000-000000000001', -2, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000007', '100000c6-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c6-0000-4000-8000-000000000008', '100000c6-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c6-0000-4000-8000-000000000001', '2026-10-29') b),
  '(0,2,0,0)',
  'case 198: fuzz 20261028/144'
);

-- ── case 199: fuzz 20261028/145 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c7-0000-4000-8000-000000000001', 'parity case 199', '2026-12-01', '2026-12-02', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, 1960, '2026-10-27T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c7-0000-4000-8000-000000000001', '100000c7-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c7-0000-4000-8000-000000000002', '100000c7-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c7-0000-4000-8000-000000000001', '2026-11-30') b),
  '(1960,0,1960,1960)',
  'case 199: fuzz 20261028/145'
);

-- ── case 200: fuzz 20261028/146 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c8-0000-4000-8000-000000000001', 'parity case 200', '2026-09-07', '2026-09-08', false, false, NULL, 14.975, 1760, '2026-07-30T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000c8-0000-4000-8000-000000000001', 'line', 'USD', 8203, 1, '100000c8-0000-4000-8000-000000000001', false),
  ('300000c8-0000-4000-8000-000000000002', 'line', 'USD', 104956, NULL, '100000c8-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c8-0000-4000-8000-000000000001', '100000c8-0000-4000-8000-000000000001', '2026-09-29', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c8-0000-4000-8000-000000000001', '100000c8-0000-4000-8000-000000000001', NULL, 42373, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c8-0000-4000-8000-000000000002', '100000c8-0000-4000-8000-000000000001', '200000c8-0000-4000-8000-000000000001', 40125, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c8-0000-4000-8000-000000000003', '100000c8-0000-4000-8000-000000000001', '200000c8-0000-4000-8000-000000000001', -83080, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c8-0000-4000-8000-000000000004', '100000c8-0000-4000-8000-000000000001', '200000c8-0000-4000-8000-000000000001', 36318, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c8-0000-4000-8000-000000000001', '2026-11-01') b),
  '(114919,-4389,119308,114919)',
  'case 200: fuzz 20261028/146'
);

-- ── case 201: fuzz 20261028/147 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000c9-0000-4000-8000-000000000001', 'parity case 201', '2026-11-06', '2026-11-07', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-10-01T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000c9-0000-4000-8000-000000000001', '100000c9-0000-4000-8000-000000000001', '2026-10-23', 'CAD', 5907),
  ('200000c9-0000-4000-8000-000000000002', '100000c9-0000-4000-8000-000000000001', '2026-10-26', 'CAD', 1628),
  ('200000c9-0000-4000-8000-000000000003', '100000c9-0000-4000-8000-000000000001', '2026-11-28', 'CAD', 1586),
  ('200000c9-0000-4000-8000-000000000004', '100000c9-0000-4000-8000-000000000001', '2026-11-08', 'CAD', 879);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000c9-0000-4000-8000-000000000001', '100000c9-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000002', '100000c9-0000-4000-8000-000000000001', '200000c9-0000-4000-8000-000000000003', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000003', '100000c9-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000004', '100000c9-0000-4000-8000-000000000001', NULL, 2, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000005', '100000c9-0000-4000-8000-000000000001', NULL, 2, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000006', '100000c9-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000c9-0000-4000-8000-000000000007', '100000c9-0000-4000-8000-000000000001', '200000c9-0000-4000-8000-000000000002', 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000c9-0000-4000-8000-000000000001', '2026-12-06') b),
  '(0,4,0,0)',
  'case 201: fuzz 20261028/147'
);

-- ── case 202: fuzz 20261028/148 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ca-0000-4000-8000-000000000001', 'parity case 202', '2026-10-15', '2026-10-16', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-29T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ca-0000-4000-8000-000000000001', '100000ca-0000-4000-8000-000000000001', '2026-10-15', 'CAD', 2731),
  ('200000ca-0000-4000-8000-000000000002', '100000ca-0000-4000-8000-000000000001', '2026-10-09', 'CAD', 7269);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ca-0000-4000-8000-000000000001', '100000ca-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ca-0000-4000-8000-000000000001', '2026-11-19') b),
  '(0,1,0,0)',
  'case 202: fuzz 20261028/148'
);

-- ── case 203: fuzz 20261028/149 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000cb-0000-4000-8000-000000000001', 'parity case 203', '2026-12-03', '2026-12-04', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-10-24T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000cb-0000-4000-8000-000000000001', 'line', 'CAD', 119613, 2, '100000cb-0000-4000-8000-000000000001', false),
  ('300000cb-0000-4000-8000-000000000002', 'line', 'CAD', 148922, 5, '100000cb-0000-4000-8000-000000000001', true),
  ('300000cb-0000-4000-8000-000000000003', 'line', 'CAD', 108664, NULL, '100000cb-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000cb-0000-4000-8000-000000000001', '100000cb-0000-4000-8000-000000000001', '2026-09-29', 'CAD', 5012),
  ('200000cb-0000-4000-8000-000000000002', '100000cb-0000-4000-8000-000000000001', '2026-10-14', 'CAD', 2430),
  ('200000cb-0000-4000-8000-000000000003', '100000cb-0000-4000-8000-000000000001', '2026-08-21', 'CAD', 37),
  ('200000cb-0000-4000-8000-000000000004', '100000cb-0000-4000-8000-000000000001', '2026-10-10', 'CAD', 965),
  ('200000cb-0000-4000-8000-000000000005', '100000cb-0000-4000-8000-000000000001', '2026-09-06', 'CAD', 1556);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000cb-0000-4000-8000-000000000001', '100000cb-0000-4000-8000-000000000001', NULL, -60522, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000cb-0000-4000-8000-000000000002', '100000cb-0000-4000-8000-000000000001', NULL, 264329, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000cb-0000-4000-8000-000000000001', '2026-10-19') b),
  '(347890,203807,144083,144083)',
  'case 203: fuzz 20261028/149'
);

-- ── case 204: fuzz 20261028/150 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000cc-0000-4000-8000-000000000001', 'parity case 204', '2026-11-22', '2026-11-23', false, false, '0ff1ce00-0000-4000-8000-000000000002', 0, NULL, '2026-10-17T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000cc-0000-4000-8000-000000000001', 'line', 'CAD', 70750, 1, '100000cc-0000-4000-8000-000000000001', false),
  ('300000cc-0000-4000-8000-000000000002', 'line', 'CAD', 138804, 5, '100000cc-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000cc-0000-4000-8000-000000000001', '100000cc-0000-4000-8000-000000000001', '2026-10-02', 'CAD', 1348),
  ('200000cc-0000-4000-8000-000000000002', '100000cc-0000-4000-8000-000000000001', '2026-12-31', 'CAD', 3074),
  ('200000cc-0000-4000-8000-000000000003', '100000cc-0000-4000-8000-000000000001', '2026-12-17', 'CAD', 3211),
  ('200000cc-0000-4000-8000-000000000004', '100000cc-0000-4000-8000-000000000001', '2026-09-30', 'CAD', 2367);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000cc-0000-4000-8000-000000000001', '100000cc-0000-4000-8000-000000000001', NULL, 83739, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000cc-0000-4000-8000-000000000002', '100000cc-0000-4000-8000-000000000001', '200000cc-0000-4000-8000-000000000003', 100151, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000cc-0000-4000-8000-000000000001', '2026-11-03') b),
  '(764770,0,764770,284112)',
  'case 204: fuzz 20261028/150'
);

-- ── case 205: fuzz 20261028/151 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000cd-0000-4000-8000-000000000001', 'parity case 205', '2026-12-31', '2027-01-01', false, false, NULL, 7.5, 2026, '2026-11-23T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000cd-0000-4000-8000-000000000001', 'line', 'USD', 5265, 5, '100000cd-0000-4000-8000-000000000001', false),
  ('300000cd-0000-4000-8000-000000000002', 'line', 'USD', 11813, 2, '100000cd-0000-4000-8000-000000000001', false),
  ('300000cd-0000-4000-8000-000000000003', 'line', 'USD', 120600, 1, '100000cd-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000cd-0000-4000-8000-000000000001', '100000cd-0000-4000-8000-000000000001', '2026-11-07', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000cd-0000-4000-8000-000000000001', '100000cd-0000-4000-8000-000000000001', NULL, 59657, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000cd-0000-4000-8000-000000000002', '100000cd-0000-4000-8000-000000000001', NULL, 96792, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000cd-0000-4000-8000-000000000001', '2026-11-05') b),
  '(172577,0,172577,0)',
  'case 205: fuzz 20261028/151'
);

-- ── case 206: fuzz 20261028/152 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ce-0000-4000-8000-000000000001', 'parity case 206', '2026-09-23', '2026-09-24', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-09-17T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ce-0000-4000-8000-000000000001', 'line', 'CAD', 124144, 5, '100000ce-0000-4000-8000-000000000001', false),
  ('300000ce-0000-4000-8000-000000000002', 'line', 'CAD', 50315, 4, '100000ce-0000-4000-8000-000000000001', false),
  ('300000ce-0000-4000-8000-000000000003', 'line', 'CAD', 96697, NULL, '100000ce-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ce-0000-4000-8000-000000000001', '100000ce-0000-4000-8000-000000000001', '2026-11-23', 'CAD', 206),
  ('200000ce-0000-4000-8000-000000000002', '100000ce-0000-4000-8000-000000000001', '2026-10-07', 'CAD', 2381),
  ('200000ce-0000-4000-8000-000000000003', '100000ce-0000-4000-8000-000000000001', '2026-10-31', 'CAD', 6222),
  ('200000ce-0000-4000-8000-000000000004', '100000ce-0000-4000-8000-000000000001', '2026-12-13', 'CAD', 1191);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ce-0000-4000-8000-000000000001', '100000ce-0000-4000-8000-000000000001', '200000ce-0000-4000-8000-000000000003', -86528, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ce-0000-4000-8000-000000000002', '100000ce-0000-4000-8000-000000000001', '200000ce-0000-4000-8000-000000000003', 265815, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ce-0000-4000-8000-000000000003', '100000ce-0000-4000-8000-000000000001', NULL, 265431, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ce-0000-4000-8000-000000000001', '2026-11-18') b),
  '(918677,444718,473959,345620)',
  'case 206: fuzz 20261028/152'
);

-- ── case 207: fuzz 20261028/153 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000cf-0000-4000-8000-000000000001', 'parity case 207', '2027-01-22', '2027-01-23', false, false, '0ff1ce00-0000-4000-8000-000000000004', 15, NULL, '2027-01-14T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000cf-0000-4000-8000-000000000001', 'line', 'USD', 89475, 4, '100000cf-0000-4000-8000-000000000001', false),
  ('300000cf-0000-4000-8000-000000000002', 'line', 'USD', 140588, 1, '100000cf-0000-4000-8000-000000000001', false),
  ('300000cf-0000-4000-8000-000000000003', 'line', 'USD', 106294, NULL, '100000cf-0000-4000-8000-000000000001', false),
  ('300000cf-0000-4000-8000-000000000004', 'line', 'USD', 132222, 5, '100000cf-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000cf-0000-4000-8000-000000000001', '100000cf-0000-4000-8000-000000000001', '2027-01-03', 'USD', 4386),
  ('200000cf-0000-4000-8000-000000000002', '100000cf-0000-4000-8000-000000000001', '2026-10-09', 'USD', 5614);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000cf-0000-4000-8000-000000000001', '100000cf-0000-4000-8000-000000000001', NULL, 126855, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000cf-0000-4000-8000-000000000002', '100000cf-0000-4000-8000-000000000001', NULL, -251345, 'USD', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000cf-0000-4000-8000-000000000001', '2026-11-24') b),
  '(1455776,0,1455776,817273)',
  'case 207: fuzz 20261028/153'
);

-- ── case 208: fuzz 20261028/154 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d0-0000-4000-8000-000000000001', 'parity case 208', '2026-11-09', '2026-11-10', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-13T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d0-0000-4000-8000-000000000001', 'line', 'CAD', 117480, 5, '100000d0-0000-4000-8000-000000000001', false),
  ('300000d0-0000-4000-8000-000000000002', 'line', 'CAD', 15453, 1, '100000d0-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d0-0000-4000-8000-000000000001', '100000d0-0000-4000-8000-000000000001', '2026-12-19', 'CAD', 1985),
  ('200000d0-0000-4000-8000-000000000002', '100000d0-0000-4000-8000-000000000001', '2026-12-19', 'CAD', 990),
  ('200000d0-0000-4000-8000-000000000003', '100000d0-0000-4000-8000-000000000001', '2027-01-27', 'CAD', 3762),
  ('200000d0-0000-4000-8000-000000000004', '100000d0-0000-4000-8000-000000000001', '2026-10-12', 'CAD', 3263);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d0-0000-4000-8000-000000000001', '100000d0-0000-4000-8000-000000000001', '200000d0-0000-4000-8000-000000000004', 217758, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d0-0000-4000-8000-000000000002', '100000d0-0000-4000-8000-000000000001', NULL, -8421, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d0-0000-4000-8000-000000000003', '100000d0-0000-4000-8000-000000000001', NULL, 172961, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d0-0000-4000-8000-000000000004', '100000d0-0000-4000-8000-000000000001', '200000d0-0000-4000-8000-000000000002', -38632, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d0-0000-4000-8000-000000000001', '2026-12-08') b),
  '(602853,164540,438313,32171)',
  'case 208: fuzz 20261028/154'
);

-- ── case 209: fuzz 20261028/155 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d1-0000-4000-8000-000000000001', 'parity case 209', '2026-10-29', '2026-10-30', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-10-17T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d1-0000-4000-8000-000000000001', 'line', 'CAD', 99116, 1, '100000d1-0000-4000-8000-000000000001', false),
  ('300000d1-0000-4000-8000-000000000002', 'line', 'CAD', 94165, 5, '100000d1-0000-4000-8000-000000000001', true),
  ('300000d1-0000-4000-8000-000000000003', 'line', 'CAD', 80375, 5, '100000d1-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d1-0000-4000-8000-000000000001', '100000d1-0000-4000-8000-000000000001', NULL, 30426, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d1-0000-4000-8000-000000000002', '100000d1-0000-4000-8000-000000000001', NULL, 114796, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000d1-0000-4000-8000-000000000003', '100000d1-0000-4000-8000-000000000001', NULL, -107571, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d1-0000-4000-8000-000000000004', '100000d1-0000-4000-8000-000000000001', NULL, -208562, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d1-0000-4000-8000-000000000005', '100000d1-0000-4000-8000-000000000001', NULL, 236207, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d1-0000-4000-8000-000000000006', '100000d1-0000-4000-8000-000000000001', NULL, 23971, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d1-0000-4000-8000-000000000001', '2026-11-27') b),
  '(538565,-285707,824272,824272)',
  'case 209: fuzz 20261028/155'
);

-- ── case 210: fuzz 20261028/156 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d2-0000-4000-8000-000000000001', 'parity case 210', '2026-12-21', '2026-12-22', false, false, '0ff1ce00-0000-4000-8000-000000000007', 7.5, NULL, '2026-11-21T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d2-0000-4000-8000-000000000001', 'line', 'CAD', 22095, 4, '100000d2-0000-4000-8000-000000000001', false),
  ('300000d2-0000-4000-8000-000000000002', 'line', 'CAD', 129930, 4, '100000d2-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d2-0000-4000-8000-000000000001', '100000d2-0000-4000-8000-000000000001', '2026-12-23', 'CAD', 413),
  ('200000d2-0000-4000-8000-000000000002', '100000d2-0000-4000-8000-000000000001', '2026-12-02', 'CAD', 1819),
  ('200000d2-0000-4000-8000-000000000003', '100000d2-0000-4000-8000-000000000001', '2027-01-14', 'CAD', 6536),
  ('200000d2-0000-4000-8000-000000000004', '100000d2-0000-4000-8000-000000000001', '2027-01-06', 'CAD', 1232);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d2-0000-4000-8000-000000000001', '2026-12-05') b),
  '(653708,0,653708,118909)',
  'case 210: fuzz 20261028/156'
);

-- ── case 211: fuzz 20261028/157 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d3-0000-4000-8000-000000000001', 'parity case 211', '2026-10-21', '2026-10-22', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-15T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d3-0000-4000-8000-000000000001', 'line', 'CAD', 122962, 5, '100000d3-0000-4000-8000-000000000001', true),
  ('300000d3-0000-4000-8000-000000000002', 'line', 'CAD', 134200, 5, '100000d3-0000-4000-8000-000000000001', true),
  ('300000d3-0000-4000-8000-000000000003', 'line', 'CAD', 61850, 5, '100000d3-0000-4000-8000-000000000001', false),
  ('300000d3-0000-4000-8000-000000000004', 'line', 'CAD', 70326, 5, '100000d3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d3-0000-4000-8000-000000000001', '100000d3-0000-4000-8000-000000000001', NULL, 166051, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d3-0000-4000-8000-000000000002', '100000d3-0000-4000-8000-000000000001', NULL, 15695, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d3-0000-4000-8000-000000000003', '100000d3-0000-4000-8000-000000000001', NULL, 229228, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d3-0000-4000-8000-000000000004', '100000d3-0000-4000-8000-000000000001', NULL, -282694, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d3-0000-4000-8000-000000000005', '100000d3-0000-4000-8000-000000000001', NULL, 249091, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d3-0000-4000-8000-000000000006', '100000d3-0000-4000-8000-000000000001', NULL, 184406, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d3-0000-4000-8000-000000000001', '2026-11-13') b),
  '(660880,828776,0,0)',
  'case 211: fuzz 20261028/157'
);

-- ── case 212: fuzz 20261028/158 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d4-0000-4000-8000-000000000001', 'parity case 212', '2026-10-30', '2026-10-31', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, 255, '2026-10-18T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d4-0000-4000-8000-000000000001', 'line', 'CAD', -9585, 2, '100000d4-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d4-0000-4000-8000-000000000001', '100000d4-0000-4000-8000-000000000001', '2026-11-06', 'CAD', 1821),
  ('200000d4-0000-4000-8000-000000000002', '100000d4-0000-4000-8000-000000000001', '2026-09-12', 'CAD', 1711),
  ('200000d4-0000-4000-8000-000000000003', '100000d4-0000-4000-8000-000000000001', '2026-11-04', 'CAD', 360),
  ('200000d4-0000-4000-8000-000000000004', '100000d4-0000-4000-8000-000000000001', '2026-12-11', 'CAD', 5029),
  ('200000d4-0000-4000-8000-000000000005', '100000d4-0000-4000-8000-000000000001', '2026-12-11', 'CAD', 1079);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d4-0000-4000-8000-000000000001', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000002', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000002', '100000d4-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000003', '100000d4-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000004', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000001', -1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000005', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000002', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000006', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000003', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000007', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000005', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d4-0000-4000-8000-000000000008', '100000d4-0000-4000-8000-000000000001', '200000d4-0000-4000-8000-000000000002', -1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d4-0000-4000-8000-000000000001', '2026-11-07') b),
  '(0,6,0,0)',
  'case 212: fuzz 20261028/158'
);

-- ── case 213: fuzz 20261028/159 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d5-0000-4000-8000-000000000001', 'parity case 213', '2026-11-04', '2026-11-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, 1334, '2026-10-12T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d5-0000-4000-8000-000000000001', 'line', 'CAD', 193, NULL, '100000d5-0000-4000-8000-000000000001', false),
  ('300000d5-0000-4000-8000-000000000002', 'line', 'CAD', 104212, 5, '100000d5-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d5-0000-4000-8000-000000000001', '100000d5-0000-4000-8000-000000000001', '2026-11-27', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d5-0000-4000-8000-000000000001', '100000d5-0000-4000-8000-000000000001', NULL, 22899, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d5-0000-4000-8000-000000000002', '100000d5-0000-4000-8000-000000000001', '200000d5-0000-4000-8000-000000000001', -44364, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d5-0000-4000-8000-000000000003', '100000d5-0000-4000-8000-000000000001', '200000d5-0000-4000-8000-000000000001', 59944, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d5-0000-4000-8000-000000000004', '100000d5-0000-4000-8000-000000000001', '200000d5-0000-4000-8000-000000000001', -183022, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d5-0000-4000-8000-000000000001', '2026-11-13') b),
  '(522587,82843,439744,0)',
  'case 213: fuzz 20261028/159'
);

-- ── case 214: fuzz 20261028/160 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d6-0000-4000-8000-000000000001', 'parity case 214', '2026-12-01', '2026-12-02', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-24T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000d6-0000-4000-8000-000000000001', 'parity case 214 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000d6-0000-4000-8000-000000000001', '500000d6-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d6-0000-4000-8000-000000000001', 'line', 'CAD', -4394, 4, '100000d6-0000-4000-8000-000000000001', true),
  ('300000d6-0000-4000-8000-000000000002', 'line', 'CAD', -1649, 3, '100000d6-0000-4000-8000-000000000001', false),
  ('300000d6-0000-4000-8000-000000000003', 'line', 'CAD', 30636, 2, '100000d6-0000-4000-8000-000000000001', false),
  ('300000d6-0000-4000-8000-000000000004', 'line', 'CAD', -12066, 2, '100000d6-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d6-0000-4000-8000-000000000001', '100000d6-0000-4000-8000-000000000001', '2027-02-07', 'CAD', 3856),
  ('200000d6-0000-4000-8000-000000000002', '100000d6-0000-4000-8000-000000000001', '2026-11-30', 'CAD', 4969),
  ('200000d6-0000-4000-8000-000000000003', '100000d6-0000-4000-8000-000000000001', '2027-01-28', 'CAD', 5642),
  ('200000d6-0000-4000-8000-000000000004', '100000d6-0000-4000-8000-000000000001', '2026-11-03', 'CAD', 114),
  ('200000d6-0000-4000-8000-000000000005', '100000d6-0000-4000-8000-000000000001', '2026-11-05', 'CAD', 4750);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d6-0000-4000-8000-000000000001', '100000d6-0000-4000-8000-000000000001', '200000d6-0000-4000-8000-000000000001', 25788, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000002', '100000d6-0000-4000-8000-000000000001', '200000d6-0000-4000-8000-000000000001', 13467, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000003', '100000d6-0000-4000-8000-000000000001', '200000d6-0000-4000-8000-000000000004', 28977, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000004', '100000d6-0000-4000-8000-000000000001', NULL, 4885, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000005', '100000d6-0000-4000-8000-000000000001', NULL, 23250, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000006', '100000d6-0000-4000-8000-000000000001', NULL, 17814, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000007', '100000d6-0000-4000-8000-000000000001', '200000d6-0000-4000-8000-000000000004', 457, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d6-0000-4000-8000-000000000008', '100000d6-0000-4000-8000-000000000001', '600000d6-0000-4000-8000-000000000001', -18517, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d6-0000-4000-8000-000000000001', '2026-12-10') b),
  '(32193,77921,0,0)',
  'case 214: fuzz 20261028/160'
);

-- ── case 215: fuzz 20261028/161 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d7-0000-4000-8000-000000000001', 'parity case 215', '2027-01-13', '2027-01-14', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-12-10T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d7-0000-4000-8000-000000000001', 'line', 'CAD', -42495, 4, '100000d7-0000-4000-8000-000000000001', false),
  ('300000d7-0000-4000-8000-000000000002', 'line', 'CAD', 85248, 4, '100000d7-0000-4000-8000-000000000001', false),
  ('300000d7-0000-4000-8000-000000000003', 'line', 'CAD', -39728, 1, '100000d7-0000-4000-8000-000000000001', false),
  ('300000d7-0000-4000-8000-000000000004', 'line', 'CAD', 137963, 5, '100000d7-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000d7-0000-4000-8000-000000000001', '100000d7-0000-4000-8000-000000000001', '2026-10-16', 'CAD', 8044),
  ('200000d7-0000-4000-8000-000000000002', '100000d7-0000-4000-8000-000000000001', '2026-12-05', 'CAD', 105),
  ('200000d7-0000-4000-8000-000000000003', '100000d7-0000-4000-8000-000000000001', '2026-11-11', 'CAD', 1851);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d7-0000-4000-8000-000000000001', '100000d7-0000-4000-8000-000000000001', NULL, 82525, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d7-0000-4000-8000-000000000002', '100000d7-0000-4000-8000-000000000001', NULL, -191000, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d7-0000-4000-8000-000000000003', '100000d7-0000-4000-8000-000000000001', '200000d7-0000-4000-8000-000000000003', -198679, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d7-0000-4000-8000-000000000001', '2026-12-11') b),
  '(821099,-307154,1128253,821099)',
  'case 215: fuzz 20261028/161'
);

-- ── case 216: fuzz 20261028/162 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d8-0000-4000-8000-000000000001', 'parity case 216', '2027-01-22', '2027-01-23', false, false, '0ff1ce00-0000-4000-8000-000000000008', 14.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000d8-0000-4000-8000-000000000001', 'line', 'USD', 36651, 1, '100000d8-0000-4000-8000-000000000001', true),
  ('300000d8-0000-4000-8000-000000000002', 'line', 'USD', 110712, 5, '100000d8-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d8-0000-4000-8000-000000000001', '100000d8-0000-4000-8000-000000000001', NULL, 122390, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000d8-0000-4000-8000-000000000002', '100000d8-0000-4000-8000-000000000001', NULL, -13061, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000d8-0000-4000-8000-000000000003', '100000d8-0000-4000-8000-000000000001', NULL, 57736, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d8-0000-4000-8000-000000000004', '100000d8-0000-4000-8000-000000000001', NULL, -136523, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d8-0000-4000-8000-000000000005', '100000d8-0000-4000-8000-000000000001', NULL, -268595, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d8-0000-4000-8000-000000000006', '100000d8-0000-4000-8000-000000000001', NULL, 287984, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d8-0000-4000-8000-000000000007', '100000d8-0000-4000-8000-000000000001', NULL, 298902, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d8-0000-4000-8000-000000000001', '2026-11-26') b),
  '(636456,-117134,753590,0)',
  'case 216: fuzz 20261028/162'
);

-- ── case 217: fuzz 20261028/163 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000d9-0000-4000-8000-000000000001', 'parity case 217', '2026-12-09', '2026-12-10', false, false, NULL, 0, NULL, '2026-11-01T23:45:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000d9-0000-4000-8000-000000000001', '100000d9-0000-4000-8000-000000000001', NULL, 2, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d9-0000-4000-8000-000000000002', '100000d9-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000d9-0000-4000-8000-000000000003', '100000d9-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000d9-0000-4000-8000-000000000001', '2026-11-08') b),
  '(0,2,0,0)',
  'case 217: fuzz 20261028/163'
);

-- ── case 218: fuzz 20261028/164 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000da-0000-4000-8000-000000000001', 'parity case 218', '2027-01-04', '2027-01-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-30T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000da-0000-4000-8000-000000000001', 'line', 'CAD', 136768, 4, '100000da-0000-4000-8000-000000000001', false),
  ('300000da-0000-4000-8000-000000000002', 'line', 'CAD', 132713, 2, '100000da-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000da-0000-4000-8000-000000000001', '100000da-0000-4000-8000-000000000001', '2026-09-26', 'CAD', 4345),
  ('200000da-0000-4000-8000-000000000002', '100000da-0000-4000-8000-000000000001', '2026-11-20', 'CAD', 3109),
  ('200000da-0000-4000-8000-000000000003', '100000da-0000-4000-8000-000000000001', '2026-10-30', 'CAD', 2546);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000da-0000-4000-8000-000000000001', '100000da-0000-4000-8000-000000000001', NULL, 256433, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000da-0000-4000-8000-000000000001', '2026-11-22') b),
  '(812498,256433,556065,556065)',
  'case 218: fuzz 20261028/164'
);

-- ── case 219: fuzz 20261028/165 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000db-0000-4000-8000-000000000001', 'parity case 219', '2026-12-09', '2026-12-10', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-03T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000db-0000-4000-8000-000000000001', 'line', 'CAD', 132228, NULL, '100000db-0000-4000-8000-000000000001', false),
  ('300000db-0000-4000-8000-000000000002', 'line', 'CAD', 128570, 4, '100000db-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000db-0000-4000-8000-000000000001', '100000db-0000-4000-8000-000000000001', '2027-01-03', 'CAD', 3737),
  ('200000db-0000-4000-8000-000000000002', '100000db-0000-4000-8000-000000000001', '2026-10-15', 'CAD', 584);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000db-0000-4000-8000-000000000001', '100000db-0000-4000-8000-000000000001', NULL, 297662, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000db-0000-4000-8000-000000000002', '100000db-0000-4000-8000-000000000001', '200000db-0000-4000-8000-000000000001', 274841, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000db-0000-4000-8000-000000000003', '100000db-0000-4000-8000-000000000001', '200000db-0000-4000-8000-000000000001', 106764, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000db-0000-4000-8000-000000000004', '100000db-0000-4000-8000-000000000001', NULL, 253663, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000db-0000-4000-8000-000000000005', '100000db-0000-4000-8000-000000000001', '200000db-0000-4000-8000-000000000002', 22881, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000db-0000-4000-8000-000000000006', '100000db-0000-4000-8000-000000000001', '200000db-0000-4000-8000-000000000002', 225835, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000db-0000-4000-8000-000000000001', '2026-11-16') b),
  '(646508,630321,16187,0)',
  'case 219: fuzz 20261028/165'
);

-- ── case 220: fuzz 20261028/166 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000dc-0000-4000-8000-000000000001', 'parity case 220', '2026-10-07', '2026-10-08', false, false, NULL, NULL, NULL, '2026-08-30T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000dc-0000-4000-8000-000000000001', 'line', 'USD', 133978, 4, '100000dc-0000-4000-8000-000000000001', false),
  ('300000dc-0000-4000-8000-000000000002', 'line', 'USD', 45423, 4, '100000dc-0000-4000-8000-000000000001', true),
  ('300000dc-0000-4000-8000-000000000003', 'line', 'USD', 94128, 3, '100000dc-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000dc-0000-4000-8000-000000000001', '100000dc-0000-4000-8000-000000000001', '2026-11-26', 'USD', 1191),
  ('200000dc-0000-4000-8000-000000000002', '100000dc-0000-4000-8000-000000000001', '2026-10-17', 'USD', 3030),
  ('200000dc-0000-4000-8000-000000000003', '100000dc-0000-4000-8000-000000000001', '2026-11-13', 'USD', 1631),
  ('200000dc-0000-4000-8000-000000000004', '100000dc-0000-4000-8000-000000000001', '2026-10-23', 'USD', 3544),
  ('200000dc-0000-4000-8000-000000000005', '100000dc-0000-4000-8000-000000000001', '2026-10-14', 'USD', 604);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000dc-0000-4000-8000-000000000001', '100000dc-0000-4000-8000-000000000001', NULL, 97725, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000dc-0000-4000-8000-000000000001', '2026-10-30') b),
  '(535912,97725,438187,286953)',
  'case 220: fuzz 20261028/166'
);

-- ── case 221: fuzz 20261028/167 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000dd-0000-4000-8000-000000000001', 'parity case 221', '2026-09-28', '2026-09-29', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-28T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000dd-0000-4000-8000-000000000001', 'line', 'CAD', 37530, 4, '100000dd-0000-4000-8000-000000000001', false),
  ('300000dd-0000-4000-8000-000000000002', 'line', 'CAD', 62632, 4, '100000dd-0000-4000-8000-000000000001', false),
  ('300000dd-0000-4000-8000-000000000003', 'line', 'CAD', -8524, 5, '100000dd-0000-4000-8000-000000000001', false),
  ('300000dd-0000-4000-8000-000000000004', 'line', 'CAD', 65278, 5, '100000dd-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000dd-0000-4000-8000-000000000001', '100000dd-0000-4000-8000-000000000001', NULL, 124840, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000002', '100000dd-0000-4000-8000-000000000001', NULL, 6732, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000003', '100000dd-0000-4000-8000-000000000001', NULL, -227909, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000004', '100000dd-0000-4000-8000-000000000001', NULL, 59006, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000005', '100000dd-0000-4000-8000-000000000001', NULL, 189030, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000006', '100000dd-0000-4000-8000-000000000001', NULL, 42097, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000007', '100000dd-0000-4000-8000-000000000001', NULL, 207286, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000dd-0000-4000-8000-000000000008', '100000dd-0000-4000-8000-000000000001', NULL, -122525, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000dd-0000-4000-8000-000000000001', '2026-11-05') b),
  '(684418,355967,328451,328451)',
  'case 221: fuzz 20261028/167'
);

-- ── case 222: fuzz 20261028/168 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000de-0000-4000-8000-000000000001', 'parity case 222', '2026-11-15', '2026-11-16', false, false, NULL, NULL, NULL, '2026-10-30T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000de-0000-4000-8000-000000000001', 'line', 'USD', 64883, 2, '100000de-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000de-0000-4000-8000-000000000001', '100000de-0000-4000-8000-000000000001', NULL, 127988, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000de-0000-4000-8000-000000000002', '100000de-0000-4000-8000-000000000001', NULL, -92963, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000de-0000-4000-8000-000000000003', '100000de-0000-4000-8000-000000000001', NULL, 82933, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000de-0000-4000-8000-000000000004', '100000de-0000-4000-8000-000000000001', NULL, 117281, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000de-0000-4000-8000-000000000005', '100000de-0000-4000-8000-000000000001', NULL, 28249, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000de-0000-4000-8000-000000000006', '100000de-0000-4000-8000-000000000001', NULL, 54238, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000de-0000-4000-8000-000000000007', '100000de-0000-4000-8000-000000000001', NULL, -18826, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000de-0000-4000-8000-000000000001', '2026-11-26') b),
  '(129766,59730,70036,70036)',
  'case 222: fuzz 20261028/168'
);

-- ── case 223: fuzz 20261028/169 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000df-0000-4000-8000-000000000001', 'parity case 223', '2026-11-08', '2026-11-09', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, NULL, '2026-10-27T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000df-0000-4000-8000-000000000001', 'line', 'CAD', 59982, 1, '100000df-0000-4000-8000-000000000001', false),
  ('300000df-0000-4000-8000-000000000002', 'line', 'CAD', 23779, 2, '100000df-0000-4000-8000-000000000001', false),
  ('300000df-0000-4000-8000-000000000003', 'line', 'CAD', 101110, 3, '100000df-0000-4000-8000-000000000001', false),
  ('300000df-0000-4000-8000-000000000004', 'line', 'CAD', 146506, 1, '100000df-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000df-0000-4000-8000-000000000001', '100000df-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 8558),
  ('200000df-0000-4000-8000-000000000002', '100000df-0000-4000-8000-000000000001', '2026-10-15', 'CAD', 1442);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000df-0000-4000-8000-000000000001', '100000df-0000-4000-8000-000000000001', NULL, 101132, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000df-0000-4000-8000-000000000001', '2026-12-03') b),
  '(629835,0,629835,629835)',
  'case 223: fuzz 20261028/169'
);

-- ── case 224: fuzz 20261028/170 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e0-0000-4000-8000-000000000001', 'parity case 224', '2026-09-13', '2026-09-14', false, false, '0ff1ce00-0000-4000-8000-000000000008', 13, NULL, '2026-08-13T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e0-0000-4000-8000-000000000001', 'line', 'USD', -5308, 5, '100000e0-0000-4000-8000-000000000001', false),
  ('300000e0-0000-4000-8000-000000000002', 'line', 'USD', 105435, NULL, '100000e0-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e0-0000-4000-8000-000000000001', '100000e0-0000-4000-8000-000000000001', NULL, -25715, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e0-0000-4000-8000-000000000002', '100000e0-0000-4000-8000-000000000001', NULL, -62456, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e0-0000-4000-8000-000000000001', '2026-11-05') b),
  '(89151,-62456,151607,151607)',
  'case 224: fuzz 20261028/170'
);

-- ── case 225: fuzz 20261028/171 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e1-0000-4000-8000-000000000001', 'parity case 225', '2027-01-03', '2027-01-04', false, false, NULL, 0, NULL, '2026-12-09T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e1-0000-4000-8000-000000000001', 'line', 'USD', 75643, NULL, '100000e1-0000-4000-8000-000000000001', false),
  ('300000e1-0000-4000-8000-000000000002', 'line', 'USD', 27441, 3, '100000e1-0000-4000-8000-000000000001', true),
  ('300000e1-0000-4000-8000-000000000003', 'line', 'USD', 84629, 2, '100000e1-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e1-0000-4000-8000-000000000001', '100000e1-0000-4000-8000-000000000001', '2026-09-16', 'USD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e1-0000-4000-8000-000000000001', '2026-11-08') b),
  '(244901,0,244901,244901)',
  'case 225: fuzz 20261028/171'
);

-- ── case 226: fuzz 20261028/172 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e2-0000-4000-8000-000000000001', 'parity case 226', '2026-09-01', '2026-09-02', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e2-0000-4000-8000-000000000001', '100000e2-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e2-0000-4000-8000-000000000002', '100000e2-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e2-0000-4000-8000-000000000001', '2026-10-27') b),
  '(0,2,0,0)',
  'case 226: fuzz 20261028/172'
);

-- ── case 227: fuzz 20261028/173 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e3-0000-4000-8000-000000000001', 'parity case 227', '2026-11-05', '2026-11-06', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-26T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e3-0000-4000-8000-000000000001', 'line', 'CAD', 128906, 4, '100000e3-0000-4000-8000-000000000001', false),
  ('300000e3-0000-4000-8000-000000000002', 'line', 'CAD', 147643, 1, '100000e3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e3-0000-4000-8000-000000000001', '100000e3-0000-4000-8000-000000000001', '2026-11-20', 'CAD', 550),
  ('200000e3-0000-4000-8000-000000000002', '100000e3-0000-4000-8000-000000000001', '2027-01-29', 'CAD', 9450);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e3-0000-4000-8000-000000000001', '100000e3-0000-4000-8000-000000000001', NULL, 41811, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e3-0000-4000-8000-000000000002', '100000e3-0000-4000-8000-000000000001', NULL, 263976, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000e3-0000-4000-8000-000000000003', '100000e3-0000-4000-8000-000000000001', '200000e3-0000-4000-8000-000000000002', 110175, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e3-0000-4000-8000-000000000001', '2026-12-07') b),
  '(663267,110175,553092,36480)',
  'case 227: fuzz 20261028/173'
);

-- ── case 228: fuzz 20261028/174 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e4-0000-4000-8000-000000000001', 'parity case 228', '2026-11-08', '2026-11-09', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e4-0000-4000-8000-000000000001', 'line', 'CAD', 855, 1, '100000e4-0000-4000-8000-000000000001', false),
  ('300000e4-0000-4000-8000-000000000002', 'line', 'CAD', 28260, 2, '100000e4-0000-4000-8000-000000000001', false),
  ('300000e4-0000-4000-8000-000000000003', 'line', 'CAD', 12530, 2, '100000e4-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e4-0000-4000-8000-000000000001', '100000e4-0000-4000-8000-000000000001', '2027-01-11', 'CAD', 1303),
  ('200000e4-0000-4000-8000-000000000002', '100000e4-0000-4000-8000-000000000001', '2026-09-30', 'CAD', 4248),
  ('200000e4-0000-4000-8000-000000000003', '100000e4-0000-4000-8000-000000000001', '2026-09-21', 'CAD', 1621);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e4-0000-4000-8000-000000000001', '100000e4-0000-4000-8000-000000000001', NULL, 48285, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000002', '100000e4-0000-4000-8000-000000000001', '200000e4-0000-4000-8000-000000000002', 948, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000003', '100000e4-0000-4000-8000-000000000001', NULL, 45129, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000004', '100000e4-0000-4000-8000-000000000001', '200000e4-0000-4000-8000-000000000001', 55924, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000005', '100000e4-0000-4000-8000-000000000001', NULL, 74812, ' CAD ', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000e4-0000-4000-8000-000000000006', '100000e4-0000-4000-8000-000000000001', NULL, -38791, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000007', '100000e4-0000-4000-8000-000000000001', NULL, 40036, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e4-0000-4000-8000-000000000008', '100000e4-0000-4000-8000-000000000001', NULL, -13484, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e4-0000-4000-8000-000000000001', '2026-11-19') b),
  '(82435,176838,0,0)',
  'case 228: fuzz 20261028/174'
);

-- ── case 229: fuzz 20261028/175 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e5-0000-4000-8000-000000000001', 'parity case 229', '2026-11-02', '2026-11-03', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-13T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000e5-0000-4000-8000-000000000001', 'parity case 229 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000e5-0000-4000-8000-000000000001', '500000e5-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e5-0000-4000-8000-000000000001', '100000e5-0000-4000-8000-000000000001', '2026-10-07', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e5-0000-4000-8000-000000000001', '100000e5-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e5-0000-4000-8000-000000000002', '100000e5-0000-4000-8000-000000000001', '200000e5-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e5-0000-4000-8000-000000000003', '100000e5-0000-4000-8000-000000000001', '600000e5-0000-4000-8000-000000000001', 2, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e5-0000-4000-8000-000000000004', '100000e5-0000-4000-8000-000000000001', NULL, 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e5-0000-4000-8000-000000000005', '100000e5-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e5-0000-4000-8000-000000000001', '2026-11-01') b),
  '(0,2,0,0)',
  'case 229: fuzz 20261028/175'
);

-- ── case 230: fuzz 20261028/176 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e6-0000-4000-8000-000000000001', 'parity case 230', '2026-11-23', '2026-11-24', false, false, NULL, NULL, 773, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000e6-0000-4000-8000-000000000001', 'parity case 230 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000e6-0000-4000-8000-000000000001', '500000e6-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e6-0000-4000-8000-000000000001', 'line', 'USD', 56315, 5, '100000e6-0000-4000-8000-000000000001', false),
  ('300000e6-0000-4000-8000-000000000002', 'line', 'USD', 12520, 5, '100000e6-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e6-0000-4000-8000-000000000001', '100000e6-0000-4000-8000-000000000001', '2026-11-27', 'USD', 1680),
  ('200000e6-0000-4000-8000-000000000002', '100000e6-0000-4000-8000-000000000001', '2026-12-02', 'USD', 3732),
  ('200000e6-0000-4000-8000-000000000003', '100000e6-0000-4000-8000-000000000001', '2027-01-18', 'USD', 3344),
  ('200000e6-0000-4000-8000-000000000004', '100000e6-0000-4000-8000-000000000001', '2026-10-15', 'USD', 377),
  ('200000e6-0000-4000-8000-000000000005', '100000e6-0000-4000-8000-000000000001', '2027-01-21', 'USD', 867);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e6-0000-4000-8000-000000000001', '100000e6-0000-4000-8000-000000000001', '600000e6-0000-4000-8000-000000000001', 146275, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000002', '100000e6-0000-4000-8000-000000000001', NULL, 186071, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000003', '100000e6-0000-4000-8000-000000000001', '200000e6-0000-4000-8000-000000000002', 181764, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000004', '100000e6-0000-4000-8000-000000000001', NULL, -220821, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000005', '100000e6-0000-4000-8000-000000000001', '200000e6-0000-4000-8000-000000000004', 207097, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000006', '100000e6-0000-4000-8000-000000000001', '200000e6-0000-4000-8000-000000000004', -257015, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e6-0000-4000-8000-000000000007', '100000e6-0000-4000-8000-000000000001', '200000e6-0000-4000-8000-000000000004', 85721, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e6-0000-4000-8000-000000000001', '2026-12-02') b),
  '(344948,549913,0,0)',
  'case 230: fuzz 20261028/176'
);

-- ── case 231: fuzz 20261028/177 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e7-0000-4000-8000-000000000001', 'parity case 231', '2026-12-21', '2026-12-22', false, false, '0ff1ce00-0000-4000-8000-000000000004', 13, NULL, '2026-11-19T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e7-0000-4000-8000-000000000001', 'line', 'USD', 142253, 3, '100000e7-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e7-0000-4000-8000-000000000001', '100000e7-0000-4000-8000-000000000001', '2026-09-15', 'USD', 4623),
  ('200000e7-0000-4000-8000-000000000002', '100000e7-0000-4000-8000-000000000001', '2026-12-07', 'USD', 5377);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e7-0000-4000-8000-000000000001', '100000e7-0000-4000-8000-000000000001', '200000e7-0000-4000-8000-000000000001', 111954, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000002', '100000e7-0000-4000-8000-000000000001', NULL, 284127, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000e7-0000-4000-8000-000000000003', '100000e7-0000-4000-8000-000000000001', NULL, 178671, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000004', '100000e7-0000-4000-8000-000000000001', NULL, 177482, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000005', '100000e7-0000-4000-8000-000000000001', '200000e7-0000-4000-8000-000000000002', 241213, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000006', '100000e7-0000-4000-8000-000000000001', '200000e7-0000-4000-8000-000000000001', 292791, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000007', '100000e7-0000-4000-8000-000000000001', '200000e7-0000-4000-8000-000000000001', 292173, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e7-0000-4000-8000-000000000008', '100000e7-0000-4000-8000-000000000001', NULL, 105544, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e7-0000-4000-8000-000000000001', '2026-11-04') b),
  '(482238,645958,0,0)',
  'case 231: fuzz 20261028/177'
);

-- ── case 232: fuzz 20261028/178 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e8-0000-4000-8000-000000000001', 'parity case 232', '2026-12-23', '2026-12-24', false, false, '0ff1ce00-0000-4000-8000-000000000002', 9.975, 707, '2026-11-27T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000e8-0000-4000-8000-000000000001', 'parity case 232 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000e8-0000-4000-8000-000000000001', '500000e8-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e8-0000-4000-8000-000000000001', 'line', 'CAD', 68493, 4, '100000e8-0000-4000-8000-000000000001', false),
  ('300000e8-0000-4000-8000-000000000002', 'line', 'CAD', 102335, 5, '100000e8-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e8-0000-4000-8000-000000000001', '100000e8-0000-4000-8000-000000000001', '2026-11-27', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e8-0000-4000-8000-000000000001', '100000e8-0000-4000-8000-000000000001', '200000e8-0000-4000-8000-000000000001', 164625, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000002', '100000e8-0000-4000-8000-000000000001', '200000e8-0000-4000-8000-000000000001', 113887, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000003', '100000e8-0000-4000-8000-000000000001', '200000e8-0000-4000-8000-000000000001', 41865, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000004', '100000e8-0000-4000-8000-000000000001', NULL, 241004, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000005', '100000e8-0000-4000-8000-000000000001', '200000e8-0000-4000-8000-000000000001', 211822, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000006', '100000e8-0000-4000-8000-000000000001', NULL, 120411, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000007', '100000e8-0000-4000-8000-000000000001', '600000e8-0000-4000-8000-000000000001', 65038, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e8-0000-4000-8000-000000000008', '100000e8-0000-4000-8000-000000000001', NULL, -47862, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e8-0000-4000-8000-000000000001', '2026-11-06') b),
  '(786354,790379,0,0)',
  'case 232: fuzz 20261028/178'
);

-- ── case 233: fuzz 20261028/179 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000e9-0000-4000-8000-000000000001', 'parity case 233', '2026-12-10', '2026-12-11', false, false, '0ff1ce00-0000-4000-8000-000000000004', 13, NULL, '2026-11-09T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000e9-0000-4000-8000-000000000001', 'line', 'USD', 115553, 2, '100000e9-0000-4000-8000-000000000001', true),
  ('300000e9-0000-4000-8000-000000000002', 'line', 'USD', 110276, 2, '100000e9-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000e9-0000-4000-8000-000000000001', '100000e9-0000-4000-8000-000000000001', '2027-01-12', 'USD', 4352),
  ('200000e9-0000-4000-8000-000000000002', '100000e9-0000-4000-8000-000000000001', '2026-11-02', 'USD', 1507),
  ('200000e9-0000-4000-8000-000000000003', '100000e9-0000-4000-8000-000000000001', '2027-01-28', 'USD', 4101),
  ('200000e9-0000-4000-8000-000000000004', '100000e9-0000-4000-8000-000000000001', '2027-02-04', 'USD', 40);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000e9-0000-4000-8000-000000000001', '100000e9-0000-4000-8000-000000000001', '200000e9-0000-4000-8000-000000000004', 218803, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e9-0000-4000-8000-000000000002', '100000e9-0000-4000-8000-000000000001', '200000e9-0000-4000-8000-000000000001', 193284, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e9-0000-4000-8000-000000000003', '100000e9-0000-4000-8000-000000000001', '200000e9-0000-4000-8000-000000000002', 40370, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000e9-0000-4000-8000-000000000004', '100000e9-0000-4000-8000-000000000001', NULL, 202861, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000e9-0000-4000-8000-000000000001', '2026-12-14') b),
  '(249224,452457,0,0)',
  'case 233: fuzz 20261028/179'
);

-- ── case 234: fuzz 20261028/180 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ea-0000-4000-8000-000000000001', 'parity case 234', '2026-11-22', '2026-11-23', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-10-26T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ea-0000-4000-8000-000000000001', 'line', 'CAD', 95601, 2, '100000ea-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ea-0000-4000-8000-000000000001', '100000ea-0000-4000-8000-000000000001', '2026-12-16', 'CAD', 4777),
  ('200000ea-0000-4000-8000-000000000002', '100000ea-0000-4000-8000-000000000001', '2026-11-13', 'CAD', 5671),
  ('200000ea-0000-4000-8000-000000000003', '100000ea-0000-4000-8000-000000000001', '2026-11-30', 'CAD', 3859),
  ('200000ea-0000-4000-8000-000000000004', '100000ea-0000-4000-8000-000000000001', '2026-10-08', 'CAD', 1296),
  ('200000ea-0000-4000-8000-000000000005', '100000ea-0000-4000-8000-000000000001', '2026-08-26', 'CAD', 1727);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ea-0000-4000-8000-000000000001', '100000ea-0000-4000-8000-000000000001', '200000ea-0000-4000-8000-000000000004', 3750, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ea-0000-4000-8000-000000000002', '100000ea-0000-4000-8000-000000000001', '200000ea-0000-4000-8000-000000000004', 169706, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ea-0000-4000-8000-000000000001', '2026-10-18') b),
  '(191202,173456,17746,0)',
  'case 234: fuzz 20261028/180'
);

-- ── case 235: fuzz 20261028/181 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000eb-0000-4000-8000-000000000001', 'parity case 235', '2026-09-24', '2026-09-25', false, false, '0ff1ce00-0000-4000-8000-000000000004', 0, NULL, '2026-09-08T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000eb-0000-4000-8000-000000000001', 'line', 'USD', 33275, 3, '100000eb-0000-4000-8000-000000000001', false),
  ('300000eb-0000-4000-8000-000000000002', 'line', 'USD', -36941, 5, '100000eb-0000-4000-8000-000000000001', false),
  ('300000eb-0000-4000-8000-000000000003', 'line', 'USD', 12502, 4, '100000eb-0000-4000-8000-000000000001', false),
  ('300000eb-0000-4000-8000-000000000004', 'line', 'USD', 28472, 2, '100000eb-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000eb-0000-4000-8000-000000000001', '100000eb-0000-4000-8000-000000000001', NULL, -1492, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000eb-0000-4000-8000-000000000001', '2026-10-23') b),
  '(22072,-1492,23564,23564)',
  'case 235: fuzz 20261028/181'
);

-- ── case 236: fuzz 20261028/182 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ec-0000-4000-8000-000000000001', 'parity case 236', '2026-10-08', '2026-10-09', false, false, NULL, NULL, NULL, '2026-09-11T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ec-0000-4000-8000-000000000001', 'line', 'USD', 15322, 1, '100000ec-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ec-0000-4000-8000-000000000001', '100000ec-0000-4000-8000-000000000001', '2026-10-03', 'USD', 934),
  ('200000ec-0000-4000-8000-000000000002', '100000ec-0000-4000-8000-000000000001', '2026-11-06', 'USD', 8736),
  ('200000ec-0000-4000-8000-000000000003', '100000ec-0000-4000-8000-000000000001', '2026-10-04', 'USD', 330);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ec-0000-4000-8000-000000000001', '2026-10-31') b),
  '(15322,0,15322,1937)',
  'case 236: fuzz 20261028/182'
);

-- ── case 237: fuzz 20261028/183 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ed-0000-4000-8000-000000000001', 'parity case 237', '2027-01-11', '2027-01-12', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-12-05T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ed-0000-4000-8000-000000000001', 'line', 'CAD', 42792, 3, '100000ed-0000-4000-8000-000000000001', false),
  ('300000ed-0000-4000-8000-000000000002', 'line', 'CAD', 112724, 2, '100000ed-0000-4000-8000-000000000001', false),
  ('300000ed-0000-4000-8000-000000000003', 'line', 'CAD', 64961, 1, '100000ed-0000-4000-8000-000000000001', false),
  ('300000ed-0000-4000-8000-000000000004', 'line', 'CAD', 141748, 1, '100000ed-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ed-0000-4000-8000-000000000001', '100000ed-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 856),
  ('200000ed-0000-4000-8000-000000000002', '100000ed-0000-4000-8000-000000000001', '2027-02-04', 'CAD', 9144);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ed-0000-4000-8000-000000000001', '100000ed-0000-4000-8000-000000000001', NULL, 265706, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ed-0000-4000-8000-000000000002', '100000ed-0000-4000-8000-000000000001', NULL, 186215, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000ed-0000-4000-8000-000000000003', '100000ed-0000-4000-8000-000000000001', NULL, 85706, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ed-0000-4000-8000-000000000004', '100000ed-0000-4000-8000-000000000001', NULL, -155231, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000ed-0000-4000-8000-000000000005', '100000ed-0000-4000-8000-000000000001', NULL, 270137, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ed-0000-4000-8000-000000000001', '2026-12-14') b),
  '(560533,265706,294827,0)',
  'case 237: fuzz 20261028/183'
);

-- ── case 238: fuzz 20261028/184 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ee-0000-4000-8000-000000000001', 'parity case 238', '2026-09-28', '2026-09-29', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-12T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ee-0000-4000-8000-000000000001', 'line', 'USD', 138929, NULL, '100000ee-0000-4000-8000-000000000001', false),
  ('300000ee-0000-4000-8000-000000000002', 'line', 'USD', 14379, 1, '100000ee-0000-4000-8000-000000000001', false),
  ('300000ee-0000-4000-8000-000000000003', 'line', 'USD', 66708, 5, '100000ee-0000-4000-8000-000000000001', false),
  ('300000ee-0000-4000-8000-000000000004', 'line', 'USD', 132465, 2, '100000ee-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ee-0000-4000-8000-000000000001', '2026-11-25') b),
  '(751778,0,751778,751778)',
  'case 238: fuzz 20261028/184'
);

-- ── case 239: fuzz 20261028/185 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ef-0000-4000-8000-000000000001', 'parity case 239', '2026-12-03', '2026-12-04', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-22T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000ef-0000-4000-8000-000000000001', 'parity case 239 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000ef-0000-4000-8000-000000000001', '500000ef-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ef-0000-4000-8000-000000000001', 'line', 'CAD', -7344, NULL, '100000ef-0000-4000-8000-000000000001', false),
  ('300000ef-0000-4000-8000-000000000002', 'line', 'CAD', 106977, NULL, '100000ef-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ef-0000-4000-8000-000000000001', '100000ef-0000-4000-8000-000000000001', '2026-09-05', 'CAD', 1958),
  ('200000ef-0000-4000-8000-000000000002', '100000ef-0000-4000-8000-000000000001', '2026-09-28', 'CAD', 1084),
  ('200000ef-0000-4000-8000-000000000003', '100000ef-0000-4000-8000-000000000001', '2026-11-05', 'CAD', 3100),
  ('200000ef-0000-4000-8000-000000000004', '100000ef-0000-4000-8000-000000000001', '2026-11-15', 'CAD', 4865),
  ('200000ef-0000-4000-8000-000000000005', '100000ef-0000-4000-8000-000000000001', '2026-11-14', 'CAD', 3593);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ef-0000-4000-8000-000000000001', '100000ef-0000-4000-8000-000000000001', '200000ef-0000-4000-8000-000000000003', 34495, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ef-0000-4000-8000-000000000002', '100000ef-0000-4000-8000-000000000001', '200000ef-0000-4000-8000-000000000001', 19801, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ef-0000-4000-8000-000000000003', '100000ef-0000-4000-8000-000000000001', '600000ef-0000-4000-8000-000000000001', 1751, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ef-0000-4000-8000-000000000001', '2026-11-02') b),
  '(99633,1751,97882,28557)',
  'case 239: fuzz 20261028/185'
);

-- ── case 240: fuzz 20261028/186 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f0-0000-4000-8000-000000000001', 'parity case 240', '2026-10-20', '2026-10-21', false, false, NULL, NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f0-0000-4000-8000-000000000001', 'line', 'USD', 11489, NULL, '100000f0-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f0-0000-4000-8000-000000000001', '100000f0-0000-4000-8000-000000000001', '2026-09-16', 'USD', 593),
  ('200000f0-0000-4000-8000-000000000002', '100000f0-0000-4000-8000-000000000001', '2026-09-20', 'USD', 260),
  ('200000f0-0000-4000-8000-000000000003', '100000f0-0000-4000-8000-000000000001', '2026-10-29', 'USD', 6317),
  ('200000f0-0000-4000-8000-000000000004', '100000f0-0000-4000-8000-000000000001', '2026-12-02', 'USD', 2830);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f0-0000-4000-8000-000000000001', '100000f0-0000-4000-8000-000000000001', '200000f0-0000-4000-8000-000000000002', 6089, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f0-0000-4000-8000-000000000002', '100000f0-0000-4000-8000-000000000001', NULL, 1098, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f0-0000-4000-8000-000000000003', '100000f0-0000-4000-8000-000000000001', NULL, 6150, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f0-0000-4000-8000-000000000001', '2026-10-20') b),
  '(11489,7187,4302,0)',
  'case 240: fuzz 20261028/186'
);

-- ── case 241: fuzz 20261028/187 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f1-0000-4000-8000-000000000001', 'parity case 241', '2027-01-22', '2027-01-23', false, false, '0ff1ce00-0000-4000-8000-000000000007', 15, NULL, '2027-01-21T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f1-0000-4000-8000-000000000001', 'line', 'CAD', 146121, 3, '100000f1-0000-4000-8000-000000000001', true),
  ('300000f1-0000-4000-8000-000000000002', 'line', 'CAD', 86652, NULL, '100000f1-0000-4000-8000-000000000001', false),
  ('300000f1-0000-4000-8000-000000000003', 'line', 'CAD', -19121, 4, '100000f1-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f1-0000-4000-8000-000000000001', '100000f1-0000-4000-8000-000000000001', '2027-01-19', 'CAD', 9992),
  ('200000f1-0000-4000-8000-000000000002', '100000f1-0000-4000-8000-000000000001', '2026-11-28', 'CAD', 8);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f1-0000-4000-8000-000000000001', '100000f1-0000-4000-8000-000000000001', '200000f1-0000-4000-8000-000000000001', 6001, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f1-0000-4000-8000-000000000001', '2026-12-03') b),
  '(11693,6001,5692,9)',
  'case 241: fuzz 20261028/187'
);

-- ── case 242: fuzz 20261028/188 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f2-0000-4000-8000-000000000001', 'parity case 242', '2026-10-15', '2026-10-16', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-17T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f2-0000-4000-8000-000000000001', 'line', 'USD', 83834, 1, '100000f2-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f2-0000-4000-8000-000000000001', '100000f2-0000-4000-8000-000000000001', NULL, -73498, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f2-0000-4000-8000-000000000002', '100000f2-0000-4000-8000-000000000001', NULL, 62679, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f2-0000-4000-8000-000000000003', '100000f2-0000-4000-8000-000000000001', NULL, 77118, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f2-0000-4000-8000-000000000004', '100000f2-0000-4000-8000-000000000001', NULL, 77560, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f2-0000-4000-8000-000000000005', '100000f2-0000-4000-8000-000000000001', NULL, 78221, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f2-0000-4000-8000-000000000006', '100000f2-0000-4000-8000-000000000001', NULL, 14025, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f2-0000-4000-8000-000000000001', '2026-10-30') b),
  '(83834,95205,0,0)',
  'case 242: fuzz 20261028/188'
);

-- ── case 243: fuzz 20261028/189 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f3-0000-4000-8000-000000000001', 'parity case 243', '2026-11-07', '2026-11-08', false, false, '0ff1ce00-0000-4000-8000-000000000007', 13, NULL, '2026-10-20T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f3-0000-4000-8000-000000000001', 'line', 'CAD', -15696, 3, '100000f3-0000-4000-8000-000000000001', true),
  ('300000f3-0000-4000-8000-000000000002', 'line', 'CAD', 1229, NULL, '100000f3-0000-4000-8000-000000000001', false),
  ('300000f3-0000-4000-8000-000000000003', 'line', 'CAD', 67222, 3, '100000f3-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f3-0000-4000-8000-000000000001', '100000f3-0000-4000-8000-000000000001', '2027-01-30', 'CAD', 10000);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f3-0000-4000-8000-000000000001', '2026-12-14') b),
  '(229271,0,229271,0)',
  'case 243: fuzz 20261028/189'
);

-- ── case 244: fuzz 20261028/190 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f4-0000-4000-8000-000000000001', 'parity case 244', '2026-11-21', '2026-11-22', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-11-12T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f4-0000-4000-8000-000000000001', 'line', 'CAD', 129393, 1, '100000f4-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f4-0000-4000-8000-000000000001', '100000f4-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f4-0000-4000-8000-000000000001', '100000f4-0000-4000-8000-000000000001', '200000f4-0000-4000-8000-000000000001', 106236, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f4-0000-4000-8000-000000000001', '2026-12-14') b),
  '(129393,0,129393,0)',
  'case 244: fuzz 20261028/190'
);

-- ── case 245: fuzz 20261028/191 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f5-0000-4000-8000-000000000001', 'parity case 245', '2026-10-23', '2026-10-24', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-10-14T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f5-0000-4000-8000-000000000001', 'line', 'USD', 139256, NULL, '100000f5-0000-4000-8000-000000000001', false),
  ('300000f5-0000-4000-8000-000000000002', 'line', 'USD', -15477, 2, '100000f5-0000-4000-8000-000000000001', false),
  ('300000f5-0000-4000-8000-000000000003', 'line', 'USD', 147254, NULL, '100000f5-0000-4000-8000-000000000001', false),
  ('300000f5-0000-4000-8000-000000000004', 'line', 'USD', 106642, 4, '100000f5-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f5-0000-4000-8000-000000000001', '100000f5-0000-4000-8000-000000000001', NULL, 212411, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f5-0000-4000-8000-000000000002', '100000f5-0000-4000-8000-000000000001', NULL, -17276, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f5-0000-4000-8000-000000000003', '100000f5-0000-4000-8000-000000000001', NULL, -137067, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f5-0000-4000-8000-000000000004', '100000f5-0000-4000-8000-000000000001', NULL, 193489, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f5-0000-4000-8000-000000000005', '100000f5-0000-4000-8000-000000000001', NULL, -193692, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f5-0000-4000-8000-000000000001', '2026-12-12') b),
  '(682124,57865,624259,624259)',
  'case 245: fuzz 20261028/191'
);

-- ── case 246: fuzz 20261028/192 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f6-0000-4000-8000-000000000001', 'parity case 246', '2026-09-28', '2026-09-29', false, false, '0ff1ce00-0000-4000-8000-000000000001', 9.975, NULL, '2026-09-04T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f6-0000-4000-8000-000000000001', 'line', 'CAD', 31541, 1, '100000f6-0000-4000-8000-000000000001', false),
  ('300000f6-0000-4000-8000-000000000002', 'line', 'CAD', -28456, 5, '100000f6-0000-4000-8000-000000000001', false),
  ('300000f6-0000-4000-8000-000000000003', 'line', 'CAD', 49139, 2, '100000f6-0000-4000-8000-000000000001', true),
  ('300000f6-0000-4000-8000-000000000004', 'line', 'CAD', 130511, 1, '100000f6-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f6-0000-4000-8000-000000000001', '100000f6-0000-4000-8000-000000000001', NULL, 8900, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f6-0000-4000-8000-000000000002', '100000f6-0000-4000-8000-000000000001', NULL, -18424, 'cad', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000f6-0000-4000-8000-000000000003', '100000f6-0000-4000-8000-000000000001', NULL, 18586, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000f6-0000-4000-8000-000000000004', '100000f6-0000-4000-8000-000000000001', NULL, 8797, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f6-0000-4000-8000-000000000001', '2026-11-26') b),
  '(21744,8797,12947,12947)',
  'case 246: fuzz 20261028/192'
);

-- ── case 247: fuzz 20261028/193 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f7-0000-4000-8000-000000000001', 'parity case 247', '2026-11-28', '2026-11-29', false, false, '0ff1ce00-0000-4000-8000-000000000002', 7.5, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f7-0000-4000-8000-000000000001', '100000f7-0000-4000-8000-000000000001', '2027-01-06', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f7-0000-4000-8000-000000000001', '100000f7-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000002', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000003', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000004', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000005', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000006', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000f7-0000-4000-8000-000000000007', '100000f7-0000-4000-8000-000000000001', '200000f7-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f7-0000-4000-8000-000000000001', '2026-12-11') b),
  '(0,12,0,0)',
  'case 247: fuzz 20261028/193'
);

-- ── case 248: fuzz 20261028/194 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f8-0000-4000-8000-000000000001', 'parity case 248', '2026-10-30', '2026-10-31', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000f8-0000-4000-8000-000000000001', '100000f8-0000-4000-8000-000000000001', '2027-01-18', 'CAD', 3528),
  ('200000f8-0000-4000-8000-000000000002', '100000f8-0000-4000-8000-000000000001', '2026-10-20', 'CAD', 2091);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f8-0000-4000-8000-000000000001', '2026-12-13') b),
  '(0,0,0,0)',
  'case 248: fuzz 20261028/194'
);

-- ── case 249: fuzz 20261028/195 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000f9-0000-4000-8000-000000000001', 'parity case 249', '2026-12-05', '2026-12-06', false, false, '0ff1ce00-0000-4000-8000-000000000004', 0, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000f9-0000-4000-8000-000000000001', 'line', 'USD', 29339, 2, '100000f9-0000-4000-8000-000000000001', false),
  ('300000f9-0000-4000-8000-000000000002', 'line', 'USD', 47160, 3, '100000f9-0000-4000-8000-000000000001', false),
  ('300000f9-0000-4000-8000-000000000003', 'line', 'USD', 106902, NULL, '100000f9-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000f9-0000-4000-8000-000000000001', '100000f9-0000-4000-8000-000000000001', NULL, -279669, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000f9-0000-4000-8000-000000000001', '2026-11-07') b),
  '(307060,-279669,586729,0)',
  'case 249: fuzz 20261028/195'
);

-- ── case 250: fuzz 20261028/196 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000fa-0000-4000-8000-000000000001', 'parity case 250', '2026-12-09', '2026-12-10', false, false, NULL, 5, 302, '2026-11-26T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000fa-0000-4000-8000-000000000001', 'line', 'USD', 104428, 5, '100000fa-0000-4000-8000-000000000001', false),
  ('300000fa-0000-4000-8000-000000000002', 'line', 'USD', -14569, 3, '100000fa-0000-4000-8000-000000000001', false),
  ('300000fa-0000-4000-8000-000000000003', 'line', 'USD', -44547, NULL, '100000fa-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000fa-0000-4000-8000-000000000001', '100000fa-0000-4000-8000-000000000001', '2026-10-23', 'USD', 3296),
  ('200000fa-0000-4000-8000-000000000002', '100000fa-0000-4000-8000-000000000001', '2026-12-01', 'USD', 6704);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000fa-0000-4000-8000-000000000001', '100000fa-0000-4000-8000-000000000001', '200000fa-0000-4000-8000-000000000002', -56507, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000002', '100000fa-0000-4000-8000-000000000001', '200000fa-0000-4000-8000-000000000002', 204844, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000003', '100000fa-0000-4000-8000-000000000001', NULL, 144049, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000004', '100000fa-0000-4000-8000-000000000001', NULL, 92580, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000005', '100000fa-0000-4000-8000-000000000001', NULL, -105446, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000006', '100000fa-0000-4000-8000-000000000001', '200000fa-0000-4000-8000-000000000002', 271437, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000007', '100000fa-0000-4000-8000-000000000001', NULL, 282633, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fa-0000-4000-8000-000000000008', '100000fa-0000-4000-8000-000000000001', NULL, -100109, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000fa-0000-4000-8000-000000000001', '2026-11-03') b),
  '(434188,741010,0,0)',
  'case 250: fuzz 20261028/196'
);

-- ── case 251: fuzz 20261028/197 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000fb-0000-4000-8000-000000000001', 'parity case 251', '2026-11-06', '2026-11-07', false, false, '0ff1ce00-0000-4000-8000-000000000008', 0, NULL, '2026-10-24T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000fb-0000-4000-8000-000000000001', '100000fb-0000-4000-8000-000000000001', '2026-12-03', 'USD', 2810),
  ('200000fb-0000-4000-8000-000000000002', '100000fb-0000-4000-8000-000000000001', '2026-10-15', 'USD', 1495),
  ('200000fb-0000-4000-8000-000000000003', '100000fb-0000-4000-8000-000000000001', '2026-10-17', 'USD', 272),
  ('200000fb-0000-4000-8000-000000000004', '100000fb-0000-4000-8000-000000000001', '2026-10-07', 'USD', 5218),
  ('200000fb-0000-4000-8000-000000000005', '100000fb-0000-4000-8000-000000000001', '2026-11-16', 'USD', 205);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000fb-0000-4000-8000-000000000001', '100000fb-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fb-0000-4000-8000-000000000002', '100000fb-0000-4000-8000-000000000001', '200000fb-0000-4000-8000-000000000004', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fb-0000-4000-8000-000000000003', '100000fb-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fb-0000-4000-8000-000000000004', '100000fb-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fb-0000-4000-8000-000000000005', '100000fb-0000-4000-8000-000000000001', '200000fb-0000-4000-8000-000000000004', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fb-0000-4000-8000-000000000006', '100000fb-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000fb-0000-4000-8000-000000000001', '2026-11-28') b),
  '(0,5,0,0)',
  'case 251: fuzz 20261028/197'
);

-- ── case 252: fuzz 20261028/198 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000fc-0000-4000-8000-000000000001', 'parity case 252', '2026-10-21', '2026-10-22', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-30T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000fc-0000-4000-8000-000000000001', 'line', 'USD', -21785, 5, '100000fc-0000-4000-8000-000000000001', false),
  ('300000fc-0000-4000-8000-000000000002', 'line', 'USD', 144539, 3, '100000fc-0000-4000-8000-000000000001', false),
  ('300000fc-0000-4000-8000-000000000003', 'line', 'USD', 5651, 1, '100000fc-0000-4000-8000-000000000001', false),
  ('300000fc-0000-4000-8000-000000000004', 'line', 'USD', -10681, 5, '100000fc-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000fc-0000-4000-8000-000000000001', '100000fc-0000-4000-8000-000000000001', '2027-01-20', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000fc-0000-4000-8000-000000000001', '100000fc-0000-4000-8000-000000000001', NULL, 250588, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000002', '100000fc-0000-4000-8000-000000000001', '200000fc-0000-4000-8000-000000000001', -201229, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000003', '100000fc-0000-4000-8000-000000000001', NULL, 174840, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000004', '100000fc-0000-4000-8000-000000000001', NULL, 192200, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000005', '100000fc-0000-4000-8000-000000000001', NULL, 79941, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000006', '100000fc-0000-4000-8000-000000000001', NULL, 255920, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000007', '100000fc-0000-4000-8000-000000000001', '200000fc-0000-4000-8000-000000000001', 52727, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fc-0000-4000-8000-000000000008', '100000fc-0000-4000-8000-000000000001', NULL, -5718, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000fc-0000-4000-8000-000000000001', '2026-11-29') b),
  '(276938,362199,0,0)',
  'case 252: fuzz 20261028/198'
);

-- ── case 253: fuzz 20261028/199 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000fd-0000-4000-8000-000000000001', 'parity case 253', '2026-10-22', '2026-10-23', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-09T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000fd-0000-4000-8000-000000000001', 'line', 'CAD', 5269, 5, '100000fd-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000fd-0000-4000-8000-000000000001', '100000fd-0000-4000-8000-000000000001', '2027-01-13', 'CAD', 5827),
  ('200000fd-0000-4000-8000-000000000002', '100000fd-0000-4000-8000-000000000001', '2026-11-01', 'CAD', 729),
  ('200000fd-0000-4000-8000-000000000003', '100000fd-0000-4000-8000-000000000001', '2027-01-20', 'CAD', 776),
  ('200000fd-0000-4000-8000-000000000004', '100000fd-0000-4000-8000-000000000001', '2026-10-18', 'CAD', 2668);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000fd-0000-4000-8000-000000000001', '100000fd-0000-4000-8000-000000000001', '200000fd-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fd-0000-4000-8000-000000000002', '100000fd-0000-4000-8000-000000000001', '200000fd-0000-4000-8000-000000000001', 2, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fd-0000-4000-8000-000000000003', '100000fd-0000-4000-8000-000000000001', '200000fd-0000-4000-8000-000000000002', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fd-0000-4000-8000-000000000004', '100000fd-0000-4000-8000-000000000001', '200000fd-0000-4000-8000-000000000004', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fd-0000-4000-8000-000000000005', '100000fd-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fd-0000-4000-8000-000000000006', '100000fd-0000-4000-8000-000000000001', '200000fd-0000-4000-8000-000000000003', 1, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000fd-0000-4000-8000-000000000001', '2026-12-11') b),
  '(0,6,0,0)',
  'case 253: fuzz 20261028/199'
);

-- ── case 254: fuzz 20261028/200 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000fe-0000-4000-8000-000000000001', 'parity case 254', '2026-12-16', '2026-12-17', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('500000fe-0000-4000-8000-000000000001', 'parity case 254 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('600000fe-0000-4000-8000-000000000001', '500000fe-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000fe-0000-4000-8000-000000000001', '100000fe-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000fe-0000-4000-8000-000000000001', '100000fe-0000-4000-8000-000000000001', NULL, 1, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fe-0000-4000-8000-000000000002', '100000fe-0000-4000-8000-000000000001', '200000fe-0000-4000-8000-000000000001', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fe-0000-4000-8000-000000000003', '100000fe-0000-4000-8000-000000000001', NULL, -2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000fe-0000-4000-8000-000000000004', '100000fe-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('400000fe-0000-4000-8000-000000000005', '100000fe-0000-4000-8000-000000000001', '600000fe-0000-4000-8000-000000000001', -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000fe-0000-4000-8000-000000000001', '2026-10-22') b),
  '(0,-3,3,0)',
  'case 254: fuzz 20261028/200'
);

-- ── case 255: fuzz 20261028/201 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('100000ff-0000-4000-8000-000000000001', 'parity case 255', '2026-10-05', '2026-10-06', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('300000ff-0000-4000-8000-000000000001', 'line', 'CAD', 117398, 2, '100000ff-0000-4000-8000-000000000001', false),
  ('300000ff-0000-4000-8000-000000000002', 'line', 'CAD', 133644, 2, '100000ff-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('200000ff-0000-4000-8000-000000000001', '100000ff-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 3484),
  ('200000ff-0000-4000-8000-000000000002', '100000ff-0000-4000-8000-000000000001', '2027-01-19', 'CAD', 172),
  ('200000ff-0000-4000-8000-000000000003', '100000ff-0000-4000-8000-000000000001', '2026-12-12', 'CAD', 5268),
  ('200000ff-0000-4000-8000-000000000004', '100000ff-0000-4000-8000-000000000001', '2026-10-18', 'CAD', 1076);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('400000ff-0000-4000-8000-000000000001', '100000ff-0000-4000-8000-000000000001', NULL, 17101, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ff-0000-4000-8000-000000000002', '100000ff-0000-4000-8000-000000000001', NULL, 259666, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('400000ff-0000-4000-8000-000000000003', '100000ff-0000-4000-8000-000000000001', NULL, -193143, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('100000ff-0000-4000-8000-000000000001', '2026-11-29') b),
  '(502084,83624,418460,0)',
  'case 255: fuzz 20261028/201'
);

-- ── case 256: fuzz 20261028/202 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000100-0000-4000-8000-000000000001', 'parity case 256', '2026-11-23', '2026-11-24', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-11-15T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000100-0000-4000-8000-000000000001', 'parity case 256 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000100-0000-4000-8000-000000000001', '50000100-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000100-0000-4000-8000-000000000001', 'line', 'CAD', 7397, 4, '10000100-0000-4000-8000-000000000001', false),
  ('30000100-0000-4000-8000-000000000002', 'line', 'CAD', 67423, 5, '10000100-0000-4000-8000-000000000001', false),
  ('30000100-0000-4000-8000-000000000003', 'line', 'CAD', 117087, 5, '10000100-0000-4000-8000-000000000001', false),
  ('30000100-0000-4000-8000-000000000004', 'line', 'CAD', 92951, 2, '10000100-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000100-0000-4000-8000-000000000001', '10000100-0000-4000-8000-000000000001', NULL, 34674, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000100-0000-4000-8000-000000000002', '10000100-0000-4000-8000-000000000001', NULL, -27500, 'cad', 'failed', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000100-0000-4000-8000-000000000003', '10000100-0000-4000-8000-000000000001', '60000100-0000-4000-8000-000000000001', 268975, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000100-0000-4000-8000-000000000004', '10000100-0000-4000-8000-000000000001', NULL, 202888, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000100-0000-4000-8000-000000000005', '10000100-0000-4000-8000-000000000001', NULL, -106182, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000100-0000-4000-8000-000000000006', '10000100-0000-4000-8000-000000000001', NULL, 120011, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000100-0000-4000-8000-000000000007', '10000100-0000-4000-8000-000000000001', NULL, 102099, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000100-0000-4000-8000-000000000001', '2026-10-27') b),
  '(1138040,384903,753137,0)',
  'case 256: fuzz 20261028/202'
);

-- ── case 257: fuzz 20261028/203 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000101-0000-4000-8000-000000000001', 'parity case 257', '2027-01-24', '2027-01-25', false, false, '0ff1ce00-0000-4000-8000-000000000001', 9.975, NULL, '2027-01-11T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000101-0000-4000-8000-000000000001', 'line', 'CAD', -28745, 4, '10000101-0000-4000-8000-000000000001', false),
  ('30000101-0000-4000-8000-000000000002', 'line', 'CAD', 100213, 3, '10000101-0000-4000-8000-000000000001', false),
  ('30000101-0000-4000-8000-000000000003', 'line', 'CAD', -27050, NULL, '10000101-0000-4000-8000-000000000001', false),
  ('30000101-0000-4000-8000-000000000004', 'line', 'CAD', -7569, 1, '10000101-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000101-0000-4000-8000-000000000001', '10000101-0000-4000-8000-000000000001', '2026-11-20', 'CAD', 844),
  ('20000101-0000-4000-8000-000000000002', '10000101-0000-4000-8000-000000000001', '2027-01-19', 'CAD', 1898),
  ('20000101-0000-4000-8000-000000000003', '10000101-0000-4000-8000-000000000001', '2027-01-16', 'CAD', 4693),
  ('20000101-0000-4000-8000-000000000004', '10000101-0000-4000-8000-000000000001', '2026-12-16', 'CAD', 1770),
  ('20000101-0000-4000-8000-000000000005', '10000101-0000-4000-8000-000000000001', '2026-10-23', 'CAD', 795);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000101-0000-4000-8000-000000000001', '10000101-0000-4000-8000-000000000001', '20000101-0000-4000-8000-000000000002', 17698, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000101-0000-4000-8000-000000000002', '10000101-0000-4000-8000-000000000001', '20000101-0000-4000-8000-000000000004', 102580, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000101-0000-4000-8000-000000000003', '10000101-0000-4000-8000-000000000001', '20000101-0000-4000-8000-000000000003', 121433, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000101-0000-4000-8000-000000000001', '2026-12-10') b),
  '(174430,139131,35299,0)',
  'case 257: fuzz 20261028/203'
);

-- ── case 258: fuzz 20261028/204 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000102-0000-4000-8000-000000000001', 'parity case 258', '2027-01-04', '2027-01-05', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-04T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000102-0000-4000-8000-000000000001', 'line', 'CAD', 45539, 5, '10000102-0000-4000-8000-000000000001', false),
  ('30000102-0000-4000-8000-000000000002', 'line', 'CAD', -29632, 1, '10000102-0000-4000-8000-000000000001', false),
  ('30000102-0000-4000-8000-000000000003', 'line', 'CAD', 61347, 5, '10000102-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000102-0000-4000-8000-000000000001', '10000102-0000-4000-8000-000000000001', '2027-01-12', 'CAD', 313),
  ('20000102-0000-4000-8000-000000000002', '10000102-0000-4000-8000-000000000001', '2026-12-27', 'CAD', 4617),
  ('20000102-0000-4000-8000-000000000003', '10000102-0000-4000-8000-000000000001', '2026-11-07', 'CAD', 5070);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000102-0000-4000-8000-000000000001', '10000102-0000-4000-8000-000000000001', '20000102-0000-4000-8000-000000000003', 129434, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000102-0000-4000-8000-000000000001', '2026-12-13') b),
  '(504798,0,504798,255933)',
  'case 258: fuzz 20261028/204'
);

-- ── case 259: fuzz 20261028/205 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000103-0000-4000-8000-000000000001', 'parity case 259', '2026-12-08', '2026-12-09', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-01T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000103-0000-4000-8000-000000000001', 'line', 'CAD', 65015, 1, '10000103-0000-4000-8000-000000000001', false),
  ('30000103-0000-4000-8000-000000000002', 'line', 'CAD', 1070, 3, '10000103-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000103-0000-4000-8000-000000000001', '10000103-0000-4000-8000-000000000001', '2027-01-27', 'CAD', 101),
  ('20000103-0000-4000-8000-000000000002', '10000103-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 2162);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000103-0000-4000-8000-000000000001', '10000103-0000-4000-8000-000000000001', NULL, 54644, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000103-0000-4000-8000-000000000001', '2026-12-03') b),
  '(65015,54644,10371,0)',
  'case 259: fuzz 20261028/205'
);

-- ── case 260: fuzz 20261028/206 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000104-0000-4000-8000-000000000001', 'parity case 260', '2026-11-01', '2026-11-02', false, false, NULL, 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000104-0000-4000-8000-000000000001', 'line', 'USD', 36651, 2, '10000104-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000104-0000-4000-8000-000000000001', '10000104-0000-4000-8000-000000000001', NULL, -1, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000002', '10000104-0000-4000-8000-000000000001', NULL, 2, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000003', '10000104-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000004', '10000104-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000005', '10000104-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000006', '10000104-0000-4000-8000-000000000001', NULL, 2, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000007', '10000104-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000104-0000-4000-8000-000000000008', '10000104-0000-4000-8000-000000000001', NULL, -2, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000104-0000-4000-8000-000000000001', '2026-10-28') b),
  '(0,3,0,0)',
  'case 260: fuzz 20261028/206'
);

-- ── case 261: fuzz 20261028/207 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000105-0000-4000-8000-000000000001', 'parity case 261', '2026-10-20', '2026-10-21', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000105-0000-4000-8000-000000000001', 'line', 'CAD', 65651, 3, '10000105-0000-4000-8000-000000000001', true),
  ('30000105-0000-4000-8000-000000000002', 'line', 'CAD', 118410, 1, '10000105-0000-4000-8000-000000000001', false),
  ('30000105-0000-4000-8000-000000000003', 'line', 'CAD', 64875, 2, '10000105-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000105-0000-4000-8000-000000000001', '10000105-0000-4000-8000-000000000001', '2026-12-24', 'CAD', 2332),
  ('20000105-0000-4000-8000-000000000002', '10000105-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 7668);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000105-0000-4000-8000-000000000001', '10000105-0000-4000-8000-000000000001', '20000105-0000-4000-8000-000000000002', 123058, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000105-0000-4000-8000-000000000001', '2026-11-19') b),
  '(248160,123058,125102,67231)',
  'case 261: fuzz 20261028/207'
);

-- ── case 262: fuzz 20261028/208 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000106-0000-4000-8000-000000000001', 'parity case 262', '2026-12-25', '2026-12-26', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, 1774, '2026-12-03T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000106-0000-4000-8000-000000000001', 'line', 'CAD', 72219, 1, '10000106-0000-4000-8000-000000000001', false),
  ('30000106-0000-4000-8000-000000000002', 'line', 'CAD', 149073, NULL, '10000106-0000-4000-8000-000000000001', false),
  ('30000106-0000-4000-8000-000000000003', 'line', 'CAD', 117846, NULL, '10000106-0000-4000-8000-000000000001', false),
  ('30000106-0000-4000-8000-000000000004', 'line', 'CAD', 52787, 5, '10000106-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000106-0000-4000-8000-000000000001', '10000106-0000-4000-8000-000000000001', '2026-11-04', 'CAD', 1389),
  ('20000106-0000-4000-8000-000000000002', '10000106-0000-4000-8000-000000000001', '2027-01-02', 'CAD', 8611);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000106-0000-4000-8000-000000000001', '10000106-0000-4000-8000-000000000001', NULL, 188982, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000106-0000-4000-8000-000000000002', '10000106-0000-4000-8000-000000000001', NULL, 36930, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000106-0000-4000-8000-000000000003', '10000106-0000-4000-8000-000000000001', NULL, 114514, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000106-0000-4000-8000-000000000001', '2026-11-06') b),
  '(604847,151444,453403,0)',
  'case 262: fuzz 20261028/208'
);

-- ── case 263: fuzz 20261028/209 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000107-0000-4000-8000-000000000001', 'parity case 263', '2027-01-07', '2027-01-08', false, false, NULL, 7.5, NULL, '2026-12-14T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000107-0000-4000-8000-000000000001', 'line', 'USD', 115828, 4, '10000107-0000-4000-8000-000000000001', false),
  ('30000107-0000-4000-8000-000000000002', 'line', 'USD', 138408, 3, '10000107-0000-4000-8000-000000000001', false),
  ('30000107-0000-4000-8000-000000000003', 'line', 'USD', 123188, 2, '10000107-0000-4000-8000-000000000001', false),
  ('30000107-0000-4000-8000-000000000004', 'line', 'USD', 144289, 2, '10000107-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000107-0000-4000-8000-000000000001', '10000107-0000-4000-8000-000000000001', NULL, 196483, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000107-0000-4000-8000-000000000002', '10000107-0000-4000-8000-000000000001', NULL, 135257, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000107-0000-4000-8000-000000000003', '10000107-0000-4000-8000-000000000001', NULL, 253430, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000107-0000-4000-8000-000000000001', '2026-11-11') b),
  '(1519502,331740,1187762,0)',
  'case 263: fuzz 20261028/209'
);

-- ── case 264: fuzz 20261028/210 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000108-0000-4000-8000-000000000001', 'parity case 264', '2026-12-15', '2026-12-16', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 185, '2026-11-21T23:45:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000108-0000-4000-8000-000000000001', '10000108-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000002', '10000108-0000-4000-8000-000000000001', NULL, -2, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000003', '10000108-0000-4000-8000-000000000001', NULL, 2, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000004', '10000108-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000005', '10000108-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000006', '10000108-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000007', '10000108-0000-4000-8000-000000000001', NULL, 2, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000108-0000-4000-8000-000000000008', '10000108-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000108-0000-4000-8000-000000000001', '2026-12-08') b),
  '(185,-2,187,187)',
  'case 264: fuzz 20261028/210'
);

-- ── case 265: fuzz 20261028/211 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000109-0000-4000-8000-000000000001', 'parity case 265', '2026-11-09', '2026-11-10', false, false, NULL, NULL, NULL, '2026-10-19T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000109-0000-4000-8000-000000000001', 'line', 'USD', 37061, NULL, '10000109-0000-4000-8000-000000000001', false),
  ('30000109-0000-4000-8000-000000000002', 'line', 'USD', 34095, 3, '10000109-0000-4000-8000-000000000001', false),
  ('30000109-0000-4000-8000-000000000003', 'line', 'USD', 17808, 1, '10000109-0000-4000-8000-000000000001', false),
  ('30000109-0000-4000-8000-000000000004', 'line', 'USD', 145658, 1, '10000109-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000109-0000-4000-8000-000000000001', '10000109-0000-4000-8000-000000000001', '2027-01-09', 'USD', 2132),
  ('20000109-0000-4000-8000-000000000002', '10000109-0000-4000-8000-000000000001', '2026-10-30', 'USD', 352),
  ('20000109-0000-4000-8000-000000000003', '10000109-0000-4000-8000-000000000001', '2026-12-07', 'USD', 6013),
  ('20000109-0000-4000-8000-000000000004', '10000109-0000-4000-8000-000000000001', '2026-12-22', 'USD', 12),
  ('20000109-0000-4000-8000-000000000005', '10000109-0000-4000-8000-000000000001', '2026-11-28', 'USD', 1491);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000109-0000-4000-8000-000000000001', '10000109-0000-4000-8000-000000000001', NULL, 63685, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000109-0000-4000-8000-000000000002', '10000109-0000-4000-8000-000000000001', '20000109-0000-4000-8000-000000000001', 42768, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000109-0000-4000-8000-000000000003', '10000109-0000-4000-8000-000000000001', NULL, 128977, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000109-0000-4000-8000-000000000001', '2026-11-29') b),
  '(157154,192662,0,0)',
  'case 265: fuzz 20261028/211'
);

-- ── case 266: fuzz 20261028/212 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010a-0000-4000-8000-000000000001', 'parity case 266', '2026-10-24', '2026-10-25', false, false, NULL, NULL, NULL, '2026-10-20T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010a-0000-4000-8000-000000000001', 'line', 'USD', 121017, 1, '1000010a-0000-4000-8000-000000000001', false),
  ('3000010a-0000-4000-8000-000000000002', 'line', 'USD', 19704, 1, '1000010a-0000-4000-8000-000000000001', false),
  ('3000010a-0000-4000-8000-000000000003', 'line', 'USD', 46315, NULL, '1000010a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010a-0000-4000-8000-000000000001', '1000010a-0000-4000-8000-000000000001', '2026-10-14', 'USD', 5887),
  ('2000010a-0000-4000-8000-000000000002', '1000010a-0000-4000-8000-000000000001', '2026-12-23', 'USD', 4113);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010a-0000-4000-8000-000000000001', '1000010a-0000-4000-8000-000000000001', '2000010a-0000-4000-8000-000000000002', 22297, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000002', '1000010a-0000-4000-8000-000000000001', NULL, -73695, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000003', '1000010a-0000-4000-8000-000000000001', NULL, 50537, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000004', '1000010a-0000-4000-8000-000000000001', NULL, 67400, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000005', '1000010a-0000-4000-8000-000000000001', '2000010a-0000-4000-8000-000000000002', -61537, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000006', '1000010a-0000-4000-8000-000000000001', '2000010a-0000-4000-8000-000000000002', 4496, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010a-0000-4000-8000-000000000007', '1000010a-0000-4000-8000-000000000001', NULL, 109904, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010a-0000-4000-8000-000000000001', '2026-11-15') b),
  '(187036,119402,67634,0)',
  'case 266: fuzz 20261028/212'
);

-- ── case 267: fuzz 20261028/213 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010b-0000-4000-8000-000000000001', 'parity case 267', '2027-01-17', '2027-01-18', false, false, '0ff1ce00-0000-4000-8000-000000000001', 0, NULL, '2027-01-03T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010b-0000-4000-8000-000000000001', 'line', 'CAD', 9910, NULL, '1000010b-0000-4000-8000-000000000001', false),
  ('3000010b-0000-4000-8000-000000000002', 'line', 'CAD', 71115, 5, '1000010b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010b-0000-4000-8000-000000000001', '1000010b-0000-4000-8000-000000000001', '2027-01-06', 'CAD', 947),
  ('2000010b-0000-4000-8000-000000000002', '1000010b-0000-4000-8000-000000000001', '2026-11-30', 'CAD', 4040),
  ('2000010b-0000-4000-8000-000000000003', '1000010b-0000-4000-8000-000000000001', '2027-01-03', 'CAD', 5013);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010b-0000-4000-8000-000000000001', '1000010b-0000-4000-8000-000000000001', NULL, -246394, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010b-0000-4000-8000-000000000002', '1000010b-0000-4000-8000-000000000001', NULL, -203336, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000010b-0000-4000-8000-000000000003', '1000010b-0000-4000-8000-000000000001', '2000010b-0000-4000-8000-000000000001', -181041, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010b-0000-4000-8000-000000000004', '1000010b-0000-4000-8000-000000000001', '2000010b-0000-4000-8000-000000000002', 64154, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010b-0000-4000-8000-000000000001', '2026-12-14') b),
  '(365485,-363281,728766,147656)',
  'case 267: fuzz 20261028/213'
);

-- ── case 268: fuzz 20261028/214 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010c-0000-4000-8000-000000000001', 'parity case 268', '2026-11-14', '2026-11-15', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-04T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010c-0000-4000-8000-000000000001', 'line', 'CAD', 112335, 2, '1000010c-0000-4000-8000-000000000001', false),
  ('3000010c-0000-4000-8000-000000000002', 'line', 'CAD', 30947, NULL, '1000010c-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010c-0000-4000-8000-000000000001', '1000010c-0000-4000-8000-000000000001', '2026-10-20', 'CAD', 1820),
  ('2000010c-0000-4000-8000-000000000002', '1000010c-0000-4000-8000-000000000001', '2026-12-27', 'CAD', 5610),
  ('2000010c-0000-4000-8000-000000000003', '1000010c-0000-4000-8000-000000000001', '2026-11-12', 'CAD', 382),
  ('2000010c-0000-4000-8000-000000000004', '1000010c-0000-4000-8000-000000000001', '2026-10-07', 'CAD', 599),
  ('2000010c-0000-4000-8000-000000000005', '1000010c-0000-4000-8000-000000000001', '2026-12-27', 'CAD', 1589);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010c-0000-4000-8000-000000000001', '1000010c-0000-4000-8000-000000000001', '2000010c-0000-4000-8000-000000000005', 43951, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010c-0000-4000-8000-000000000002', '1000010c-0000-4000-8000-000000000001', NULL, 137139, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010c-0000-4000-8000-000000000003', '1000010c-0000-4000-8000-000000000001', NULL, 51817, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010c-0000-4000-8000-000000000001', '2026-11-29') b),
  '(224670,232907,0,0)',
  'case 268: fuzz 20261028/214'
);

-- ── case 269: fuzz 20261028/215 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010d-0000-4000-8000-000000000001', 'parity case 269', '2026-10-10', '2026-10-11', false, false, '0ff1ce00-0000-4000-8000-000000000004', 7.5, 2129, '2026-10-04T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010d-0000-4000-8000-000000000001', 'line', 'USD', 47517, 1, '1000010d-0000-4000-8000-000000000001', false),
  ('3000010d-0000-4000-8000-000000000002', 'line', 'USD', -42443, 3, '1000010d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010d-0000-4000-8000-000000000001', '1000010d-0000-4000-8000-000000000001', '2026-12-01', 'USD', 3541),
  ('2000010d-0000-4000-8000-000000000002', '1000010d-0000-4000-8000-000000000001', '2026-10-24', 'USD', 1698),
  ('2000010d-0000-4000-8000-000000000003', '1000010d-0000-4000-8000-000000000001', '2026-12-23', 'USD', 2204),
  ('2000010d-0000-4000-8000-000000000004', '1000010d-0000-4000-8000-000000000001', '2026-09-05', 'USD', 2557);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010d-0000-4000-8000-000000000001', '1000010d-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000010d-0000-4000-8000-000000000002', '1000010d-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010d-0000-4000-8000-000000000003', '1000010d-0000-4000-8000-000000000001', '2000010d-0000-4000-8000-000000000004', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010d-0000-4000-8000-000000000004', '1000010d-0000-4000-8000-000000000001', '2000010d-0000-4000-8000-000000000003', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010d-0000-4000-8000-000000000005', '1000010d-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010d-0000-4000-8000-000000000001', '2026-11-01') b),
  '(0,0,0,0)',
  'case 269: fuzz 20261028/215'
);

-- ── case 270: fuzz 20261028/216 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010e-0000-4000-8000-000000000001', 'parity case 270', '2026-11-18', '2026-11-19', false, false, '0ff1ce00-0000-4000-8000-000000000008', 15, 2198, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010e-0000-4000-8000-000000000001', 'line', 'USD', 35022, 4, '1000010e-0000-4000-8000-000000000001', false),
  ('3000010e-0000-4000-8000-000000000002', 'line', 'USD', -35539, 3, '1000010e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010e-0000-4000-8000-000000000001', '1000010e-0000-4000-8000-000000000001', '2026-11-27', 'USD', 5075),
  ('2000010e-0000-4000-8000-000000000002', '1000010e-0000-4000-8000-000000000001', '2026-10-26', 'USD', 4925);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010e-0000-4000-8000-000000000001', '1000010e-0000-4000-8000-000000000001', '2000010e-0000-4000-8000-000000000002', 11958, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010e-0000-4000-8000-000000000002', '1000010e-0000-4000-8000-000000000001', '2000010e-0000-4000-8000-000000000001', 8695, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010e-0000-4000-8000-000000000001', '2026-12-06') b),
  '(35669,0,35669,35669)',
  'case 270: fuzz 20261028/216'
);

-- ── case 271: fuzz 20261028/217 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000010f-0000-4000-8000-000000000001', 'parity case 271', '2026-12-15', '2026-12-16', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-11-29T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000010f-0000-4000-8000-000000000001', 'line', 'USD', 50169, 5, '1000010f-0000-4000-8000-000000000001', false),
  ('3000010f-0000-4000-8000-000000000002', 'line', 'USD', 126408, 1, '1000010f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000010f-0000-4000-8000-000000000001', '1000010f-0000-4000-8000-000000000001', '2026-09-13', 'USD', 503),
  ('2000010f-0000-4000-8000-000000000002', '1000010f-0000-4000-8000-000000000001', '2026-11-19', 'USD', 5417),
  ('2000010f-0000-4000-8000-000000000003', '1000010f-0000-4000-8000-000000000001', '2026-11-13', 'USD', 1450),
  ('2000010f-0000-4000-8000-000000000004', '1000010f-0000-4000-8000-000000000001', '2026-12-18', 'USD', 988),
  ('2000010f-0000-4000-8000-000000000005', '1000010f-0000-4000-8000-000000000001', '2026-09-07', 'USD', 1642);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000010f-0000-4000-8000-000000000001', '1000010f-0000-4000-8000-000000000001', '2000010f-0000-4000-8000-000000000002', 198371, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010f-0000-4000-8000-000000000002', '1000010f-0000-4000-8000-000000000001', '2000010f-0000-4000-8000-000000000003', 142965, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010f-0000-4000-8000-000000000003', '1000010f-0000-4000-8000-000000000001', NULL, 43915, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010f-0000-4000-8000-000000000004', '1000010f-0000-4000-8000-000000000001', '2000010f-0000-4000-8000-000000000003', 230439, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000010f-0000-4000-8000-000000000005', '1000010f-0000-4000-8000-000000000001', '2000010f-0000-4000-8000-000000000003', 165251, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000010f-0000-4000-8000-000000000001', '2026-11-01') b),
  '(377253,407537,0,0)',
  'case 271: fuzz 20261028/217'
);

-- ── case 272: fuzz 20261028/218 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000110-0000-4000-8000-000000000001', 'parity case 272', '2026-12-15', '2026-12-16', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000110-0000-4000-8000-000000000001', '10000110-0000-4000-8000-000000000001', '2026-10-22', 'CAD', 5858),
  ('20000110-0000-4000-8000-000000000002', '10000110-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 4142);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000110-0000-4000-8000-000000000001', '10000110-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000110-0000-4000-8000-000000000002', '10000110-0000-4000-8000-000000000001', '20000110-0000-4000-8000-000000000002', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000110-0000-4000-8000-000000000003', '10000110-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000110-0000-4000-8000-000000000004', '10000110-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000110-0000-4000-8000-000000000005', '10000110-0000-4000-8000-000000000001', '20000110-0000-4000-8000-000000000001', 2, ' CAD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000110-0000-4000-8000-000000000006', '10000110-0000-4000-8000-000000000001', '20000110-0000-4000-8000-000000000002', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000110-0000-4000-8000-000000000001', '2026-12-03') b),
  '(0,9,0,0)',
  'case 272: fuzz 20261028/218'
);

-- ── case 273: fuzz 20261028/219 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000111-0000-4000-8000-000000000001', 'parity case 273', '2026-10-31', '2026-11-01', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-08T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000111-0000-4000-8000-000000000001', 'line', 'CAD', 142060, 2, '10000111-0000-4000-8000-000000000001', false),
  ('30000111-0000-4000-8000-000000000002', 'line', 'CAD', -46649, 1, '10000111-0000-4000-8000-000000000001', false),
  ('30000111-0000-4000-8000-000000000003', 'line', 'CAD', 137172, 4, '10000111-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000111-0000-4000-8000-000000000001', '10000111-0000-4000-8000-000000000001', '2026-10-22', 'CAD', 6336),
  ('20000111-0000-4000-8000-000000000002', '10000111-0000-4000-8000-000000000001', '2026-10-30', 'CAD', 2310),
  ('20000111-0000-4000-8000-000000000003', '10000111-0000-4000-8000-000000000001', '2026-11-30', 'CAD', 721),
  ('20000111-0000-4000-8000-000000000004', '10000111-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 445),
  ('20000111-0000-4000-8000-000000000005', '10000111-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 188);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000111-0000-4000-8000-000000000001', '10000111-0000-4000-8000-000000000001', NULL, 183764, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000111-0000-4000-8000-000000000001', '2026-12-11') b),
  '(237471,183764,53707,49243)',
  'case 273: fuzz 20261028/219'
);

-- ── case 274: fuzz 20261028/220 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000112-0000-4000-8000-000000000001', 'parity case 274', '2026-09-24', '2026-09-25', false, false, NULL, 0, NULL, NULL);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000112-0000-4000-8000-000000000001', '10000112-0000-4000-8000-000000000001', '2026-12-13', 'USD', 726),
  ('20000112-0000-4000-8000-000000000002', '10000112-0000-4000-8000-000000000001', '2026-11-10', 'USD', 194),
  ('20000112-0000-4000-8000-000000000003', '10000112-0000-4000-8000-000000000001', '2027-01-08', 'USD', 2300),
  ('20000112-0000-4000-8000-000000000004', '10000112-0000-4000-8000-000000000001', '2026-10-30', 'USD', 2982),
  ('20000112-0000-4000-8000-000000000005', '10000112-0000-4000-8000-000000000001', '2026-12-28', 'USD', 3798);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000112-0000-4000-8000-000000000001', '10000112-0000-4000-8000-000000000001', NULL, 1, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000112-0000-4000-8000-000000000002', '10000112-0000-4000-8000-000000000001', '20000112-0000-4000-8000-000000000003', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000112-0000-4000-8000-000000000003', '10000112-0000-4000-8000-000000000001', '20000112-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000112-0000-4000-8000-000000000004', '10000112-0000-4000-8000-000000000001', '20000112-0000-4000-8000-000000000003', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000112-0000-4000-8000-000000000005', '10000112-0000-4000-8000-000000000001', '20000112-0000-4000-8000-000000000004', -2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000112-0000-4000-8000-000000000006', '10000112-0000-4000-8000-000000000001', NULL, -1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000112-0000-4000-8000-000000000001', '2026-11-17') b),
  '(0,-1,1,0)',
  'case 274: fuzz 20261028/220'
);

-- ── case 275: fuzz 20261028/221 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000113-0000-4000-8000-000000000001', 'parity case 275', '2026-09-21', '2026-09-22', false, false, '0ff1ce00-0000-4000-8000-000000000001', 9.975, 2563, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000113-0000-4000-8000-000000000001', 'line', 'CAD', 84251, 1, '10000113-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000113-0000-4000-8000-000000000001', '2026-10-20') b),
  '(86814,0,86814,86814)',
  'case 275: fuzz 20261028/221'
);

-- ── case 276: fuzz 20261028/222 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000114-0000-4000-8000-000000000001', 'parity case 276', '2026-10-07', '2026-10-08', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-09-12T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000114-0000-4000-8000-000000000001', 'line', 'CAD', -9515, NULL, '10000114-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000114-0000-4000-8000-000000000001', '10000114-0000-4000-8000-000000000001', NULL, 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000114-0000-4000-8000-000000000002', '10000114-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000114-0000-4000-8000-000000000003', '10000114-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000114-0000-4000-8000-000000000004', '10000114-0000-4000-8000-000000000001', NULL, -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000114-0000-4000-8000-000000000005', '10000114-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000114-0000-4000-8000-000000000001', '2026-10-28') b),
  '(0,3,0,0)',
  'case 276: fuzz 20261028/222'
);

-- ── case 277: fuzz 20261028/223 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000115-0000-4000-8000-000000000001', 'parity case 277', '2026-12-06', '2026-12-07', false, false, '0ff1ce00-0000-4000-8000-000000000001', 15, NULL, '2026-11-26T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000115-0000-4000-8000-000000000001', 'line', 'CAD', 49263, 5, '10000115-0000-4000-8000-000000000001', true),
  ('30000115-0000-4000-8000-000000000002', 'line', 'CAD', 97917, 2, '10000115-0000-4000-8000-000000000001', true),
  ('30000115-0000-4000-8000-000000000003', 'line', 'CAD', -1590, 3, '10000115-0000-4000-8000-000000000001', false),
  ('30000115-0000-4000-8000-000000000004', 'line', 'CAD', 84288, NULL, '10000115-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000115-0000-4000-8000-000000000001', '10000115-0000-4000-8000-000000000001', '2026-12-22', 'CAD', 888),
  ('20000115-0000-4000-8000-000000000002', '10000115-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 2108),
  ('20000115-0000-4000-8000-000000000003', '10000115-0000-4000-8000-000000000001', '2026-10-24', 'CAD', 17),
  ('20000115-0000-4000-8000-000000000004', '10000115-0000-4000-8000-000000000001', '2026-11-18', 'CAD', 5522),
  ('20000115-0000-4000-8000-000000000005', '10000115-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 1465);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000115-0000-4000-8000-000000000001', '10000115-0000-4000-8000-000000000001', NULL, -41196, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000115-0000-4000-8000-000000000002', '10000115-0000-4000-8000-000000000001', '20000115-0000-4000-8000-000000000005', 77446, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000115-0000-4000-8000-000000000003', '10000115-0000-4000-8000-000000000001', '20000115-0000-4000-8000-000000000004', 25922, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000115-0000-4000-8000-000000000004', '10000115-0000-4000-8000-000000000001', NULL, 11186, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000115-0000-4000-8000-000000000001', '2026-11-28') b),
  '(91446,73358,18088,9968)',
  'case 277: fuzz 20261028/223'
);

-- ── case 278: fuzz 20261028/224 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000116-0000-4000-8000-000000000001', 'parity case 278', '2026-11-11', '2026-11-12', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-10T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000116-0000-4000-8000-000000000001', 'line', 'CAD', 26405, NULL, '10000116-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000116-0000-4000-8000-000000000001', '10000116-0000-4000-8000-000000000001', '2026-09-03', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000116-0000-4000-8000-000000000001', '10000116-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000116-0000-4000-8000-000000000002', '10000116-0000-4000-8000-000000000001', '20000116-0000-4000-8000-000000000001', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000116-0000-4000-8000-000000000003', '10000116-0000-4000-8000-000000000001', '20000116-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000116-0000-4000-8000-000000000004', '10000116-0000-4000-8000-000000000001', '20000116-0000-4000-8000-000000000001', -2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000116-0000-4000-8000-000000000001', '2026-10-22') b),
  '(0,0,0,0)',
  'case 278: fuzz 20261028/224'
);

-- ── case 279: fuzz 20261028/225 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000117-0000-4000-8000-000000000001', 'parity case 279', '2026-11-06', '2026-11-07', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 1543, '2026-11-03T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000117-0000-4000-8000-000000000001', 'parity case 279 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000117-0000-4000-8000-000000000001', '50000117-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000117-0000-4000-8000-000000000001', 'line', 'CAD', 4273, 1, '10000117-0000-4000-8000-000000000001', false),
  ('30000117-0000-4000-8000-000000000002', 'line', 'CAD', 97094, 2, '10000117-0000-4000-8000-000000000001', false),
  ('30000117-0000-4000-8000-000000000003', 'line', 'CAD', 113783, NULL, '10000117-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000117-0000-4000-8000-000000000001', '10000117-0000-4000-8000-000000000001', NULL, -213601, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000117-0000-4000-8000-000000000002', '10000117-0000-4000-8000-000000000001', NULL, 206065, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000117-0000-4000-8000-000000000003', '10000117-0000-4000-8000-000000000001', NULL, 49003, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000117-0000-4000-8000-000000000004', '10000117-0000-4000-8000-000000000001', NULL, 136528, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000117-0000-4000-8000-000000000005', '10000117-0000-4000-8000-000000000001', '60000117-0000-4000-8000-000000000001', 60438, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000117-0000-4000-8000-000000000001', '2026-10-23') b),
  '(313787,-7536,321323,0)',
  'case 279: fuzz 20261028/225'
);

-- ── case 280: fuzz 20261028/226 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000118-0000-4000-8000-000000000001', 'parity case 280', '2026-09-18', '2026-09-19', false, false, NULL, 9.975, NULL, '2026-08-22T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000118-0000-4000-8000-000000000001', 'line', 'USD', 81606, 5, '10000118-0000-4000-8000-000000000001', false),
  ('30000118-0000-4000-8000-000000000002', 'line', 'USD', 79889, 1, '10000118-0000-4000-8000-000000000001', false),
  ('30000118-0000-4000-8000-000000000003', 'line', 'USD', 121028, 1, '10000118-0000-4000-8000-000000000001', true),
  ('30000118-0000-4000-8000-000000000004', 'line', 'USD', 27095, 4, '10000118-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000118-0000-4000-8000-000000000001', '2026-11-02') b),
  '(655780,0,655780,655780)',
  'case 280: fuzz 20261028/226'
);

-- ── case 281: fuzz 20261028/227 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000119-0000-4000-8000-000000000001', 'parity case 281', '2026-12-24', '2026-12-25', false, false, '0ff1ce00-0000-4000-8000-000000000004', 7.5, NULL, '2026-12-13T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000119-0000-4000-8000-000000000001', 'line', 'USD', 118644, 5, '10000119-0000-4000-8000-000000000001', false),
  ('30000119-0000-4000-8000-000000000002', 'line', 'USD', 111390, 5, '10000119-0000-4000-8000-000000000001', true),
  ('30000119-0000-4000-8000-000000000003', 'line', 'USD', 32413, 5, '10000119-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000119-0000-4000-8000-000000000001', '10000119-0000-4000-8000-000000000001', '2026-11-03', 'USD', 5776),
  ('20000119-0000-4000-8000-000000000002', '10000119-0000-4000-8000-000000000001', '2026-09-17', 'USD', 2588),
  ('20000119-0000-4000-8000-000000000003', '10000119-0000-4000-8000-000000000001', '2026-09-11', 'USD', 2826),
  ('20000119-0000-4000-8000-000000000004', '10000119-0000-4000-8000-000000000001', '2026-10-07', 'USD', 2367);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000119-0000-4000-8000-000000000001', '10000119-0000-4000-8000-000000000001', '20000119-0000-4000-8000-000000000001', 251761, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000119-0000-4000-8000-000000000002', '10000119-0000-4000-8000-000000000001', NULL, 44147, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000119-0000-4000-8000-000000000003', '10000119-0000-4000-8000-000000000001', '20000119-0000-4000-8000-000000000001', -212311, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000119-0000-4000-8000-000000000001', '2026-10-25') b),
  '(637712,251761,385951,385951)',
  'case 281: fuzz 20261028/227'
);

-- ── case 282: fuzz 20261028/228 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011a-0000-4000-8000-000000000001', 'parity case 282', '2026-11-25', '2026-11-26', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 2207, '2026-10-22T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011a-0000-4000-8000-000000000001', 'line', 'CAD', 145956, 5, '1000011a-0000-4000-8000-000000000001', false),
  ('3000011a-0000-4000-8000-000000000002', 'line', 'CAD', 66895, 1, '1000011a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000011a-0000-4000-8000-000000000001', '1000011a-0000-4000-8000-000000000001', '2026-12-09', 'CAD', 1601),
  ('2000011a-0000-4000-8000-000000000002', '1000011a-0000-4000-8000-000000000001', '2026-12-01', 'CAD', 1799),
  ('2000011a-0000-4000-8000-000000000003', '1000011a-0000-4000-8000-000000000001', '2027-01-01', 'CAD', 4314),
  ('2000011a-0000-4000-8000-000000000004', '1000011a-0000-4000-8000-000000000001', '2026-11-24', 'CAD', 2286);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011a-0000-4000-8000-000000000001', '1000011a-0000-4000-8000-000000000001', NULL, 269301, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011a-0000-4000-8000-000000000002', '1000011a-0000-4000-8000-000000000001', '2000011a-0000-4000-8000-000000000002', 165996, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011a-0000-4000-8000-000000000001', '2026-11-25') b),
  '(798882,435297,363585,0)',
  'case 282: fuzz 20261028/228'
);

-- ── case 283: fuzz 20261028/229 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011b-0000-4000-8000-000000000001', 'parity case 283', '2026-10-31', '2026-11-01', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-09-22T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011b-0000-4000-8000-000000000001', 'line', 'CAD', 13105, 5, '1000011b-0000-4000-8000-000000000001', true),
  ('3000011b-0000-4000-8000-000000000002', 'line', 'CAD', 83994, 4, '1000011b-0000-4000-8000-000000000001', false),
  ('3000011b-0000-4000-8000-000000000003', 'line', 'CAD', -46743, 4, '1000011b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000011b-0000-4000-8000-000000000001', '1000011b-0000-4000-8000-000000000001', '2026-11-23', 'CAD', 1204),
  ('2000011b-0000-4000-8000-000000000002', '1000011b-0000-4000-8000-000000000001', '2026-11-10', 'CAD', 8796);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011b-0000-4000-8000-000000000001', '1000011b-0000-4000-8000-000000000001', NULL, 107369, ' CAD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000011b-0000-4000-8000-000000000002', '1000011b-0000-4000-8000-000000000001', NULL, 76616, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011b-0000-4000-8000-000000000003', '1000011b-0000-4000-8000-000000000001', '2000011b-0000-4000-8000-000000000002', 59881, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011b-0000-4000-8000-000000000004', '1000011b-0000-4000-8000-000000000001', NULL, 60700, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011b-0000-4000-8000-000000000001', '2026-12-06') b),
  '(149004,197197,0,0)',
  'case 283: fuzz 20261028/229'
);

-- ── case 284: fuzz 20261028/230 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011c-0000-4000-8000-000000000001', 'parity case 284', '2026-10-31', '2026-11-01', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-20T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011c-0000-4000-8000-000000000001', 'line', 'USD', 129551, 1, '1000011c-0000-4000-8000-000000000001', false),
  ('3000011c-0000-4000-8000-000000000002', 'line', 'USD', 92515, 1, '1000011c-0000-4000-8000-000000000001', false),
  ('3000011c-0000-4000-8000-000000000003', 'line', 'USD', 30863, 5, '1000011c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000011c-0000-4000-8000-000000000001', '1000011c-0000-4000-8000-000000000001', '2026-10-18', 'USD', 1189),
  ('2000011c-0000-4000-8000-000000000002', '1000011c-0000-4000-8000-000000000001', '2026-10-21', 'USD', 3035),
  ('2000011c-0000-4000-8000-000000000003', '1000011c-0000-4000-8000-000000000001', '2026-11-15', 'USD', 2225),
  ('2000011c-0000-4000-8000-000000000004', '1000011c-0000-4000-8000-000000000001', '2026-09-27', 'USD', 4709),
  ('2000011c-0000-4000-8000-000000000005', '1000011c-0000-4000-8000-000000000001', '2026-12-15', 'USD', 1047);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011c-0000-4000-8000-000000000001', '1000011c-0000-4000-8000-000000000001', '2000011c-0000-4000-8000-000000000001', 282941, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011c-0000-4000-8000-000000000002', '1000011c-0000-4000-8000-000000000001', '2000011c-0000-4000-8000-000000000003', -27443, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011c-0000-4000-8000-000000000003', '1000011c-0000-4000-8000-000000000001', '2000011c-0000-4000-8000-000000000005', -125598, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011c-0000-4000-8000-000000000004', '1000011c-0000-4000-8000-000000000001', '2000011c-0000-4000-8000-000000000003', -285509, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011c-0000-4000-8000-000000000005', '1000011c-0000-4000-8000-000000000001', NULL, 123833, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011c-0000-4000-8000-000000000001', '2026-11-20') b),
  '(376381,-4333,380714,380714)',
  'case 284: fuzz 20261028/230'
);

-- ── case 285: fuzz 20261028/231 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011d-0000-4000-8000-000000000001', 'parity case 285', '2026-09-26', '2026-09-27', false, false, '0ff1ce00-0000-4000-8000-000000000007', 0, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011d-0000-4000-8000-000000000001', 'line', 'CAD', 130765, 4, '1000011d-0000-4000-8000-000000000001', false),
  ('3000011d-0000-4000-8000-000000000002', 'line', 'CAD', 91066, NULL, '1000011d-0000-4000-8000-000000000001', false),
  ('3000011d-0000-4000-8000-000000000003', 'line', 'CAD', 15895, NULL, '1000011d-0000-4000-8000-000000000001', false),
  ('3000011d-0000-4000-8000-000000000004', 'line', 'CAD', 148423, 1, '1000011d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000011d-0000-4000-8000-000000000001', '1000011d-0000-4000-8000-000000000001', '2026-12-22', 'CAD', 8633),
  ('2000011d-0000-4000-8000-000000000002', '1000011d-0000-4000-8000-000000000001', '2026-12-20', 'CAD', 1367);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011d-0000-4000-8000-000000000001', '1000011d-0000-4000-8000-000000000001', '2000011d-0000-4000-8000-000000000001', 16525, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011d-0000-4000-8000-000000000002', '1000011d-0000-4000-8000-000000000001', '2000011d-0000-4000-8000-000000000002', -186471, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011d-0000-4000-8000-000000000003', '1000011d-0000-4000-8000-000000000001', NULL, 55719, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000011d-0000-4000-8000-000000000004', '1000011d-0000-4000-8000-000000000001', NULL, 2737, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011d-0000-4000-8000-000000000005', '1000011d-0000-4000-8000-000000000001', NULL, 72444, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011d-0000-4000-8000-000000000006', '1000011d-0000-4000-8000-000000000001', '2000011d-0000-4000-8000-000000000001', -221494, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011d-0000-4000-8000-000000000001', '2026-10-29') b),
  '(778444,0,778444,0)',
  'case 285: fuzz 20261028/231'
);

-- ── case 286: fuzz 20261028/232 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011e-0000-4000-8000-000000000001', 'parity case 286', '2026-12-15', '2026-12-16', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-11-07T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011e-0000-4000-8000-000000000001', 'line', 'USD', 135682, 1, '1000011e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000011e-0000-4000-8000-000000000001', '1000011e-0000-4000-8000-000000000001', '2026-10-22', 'USD', 713),
  ('2000011e-0000-4000-8000-000000000002', '1000011e-0000-4000-8000-000000000001', '2027-01-28', 'USD', 1650),
  ('2000011e-0000-4000-8000-000000000003', '1000011e-0000-4000-8000-000000000001', '2027-01-28', 'USD', 1606),
  ('2000011e-0000-4000-8000-000000000004', '1000011e-0000-4000-8000-000000000001', '2027-01-27', 'USD', 1610),
  ('2000011e-0000-4000-8000-000000000005', '1000011e-0000-4000-8000-000000000001', '2026-11-13', 'USD', 4421);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011e-0000-4000-8000-000000000001', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000004', 63221, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000002', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000003', -123148, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000003', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000004', 133981, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000004', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000005', 14658, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000005', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000004', 43821, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000006', '1000011e-0000-4000-8000-000000000001', NULL, 95721, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000007', '1000011e-0000-4000-8000-000000000001', '2000011e-0000-4000-8000-000000000001', 79896, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011e-0000-4000-8000-000000000008', '1000011e-0000-4000-8000-000000000001', NULL, -71938, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011e-0000-4000-8000-000000000001', '2026-12-06') b),
  '(135682,236212,0,0)',
  'case 286: fuzz 20261028/232'
);

-- ── case 287: fuzz 20261028/233 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000011f-0000-4000-8000-000000000001', 'parity case 287', '2026-09-21', '2026-09-22', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-10T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000011f-0000-4000-8000-000000000001', 'line', 'USD', 18345, 1, '1000011f-0000-4000-8000-000000000001', false),
  ('3000011f-0000-4000-8000-000000000002', 'line', 'USD', 138045, 5, '1000011f-0000-4000-8000-000000000001', false),
  ('3000011f-0000-4000-8000-000000000003', 'line', 'USD', 12833, 1, '1000011f-0000-4000-8000-000000000001', false),
  ('3000011f-0000-4000-8000-000000000004', 'line', 'USD', 124192, 5, '1000011f-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000011f-0000-4000-8000-000000000001', '1000011f-0000-4000-8000-000000000001', NULL, 82626, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011f-0000-4000-8000-000000000002', '1000011f-0000-4000-8000-000000000001', NULL, 266240, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011f-0000-4000-8000-000000000003', '1000011f-0000-4000-8000-000000000001', NULL, 183910, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000011f-0000-4000-8000-000000000004', '1000011f-0000-4000-8000-000000000001', NULL, -99509, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000011f-0000-4000-8000-000000000001', '2026-11-04') b),
  '(721403,167027,554376,554376)',
  'case 287: fuzz 20261028/233'
);

-- ── case 288: fuzz 20261028/234 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000120-0000-4000-8000-000000000001', 'parity case 288', '2026-11-01', '2026-11-02', false, false, NULL, 0, NULL, '2026-10-06T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000120-0000-4000-8000-000000000001', 'line', 'USD', 43976, 4, '10000120-0000-4000-8000-000000000001', true),
  ('30000120-0000-4000-8000-000000000002', 'line', 'USD', 28759, 5, '10000120-0000-4000-8000-000000000001', false),
  ('30000120-0000-4000-8000-000000000003', 'line', 'USD', 16196, 4, '10000120-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000120-0000-4000-8000-000000000001', '10000120-0000-4000-8000-000000000001', '2026-11-21', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000120-0000-4000-8000-000000000001', '10000120-0000-4000-8000-000000000001', '20000120-0000-4000-8000-000000000001', 87421, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000120-0000-4000-8000-000000000002', '10000120-0000-4000-8000-000000000001', NULL, 182401, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000120-0000-4000-8000-000000000001', '2026-12-04') b),
  '(208579,87421,121158,121158)',
  'case 288: fuzz 20261028/234'
);

-- ── case 289: fuzz 20261028/235 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000121-0000-4000-8000-000000000001', 'parity case 289', '2026-11-11', '2026-11-12', false, false, '0ff1ce00-0000-4000-8000-000000000002', 15, NULL, '2026-10-23T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000121-0000-4000-8000-000000000001', 'line', 'CAD', 49712, NULL, '10000121-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000121-0000-4000-8000-000000000001', '10000121-0000-4000-8000-000000000001', NULL, 38951, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000002', '10000121-0000-4000-8000-000000000001', NULL, 48294, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000003', '10000121-0000-4000-8000-000000000001', NULL, 44944, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000004', '10000121-0000-4000-8000-000000000001', NULL, 42228, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000005', '10000121-0000-4000-8000-000000000001', NULL, -200, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000006', '10000121-0000-4000-8000-000000000001', NULL, 5955, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000007', '10000121-0000-4000-8000-000000000001', NULL, 27671, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000121-0000-4000-8000-000000000008', '10000121-0000-4000-8000-000000000001', NULL, 29380, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000121-0000-4000-8000-000000000001', '2026-11-04') b),
  '(57169,159549,0,0)',
  'case 289: fuzz 20261028/235'
);

-- ── case 290: fuzz 20261028/236 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000122-0000-4000-8000-000000000001', 'parity case 290', '2026-11-28', '2026-11-29', false, false, '0ff1ce00-0000-4000-8000-000000000004', 7.5, NULL, '2026-11-24T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000122-0000-4000-8000-000000000001', '10000122-0000-4000-8000-000000000001', '2026-12-06', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000122-0000-4000-8000-000000000001', '10000122-0000-4000-8000-000000000001', '20000122-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000122-0000-4000-8000-000000000002', '10000122-0000-4000-8000-000000000001', '20000122-0000-4000-8000-000000000001', 1, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000122-0000-4000-8000-000000000003', '10000122-0000-4000-8000-000000000001', '20000122-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000122-0000-4000-8000-000000000004', '10000122-0000-4000-8000-000000000001', NULL, -1, 'usd', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000122-0000-4000-8000-000000000005', '10000122-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000122-0000-4000-8000-000000000006', '10000122-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000122-0000-4000-8000-000000000007', '10000122-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000122-0000-4000-8000-000000000008', '10000122-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000122-0000-4000-8000-000000000001', '2026-11-03') b),
  '(0,3,0,0)',
  'case 290: fuzz 20261028/236'
);

-- ── case 291: fuzz 20261028/237 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000123-0000-4000-8000-000000000001', 'parity case 291', '2026-11-01', '2026-11-02', false, false, '0ff1ce00-0000-4000-8000-000000000002', 7.5, NULL, '2026-11-01T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000123-0000-4000-8000-000000000001', '10000123-0000-4000-8000-000000000001', '2027-02-07', 'CAD', 3881),
  ('20000123-0000-4000-8000-000000000002', '10000123-0000-4000-8000-000000000001', '2026-12-22', 'CAD', 5948);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000123-0000-4000-8000-000000000001', '2026-12-14') b),
  '(0,0,0,0)',
  'case 291: fuzz 20261028/237'
);

-- ── case 292: fuzz 20261028/238 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000124-0000-4000-8000-000000000001', 'parity case 292', '2026-09-25', '2026-09-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', 5, 2146, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000124-0000-4000-8000-000000000001', 'line', 'CAD', 36810, 2, '10000124-0000-4000-8000-000000000001', false),
  ('30000124-0000-4000-8000-000000000002', 'line', 'CAD', 111167, NULL, '10000124-0000-4000-8000-000000000001', true),
  ('30000124-0000-4000-8000-000000000003', 'line', 'CAD', 26586, 5, '10000124-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000124-0000-4000-8000-000000000001', '10000124-0000-4000-8000-000000000001', NULL, -169465, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000124-0000-4000-8000-000000000001', '2026-10-23') b),
  '(208696,-169465,378161,378161)',
  'case 292: fuzz 20261028/238'
);

-- ── case 293: fuzz 20261028/239 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000125-0000-4000-8000-000000000001', 'parity case 293', '2027-02-09', '2027-02-10', false, false, NULL, NULL, NULL, '2027-01-10T23:45:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000125-0000-4000-8000-000000000001', 'parity case 293 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000125-0000-4000-8000-000000000001', '50000125-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000125-0000-4000-8000-000000000001', '10000125-0000-4000-8000-000000000001', '2027-01-26', 'USD', 5275),
  ('20000125-0000-4000-8000-000000000002', '10000125-0000-4000-8000-000000000001', '2026-12-26', 'USD', 320),
  ('20000125-0000-4000-8000-000000000003', '10000125-0000-4000-8000-000000000001', '2026-12-02', 'USD', 247),
  ('20000125-0000-4000-8000-000000000004', '10000125-0000-4000-8000-000000000001', '2026-11-08', 'USD', 4158);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000125-0000-4000-8000-000000000001', '10000125-0000-4000-8000-000000000001', '20000125-0000-4000-8000-000000000004', 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000002', '10000125-0000-4000-8000-000000000001', '20000125-0000-4000-8000-000000000003', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000003', '10000125-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000004', '10000125-0000-4000-8000-000000000001', '20000125-0000-4000-8000-000000000002', 1, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000005', '10000125-0000-4000-8000-000000000001', '20000125-0000-4000-8000-000000000002', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000006', '10000125-0000-4000-8000-000000000001', '60000125-0000-4000-8000-000000000001', -2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000125-0000-4000-8000-000000000007', '10000125-0000-4000-8000-000000000001', '20000125-0000-4000-8000-000000000004', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000125-0000-4000-8000-000000000001', '2026-12-14') b),
  '(0,2,0,0)',
  'case 293: fuzz 20261028/239'
);

-- ── case 294: fuzz 20261028/240 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000126-0000-4000-8000-000000000001', 'parity case 294', '2027-01-14', '2027-01-15', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, 1327, '2026-12-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000126-0000-4000-8000-000000000001', 'line', 'USD', 4362, 4, '10000126-0000-4000-8000-000000000001', false),
  ('30000126-0000-4000-8000-000000000002', 'line', 'USD', 42862, 4, '10000126-0000-4000-8000-000000000001', false),
  ('30000126-0000-4000-8000-000000000003', 'line', 'USD', 23067, 1, '10000126-0000-4000-8000-000000000001', false),
  ('30000126-0000-4000-8000-000000000004', 'line', 'USD', 122802, 2, '10000126-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000126-0000-4000-8000-000000000001', '10000126-0000-4000-8000-000000000001', '2026-11-11', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000126-0000-4000-8000-000000000001', '10000126-0000-4000-8000-000000000001', NULL, -32640, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000126-0000-4000-8000-000000000002', '10000126-0000-4000-8000-000000000001', NULL, 224064, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000126-0000-4000-8000-000000000003', '10000126-0000-4000-8000-000000000001', '20000126-0000-4000-8000-000000000001', -289599, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000126-0000-4000-8000-000000000004', '10000126-0000-4000-8000-000000000001', '20000126-0000-4000-8000-000000000001', 109186, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000126-0000-4000-8000-000000000005', '10000126-0000-4000-8000-000000000001', '20000126-0000-4000-8000-000000000001', 184713, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000126-0000-4000-8000-000000000006', '10000126-0000-4000-8000-000000000001', NULL, 121014, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000126-0000-4000-8000-000000000001', '2026-12-09') b),
  '(458894,119178,339716,339716)',
  'case 294: fuzz 20261028/240'
);

-- ── case 295: fuzz 20261028/241 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000127-0000-4000-8000-000000000001', 'parity case 295', '2026-12-12', '2026-12-13', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-11-04T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000127-0000-4000-8000-000000000001', 'line', 'CAD', 124565, 1, '10000127-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000127-0000-4000-8000-000000000001', '10000127-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000127-0000-4000-8000-000000000001', '2026-12-12') b),
  '(0,2,0,0)',
  'case 295: fuzz 20261028/241'
);

-- ── case 296: fuzz 20261028/242 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000128-0000-4000-8000-000000000001', 'parity case 296', '2026-10-03', '2026-10-04', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-23T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000128-0000-4000-8000-000000000001', 'line', 'USD', 126074, 5, '10000128-0000-4000-8000-000000000001', true),
  ('30000128-0000-4000-8000-000000000002', 'line', 'USD', 57232, 5, '10000128-0000-4000-8000-000000000001', false),
  ('30000128-0000-4000-8000-000000000003', 'line', 'USD', 94044, 5, '10000128-0000-4000-8000-000000000001', false),
  ('30000128-0000-4000-8000-000000000004', 'line', 'USD', 96190, 3, '10000128-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000128-0000-4000-8000-000000000001', '10000128-0000-4000-8000-000000000001', '2026-10-21', 'USD', 6716),
  ('20000128-0000-4000-8000-000000000002', '10000128-0000-4000-8000-000000000001', '2026-10-01', 'USD', 3284);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000128-0000-4000-8000-000000000001', '10000128-0000-4000-8000-000000000001', '20000128-0000-4000-8000-000000000002', 231932, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000128-0000-4000-8000-000000000002', '10000128-0000-4000-8000-000000000001', NULL, -274131, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000128-0000-4000-8000-000000000003', '10000128-0000-4000-8000-000000000001', NULL, -115162, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000128-0000-4000-8000-000000000004', '10000128-0000-4000-8000-000000000001', '20000128-0000-4000-8000-000000000002', 130817, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000128-0000-4000-8000-000000000001', '2026-11-26') b),
  '(1044950,-258476,1303426,1044950)',
  'case 296: fuzz 20261028/242'
);

-- ── case 297: fuzz 20261028/243 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000129-0000-4000-8000-000000000001', 'parity case 297', '2026-12-14', '2026-12-15', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, 2345, '2026-12-03T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000129-0000-4000-8000-000000000001', 'line', 'CAD', 59904, 4, '10000129-0000-4000-8000-000000000001', false),
  ('30000129-0000-4000-8000-000000000002', 'line', 'CAD', 75170, NULL, '10000129-0000-4000-8000-000000000001', false),
  ('30000129-0000-4000-8000-000000000003', 'line', 'CAD', 91209, NULL, '10000129-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000129-0000-4000-8000-000000000001', '10000129-0000-4000-8000-000000000001', '2026-11-11', 'CAD', 3665),
  ('20000129-0000-4000-8000-000000000002', '10000129-0000-4000-8000-000000000001', '2026-09-21', 'CAD', 3104),
  ('20000129-0000-4000-8000-000000000003', '10000129-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 2717),
  ('20000129-0000-4000-8000-000000000004', '10000129-0000-4000-8000-000000000001', '2026-12-13', 'CAD', 514);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000129-0000-4000-8000-000000000001', '10000129-0000-4000-8000-000000000001', NULL, 123519, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000129-0000-4000-8000-000000000002', '10000129-0000-4000-8000-000000000001', NULL, 182695, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000129-0000-4000-8000-000000000003', '10000129-0000-4000-8000-000000000001', '20000129-0000-4000-8000-000000000002', -271002, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000129-0000-4000-8000-000000000004', '10000129-0000-4000-8000-000000000001', NULL, 224329, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000129-0000-4000-8000-000000000005', '10000129-0000-4000-8000-000000000001', NULL, 154099, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000129-0000-4000-8000-000000000001', '2026-11-13') b),
  '(408340,290121,118219,0)',
  'case 297: fuzz 20261028/243'
);

-- ── case 298: fuzz 20261028/244 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012a-0000-4000-8000-000000000001', 'parity case 298', '2026-10-22', '2026-10-23', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-10-14T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000012a-0000-4000-8000-000000000001', 'parity case 298 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000012a-0000-4000-8000-000000000001', '5000012a-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000012a-0000-4000-8000-000000000001', 'line', 'CAD', 12958, 2, '1000012a-0000-4000-8000-000000000001', false),
  ('3000012a-0000-4000-8000-000000000002', 'line', 'CAD', 3946, 5, '1000012a-0000-4000-8000-000000000001', false),
  ('3000012a-0000-4000-8000-000000000003', 'line', 'CAD', -16436, 4, '1000012a-0000-4000-8000-000000000001', false),
  ('3000012a-0000-4000-8000-000000000004', 'line', 'CAD', 64627, 3, '1000012a-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000012a-0000-4000-8000-000000000001', '1000012a-0000-4000-8000-000000000001', '2026-12-05', 'CAD', 8149),
  ('2000012a-0000-4000-8000-000000000002', '1000012a-0000-4000-8000-000000000001', '2027-01-09', 'CAD', 1851);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000012a-0000-4000-8000-000000000001', '1000012a-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000002', '1000012a-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000003', '1000012a-0000-4000-8000-000000000001', '2000012a-0000-4000-8000-000000000002', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000004', '1000012a-0000-4000-8000-000000000001', '2000012a-0000-4000-8000-000000000002', 2, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000005', '1000012a-0000-4000-8000-000000000001', '2000012a-0000-4000-8000-000000000002', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000006', '1000012a-0000-4000-8000-000000000001', '2000012a-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000007', '1000012a-0000-4000-8000-000000000001', '2000012a-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012a-0000-4000-8000-000000000008', '1000012a-0000-4000-8000-000000000001', '6000012a-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012a-0000-4000-8000-000000000001', '2026-11-21') b),
  '(0,7,0,0)',
  'case 298: fuzz 20261028/244'
);

-- ── case 299: fuzz 20261028/245 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012b-0000-4000-8000-000000000001', 'parity case 299', '2026-09-12', '2026-09-13', false, false, '0ff1ce00-0000-4000-8000-000000000001', 15, NULL, '2026-08-13T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000012b-0000-4000-8000-000000000001', 'line', 'CAD', 48522, 4, '1000012b-0000-4000-8000-000000000001', false),
  ('3000012b-0000-4000-8000-000000000002', 'line', 'CAD', 26212, 2, '1000012b-0000-4000-8000-000000000001', false),
  ('3000012b-0000-4000-8000-000000000003', 'line', 'CAD', 105540, 2, '1000012b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000012b-0000-4000-8000-000000000001', '1000012b-0000-4000-8000-000000000001', NULL, 281469, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000012b-0000-4000-8000-000000000002', '1000012b-0000-4000-8000-000000000001', NULL, 54913, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012b-0000-4000-8000-000000000003', '1000012b-0000-4000-8000-000000000001', NULL, 243500, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012b-0000-4000-8000-000000000004', '1000012b-0000-4000-8000-000000000001', NULL, 100480, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012b-0000-4000-8000-000000000005', '1000012b-0000-4000-8000-000000000001', NULL, 203549, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012b-0000-4000-8000-000000000001', '2026-10-25') b),
  '(526231,602442,0,0)',
  'case 299: fuzz 20261028/245'
);

-- ── case 300: fuzz 20261028/246 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012c-0000-4000-8000-000000000001', 'parity case 300', '2027-01-20', '2027-01-21', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2027-01-16T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000012c-0000-4000-8000-000000000001', 'parity case 300 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000012c-0000-4000-8000-000000000001', '5000012c-0000-4000-8000-000000000001', '2026-10-01', 'CAD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000012c-0000-4000-8000-000000000001', 'line', 'CAD', 102980, 3, '1000012c-0000-4000-8000-000000000001', true),
  ('3000012c-0000-4000-8000-000000000002', 'line', 'CAD', 67428, 5, '1000012c-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000012c-0000-4000-8000-000000000001', '1000012c-0000-4000-8000-000000000001', '2026-11-28', 'CAD', 276),
  ('2000012c-0000-4000-8000-000000000002', '1000012c-0000-4000-8000-000000000001', '2026-10-30', 'CAD', 4660),
  ('2000012c-0000-4000-8000-000000000003', '1000012c-0000-4000-8000-000000000001', '2026-11-18', 'CAD', 236),
  ('2000012c-0000-4000-8000-000000000004', '1000012c-0000-4000-8000-000000000001', '2026-10-24', 'CAD', 1056);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000012c-0000-4000-8000-000000000001', '1000012c-0000-4000-8000-000000000001', '6000012c-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000002', '1000012c-0000-4000-8000-000000000001', '2000012c-0000-4000-8000-000000000004', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000003', '1000012c-0000-4000-8000-000000000001', '2000012c-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000004', '1000012c-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000005', '1000012c-0000-4000-8000-000000000001', '2000012c-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000006', '1000012c-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000007', '1000012c-0000-4000-8000-000000000001', NULL, -1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012c-0000-4000-8000-000000000008', '1000012c-0000-4000-8000-000000000001', '2000012c-0000-4000-8000-000000000001', 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012c-0000-4000-8000-000000000001', '2026-12-14') b),
  '(0,8,0,0)',
  'case 300: fuzz 20261028/246'
);

-- ── case 301: fuzz 20261028/247 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012d-0000-4000-8000-000000000001', 'parity case 301', '2026-12-07', '2026-12-08', false, false, NULL, 15, 2735, '2026-11-22T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000012d-0000-4000-8000-000000000001', 'line', 'USD', 66716, 1, '1000012d-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012d-0000-4000-8000-000000000001', '2026-11-03') b),
  '(69451,0,69451,0)',
  'case 301: fuzz 20261028/247'
);

-- ── case 302: fuzz 20261028/248 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012e-0000-4000-8000-000000000001', 'parity case 302', '2026-12-24', '2026-12-25', false, false, NULL, NULL, NULL, '2026-11-18T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000012e-0000-4000-8000-000000000001', '1000012e-0000-4000-8000-000000000001', '2026-09-20', 'USD', 431),
  ('2000012e-0000-4000-8000-000000000002', '1000012e-0000-4000-8000-000000000001', '2026-09-18', 'USD', 7056),
  ('2000012e-0000-4000-8000-000000000003', '1000012e-0000-4000-8000-000000000001', '2026-09-27', 'USD', 2513);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000012e-0000-4000-8000-000000000001', '1000012e-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012e-0000-4000-8000-000000000002', '1000012e-0000-4000-8000-000000000001', '2000012e-0000-4000-8000-000000000001', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012e-0000-4000-8000-000000000003', '1000012e-0000-4000-8000-000000000001', NULL, 1, 'USD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012e-0000-4000-8000-000000000004', '1000012e-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012e-0000-4000-8000-000000000005', '1000012e-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012e-0000-4000-8000-000000000006', '1000012e-0000-4000-8000-000000000001', '2000012e-0000-4000-8000-000000000003', 1, ' USD ', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012e-0000-4000-8000-000000000001', '2026-10-26') b),
  '(0,3,0,0)',
  'case 302: fuzz 20261028/248'
);

-- ── case 303: fuzz 20261028/249 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000012f-0000-4000-8000-000000000001', 'parity case 303', '2026-11-17', '2026-11-18', false, false, '0ff1ce00-0000-4000-8000-000000000001', 5, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000012f-0000-4000-8000-000000000001', 'line', 'CAD', -37908, NULL, '1000012f-0000-4000-8000-000000000001', false),
  ('3000012f-0000-4000-8000-000000000002', 'line', 'CAD', 107016, NULL, '1000012f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000012f-0000-4000-8000-000000000001', '1000012f-0000-4000-8000-000000000001', NULL, 14838, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000012f-0000-4000-8000-000000000002', '1000012f-0000-4000-8000-000000000001', NULL, 33129, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000012f-0000-4000-8000-000000000001', '2026-11-21') b),
  '(72563,33129,39434,39434)',
  'case 303: fuzz 20261028/249'
);

-- ── case 304: fuzz 20261028/250 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000130-0000-4000-8000-000000000001', 'parity case 304', '2026-12-12', '2026-12-13', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-19T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000130-0000-4000-8000-000000000001', 'line', 'CAD', 30927, 2, '10000130-0000-4000-8000-000000000001', false),
  ('30000130-0000-4000-8000-000000000002', 'line', 'CAD', 77164, NULL, '10000130-0000-4000-8000-000000000001', false),
  ('30000130-0000-4000-8000-000000000003', 'line', 'CAD', -26719, 2, '10000130-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000130-0000-4000-8000-000000000001', '10000130-0000-4000-8000-000000000001', '2026-09-24', 'CAD', 786),
  ('20000130-0000-4000-8000-000000000002', '10000130-0000-4000-8000-000000000001', '2026-09-25', 'CAD', 9214);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000130-0000-4000-8000-000000000001', '2026-11-23') b),
  '(85580,0,85580,85580)',
  'case 304: fuzz 20261028/250'
);

-- ── case 305: fuzz 20261028/251 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000131-0000-4000-8000-000000000001', 'parity case 305', '2026-09-26', '2026-09-27', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000131-0000-4000-8000-000000000001', 'line', 'CAD', 146932, NULL, '10000131-0000-4000-8000-000000000001', false),
  ('30000131-0000-4000-8000-000000000002', 'line', 'CAD', 10924, 2, '10000131-0000-4000-8000-000000000001', false),
  ('30000131-0000-4000-8000-000000000003', 'line', 'CAD', 145436, 5, '10000131-0000-4000-8000-000000000001', false),
  ('30000131-0000-4000-8000-000000000004', 'line', 'CAD', 53383, 5, '10000131-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000131-0000-4000-8000-000000000001', '10000131-0000-4000-8000-000000000001', NULL, 145318, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000131-0000-4000-8000-000000000002', '10000131-0000-4000-8000-000000000001', NULL, 80263, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000131-0000-4000-8000-000000000003', '10000131-0000-4000-8000-000000000001', NULL, 179435, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000131-0000-4000-8000-000000000004', '10000131-0000-4000-8000-000000000001', NULL, -169620, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000131-0000-4000-8000-000000000005', '10000131-0000-4000-8000-000000000001', NULL, -5727, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000131-0000-4000-8000-000000000001', '2026-11-15') b),
  '(1162875,80263,1082612,1082612)',
  'case 305: fuzz 20261028/251'
);

-- ── case 306: fuzz 20261028/252 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000132-0000-4000-8000-000000000001', 'parity case 306', '2026-09-14', '2026-09-15', false, false, '0ff1ce00-0000-4000-8000-000000000008', 5, NULL, '2026-08-17T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000132-0000-4000-8000-000000000001', 'parity case 306 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000132-0000-4000-8000-000000000001', '50000132-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000132-0000-4000-8000-000000000001', 'line', 'USD', 19331, 5, '10000132-0000-4000-8000-000000000001', true),
  ('30000132-0000-4000-8000-000000000002', 'line', 'USD', 114221, NULL, '10000132-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000132-0000-4000-8000-000000000001', '10000132-0000-4000-8000-000000000001', '60000132-0000-4000-8000-000000000001', 78825, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000132-0000-4000-8000-000000000002', '10000132-0000-4000-8000-000000000001', NULL, 66359, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000132-0000-4000-8000-000000000003', '10000132-0000-4000-8000-000000000001', NULL, 105528, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000132-0000-4000-8000-000000000004', '10000132-0000-4000-8000-000000000001', NULL, 35674, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000132-0000-4000-8000-000000000005', '10000132-0000-4000-8000-000000000001', NULL, 107025, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000132-0000-4000-8000-000000000001', '2026-11-08') b),
  '(119932,180858,0,0)',
  'case 306: fuzz 20261028/252'
);

-- ── case 307: fuzz 20261028/253 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000133-0000-4000-8000-000000000001', 'parity case 307', '2026-11-21', '2026-11-22', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, NULL, '2026-10-25T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000133-0000-4000-8000-000000000001', 'line', 'CAD', 117567, 1, '10000133-0000-4000-8000-000000000001', false),
  ('30000133-0000-4000-8000-000000000002', 'line', 'CAD', 17343, NULL, '10000133-0000-4000-8000-000000000001', false),
  ('30000133-0000-4000-8000-000000000003', 'line', 'CAD', 96721, 4, '10000133-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000133-0000-4000-8000-000000000001', '10000133-0000-4000-8000-000000000001', '2027-01-05', 'CAD', 3656),
  ('20000133-0000-4000-8000-000000000002', '10000133-0000-4000-8000-000000000001', '2026-10-28', 'CAD', 6344);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000133-0000-4000-8000-000000000001', '10000133-0000-4000-8000-000000000001', '20000133-0000-4000-8000-000000000001', 130596, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000133-0000-4000-8000-000000000002', '10000133-0000-4000-8000-000000000001', NULL, 92954, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000133-0000-4000-8000-000000000003', '10000133-0000-4000-8000-000000000001', NULL, 59890, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000133-0000-4000-8000-000000000004', '10000133-0000-4000-8000-000000000001', NULL, 12119, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000133-0000-4000-8000-000000000001', '2026-12-02') b),
  '(152448,295559,0,0)',
  'case 307: fuzz 20261028/253'
);

-- ── case 308: fuzz 20261028/254 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000134-0000-4000-8000-000000000001', 'parity case 308', '2026-12-05', '2026-12-06', false, false, '0ff1ce00-0000-4000-8000-000000000001', 15, NULL, '2026-10-28T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000134-0000-4000-8000-000000000001', '10000134-0000-4000-8000-000000000001', NULL, -2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000134-0000-4000-8000-000000000001', '2026-10-19') b),
  '(0,-2,2,0)',
  'case 308: fuzz 20261028/254'
);

-- ── case 309: fuzz 20261028/255 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000135-0000-4000-8000-000000000001', 'parity case 309', '2026-09-25', '2026-09-26', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-08-16T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000135-0000-4000-8000-000000000001', 'line', 'CAD', 117758, 2, '10000135-0000-4000-8000-000000000001', false),
  ('30000135-0000-4000-8000-000000000002', 'line', 'CAD', 40853, 1, '10000135-0000-4000-8000-000000000001', false),
  ('30000135-0000-4000-8000-000000000003', 'line', 'CAD', 93643, 3, '10000135-0000-4000-8000-000000000001', false),
  ('30000135-0000-4000-8000-000000000004', 'line', 'CAD', -9412, 3, '10000135-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000135-0000-4000-8000-000000000001', '10000135-0000-4000-8000-000000000001', '2026-10-16', 'CAD', 2345),
  ('20000135-0000-4000-8000-000000000002', '10000135-0000-4000-8000-000000000001', '2026-09-09', 'CAD', 5044),
  ('20000135-0000-4000-8000-000000000003', '10000135-0000-4000-8000-000000000001', '2026-12-01', 'CAD', 494),
  ('20000135-0000-4000-8000-000000000004', '10000135-0000-4000-8000-000000000001', '2026-11-19', 'CAD', 2117);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000135-0000-4000-8000-000000000001', '10000135-0000-4000-8000-000000000001', NULL, 105607, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000135-0000-4000-8000-000000000002', '10000135-0000-4000-8000-000000000001', NULL, 12488, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000135-0000-4000-8000-000000000001', '2026-11-08') b),
  '(529062,105607,423455,285317)',
  'case 309: fuzz 20261028/255'
);

-- ── case 310: fuzz 20261028/256 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000136-0000-4000-8000-000000000001', 'parity case 310', '2026-12-30', '2026-12-31', false, false, NULL, NULL, NULL, '2026-12-06T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000136-0000-4000-8000-000000000001', 'line', 'USD', 22946, 4, '10000136-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000136-0000-4000-8000-000000000001', '10000136-0000-4000-8000-000000000001', '2026-11-09', 'USD', 2616),
  ('20000136-0000-4000-8000-000000000002', '10000136-0000-4000-8000-000000000001', '2026-10-23', 'USD', 357),
  ('20000136-0000-4000-8000-000000000003', '10000136-0000-4000-8000-000000000001', '2026-12-31', 'USD', 2112),
  ('20000136-0000-4000-8000-000000000004', '10000136-0000-4000-8000-000000000001', '2026-10-15', 'USD', 115),
  ('20000136-0000-4000-8000-000000000005', '10000136-0000-4000-8000-000000000001', '2026-10-09', 'USD', 4800);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000136-0000-4000-8000-000000000001', '10000136-0000-4000-8000-000000000001', '20000136-0000-4000-8000-000000000005', 7873, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000136-0000-4000-8000-000000000001', '2026-11-12') b),
  '(91784,0,91784,72399)',
  'case 310: fuzz 20261028/256'
);

-- ── case 311: fuzz 20261028/257 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000137-0000-4000-8000-000000000001', 'parity case 311', '2026-12-11', '2026-12-12', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-11-07T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000137-0000-4000-8000-000000000001', '10000137-0000-4000-8000-000000000001', '2026-11-17', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000137-0000-4000-8000-000000000001', '10000137-0000-4000-8000-000000000001', NULL, -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000137-0000-4000-8000-000000000002', '10000137-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000137-0000-4000-8000-000000000003', '10000137-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000137-0000-4000-8000-000000000004', '10000137-0000-4000-8000-000000000001', '20000137-0000-4000-8000-000000000001', 1, 'usd', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000137-0000-4000-8000-000000000001', '2026-12-08') b),
  '(0,-1,1,0)',
  'case 311: fuzz 20261028/257'
);

-- ── case 312: fuzz 20261028/258 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000138-0000-4000-8000-000000000001', 'parity case 312', '2026-11-12', '2026-11-13', false, false, NULL, NULL, NULL, '2026-10-26T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000138-0000-4000-8000-000000000001', '10000138-0000-4000-8000-000000000001', '2026-12-08', 'USD', 8950),
  ('20000138-0000-4000-8000-000000000002', '10000138-0000-4000-8000-000000000001', '2026-12-26', 'USD', 1050);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000138-0000-4000-8000-000000000001', '10000138-0000-4000-8000-000000000001', NULL, 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000138-0000-4000-8000-000000000002', '10000138-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000138-0000-4000-8000-000000000003', '10000138-0000-4000-8000-000000000001', '20000138-0000-4000-8000-000000000001', -1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000138-0000-4000-8000-000000000001', '2026-12-15') b),
  '(0,1,0,0)',
  'case 312: fuzz 20261028/258'
);

-- ── case 313: fuzz 20261028/259 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000139-0000-4000-8000-000000000001', 'parity case 313', '2026-12-26', '2026-12-27', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-25T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000139-0000-4000-8000-000000000001', '10000139-0000-4000-8000-000000000001', '2026-10-22', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000139-0000-4000-8000-000000000001', '10000139-0000-4000-8000-000000000001', '20000139-0000-4000-8000-000000000001', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000139-0000-4000-8000-000000000002', '10000139-0000-4000-8000-000000000001', '20000139-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000139-0000-4000-8000-000000000001', '2026-11-12') b),
  '(0,2,0,0)',
  'case 313: fuzz 20261028/259'
);

-- ── case 314: fuzz 20261028/260 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013a-0000-4000-8000-000000000001', 'parity case 314', '2026-12-25', '2026-12-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, 2923, '2026-11-20T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000013a-0000-4000-8000-000000000001', 'line', 'CAD', 844, 4, '1000013a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000013a-0000-4000-8000-000000000001', '1000013a-0000-4000-8000-000000000001', '2027-01-03', 'CAD', 5833),
  ('2000013a-0000-4000-8000-000000000002', '1000013a-0000-4000-8000-000000000001', '2026-11-07', 'CAD', 4658),
  ('2000013a-0000-4000-8000-000000000003', '1000013a-0000-4000-8000-000000000001', '2026-12-09', 'CAD', 5401),
  ('2000013a-0000-4000-8000-000000000004', '1000013a-0000-4000-8000-000000000001', '2026-11-12', 'CAD', 5917),
  ('2000013a-0000-4000-8000-000000000005', '1000013a-0000-4000-8000-000000000001', '2026-12-29', 'CAD', 1562);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013a-0000-4000-8000-000000000001', '1000013a-0000-4000-8000-000000000001', '2000013a-0000-4000-8000-000000000001', 3001, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013a-0000-4000-8000-000000000001', '2026-12-13') b),
  '(6299,3001,3298,3298)',
  'case 314: fuzz 20261028/260'
);

-- ── case 315: fuzz 20261028/261 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013b-0000-4000-8000-000000000001', 'parity case 315', '2026-09-22', '2026-09-23', false, false, '0ff1ce00-0000-4000-8000-000000000002', 15, NULL, '2026-09-11T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000013b-0000-4000-8000-000000000001', '1000013b-0000-4000-8000-000000000001', '2026-11-06', 'CAD', 2487),
  ('2000013b-0000-4000-8000-000000000002', '1000013b-0000-4000-8000-000000000001', '2026-11-19', 'CAD', 1656),
  ('2000013b-0000-4000-8000-000000000003', '1000013b-0000-4000-8000-000000000001', '2026-09-23', 'CAD', 1426),
  ('2000013b-0000-4000-8000-000000000004', '1000013b-0000-4000-8000-000000000001', '2026-11-14', 'CAD', 2334),
  ('2000013b-0000-4000-8000-000000000005', '1000013b-0000-4000-8000-000000000001', '2026-09-01', 'CAD', 2097);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013b-0000-4000-8000-000000000001', '1000013b-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013b-0000-4000-8000-000000000002', '1000013b-0000-4000-8000-000000000001', '2000013b-0000-4000-8000-000000000001', 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013b-0000-4000-8000-000000000001', '2026-10-23') b),
  '(0,3,0,0)',
  'case 315: fuzz 20261028/261'
);

-- ── case 316: fuzz 20261028/262 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013c-0000-4000-8000-000000000001', 'parity case 316', '2026-10-10', '2026-10-11', false, false, '0ff1ce00-0000-4000-8000-000000000007', 5, 202, '2026-09-05T03:15:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013c-0000-4000-8000-000000000001', '1000013c-0000-4000-8000-000000000001', NULL, -2, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000013c-0000-4000-8000-000000000002', '1000013c-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013c-0000-4000-8000-000000000003', '1000013c-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013c-0000-4000-8000-000000000001', '2026-11-07') b),
  '(202,1,201,201)',
  'case 316: fuzz 20261028/262'
);

-- ── case 317: fuzz 20261028/263 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013d-0000-4000-8000-000000000001', 'parity case 317', '2027-01-04', '2027-01-05', false, false, '0ff1ce00-0000-4000-8000-000000000002', 5, 1355, '2026-12-15T03:15:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000013d-0000-4000-8000-000000000001', '1000013d-0000-4000-8000-000000000001', '2027-01-01', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013d-0000-4000-8000-000000000001', '1000013d-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013d-0000-4000-8000-000000000002', '1000013d-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013d-0000-4000-8000-000000000003', '1000013d-0000-4000-8000-000000000001', '2000013d-0000-4000-8000-000000000001', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013d-0000-4000-8000-000000000004', '1000013d-0000-4000-8000-000000000001', '2000013d-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013d-0000-4000-8000-000000000005', '1000013d-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013d-0000-4000-8000-000000000006', '1000013d-0000-4000-8000-000000000001', '2000013d-0000-4000-8000-000000000001', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013d-0000-4000-8000-000000000001', '2026-11-14') b),
  '(1355,7,1348,0)',
  'case 317: fuzz 20261028/263'
);

-- ── case 318: fuzz 20261028/264 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013e-0000-4000-8000-000000000001', 'parity case 318', '2027-01-03', '2027-01-04', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-18T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000013e-0000-4000-8000-000000000001', 'line', 'CAD', 128680, NULL, '1000013e-0000-4000-8000-000000000001', false),
  ('3000013e-0000-4000-8000-000000000002', 'line', 'CAD', 66673, 1, '1000013e-0000-4000-8000-000000000001', false),
  ('3000013e-0000-4000-8000-000000000003', 'line', 'CAD', 124471, 4, '1000013e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000013e-0000-4000-8000-000000000001', '1000013e-0000-4000-8000-000000000001', '2027-01-30', 'CAD', 57);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013e-0000-4000-8000-000000000001', '1000013e-0000-4000-8000-000000000001', '2000013e-0000-4000-8000-000000000001', 236378, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013e-0000-4000-8000-000000000002', '1000013e-0000-4000-8000-000000000001', NULL, 121272, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013e-0000-4000-8000-000000000003', '1000013e-0000-4000-8000-000000000001', '2000013e-0000-4000-8000-000000000001', 144729, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013e-0000-4000-8000-000000000004', '1000013e-0000-4000-8000-000000000001', '2000013e-0000-4000-8000-000000000001', 289982, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013e-0000-4000-8000-000000000005', '1000013e-0000-4000-8000-000000000001', NULL, 117370, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013e-0000-4000-8000-000000000001', '2026-12-10') b),
  '(693237,909731,0,0)',
  'case 318: fuzz 20261028/264'
);

-- ── case 319: fuzz 20261028/265 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000013f-0000-4000-8000-000000000001', 'parity case 319', '2026-11-16', '2026-11-17', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-11-05T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000013f-0000-4000-8000-000000000001', 'line', 'USD', 95821, 4, '1000013f-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000013f-0000-4000-8000-000000000001', '1000013f-0000-4000-8000-000000000001', NULL, 214099, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000013f-0000-4000-8000-000000000002', '1000013f-0000-4000-8000-000000000001', NULL, 267737, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000013f-0000-4000-8000-000000000001', '2026-10-16') b),
  '(383284,214099,169185,0)',
  'case 319: fuzz 20261028/265'
);

-- ── case 320: fuzz 20261028/266 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000140-0000-4000-8000-000000000001', 'parity case 320', '2026-10-08', '2026-10-09', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-10-08T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000140-0000-4000-8000-000000000001', 'line', 'USD', 46309, 2, '10000140-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000140-0000-4000-8000-000000000001', '10000140-0000-4000-8000-000000000001', '2026-09-15', 'USD', 2394),
  ('20000140-0000-4000-8000-000000000002', '10000140-0000-4000-8000-000000000001', '2026-12-22', 'USD', 2478),
  ('20000140-0000-4000-8000-000000000003', '10000140-0000-4000-8000-000000000001', '2026-11-18', 'USD', 676),
  ('20000140-0000-4000-8000-000000000004', '10000140-0000-4000-8000-000000000001', '2026-10-12', 'USD', 4269),
  ('20000140-0000-4000-8000-000000000005', '10000140-0000-4000-8000-000000000001', '2026-11-06', 'USD', 183);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000140-0000-4000-8000-000000000001', '10000140-0000-4000-8000-000000000001', NULL, 19185, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000140-0000-4000-8000-000000000002', '10000140-0000-4000-8000-000000000001', NULL, 22209, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000140-0000-4000-8000-000000000001', '2026-10-27') b),
  '(92618,19185,73433,42526)',
  'case 320: fuzz 20261028/266'
);

-- ── case 321: fuzz 20261028/267 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000141-0000-4000-8000-000000000001', 'parity case 321', '2026-10-26', '2026-10-27', false, false, '0ff1ce00-0000-4000-8000-000000000008', 9.975, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000141-0000-4000-8000-000000000001', 'line', 'USD', 120522, NULL, '10000141-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000141-0000-4000-8000-000000000001', '10000141-0000-4000-8000-000000000001', '2026-10-26', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000141-0000-4000-8000-000000000001', '10000141-0000-4000-8000-000000000001', NULL, 117259, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000002', '10000141-0000-4000-8000-000000000001', NULL, -78354, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000003', '10000141-0000-4000-8000-000000000001', NULL, 105582, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000004', '10000141-0000-4000-8000-000000000001', '20000141-0000-4000-8000-000000000001', 51854, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000005', '10000141-0000-4000-8000-000000000001', NULL, 84670, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000006', '10000141-0000-4000-8000-000000000001', '20000141-0000-4000-8000-000000000001', -89, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000007', '10000141-0000-4000-8000-000000000001', '20000141-0000-4000-8000-000000000001', 25565, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000141-0000-4000-8000-000000000008', '10000141-0000-4000-8000-000000000001', '20000141-0000-4000-8000-000000000001', -87434, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000141-0000-4000-8000-000000000001', '2026-12-04') b),
  '(132544,219053,0,0)',
  'case 321: fuzz 20261028/267'
);

-- ── case 322: fuzz 20261028/268 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000142-0000-4000-8000-000000000001', 'parity case 322', '2026-11-22', '2026-11-23', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-10-15T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000142-0000-4000-8000-000000000001', 'line', 'CAD', 67408, 3, '10000142-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000142-0000-4000-8000-000000000001', '2026-11-14') b),
  '(202224,0,202224,0)',
  'case 322: fuzz 20261028/268'
);

-- ── case 323: fuzz 20261028/269 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000143-0000-4000-8000-000000000001', 'parity case 323', '2026-12-18', '2026-12-19', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000143-0000-4000-8000-000000000001', 'line', 'CAD', -48094, 5, '10000143-0000-4000-8000-000000000001', false),
  ('30000143-0000-4000-8000-000000000002', 'line', 'CAD', -30379, NULL, '10000143-0000-4000-8000-000000000001', false),
  ('30000143-0000-4000-8000-000000000003', 'line', 'CAD', 19624, NULL, '10000143-0000-4000-8000-000000000001', false),
  ('30000143-0000-4000-8000-000000000004', 'line', 'CAD', 19118, 1, '10000143-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000143-0000-4000-8000-000000000001', '10000143-0000-4000-8000-000000000001', '2026-12-10', 'CAD', 1968),
  ('20000143-0000-4000-8000-000000000002', '10000143-0000-4000-8000-000000000001', '2026-11-19', 'CAD', 356),
  ('20000143-0000-4000-8000-000000000003', '10000143-0000-4000-8000-000000000001', '2026-09-25', 'CAD', 7676);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000143-0000-4000-8000-000000000001', '2026-11-06') b),
  '(0,0,0,0)',
  'case 323: fuzz 20261028/269'
);

-- ── case 324: fuzz 20261028/270 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000144-0000-4000-8000-000000000001', 'parity case 324', '2026-10-16', '2026-10-17', false, false, NULL, 13, NULL, '2026-09-10T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000144-0000-4000-8000-000000000001', 'parity case 324 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000144-0000-4000-8000-000000000001', '50000144-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000144-0000-4000-8000-000000000001', '10000144-0000-4000-8000-000000000001', '2026-12-25', 'USD', 5494),
  ('20000144-0000-4000-8000-000000000002', '10000144-0000-4000-8000-000000000001', '2026-09-19', 'USD', 5440),
  ('20000144-0000-4000-8000-000000000003', '10000144-0000-4000-8000-000000000001', '2026-09-08', 'USD', 953);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000144-0000-4000-8000-000000000001', '10000144-0000-4000-8000-000000000001', '20000144-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000002', '10000144-0000-4000-8000-000000000001', '20000144-0000-4000-8000-000000000003', 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000003', '10000144-0000-4000-8000-000000000001', '60000144-0000-4000-8000-000000000001', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000004', '10000144-0000-4000-8000-000000000001', '20000144-0000-4000-8000-000000000001', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000005', '10000144-0000-4000-8000-000000000001', '20000144-0000-4000-8000-000000000003', -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000006', '10000144-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000144-0000-4000-8000-000000000007', '10000144-0000-4000-8000-000000000001', '20000144-0000-4000-8000-000000000001', 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000144-0000-4000-8000-000000000001', '2026-11-01') b),
  '(0,7,0,0)',
  'case 324: fuzz 20261028/270'
);

-- ── case 325: fuzz 20261028/271 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000145-0000-4000-8000-000000000001', 'parity case 325', '2026-12-08', '2026-12-09', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-11-02T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('50000145-0000-4000-8000-000000000001', 'parity case 325 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('60000145-0000-4000-8000-000000000001', '50000145-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000145-0000-4000-8000-000000000001', '10000145-0000-4000-8000-000000000001', '2026-10-27', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000145-0000-4000-8000-000000000001', '10000145-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000002', '10000145-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000003', '10000145-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000004', '10000145-0000-4000-8000-000000000001', '20000145-0000-4000-8000-000000000001', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000005', '10000145-0000-4000-8000-000000000001', '60000145-0000-4000-8000-000000000001', -1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000006', '10000145-0000-4000-8000-000000000001', '20000145-0000-4000-8000-000000000001', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000007', '10000145-0000-4000-8000-000000000001', '20000145-0000-4000-8000-000000000001', 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000145-0000-4000-8000-000000000008', '10000145-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000145-0000-4000-8000-000000000001', '2026-11-11') b),
  '(0,7,0,0)',
  'case 325: fuzz 20261028/271'
);

-- ── case 326: fuzz 20261028/272 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000146-0000-4000-8000-000000000001', 'parity case 326', '2026-10-28', '2026-10-29', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-09-28T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000146-0000-4000-8000-000000000001', 'line', 'USD', 30372, 4, '10000146-0000-4000-8000-000000000001', false),
  ('30000146-0000-4000-8000-000000000002', 'line', 'USD', 120183, 5, '10000146-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000146-0000-4000-8000-000000000001', '2026-11-09') b),
  '(722403,0,722403,722403)',
  'case 326: fuzz 20261028/272'
);

-- ── case 327: fuzz 20261028/273 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000147-0000-4000-8000-000000000001', 'parity case 327', '2026-09-07', '2026-09-08', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, 2170, '2026-08-31T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000147-0000-4000-8000-000000000001', '10000147-0000-4000-8000-000000000001', '2026-11-11', 'CAD', 5074),
  ('20000147-0000-4000-8000-000000000002', '10000147-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 4926);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000147-0000-4000-8000-000000000001', '10000147-0000-4000-8000-000000000001', '20000147-0000-4000-8000-000000000001', 2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000002', '10000147-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000003', '10000147-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000004', '10000147-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000005', '10000147-0000-4000-8000-000000000001', NULL, 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000006', '10000147-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000007', '10000147-0000-4000-8000-000000000001', '20000147-0000-4000-8000-000000000001', 1, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000147-0000-4000-8000-000000000008', '10000147-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000147-0000-4000-8000-000000000001', '2026-10-30') b),
  '(2170,9,2161,0)',
  'case 327: fuzz 20261028/273'
);

-- ── case 328: fuzz 20261028/274 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000148-0000-4000-8000-000000000001', 'parity case 328', '2026-11-04', '2026-11-05', false, false, '0ff1ce00-0000-4000-8000-000000000008', 9.975, NULL, '2026-10-30T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000148-0000-4000-8000-000000000001', 'line', 'USD', 113694, 4, '10000148-0000-4000-8000-000000000001', false),
  ('30000148-0000-4000-8000-000000000002', 'line', 'USD', 109317, 4, '10000148-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000148-0000-4000-8000-000000000001', '10000148-0000-4000-8000-000000000001', NULL, 212536, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000148-0000-4000-8000-000000000002', '10000148-0000-4000-8000-000000000001', NULL, 258275, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000148-0000-4000-8000-000000000003', '10000148-0000-4000-8000-000000000001', NULL, 173383, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000148-0000-4000-8000-000000000001', '2026-12-01') b),
  '(981025,470811,510214,510214)',
  'case 328: fuzz 20261028/274'
);

-- ── case 329: fuzz 20261028/275 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000149-0000-4000-8000-000000000001', 'parity case 329', '2026-11-01', '2026-11-02', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-10-04T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000149-0000-4000-8000-000000000001', 'line', 'USD', 110635, 2, '10000149-0000-4000-8000-000000000001', false),
  ('30000149-0000-4000-8000-000000000002', 'line', 'USD', 49607, 1, '10000149-0000-4000-8000-000000000001', false),
  ('30000149-0000-4000-8000-000000000003', 'line', 'USD', 22722, 5, '10000149-0000-4000-8000-000000000001', false),
  ('30000149-0000-4000-8000-000000000004', 'line', 'USD', 122930, 2, '10000149-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000149-0000-4000-8000-000000000001', '10000149-0000-4000-8000-000000000001', '2026-11-04', 'USD', 5897),
  ('20000149-0000-4000-8000-000000000002', '10000149-0000-4000-8000-000000000001', '2027-01-10', 'USD', 1834);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000149-0000-4000-8000-000000000001', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000001', 223575, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000002', '10000149-0000-4000-8000-000000000001', NULL, 174067, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000003', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000001', -82941, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000004', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000001', 271272, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000005', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000002', 292532, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000006', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000001', 64632, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000007', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000001', 260049, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000149-0000-4000-8000-000000000008', '10000149-0000-4000-8000-000000000001', '20000149-0000-4000-8000-000000000002', 244342, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000149-0000-4000-8000-000000000001', '2026-11-11') b),
  '(630347,1447528,0,0)',
  'case 329: fuzz 20261028/275'
);

-- ── case 330: fuzz 20261028/276 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014a-0000-4000-8000-000000000001', 'parity case 330', '2026-10-20', '2026-10-21', false, false, '0ff1ce00-0000-4000-8000-000000000004', 14.975, NULL, '2026-09-27T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000014a-0000-4000-8000-000000000001', 'parity case 330 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000014a-0000-4000-8000-000000000001', '5000014a-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014a-0000-4000-8000-000000000001', 'line', 'USD', 108636, 1, '1000014a-0000-4000-8000-000000000001', false),
  ('3000014a-0000-4000-8000-000000000002', 'line', 'USD', 9171, 5, '1000014a-0000-4000-8000-000000000001', false),
  ('3000014a-0000-4000-8000-000000000003', 'line', 'USD', 124803, 3, '1000014a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000014a-0000-4000-8000-000000000001', '1000014a-0000-4000-8000-000000000001', '2026-10-22', 'USD', 1225),
  ('2000014a-0000-4000-8000-000000000002', '1000014a-0000-4000-8000-000000000001', '2026-10-05', 'USD', 8775);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000014a-0000-4000-8000-000000000001', '1000014a-0000-4000-8000-000000000001', NULL, 114123, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014a-0000-4000-8000-000000000002', '1000014a-0000-4000-8000-000000000001', '6000014a-0000-4000-8000-000000000001', -35344, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014a-0000-4000-8000-000000000003', '1000014a-0000-4000-8000-000000000001', NULL, 152835, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014a-0000-4000-8000-000000000004', '1000014a-0000-4000-8000-000000000001', '2000014a-0000-4000-8000-000000000001', 86676, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014a-0000-4000-8000-000000000001', '2026-11-03') b),
  '(608103,204167,403936,403936)',
  'case 330: fuzz 20261028/276'
);

-- ── case 331: fuzz 20261028/277 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014b-0000-4000-8000-000000000001', 'parity case 331', '2026-09-27', '2026-09-28', false, false, NULL, NULL, 8, '2026-09-03T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014b-0000-4000-8000-000000000001', 'line', 'USD', -35676, NULL, '1000014b-0000-4000-8000-000000000001', false),
  ('3000014b-0000-4000-8000-000000000002', 'line', 'USD', 2001, 5, '1000014b-0000-4000-8000-000000000001', false),
  ('3000014b-0000-4000-8000-000000000003', 'line', 'USD', 130331, 5, '1000014b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000014b-0000-4000-8000-000000000001', '1000014b-0000-4000-8000-000000000001', NULL, 46668, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014b-0000-4000-8000-000000000002', '1000014b-0000-4000-8000-000000000001', NULL, 263109, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014b-0000-4000-8000-000000000003', '1000014b-0000-4000-8000-000000000001', NULL, 166349, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014b-0000-4000-8000-000000000004', '1000014b-0000-4000-8000-000000000001', NULL, 287601, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014b-0000-4000-8000-000000000005', '1000014b-0000-4000-8000-000000000001', NULL, 106080, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014b-0000-4000-8000-000000000001', '2026-10-21') b),
  '(625992,582206,43786,43786)',
  'case 331: fuzz 20261028/277'
);

-- ── case 332: fuzz 20261028/278 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014c-0000-4000-8000-000000000001', 'parity case 332', '2026-09-20', '2026-09-21', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-08-22T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014c-0000-4000-8000-000000000001', 'line', 'USD', 112040, 2, '1000014c-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000014c-0000-4000-8000-000000000001', '1000014c-0000-4000-8000-000000000001', NULL, 136787, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014c-0000-4000-8000-000000000002', '1000014c-0000-4000-8000-000000000001', NULL, 68500, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000014c-0000-4000-8000-000000000003', '1000014c-0000-4000-8000-000000000001', NULL, 63399, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014c-0000-4000-8000-000000000001', '2026-11-05') b),
  '(224080,200186,23894,23894)',
  'case 332: fuzz 20261028/278'
);

-- ── case 333: fuzz 20261028/279 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014d-0000-4000-8000-000000000001', 'parity case 333', '2026-10-08', '2026-10-09', false, false, NULL, NULL, 2067, '2026-09-12T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014d-0000-4000-8000-000000000001', 'line', 'USD', 10457, 5, '1000014d-0000-4000-8000-000000000001', false),
  ('3000014d-0000-4000-8000-000000000002', 'line', 'USD', 32841, 5, '1000014d-0000-4000-8000-000000000001', false),
  ('3000014d-0000-4000-8000-000000000003', 'line', 'USD', 114818, NULL, '1000014d-0000-4000-8000-000000000001', false),
  ('3000014d-0000-4000-8000-000000000004', 'line', 'USD', 37099, 4, '1000014d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000014d-0000-4000-8000-000000000001', '1000014d-0000-4000-8000-000000000001', '2026-12-22', 'USD', 707),
  ('2000014d-0000-4000-8000-000000000002', '1000014d-0000-4000-8000-000000000001', '2026-11-10', 'USD', 4667),
  ('2000014d-0000-4000-8000-000000000003', '1000014d-0000-4000-8000-000000000001', '2026-12-23', 'USD', 3973),
  ('2000014d-0000-4000-8000-000000000004', '1000014d-0000-4000-8000-000000000001', '2026-12-14', 'USD', 653);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000014d-0000-4000-8000-000000000001', '1000014d-0000-4000-8000-000000000001', '2000014d-0000-4000-8000-000000000003', 36312, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014d-0000-4000-8000-000000000001', '2026-11-19') b),
  '(481771,0,481771,224842)',
  'case 333: fuzz 20261028/279'
);

-- ── case 334: fuzz 20261028/280 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014e-0000-4000-8000-000000000001', 'parity case 334', '2026-09-21', '2026-09-22', false, false, '0ff1ce00-0000-4000-8000-000000000007', 14.975, NULL, '2026-08-28T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014e-0000-4000-8000-000000000001', 'line', 'CAD', -2124, 4, '1000014e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000014e-0000-4000-8000-000000000001', '1000014e-0000-4000-8000-000000000001', '2027-01-13', 'CAD', 8629),
  ('2000014e-0000-4000-8000-000000000002', '1000014e-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 1371);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000014e-0000-4000-8000-000000000001', '1000014e-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014e-0000-4000-8000-000000000001', '2026-11-19') b),
  '(0,2,0,0)',
  'case 334: fuzz 20261028/280'
);

-- ── case 335: fuzz 20261028/281 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000014f-0000-4000-8000-000000000001', 'parity case 335', '2026-10-19', '2026-10-20', false, false, '0ff1ce00-0000-4000-8000-000000000007', 5, 637, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000014f-0000-4000-8000-000000000001', 'line', 'CAD', 111748, 2, '1000014f-0000-4000-8000-000000000001', false),
  ('3000014f-0000-4000-8000-000000000002', 'line', 'CAD', 143548, 1, '1000014f-0000-4000-8000-000000000001', true),
  ('3000014f-0000-4000-8000-000000000003', 'line', 'CAD', 145053, 2, '1000014f-0000-4000-8000-000000000001', false);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000014f-0000-4000-8000-000000000001', '2026-12-05') b),
  '(514239,0,514239,514239)',
  'case 335: fuzz 20261028/281'
);

-- ── case 336: fuzz 20261028/282 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000150-0000-4000-8000-000000000001', 'parity case 336', '2026-09-19', '2026-09-20', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, 857, '2026-09-19T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000150-0000-4000-8000-000000000001', 'line', 'CAD', 36878, 4, '10000150-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000150-0000-4000-8000-000000000001', '10000150-0000-4000-8000-000000000001', NULL, 108753, 'cad', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000002', '10000150-0000-4000-8000-000000000001', NULL, 97340, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000003', '10000150-0000-4000-8000-000000000001', NULL, 75700, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000004', '10000150-0000-4000-8000-000000000001', NULL, 1374, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000005', '10000150-0000-4000-8000-000000000001', NULL, 146597, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000006', '10000150-0000-4000-8000-000000000001', NULL, 34017, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000007', '10000150-0000-4000-8000-000000000001', NULL, 28564, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000150-0000-4000-8000-000000000008', '10000150-0000-4000-8000-000000000001', NULL, 97449, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000150-0000-4000-8000-000000000001', '2026-11-01') b),
  '(148369,452477,0,0)',
  'case 336: fuzz 20261028/282'
);

-- ── case 337: fuzz 20261028/283 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000151-0000-4000-8000-000000000001', 'parity case 337', '2026-12-23', '2026-12-24', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-12-02T12:00:00+00:00');
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000151-0000-4000-8000-000000000001', '10000151-0000-4000-8000-000000000001', NULL, 2, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000151-0000-4000-8000-000000000002', '10000151-0000-4000-8000-000000000001', NULL, -1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000151-0000-4000-8000-000000000001', '2026-11-09') b),
  '(0,1,0,0)',
  'case 337: fuzz 20261028/283'
);

-- ── case 338: fuzz 20261028/284 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000152-0000-4000-8000-000000000001', 'parity case 338', '2026-10-16', '2026-10-17', false, false, '0ff1ce00-0000-4000-8000-000000000004', 9.975, NULL, '2026-09-10T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000152-0000-4000-8000-000000000001', '10000152-0000-4000-8000-000000000001', '2026-10-04', 'USD', 416),
  ('20000152-0000-4000-8000-000000000002', '10000152-0000-4000-8000-000000000001', '2026-11-04', 'USD', 1105),
  ('20000152-0000-4000-8000-000000000003', '10000152-0000-4000-8000-000000000001', '2026-11-19', 'USD', 5006),
  ('20000152-0000-4000-8000-000000000004', '10000152-0000-4000-8000-000000000001', '2026-12-23', 'USD', 1451),
  ('20000152-0000-4000-8000-000000000005', '10000152-0000-4000-8000-000000000001', '2026-11-18', 'USD', 2022);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000152-0000-4000-8000-000000000001', '10000152-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000002', '10000152-0000-4000-8000-000000000001', '20000152-0000-4000-8000-000000000004', 2, 'USD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000003', '10000152-0000-4000-8000-000000000001', NULL, -2, 'USD', 'pending', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('40000152-0000-4000-8000-000000000004', '10000152-0000-4000-8000-000000000001', NULL, 2, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000005', '10000152-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000006', '10000152-0000-4000-8000-000000000001', '20000152-0000-4000-8000-000000000004', 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000007', '10000152-0000-4000-8000-000000000001', '20000152-0000-4000-8000-000000000005', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000152-0000-4000-8000-000000000008', '10000152-0000-4000-8000-000000000001', NULL, 1, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000152-0000-4000-8000-000000000001', '2026-10-25') b),
  '(0,5,0,0)',
  'case 338: fuzz 20261028/284'
);

-- ── case 339: fuzz 20261028/285 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000153-0000-4000-8000-000000000001', 'parity case 339', '2027-01-23', '2027-01-24', false, false, NULL, NULL, 2200, '2026-12-29T23:45:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000153-0000-4000-8000-000000000001', '10000153-0000-4000-8000-000000000001', '2027-01-25', 'USD', 4173),
  ('20000153-0000-4000-8000-000000000002', '10000153-0000-4000-8000-000000000001', '2026-10-10', 'USD', 528),
  ('20000153-0000-4000-8000-000000000003', '10000153-0000-4000-8000-000000000001', '2026-10-29', 'USD', 678),
  ('20000153-0000-4000-8000-000000000004', '10000153-0000-4000-8000-000000000001', '2027-01-25', 'USD', 4621);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000153-0000-4000-8000-000000000001', '10000153-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000153-0000-4000-8000-000000000002', '10000153-0000-4000-8000-000000000001', NULL, -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000153-0000-4000-8000-000000000003', '10000153-0000-4000-8000-000000000001', '20000153-0000-4000-8000-000000000003', -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000153-0000-4000-8000-000000000004', '10000153-0000-4000-8000-000000000001', '20000153-0000-4000-8000-000000000002', -2, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000153-0000-4000-8000-000000000005', '10000153-0000-4000-8000-000000000001', '20000153-0000-4000-8000-000000000002', 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000153-0000-4000-8000-000000000001', '2026-11-29') b),
  '(2200,-3,2203,265)',
  'case 339: fuzz 20261028/285'
);

-- ── case 340: fuzz 20261028/286 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000154-0000-4000-8000-000000000001', 'parity case 340', '2026-12-29', '2026-12-30', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-19T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000154-0000-4000-8000-000000000001', '10000154-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 4018),
  ('20000154-0000-4000-8000-000000000002', '10000154-0000-4000-8000-000000000001', '2026-12-03', 'CAD', 2464),
  ('20000154-0000-4000-8000-000000000003', '10000154-0000-4000-8000-000000000001', '2027-02-04', 'CAD', 3518);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000154-0000-4000-8000-000000000001', '10000154-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000154-0000-4000-8000-000000000001', '2026-12-10') b),
  '(0,0,0,0)',
  'case 340: fuzz 20261028/286'
);

-- ── case 341: fuzz 20261028/287 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000155-0000-4000-8000-000000000001', 'parity case 341', '2026-11-20', '2026-11-21', false, false, '0ff1ce00-0000-4000-8000-000000000007', 0, NULL, '2026-11-17T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000155-0000-4000-8000-000000000001', 'line', 'CAD', 118841, 1, '10000155-0000-4000-8000-000000000001', false),
  ('30000155-0000-4000-8000-000000000002', 'line', 'CAD', -20990, 2, '10000155-0000-4000-8000-000000000001', false),
  ('30000155-0000-4000-8000-000000000003', 'line', 'CAD', -603, 3, '10000155-0000-4000-8000-000000000001', false),
  ('30000155-0000-4000-8000-000000000004', 'line', 'CAD', 99049, 4, '10000155-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000155-0000-4000-8000-000000000001', '10000155-0000-4000-8000-000000000001', NULL, 64657, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000155-0000-4000-8000-000000000002', '10000155-0000-4000-8000-000000000001', NULL, 136658, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000155-0000-4000-8000-000000000003', '10000155-0000-4000-8000-000000000001', NULL, 135368, ' CAD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000155-0000-4000-8000-000000000001', '2026-10-20') b),
  '(471248,0,471248,0)',
  'case 341: fuzz 20261028/287'
);

-- ── case 342: fuzz 20261028/288 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000156-0000-4000-8000-000000000001', 'parity case 342', '2026-12-25', '2026-12-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-12-10T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000156-0000-4000-8000-000000000001', 'line', 'CAD', 60016, NULL, '10000156-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000156-0000-4000-8000-000000000001', '10000156-0000-4000-8000-000000000001', '2026-11-09', 'CAD', 2721),
  ('20000156-0000-4000-8000-000000000002', '10000156-0000-4000-8000-000000000001', '2027-01-06', 'CAD', 427),
  ('20000156-0000-4000-8000-000000000003', '10000156-0000-4000-8000-000000000001', '2026-12-23', 'CAD', 1873);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000156-0000-4000-8000-000000000001', '10000156-0000-4000-8000-000000000001', '20000156-0000-4000-8000-000000000001', 12503, 'cad', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000156-0000-4000-8000-000000000001', '2026-11-09') b),
  '(60016,0,60016,16330)',
  'case 342: fuzz 20261028/288'
);

-- ── case 343: fuzz 20261028/289 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000157-0000-4000-8000-000000000001', 'parity case 343', '2026-11-19', '2026-11-20', false, false, '0ff1ce00-0000-4000-8000-000000000007', NULL, NULL, '2026-11-18T12:00:00+00:00');
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000157-0000-4000-8000-000000000001', '10000157-0000-4000-8000-000000000001', '2026-12-16', 'CAD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000157-0000-4000-8000-000000000001', '10000157-0000-4000-8000-000000000001', NULL, 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000157-0000-4000-8000-000000000002', '10000157-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000157-0000-4000-8000-000000000001', '2026-12-09') b),
  '(0,3,0,0)',
  'case 343: fuzz 20261028/289'
);

-- ── case 344: fuzz 20261028/290 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000158-0000-4000-8000-000000000001', 'parity case 344', '2026-09-07', '2026-09-08', false, false, '0ff1ce00-0000-4000-8000-000000000001', 7.5, NULL, '2026-09-05T23:45:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000158-0000-4000-8000-000000000001', 'line', 'CAD', 67986, 3, '10000158-0000-4000-8000-000000000001', false),
  ('30000158-0000-4000-8000-000000000002', 'line', 'CAD', 60627, 2, '10000158-0000-4000-8000-000000000001', false),
  ('30000158-0000-4000-8000-000000000003', 'line', 'CAD', 85672, 4, '10000158-0000-4000-8000-000000000001', false),
  ('30000158-0000-4000-8000-000000000004', 'line', 'CAD', 133597, 1, '10000158-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000158-0000-4000-8000-000000000001', '10000158-0000-4000-8000-000000000001', NULL, 147796, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000158-0000-4000-8000-000000000001', '2026-10-29') b),
  '(861609,0,861609,861609)',
  'case 344: fuzz 20261028/290'
);

-- ── case 345: fuzz 20261028/291 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000159-0000-4000-8000-000000000001', 'parity case 345', '2026-12-28', '2026-12-29', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, NULL);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000159-0000-4000-8000-000000000001', 'line', 'CAD', 52147, NULL, '10000159-0000-4000-8000-000000000001', false),
  ('30000159-0000-4000-8000-000000000002', 'line', 'CAD', 126385, 2, '10000159-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000159-0000-4000-8000-000000000001', '10000159-0000-4000-8000-000000000001', '2026-10-11', 'CAD', 2535),
  ('20000159-0000-4000-8000-000000000002', '10000159-0000-4000-8000-000000000001', '2027-01-10', 'CAD', 5813),
  ('20000159-0000-4000-8000-000000000003', '10000159-0000-4000-8000-000000000001', '2026-11-16', 'CAD', 1652);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000159-0000-4000-8000-000000000001', '10000159-0000-4000-8000-000000000001', '20000159-0000-4000-8000-000000000001', 185238, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000159-0000-4000-8000-000000000002', '10000159-0000-4000-8000-000000000001', '20000159-0000-4000-8000-000000000003', 104743, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000159-0000-4000-8000-000000000001', '2026-11-28') b),
  '(304917,185238,119679,0)',
  'case 345: fuzz 20261028/291'
);

-- ── case 346: fuzz 20261028/292 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015a-0000-4000-8000-000000000001', 'parity case 346', '2026-10-25', '2026-10-26', false, false, '0ff1ce00-0000-4000-8000-000000000001', 13, NULL, '2026-10-11T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000015a-0000-4000-8000-000000000001', 'line', 'CAD', 123771, 5, '1000015a-0000-4000-8000-000000000001', false),
  ('3000015a-0000-4000-8000-000000000002', 'line', 'CAD', 6465, 1, '1000015a-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('2000015a-0000-4000-8000-000000000001', '1000015a-0000-4000-8000-000000000001', '2026-12-22', 'CAD', 7502),
  ('2000015a-0000-4000-8000-000000000002', '1000015a-0000-4000-8000-000000000001', '2026-10-26', 'CAD', 478),
  ('2000015a-0000-4000-8000-000000000003', '1000015a-0000-4000-8000-000000000001', '2026-10-25', 'CAD', 2020);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015a-0000-4000-8000-000000000001', '1000015a-0000-4000-8000-000000000001', NULL, 270452, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000015a-0000-4000-8000-000000000002', '1000015a-0000-4000-8000-000000000001', '2000015a-0000-4000-8000-000000000002', 248939, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015a-0000-4000-8000-000000000003', '1000015a-0000-4000-8000-000000000001', '2000015a-0000-4000-8000-000000000002', 284267, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015a-0000-4000-8000-000000000004', '1000015a-0000-4000-8000-000000000001', NULL, 81150, 'cad', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000015a-0000-4000-8000-000000000005', '1000015a-0000-4000-8000-000000000001', NULL, -187300, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015a-0000-4000-8000-000000000001', '2026-10-24') b),
  '(706612,533206,173406,0)',
  'case 346: fuzz 20261028/292'
);

-- ── case 347: fuzz 20261028/293 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015b-0000-4000-8000-000000000001', 'parity case 347', '2026-12-10', '2026-12-11', false, false, '0ff1ce00-0000-4000-8000-000000000004', NULL, NULL, '2026-12-05T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000015b-0000-4000-8000-000000000001', 'line', 'USD', 26816, 4, '1000015b-0000-4000-8000-000000000001', false),
  ('3000015b-0000-4000-8000-000000000002', 'line', 'USD', 39292, 1, '1000015b-0000-4000-8000-000000000001', false),
  ('3000015b-0000-4000-8000-000000000003', 'line', 'USD', 87536, 1, '1000015b-0000-4000-8000-000000000001', false),
  ('3000015b-0000-4000-8000-000000000004', 'line', 'USD', 42248, 3, '1000015b-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015b-0000-4000-8000-000000000001', '1000015b-0000-4000-8000-000000000001', NULL, 298149, ' USD ', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015b-0000-4000-8000-000000000002', '1000015b-0000-4000-8000-000000000001', NULL, -138666, 'USD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity'),
  ('4000015b-0000-4000-8000-000000000003', '1000015b-0000-4000-8000-000000000001', NULL, 79933, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015b-0000-4000-8000-000000000004', '1000015b-0000-4000-8000-000000000001', NULL, 185279, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015b-0000-4000-8000-000000000005', '1000015b-0000-4000-8000-000000000001', NULL, 125759, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015b-0000-4000-8000-000000000006', '1000015b-0000-4000-8000-000000000001', NULL, 109475, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015b-0000-4000-8000-000000000001', '2026-10-29') b),
  '(360836,189408,171428,0)',
  'case 347: fuzz 20261028/293'
);

-- ── case 348: fuzz 20261028/294 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015c-0000-4000-8000-000000000001', 'parity case 348', '2026-10-12', '2026-10-13', false, false, '0ff1ce00-0000-4000-8000-000000000008', NULL, NULL, '2026-09-05T03:15:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000015c-0000-4000-8000-000000000001', 'parity case 348 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000015c-0000-4000-8000-000000000001', '5000015c-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015c-0000-4000-8000-000000000001', '1000015c-0000-4000-8000-000000000001', NULL, 2, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015c-0000-4000-8000-000000000002', '1000015c-0000-4000-8000-000000000001', '6000015c-0000-4000-8000-000000000001', 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015c-0000-4000-8000-000000000003', '1000015c-0000-4000-8000-000000000001', NULL, 1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015c-0000-4000-8000-000000000004', '1000015c-0000-4000-8000-000000000001', NULL, 1, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015c-0000-4000-8000-000000000005', '1000015c-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015c-0000-4000-8000-000000000006', '1000015c-0000-4000-8000-000000000001', NULL, 2, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015c-0000-4000-8000-000000000001', '2026-10-17') b),
  '(0,7,0,0)',
  'case 348: fuzz 20261028/294'
);

-- ── case 349: fuzz 20261028/295 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015d-0000-4000-8000-000000000001', 'parity case 349', '2027-01-12', '2027-01-13', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-12-17T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000015d-0000-4000-8000-000000000001', 'line', 'CAD', 84002, 3, '1000015d-0000-4000-8000-000000000001', true),
  ('3000015d-0000-4000-8000-000000000002', 'line', 'CAD', 93071, 5, '1000015d-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015d-0000-4000-8000-000000000001', '1000015d-0000-4000-8000-000000000001', NULL, 177635, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000002', '1000015d-0000-4000-8000-000000000001', NULL, 257860, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000003', '1000015d-0000-4000-8000-000000000001', NULL, 276998, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000004', '1000015d-0000-4000-8000-000000000001', NULL, 60023, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000005', '1000015d-0000-4000-8000-000000000001', NULL, 19177, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000006', '1000015d-0000-4000-8000-000000000001', NULL, -184765, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015d-0000-4000-8000-000000000007', '1000015d-0000-4000-8000-000000000001', NULL, 184449, 'CAD', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015d-0000-4000-8000-000000000001', '2026-12-11') b),
  '(465355,731670,0,0)',
  'case 349: fuzz 20261028/295'
);

-- ── case 350: fuzz 20261028/296 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015e-0000-4000-8000-000000000001', 'parity case 350', '2026-12-03', '2026-12-04', false, false, '0ff1ce00-0000-4000-8000-000000000002', NULL, NULL, '2026-11-14T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000015e-0000-4000-8000-000000000001', 'line', 'CAD', 145531, 5, '1000015e-0000-4000-8000-000000000001', false),
  ('3000015e-0000-4000-8000-000000000002', 'line', 'CAD', 104362, 5, '1000015e-0000-4000-8000-000000000001', false),
  ('3000015e-0000-4000-8000-000000000003', 'line', 'CAD', 82364, NULL, '1000015e-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015e-0000-4000-8000-000000000001', '1000015e-0000-4000-8000-000000000001', NULL, 157689, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015e-0000-4000-8000-000000000002', '1000015e-0000-4000-8000-000000000001', NULL, 38905, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015e-0000-4000-8000-000000000003', '1000015e-0000-4000-8000-000000000001', NULL, 100052, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015e-0000-4000-8000-000000000001', '2026-12-02') b),
  '(1331829,296646,1035183,1035183)',
  'case 350: fuzz 20261028/296'
);

-- ── case 351: fuzz 20261028/297 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('1000015f-0000-4000-8000-000000000001', 'parity case 351', '2026-10-13', '2026-10-14', false, false, NULL, NULL, NULL, '2026-09-06T12:00:00+00:00');
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)
VALUES ('5000015f-0000-4000-8000-000000000001', 'parity case 351 other event', '2027-06-01', '2027-06-02', false, false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)
VALUES ('6000015f-0000-4000-8000-000000000001', '5000015f-0000-4000-8000-000000000001', '2026-10-01', 'USD', 10000);
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('3000015f-0000-4000-8000-000000000001', 'line', 'USD', 111810, 1, '1000015f-0000-4000-8000-000000000001', false),
  ('3000015f-0000-4000-8000-000000000002', 'line', 'USD', 63751, 2, '1000015f-0000-4000-8000-000000000001', false),
  ('3000015f-0000-4000-8000-000000000003', 'line', 'USD', 36714, 1, '1000015f-0000-4000-8000-000000000001', true);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('4000015f-0000-4000-8000-000000000001', '1000015f-0000-4000-8000-000000000001', '6000015f-0000-4000-8000-000000000001', 121769, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000002', '1000015f-0000-4000-8000-000000000001', NULL, 101356, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000003', '1000015f-0000-4000-8000-000000000001', NULL, 67610, ' USD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000004', '1000015f-0000-4000-8000-000000000001', NULL, 143415, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000005', '1000015f-0000-4000-8000-000000000001', NULL, 12192, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000006', '1000015f-0000-4000-8000-000000000001', NULL, 193797, 'usd', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000007', '1000015f-0000-4000-8000-000000000001', NULL, 60046, 'usd', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('4000015f-0000-4000-8000-000000000008', '1000015f-0000-4000-8000-000000000001', NULL, 184180, ' USD ', 'succeeded', 'Parity', 'manual', 'check', 'f0000000-0000-4000-8000-000000000001', now(), 'f0000000-0000-4000-8000-000000000001', 'parity');
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('1000015f-0000-4000-8000-000000000001', '2026-10-16') b),
  '(239312,640139,0,0)',
  'case 351: fuzz 20261028/297'
);

-- ── case 352: fuzz 20261028/298 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000160-0000-4000-8000-000000000001', 'parity case 352', '2026-12-24', '2026-12-25', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2026-11-20T12:00:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000160-0000-4000-8000-000000000001', 'line', 'CAD', -14158, 5, '10000160-0000-4000-8000-000000000001', false),
  ('30000160-0000-4000-8000-000000000002', 'line', 'CAD', 49871, 3, '10000160-0000-4000-8000-000000000001', false),
  ('30000160-0000-4000-8000-000000000003', 'line', 'CAD', 34648, 2, '10000160-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000160-0000-4000-8000-000000000001', '10000160-0000-4000-8000-000000000001', '2027-01-02', 'CAD', 974),
  ('20000160-0000-4000-8000-000000000002', '10000160-0000-4000-8000-000000000001', '2026-11-01', 'CAD', 1571),
  ('20000160-0000-4000-8000-000000000003', '10000160-0000-4000-8000-000000000001', '2027-01-15', 'CAD', 1024),
  ('20000160-0000-4000-8000-000000000004', '10000160-0000-4000-8000-000000000001', '2026-11-10', 'CAD', 4650),
  ('20000160-0000-4000-8000-000000000005', '10000160-0000-4000-8000-000000000001', '2026-12-08', 'CAD', 1781);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000160-0000-4000-8000-000000000001', '10000160-0000-4000-8000-000000000001', NULL, 103634, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000160-0000-4000-8000-000000000002', '10000160-0000-4000-8000-000000000001', '20000160-0000-4000-8000-000000000001', 115805, 'CAD', 'pending', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000160-0000-4000-8000-000000000003', '10000160-0000-4000-8000-000000000001', '20000160-0000-4000-8000-000000000001', 35685, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000160-0000-4000-8000-000000000004', '10000160-0000-4000-8000-000000000001', '20000160-0000-4000-8000-000000000005', 97725, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000160-0000-4000-8000-000000000005', '10000160-0000-4000-8000-000000000001', NULL, -12531, 'CAD', 'failed', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000160-0000-4000-8000-000000000006', '10000160-0000-4000-8000-000000000001', '20000160-0000-4000-8000-000000000001', 15882, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000160-0000-4000-8000-000000000001', '2026-11-25') b),
  '(148119,217241,0,0)',
  'case 352: fuzz 20261028/298'
);

-- ── case 353: fuzz 20261028/299 ──
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)
VALUES ('10000161-0000-4000-8000-000000000001', 'parity case 353', '2027-02-07', '2027-02-08', false, false, '0ff1ce00-0000-4000-8000-000000000001', NULL, NULL, '2027-01-26T03:15:00+00:00');
INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES
  ('30000161-0000-4000-8000-000000000001', 'line', 'CAD', -48175, 1, '10000161-0000-4000-8000-000000000001', false);
INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES
  ('20000161-0000-4000-8000-000000000001', '10000161-0000-4000-8000-000000000001', '2026-12-24', 'CAD', 546),
  ('20000161-0000-4000-8000-000000000002', '10000161-0000-4000-8000-000000000001', '2026-12-24', 'CAD', 26);
INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES
  ('40000161-0000-4000-8000-000000000001', '10000161-0000-4000-8000-000000000001', NULL, 1, 'cad', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000161-0000-4000-8000-000000000002', '10000161-0000-4000-8000-000000000001', '20000161-0000-4000-8000-000000000002', 2, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000161-0000-4000-8000-000000000003', '10000161-0000-4000-8000-000000000001', NULL, 1, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000161-0000-4000-8000-000000000004', '10000161-0000-4000-8000-000000000001', '20000161-0000-4000-8000-000000000002', 1, ' CAD ', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000161-0000-4000-8000-000000000005', '10000161-0000-4000-8000-000000000001', NULL, 2, 'CAD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL),
  ('40000161-0000-4000-8000-000000000006', '10000161-0000-4000-8000-000000000001', '20000161-0000-4000-8000-000000000002', -1, 'USD', 'succeeded', 'Parity', 'stripe', NULL, NULL, NULL, NULL, NULL);
SELECT is(
  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text
   FROM public.ar_event_balances('10000161-0000-4000-8000-000000000001', '2026-12-11') b),
  '(0,7,0,0)',
  'case 353: fuzz 20261028/299'
);

SELECT * FROM finish();
ROLLBACK;
