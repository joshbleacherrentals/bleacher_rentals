-- ============================================================================
-- Percentage payment schedules: turning percentages into dollars.
--
-- A schedule stores percentage_bps (5000 = 50%), and resolve_payment_schedule()
-- turns it into cents against the quote's current total. Covers the live
-- functions only. The one-time backfill in
-- 20260922120000_percentage_payment_schedules.sql has already run everywhere,
-- and `supabase test db` cannot re-run a migration, because only this
-- directory is mounted in its container.
--
-- See docs/specs/percentage-payment-schedules.md.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(8);

INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, contract_revenue_cents)
VALUES
 ('00000000-0000-0000-0000-000000000101', 'Thirds', '2099-01-01', '2099-01-02', false, false, 101),
 ('00000000-0000-0000-0000-000000000102', 'Half and half', '2099-01-01', '2099-01-02', false, false, 100000),
 ('00000000-0000-0000-0000-000000000103', 'Adds up to 50%', '2099-01-01', '2099-01-02', false, false, 200000),
 ('00000000-0000-0000-0000-000000000104', 'Line items and tax', '2099-01-01', '2099-01-02', false, false, 999999);

UPDATE public."Events" SET tax_percent = 13, tax_amount_cents = NULL
 WHERE id = '00000000-0000-0000-0000-000000000104';
INSERT INTO public."EventLineItems" (event_uuid, header, quantity, value_cents, currency)
VALUES ('00000000-0000-0000-0000-000000000104', 'Rental', 2, 1000, 'USD');

INSERT INTO public."PaymentInstallments" (event_uuid, due_date, percentage_bps, currency)
VALUES
 ('00000000-0000-0000-0000-000000000101', '2099-01-01', 3334, 'USD'),
 ('00000000-0000-0000-0000-000000000101', '2099-01-02', 3333, 'USD'),
 ('00000000-0000-0000-0000-000000000101', '2099-01-03', 3333, 'USD'),
 ('00000000-0000-0000-0000-000000000102', '2099-01-01', 5000, 'USD'),
 ('00000000-0000-0000-0000-000000000102', '2099-01-02', 5000, 'USD'),
 ('00000000-0000-0000-0000-000000000103', '2099-01-01', 2500, 'USD'),
 ('00000000-0000-0000-0000-000000000103', '2099-01-02', 2500, 'USD');

CREATE TEMP VIEW schedule AS
SELECT pi.event_uuid, pi.due_date, s.amount_cents
  FROM public."PaymentInstallments" pi
  JOIN LATERAL public.resolve_payment_schedule(pi.event_uuid) s ON s.id = pi.id;

SELECT is(
  (SELECT array_agg(amount_cents ORDER BY due_date) FROM schedule
    WHERE event_uuid = '00000000-0000-0000-0000-000000000101'),
  ARRAY[34, 34, 33]::bigint[],
  'a schedule adding up to 100% hands out the leftover cents, largest remainder first'
);

SELECT is(
  (SELECT sum(amount_cents) FROM schedule WHERE event_uuid = '00000000-0000-0000-0000-000000000101'),
  101::numeric,
  'the rounded cents add up to exactly the quote total'
);

SELECT is(
  (SELECT array_agg(amount_cents ORDER BY due_date) FROM schedule
    WHERE event_uuid = '00000000-0000-0000-0000-000000000102'),
  ARRAY[50000, 50000]::bigint[],
  '50/50 of $1,000 is $500 each'
);

SELECT throws_ok(
  $$INSERT INTO public."PaymentInstallments" (event_uuid, due_date, percentage_bps, currency)
    VALUES ('00000000-0000-0000-0000-000000000102', '2099-01-03', -1, 'USD')$$,
  '23514',
  NULL,
  'a negative percentage is refused'
);

CREATE TEMP TABLE hash_before AS
SELECT contract_hash FROM public."Events" WHERE id = '00000000-0000-0000-0000-000000000102';

UPDATE public."Events" SET contract_revenue_cents = 200000
 WHERE id = '00000000-0000-0000-0000-000000000102';

SELECT is(
  (SELECT array_agg(amount_cents ORDER BY due_date) FROM schedule
    WHERE event_uuid = '00000000-0000-0000-0000-000000000102'),
  ARRAY[100000, 100000]::bigint[],
  'the schedule follows a price change: 50/50 of $2,000 is $1,000 each'
);

SELECT isnt(
  (SELECT contract_hash FROM public."Events" WHERE id = '00000000-0000-0000-0000-000000000102'),
  (SELECT contract_hash FROM hash_before),
  'a price change changes the contract hash, so a signed contract shows as out of date'
);

SELECT is(
  (SELECT array_agg(amount_cents ORDER BY due_date) FROM schedule
    WHERE event_uuid = '00000000-0000-0000-0000-000000000103'),
  ARRAY[50000, 50000]::bigint[],
  'a schedule that does not add up to 100% is not stretched to fit the total'
);

SELECT is(
  public.payment_schedule_total_cents('00000000-0000-0000-0000-000000000104'),
  2260::bigint,
  'with line items, the total is the line items plus tax, not contract_revenue_cents'
);

SELECT * FROM finish();
ROLLBACK;
