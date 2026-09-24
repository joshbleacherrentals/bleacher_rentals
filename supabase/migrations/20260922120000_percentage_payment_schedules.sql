-- Coordinated release: deploy matching app and PowerSync schema; old clients
-- writing amount_cents are incompatible. Historical payments/IDs are untouched.
CREATE OR REPLACE FUNCTION public.payment_schedule_total_cents(p_event_id uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT round(CASE WHEN count(li.id) > 0 THEN
    coalesce(sum(li.quantity * li.value_cents), 0) + coalesce(e.tax_amount_cents,
      round(coalesce(sum(li.quantity * li.value_cents), 0) * coalesce(e.tax_percent, 0) / 100))
    ELSE e.contract_revenue_cents END)::bigint
  FROM public."Events" e
  LEFT JOIN public."EventLineItems" li ON li.event_uuid = e.id AND li.deleted = false
  WHERE e.id = p_event_id GROUP BY e.id;
$$;

ALTER TABLE public."PaymentInstallments" ADD COLUMN percentage_bps integer;

-- Refuse ambiguous input before changing any saved terms.
DO $$
DECLARE invalid_ids text;
BEGIN
  SELECT string_agg(DISTINCT pi.event_uuid::text, ', ') INTO invalid_ids
  FROM public."PaymentInstallments" pi
  CROSS JOIN LATERAL (SELECT public.payment_schedule_total_cents(pi.event_uuid) AS total) t
  WHERE t.total IS NULL OR t.total < 0 OR pi.amount_cents < 0
    OR (t.total = 0 AND pi.amount_cents <> 0);
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot convert payment schedules; review totals/amounts for events: %', invalid_ids;
  END IF;
END $$;

-- Existing hashes still read amount_cents while this backfill runs.
WITH source AS (
  SELECT pi.*, public.payment_schedule_total_cents(event_uuid) AS total,
    sum(amount_cents) OVER (PARTITION BY event_uuid) AS scheduled,
    count(*) OVER (PARTITION BY event_uuid) AS n,
    row_number() OVER (PARTITION BY event_uuid ORDER BY due_date, id) AS position
  FROM public."PaymentInstallments" pi
), shares AS (
  SELECT *, CASE WHEN total = 0 THEN floor(10000.0 / n)
    ELSE amount_cents::numeric * 10000 / total END AS exact FROM source
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY event_uuid ORDER BY exact - floor(exact) DESC, due_date, id) AS rank,
    sum(floor(exact)) OVER (PARTITION BY event_uuid) AS floors FROM shares
)
UPDATE public."PaymentInstallments" pi SET percentage_bps =
  CASE WHEN r.total = 0 THEN floor(r.exact) + CASE WHEN r.position = r.n THEN 10000 - r.floors ELSE 0 END
    WHEN r.scheduled = r.total THEN floor(r.exact) + CASE WHEN r.rank <= 10000 - r.floors THEN 1 ELSE 0 END
    ELSE round(r.exact) END
FROM ranked r WHERE r.id = pi.id;

ALTER TABLE public."PaymentInstallments"
  ALTER COLUMN percentage_bps SET NOT NULL,
  ADD CONSTRAINT payment_installments_percentage_nonnegative CHECK (percentage_bps >= 0);

