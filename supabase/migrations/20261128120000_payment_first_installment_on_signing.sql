-- =============================================================
-- The first installment is due the day the event is first booked
-- (docs/specs/payment-first-installment-on-signing.md)
--
-- The first row of every payment schedule carries `due_on_signing`. Until the event is booked it
-- has no date ("On signing"). The first time the event becomes booked (the client signs, or a
-- manager sets Booked) the database writes that day onto the row, once, and nothing moves it
-- afterwards. A signed event gets the day of its FIRST signature, a hand-booked one the day of
-- its `booked_at`, both in the Toronto time zone like the Collections functions.
--
-- Old events (spec D5, narrowed by D6), by status and `event_end`, the Toronto day the migration
-- runs being today: booked / unsigned_changes and not finished (event_end after today) KEEP their
-- date; booked / unsigned_changes and finished (event_end today or earlier) are RE-DATED to the
-- first-booked day; draft, quoted and lost are CLEARED, whatever their dates. All of them get the
-- mark. The rule lives in backfill_first_installment_on_signing(), which the seed and the SQL
-- test call too.
--
-- Why the hash changes: the due date was contract material, so writing it after the client signed
-- would move contract_hash and invalidate the signature just made. For the marked row the hash now
-- carries the text `on signing` instead of the date; its percentage stays contract material.
-- resolve_payment_schedule breaks its spare-cent ties with the marked row first, so the amounts in
-- the hash do not depend on that date either (a 50 / 50 split of an odd number of cents).
--
-- Order below: column, functions, the two replaced functions, the invalidation trigger off, the
-- one-time marking and dating (spec D5 and D6), the triggers, a recompute of every schedule's hash,
-- the active signatures re-anchored (D5 question D: they stay valid), the invalidation trigger on.
-- Precedent: 20260903120000_payment_state_out_of_quote_hashes.sql. A migration file is a batch under
-- the Supabase CLI, so nothing here needs BEGIN and COMMIT. It can run twice: the column is added
-- IF NOT EXISTS, the functions are replaced, an event that already has a marked row is skipped.
-- =============================================================

-- ── 1. The column ────────────────────────────────────────────────────────────
-- due_date was NOT NULL; the marked row of an event that was never booked has no date.
ALTER TABLE public."PaymentInstallments" ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE public."PaymentInstallments"
  ADD COLUMN IF NOT EXISTS due_on_signing boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public."PaymentInstallments".due_on_signing IS
  'The first row of a schedule: due the day the event is first booked. Its due_date is empty until then; the database writes it once (fill_on_signing_installment) and it is not a term of the contract.';

-- ── 2. The day rule ──────────────────────────────────────────────────────────
-- Has the event ever been booked? Its status says so, or a signature of any status does.
CREATE OR REPLACE FUNCTION public.event_has_been_booked(p_event uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public."Events" e
                 WHERE e.id = p_event AND e.event_status IN ('booked', 'unsigned_changes'))
      OR EXISTS (SELECT 1 FROM public."ContractSignatures" s WHERE s.event_uuid = p_event);
$$;

-- The day of the first booking, in Toronto: the earliest signature of any status, else booked_at,
-- else now() (a booked event is never left without a date).
CREATE OR REPLACE FUNCTION public.first_booked_day(p_event uuid)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (COALESCE(
    (SELECT min(s.signed_at) FROM public."ContractSignatures" s WHERE s.event_uuid = p_event),
    (SELECT e.booked_at FROM public."Events" e WHERE e.id = p_event),
    now()
  ) AT TIME ZONE 'America/Toronto')::date;
$$;

