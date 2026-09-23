\set ON_ERROR_STOP on
BEGIN;
-- Recreate the old layout (no percentage_bps, amount_cents NOT NULL) inside a rollback-only
-- transaction, then run the real migration against fixtures. Existing rows are restored by ROLLBACK.
UPDATE public."PaymentInstallments" pi SET amount_cents = r.amount_cents
FROM (SELECT p.id, s.amount_cents FROM public."PaymentInstallments" p
  CROSS JOIN LATERAL public.resolve_payment_schedule(p.event_uuid) s WHERE s.id = p.id) r
WHERE r.id = pi.id;
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.recompute_quote_hashes(uuid)'::regprocedure) INTO definition;
  definition := replace(definition, '''percentageBps'', pi.percentage_bps,', '');
  definition := replace(definition, 'resolved.amount_cents', 'pi.amount_cents');
  definition := replace(definition, 'JOIN public.resolve_payment_schedule(p_event_id) resolved ON resolved.id = pi.id', '');
  EXECUTE definition;
END $$;
ALTER TABLE public."PaymentInstallments" DROP COLUMN percentage_bps;
ALTER TABLE public."PaymentInstallments" ALTER COLUMN amount_cents SET NOT NULL;

INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, contract_revenue_cents)
VALUES
 ('00000000-0000-0000-0000-000000000101', 'Percentage migration balanced', '2099-01-01', '2099-01-02', false, false, 3),
 ('00000000-0000-0000-0000-000000000102', 'Percentage migration unbalanced', '2099-01-01', '2099-01-02', false, false, 200000),
 ('00000000-0000-0000-0000-000000000103', 'Percentage migration zero', '2099-01-01', '2099-01-02', false, false, 0);
INSERT INTO public."PaymentInstallments" (event_uuid, due_date, amount_cents, currency)
SELECT '00000000-0000-0000-0000-000000000101'::uuid, '2099-01-01'::date + n, 1, 'USD' FROM generate_series(0,2) n;
INSERT INTO public."PaymentInstallments" (event_uuid, due_date, amount_cents, currency)
SELECT '00000000-0000-0000-0000-000000000102'::uuid, '2099-01-01'::date + n, 50000, 'USD' FROM generate_series(0,1) n;
INSERT INTO public."PaymentInstallments" (event_uuid, due_date, amount_cents, currency)
SELECT '00000000-0000-0000-0000-000000000103'::uuid, '2099-01-01'::date + n, 0, 'USD' FROM generate_series(0,2) n;

\ir ../migrations/20260922120000_percentage_payment_schedules.sql

DO $$
DECLARE shares integer[]; cents bigint; original_hash text;
BEGIN
  SELECT array_agg(percentage_bps ORDER BY due_date) INTO shares FROM public."PaymentInstallments"
  WHERE event_uuid = '00000000-0000-0000-0000-000000000101';
  ASSERT shares = ARRAY[3334,3333,3333], 'balanced backfill rounds to exactly 100%';
  SELECT array_agg(percentage_bps ORDER BY due_date) INTO shares FROM public."PaymentInstallments"
  WHERE event_uuid = '00000000-0000-0000-0000-000000000102';
  ASSERT shares = ARRAY[2500,2500], 'unbalanced backfill preserves missing share';
  SELECT array_agg(percentage_bps ORDER BY due_date) INTO shares FROM public."PaymentInstallments"
  WHERE event_uuid = '00000000-0000-0000-0000-000000000103';
  ASSERT shares = ARRAY[3333,3333,3334], 'zero-total schedules get equal shares';
  SELECT contract_hash INTO original_hash FROM public."Events" WHERE id = '00000000-0000-0000-0000-000000000101';
  UPDATE public."Events" SET contract_revenue_cents = 101 WHERE id = '00000000-0000-0000-0000-000000000101';
  SELECT sum(amount_cents) INTO cents FROM public.resolve_payment_schedule('00000000-0000-0000-0000-000000000101');
  ASSERT cents = 101, 'rounded cents always match total';
  ASSERT (SELECT contract_hash <> original_hash FROM public."Events" WHERE id = '00000000-0000-0000-0000-000000000101'), 'price changes update contract hash';
  SELECT sum(amount_cents) INTO cents FROM public.resolve_payment_schedule('00000000-0000-0000-0000-000000000102');
  ASSERT cents = 100000, 'invalid schedules are not normalized';
  RAISE NOTICE 'PASS: backfill, percentage preservation, cent rounding and price hash changes';
END $$;
ROLLBACK;