-- Same deterministic largest-remainder resolver as the client. Invalid legacy
-- schedules keep their short/excess amounts, rather than silently balancing.
CREATE OR REPLACE FUNCTION public.resolve_payment_schedule(p_event_id uuid)
RETURNS TABLE(id uuid, amount_cents bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH shares AS (
    SELECT pi.id, pi.due_date, pi.percentage_bps,
      public.payment_schedule_total_cents(p_event_id) AS total,
      public.payment_schedule_total_cents(p_event_id)::numeric * pi.percentage_bps / 10000 AS exact,
      sum(pi.percentage_bps) OVER () AS bps
    FROM public."PaymentInstallments" pi WHERE pi.event_uuid = p_event_id
  ), ranked AS (
    SELECT *, row_number() OVER (ORDER BY exact - floor(exact) DESC, due_date, id) AS rank,
      sum(floor(exact)) OVER () AS floors FROM shares
  )
  SELECT id, (CASE WHEN bps = 10000 THEN floor(exact) + CASE WHEN rank <= total - floors THEN 1 ELSE 0 END
    ELSE round(exact) END)::bigint FROM ranked;
$$;

CREATE OR REPLACE FUNCTION public.recompute_quote_hashes(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_content       jsonb;
  v_contract      jsonb;
  v_line_items    jsonb;
  v_installments  jsonb;
  v_content_hash  text;
  v_contract_hash text;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  -- Child collections, aggregated in a stable order so table row order
  -- can never change the hash spuriously (a real reorder still does).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'header', li.header,
             'description', li.description,
             'qty', li.quantity,
             'value', li.value_cents,
             'currency', li.currency
           ) ORDER BY li.created_at, li.id
         ), '[]'::jsonb)
  INTO v_line_items
  FROM public."EventLineItems" li
  WHERE li.event_uuid = p_event_id AND li.deleted = false;

  -- Terms only: when the money is owed and how much. NOT whether it has
  -- arrived — that is derived from PaymentHistory at read time.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'due', pi.due_date,
             'percentageBps', pi.percentage_bps,
             'amount', resolved.amount_cents
           ) ORDER BY pi.due_date, pi.id
         ), '[]'::jsonb)
  INTO v_installments
  FROM public."PaymentInstallments" pi
  JOIN public.resolve_payment_schedule(p_event_id) resolved ON resolved.id = pi.id
  WHERE pi.event_uuid = p_event_id;

  SELECT
    jsonb_build_object(
      'status', e.event_status,
      'validUntil', e.quote_valid_till,
      'poNumber', e.po_number,
      'eventName', e.event_name,
      'eventStart', e.event_start,
      'eventEnd', e.event_end,
      'clientNotes', COALESCE(e.external_notes, e.notes),
      'taxPercent', e.tax_percent,
      'taxAmountCents', e.tax_amount_cents,
      'termsUuid', e.terms_and_conditions_uuid,
      'termsHtml', tc.html_content,
      'contact', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'first', c.first_name, 'last', c.last_name, 'email', c.email, 'phone', c.phone) END,
      'venue', CASE WHEN va.id IS NULL THEN NULL ELSE jsonb_build_object(
        'street', va.street, 'city', va.city, 'state', va.state_province, 'zip', va.zip_postal) END,
      'salesOffice', CASE WHEN so.id IS NULL THEN NULL ELSE jsonb_build_object(
        'name', so.name, 'phone', so.phone,
        'street', soa.street, 'city', soa.city, 'state', soa.state_province, 'zip', soa.zip_postal) END,
      'lineItems', v_line_items,
      'installments', v_installments,
      'signature', CASE WHEN sig.id IS NULL THEN NULL ELSE jsonb_build_object(
        'signer', sig.signer_name, 'signedAt', sig.signed_at) END
    ),
    jsonb_build_object(
      'eventType', e.event_type_uuid,
      'eventStart', e.event_start,
      'eventEnd', e.event_end,
      'taxPercent', e.tax_percent,
      'taxAmountCents', e.tax_amount_cents,
      'termsUuid', e.terms_and_conditions_uuid,
      'termsHtml', tc.html_content,
      'salesOfficeUuid', e.sales_office_uuid,
      'salesOffice', CASE WHEN so.id IS NULL THEN NULL ELSE jsonb_build_object(
        'name', so.name, 'phone', so.phone,
        'street', soa.street, 'city', soa.city, 'state', soa.state_province, 'zip', soa.zip_postal) END,
      'venue', CASE WHEN va.id IS NULL THEN NULL ELSE jsonb_build_object(
        'street', va.street, 'city', va.city, 'state', va.state_province, 'zip', va.zip_postal) END,
      'lineItems', v_line_items,
      'installments', v_installments
    )
  INTO v_content, v_contract
  FROM public."Events" e
  LEFT JOIN public."TermsAndConditions" tc ON tc.id = e.terms_and_conditions_uuid
  LEFT JOIN public."Contacts" c            ON c.id  = e.contact_uuid
  LEFT JOIN public."Addresses" va          ON va.id = e.address_uuid
  LEFT JOIN public."SalesOffices" so       ON so.id = e.sales_office_uuid
  LEFT JOIN public."Addresses" soa         ON soa.id = so.address_uuid
  LEFT JOIN public."ContractSignatures" sig ON sig.event_uuid = e.id AND sig.status = 'active'
  WHERE e.id = p_event_id;

  IF v_content IS NULL THEN
    RETURN; -- event no longer exists
  END IF;

  v_content_hash  := encode(extensions.digest(v_content::text,  'sha256'), 'hex');
  v_contract_hash := encode(extensions.digest(v_contract::text, 'sha256'), 'hex');

  -- Only write when something actually changed. This also terminates the
  -- Events AFTER-UPDATE recursion: the second pass computes the same hash,
  -- matches 0 rows, and fires no further trigger.
  UPDATE public."Events"
  SET content_hash = v_content_hash,
      contract_hash = v_contract_hash
  WHERE id = p_event_id
    AND (content_hash IS DISTINCT FROM v_content_hash
         OR contract_hash IS DISTINCT FROM v_contract_hash);
END;
$$;

-- Kept, not dropped: existing dollar amounts stay on the rows as history. Nothing reads it any
-- more (percentage_bps is the term; amounts come from resolve_payment_schedule), so new rows
-- leave it NULL.
ALTER TABLE public."PaymentInstallments" ALTER COLUMN amount_cents DROP NOT NULL;
COMMENT ON COLUMN public."PaymentInstallments".amount_cents IS
  'Deprecated: superseded by percentage_bps. Historical value only; not maintained.';

-- Percentage-based terms replace fixed terms. Keep invalidation enabled and
-- report affected signatures; never re-anchor a signature to changed terms.
DO $$
DECLARE r record; before_count integer; after_count integer;
BEGIN
  SELECT count(*) INTO before_count FROM public."ContractSignatures" WHERE status = 'active';
  FOR r IN SELECT DISTINCT event_uuid FROM public."PaymentInstallments" LOOP
    PERFORM public.recompute_quote_hashes(r.event_uuid);
  END LOOP;
  SELECT count(*) INTO after_count FROM public."ContractSignatures" WHERE status = 'active';
  RAISE NOTICE 'Percentage migration invalidated % active signatures; affected quotes require re-signing.', before_count - after_count;
END $$;