-- Writes the day onto the event's marked rows that are still empty, once the event has been booked.
-- A row that already has a date is never touched.
CREATE OR REPLACE FUNCTION public.fill_on_signing_installment(p_event uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_event IS NULL OR NOT public.event_has_been_booked(p_event) THEN
    RETURN;
  END IF;
  UPDATE public."PaymentInstallments"
  SET due_date = public.first_booked_day(p_event)
  WHERE event_uuid = p_event AND due_on_signing AND due_date IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.event_has_been_booked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.first_booked_day(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_on_signing_installment(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. The schedule resolver: the marked row wins a spare-cent tie ───────────
-- Same function as 20260922120000, one change in the ranking: due_on_signing DESC before due_date.
-- Before booking the marked row has no date (TypeScript sorts an empty date first); after booking it
-- has one. Without this the spare cent would move to the other row when the date is written, and
-- the hash would move with it.
CREATE OR REPLACE FUNCTION public.resolve_payment_schedule(p_event_id uuid)
RETURNS TABLE(id uuid, amount_cents bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH shares AS (
    SELECT pi.id, pi.due_date, pi.due_on_signing, pi.percentage_bps,
      public.payment_schedule_total_cents(p_event_id) AS total,
      public.payment_schedule_total_cents(p_event_id)::numeric * pi.percentage_bps / 10000 AS exact,
      sum(pi.percentage_bps) OVER () AS bps
    FROM public."PaymentInstallments" pi WHERE pi.event_uuid = p_event_id
  ), ranked AS (
    SELECT *, row_number() OVER (ORDER BY exact - floor(exact) DESC, due_on_signing DESC, due_date, id) AS rank,
      sum(floor(exact)) OVER () AS floors FROM shares
  )
  SELECT id, (CASE WHEN bps = 10000 THEN floor(exact) + CASE WHEN rank <= total - floors THEN 1 ELSE 0 END
    ELSE round(exact) END)::bigint FROM ranked;
$$;

-- ── 4. The hash: the marked row carries `on signing`, not its date ───────────
-- A copy of recompute_quote_hashes from 20260922120000 with two changes in v_installments: `due` is
-- the text `on signing` for the marked row, and the aggregate orders the marked row first.
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
  -- arrived — that is derived from PaymentHistory at read time. The marked row is due on
  -- signing whatever day the database wrote onto it.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'due', CASE WHEN pi.due_on_signing THEN to_jsonb('on signing'::text)
                         ELSE to_jsonb(pi.due_date) END,
             'percentageBps', pi.percentage_bps,
             'amount', resolved.amount_cents
           ) ORDER BY pi.due_on_signing DESC, pi.due_date, pi.id
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

-- ── 5. The one-time marking and dating (spec D5, narrowed by D6) ─────────────
-- Marks the first row of every event that has a schedule and no marked row yet: the row the
-- schedule pays first (earliest due date, then created_at, then id). Its date, by the event's
-- status and its end, with today the Toronto day:
--   booked / unsigned_changes, event_end after today  -> Keep: the date it has
--   booked / unsigned_changes, event_end today or before -> Re-date: first_booked_day (the earliest
--                                                        signature, else booked_at, else now())
--   any other status (draft, quoted, lost)             -> Clear: NULL, "On signing"
-- Idempotent: an event that has a marked row is skipped, so a second call returns 0. Returns the
-- number of events marked. The seed and the SQL test call it too.
CREATE OR REPLACE FUNCTION public.backfill_first_installment_on_signing()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_marked integer;
BEGIN
  WITH first_row AS (
    SELECT x.id,
           x.event_uuid,
           row_number() OVER (PARTITION BY x.event_uuid
                              ORDER BY x.due_date NULLS LAST, x.created_at, x.id) AS rn
    FROM public."PaymentInstallments" x
    WHERE NOT EXISTS (SELECT 1 FROM public."PaymentInstallments" m
                      WHERE m.event_uuid = x.event_uuid AND m.due_on_signing)
  ), marked AS (
    UPDATE public."PaymentInstallments" pi
    SET due_on_signing = true,
        due_date = CASE
          WHEN e.event_status IN ('booked', 'unsigned_changes') AND e.event_end > v_today
            THEN pi.due_date
          WHEN e.event_status IN ('booked', 'unsigned_changes')
            THEN public.first_booked_day(e.id)
          ELSE NULL
        END
    FROM first_row f
    JOIN public."Events" e ON e.id = f.event_uuid
    WHERE pi.id = f.id AND f.rn = 1
    RETURNING pi.id
  )
  SELECT count(*) INTO v_marked FROM marked;
  RETURN v_marked;
END;
$$;
REVOKE ALL ON FUNCTION public.backfill_first_installment_on_signing()
  FROM PUBLIC, anon, authenticated;

-- The invalidation trigger is off while the hashes move: the formula changed for every event with a
-- schedule, and the active signatures stay valid (re-anchored below).
ALTER TABLE public."Events" DISABLE TRIGGER invalidate_signature_on_contract_change;

DO $$
DECLARE
  v_marked integer;
BEGIN
  v_marked := public.backfill_first_installment_on_signing();
  RAISE NOTICE 'first installment backfill: % events marked', v_marked;
END
$$;

-- ── 6. The two triggers ──────────────────────────────────────────────────────
-- On Events: the first time the event is booked, whichever way it got there (the status button, the
-- edit page, the client's signature through the sign route, an import).
CREATE OR REPLACE FUNCTION public.trg_fill_on_signing_from_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.fill_on_signing_installment(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_fill_on_signing_from_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fill_on_signing_installment_on_event ON public."Events";
CREATE TRIGGER fill_on_signing_installment_on_event
  AFTER INSERT OR UPDATE OF event_status ON public."Events"
  FOR EACH ROW
  WHEN (NEW.event_status IN ('booked', 'unsigned_changes'))
  EXECUTE FUNCTION public.trg_fill_on_signing_from_event();

-- On PaymentInstallments: a schedule given to an event that is already booked, and a stale editor
-- writing an empty date over a filled one. The fill makes the date non-empty, so it does not fire
-- again.
CREATE OR REPLACE FUNCTION public.trg_fill_on_signing_from_installment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.fill_on_signing_installment(NEW.event_uuid);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_fill_on_signing_from_installment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fill_on_signing_installment_on_installment ON public."PaymentInstallments";
CREATE TRIGGER fill_on_signing_installment_on_installment
  AFTER INSERT OR UPDATE OF due_on_signing, due_date ON public."PaymentInstallments"
  FOR EACH ROW
  WHEN (NEW.due_on_signing AND NEW.due_date IS NULL)
  EXECUTE FUNCTION public.trg_fill_on_signing_from_installment();

-- ── 7. Recompute every schedule's hash, re-anchor the active signatures ──────
SELECT public.recompute_quote_hashes(event_uuid)
FROM (SELECT DISTINCT event_uuid FROM public."PaymentInstallments") s;

-- `active` means the signature agreed with the terms before this migration; the formula, not the
-- agreement, changed (spec D5 question D). Invalidated rows keep their historical snapshot.
UPDATE public."ContractSignatures" s
SET signed_contract_hash = e.contract_hash
FROM public."Events" e
WHERE e.id = s.event_uuid
  AND s.status = 'active'
  AND EXISTS (SELECT 1 FROM public."PaymentInstallments" pi WHERE pi.event_uuid = e.id);

-- The Collections triggers on Events are deferred to commit (20261031120000) and the updates above
-- queued them; Postgres refuses ALTER TABLE while trigger events are pending. Firing them now is
-- what commit would do anyway, and they catch their own errors.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public."Events" ENABLE TRIGGER invalidate_signature_on_contract_change;
