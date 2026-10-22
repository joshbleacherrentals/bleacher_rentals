-- =============================================================
-- QuickBooks invoice: the link columns and the current hash on Events
-- (docs/specs/qbo-invoice-01-link-and-hash.md)
--
-- The app will keep, on each quote, which QuickBooks invoice it made and whether that invoice
-- still matches the quote. This migration adds:
--   1. five columns on Events;
--   2. a third document in recompute_quote_hashes(), hashed into qbo_invoice_hash — a fingerprint
--      of everything the invoice is built from, kept current by the same triggers that keep
--      content_hash and contract_hash;
--   3. the Contacts trigger widened to the finance contact, which the new hash reads.
--
-- qbo_invoice_sent_hash (what the invoice was built from when it was last written) and
-- qbo_invoice_mismatch are written by the server with the service role. The accountant guard
-- skips every caller that is not `authenticated`, so it needs no change; a browser may write these
-- columns like any other Events column (only the accountant is fenced).
--
-- No RLS policy, no guard, no sync rule changes: Events already syncs whole-row.
-- content_hash and contract_hash are computed exactly as before.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Columns
-- -------------------------------------------------------------
ALTER TABLE public."Events"
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_connection_uuid uuid NULL
    REFERENCES public."QboConnections"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS qbo_invoice_hash text NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_sent_hash text NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_mismatch boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."Events".qbo_invoice_id IS
  'QuickBooks'' own id of the invoice made from this quote. Null until an invoice is created. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_connection_uuid IS
  'The QuickBooks file (QboConnections) the invoice lives in. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_hash IS
  'Current hash of everything the QuickBooks invoice is built from (type, amount, tax, billed contact, venue, invoice number, Event Start, due date, title). Written only by recompute_quote_hashes().';
COMMENT ON COLUMN public."Events".qbo_invoice_sent_hash IS
  'The value qbo_invoice_hash had when the invoice was last written to QuickBooks. The invoice is outdated while this differs from qbo_invoice_hash. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_mismatch IS
  'True while QuickBooks'' totals disagree with the quote''s after the last check. Written by the server.';

-- -------------------------------------------------------------
-- 2. Same function as 20260922120000, plus a third document
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_quote_hashes(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_content       jsonb;
  v_contract      jsonb;
  v_invoice       jsonb;
  v_line_items    jsonb;
  v_installments  jsonb;
  v_content_hash  text;
  v_contract_hash text;
  v_invoice_hash  text;
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
    ),
    -- Everything the QuickBooks invoice is built from, in fixed key order. The price is after
    -- discounts (negative lines) and before tax; the customer is the finance contact when set,
    -- else the contact; the due date is the last installment's, else the Event Start.
    jsonb_build_object(
      'eventType', e.event_type_uuid,
      'amountCents', (SELECT COALESCE(sum(COALESCE(li.quantity, 1) * li.value_cents), 0)
                      FROM public."EventLineItems" li
                      WHERE li.event_uuid = p_event_id AND li.deleted = false),
      'taxPercent', e.tax_percent,
      'taxAmountCents', e.tax_amount_cents,
      'isTaxOverridden', e.is_tax_overridden,
      'customer', CASE WHEN bc.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', bc.id, 'first', bc.first_name, 'last', bc.last_name) END,
      'venue', CASE WHEN va.id IS NULL THEN NULL ELSE jsonb_build_object(
        'street', va.street, 'city', va.city, 'state', va.state_province, 'zip', va.zip_postal) END,
      'invoiceNumber', e.invoice_number,
      'invoiceDate', e.event_start,
      'dueDate', COALESCE((SELECT max(pi.due_date) FROM public."PaymentInstallments" pi
                           WHERE pi.event_uuid = p_event_id), e.event_start),
      'title', e.event_name
    )
  INTO v_content, v_contract, v_invoice
  FROM public."Events" e
  LEFT JOIN public."TermsAndConditions" tc ON tc.id = e.terms_and_conditions_uuid
  LEFT JOIN public."Contacts" c            ON c.id  = e.contact_uuid
  LEFT JOIN public."Contacts" bc           ON bc.id = COALESCE(e.finance_contact_uuid, e.contact_uuid)
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
  v_invoice_hash  := encode(extensions.digest(v_invoice::text,  'sha256'), 'hex');

  -- Only write when something actually changed. This also terminates the
  -- Events AFTER-UPDATE recursion: the second pass computes the same hash,
  -- matches 0 rows, and fires no further trigger.
  UPDATE public."Events"
  SET content_hash = v_content_hash,
      contract_hash = v_contract_hash,
      qbo_invoice_hash = v_invoice_hash
  WHERE id = p_event_id
    AND (content_hash IS DISTINCT FROM v_content_hash
         OR contract_hash IS DISTINCT FROM v_contract_hash
         OR qbo_invoice_hash IS DISTINCT FROM v_invoice_hash);
END;
$$;

-- -------------------------------------------------------------
-- 3. A finance contact is billed on the invoice, so its edit must reach the hash
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recompute_quote_hashes_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.recompute_quote_hashes(e.id)
  FROM public."Events" e
  WHERE e.contact_uuid = NEW.id OR e.finance_contact_uuid = NEW.id;
  RETURN NULL;
END;
$$;

-- -------------------------------------------------------------
-- 4. Backfill under a disabled invalidation trigger. content_hash and contract_hash do not
--    move, so nothing is invalidated; the trigger is off so that this stays true even if a
--    pre-existing hash had drifted. Aborts if an active signature then disagrees with its event.
-- -------------------------------------------------------------
ALTER TABLE public."Events"
  DISABLE TRIGGER invalidate_signature_on_contract_change;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public."Events" LOOP
    PERFORM public.recompute_quote_hashes(r.id);
  END LOOP;
END;
$$;

ALTER TABLE public."Events"
  ENABLE TRIGGER invalidate_signature_on_contract_change;

DO $$
DECLARE
  v_drifted INT;
BEGIN
  SELECT count(*) INTO v_drifted
  FROM public."ContractSignatures" s
  JOIN public."Events" e ON e.id = s.event_uuid
  WHERE s.status = 'active'
    AND s.signed_contract_hash IS DISTINCT FROM e.contract_hash;

  IF v_drifted > 0 THEN
    RAISE EXCEPTION
      'backfill left % active signature(s) disagreeing with their event — aborting', v_drifted;
  END IF;
END;
$$;
