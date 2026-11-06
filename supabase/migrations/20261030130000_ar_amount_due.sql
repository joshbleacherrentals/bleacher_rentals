-- =============================================================
-- Collections: the Amount Due calculation in Postgres (docs/specs/accountant-collections-02-sql-amount-due.md)
--
-- The daily cron (spec 04) and the completion triggers (spec 05) must know an event's Amount Due
-- inside PostgreSQL. The rule exists in TypeScript (src/features/quotesAndBookings/utils:
-- resolvePaymentSchedule -> allocatePayments -> computeAmountDue). This is a PORT of it, not a new
-- algorithm, and spec 03's shared cases keep the two equal.
--
-- Traps the port avoids:
--   * double precision, never numeric, wherever the TypeScript uses a JavaScript number: the
--     percentage maths and the remainders. The tax is lineTotal * (percent / 100), in that order;
--     lineTotal * percent / 100 rounds differently (2000 at 9.975% is 199 in TypeScript, 200 the
--     other way);
--   * Math.round(x) is floor(x + 0.5). Postgres round() on a negative half goes the other way;
--   * ids are compared as uuid here and as lower-case hex strings in JavaScript: the order is the same;
--   * the order of the payments does not matter, only their sums, so the allocation works on
--     aggregates.
--
-- The one new rule is for an event with NO payment schedule: its whole remaining balance falls due 7
-- days before event_start. This is only for Collections; the AR tabs and the public Pay tab keep
-- their own.
--
-- p_today is always passed in (spec 04 passes Toronto's date); nothing here reads the clock.
--
-- Every function is SECURITY INVOKER, STABLE (the province rule IMMUTABLE) and pins search_path.
-- None can be called over PostgREST: EXECUTE is revoked from PUBLIC, anon and authenticated. The cron
-- and the triggers run as the owner. Rolling back is safe: nothing else depends on these until specs
-- 04 and 05 ship.
-- =============================================================

-- ── Province rule (canadianTaxRates.ts: normalizeCanadianProvince) ────────────
-- A code (AB BC MB NB NL NS NT NU ON PE QC SK YT), a full name, or one of five aliases, after
-- trimming and ignoring case.
CREATE FUNCTION public.ar_is_canadian_province(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN false
    ELSE
      upper(regexp_replace(p_value, '^\s+|\s+$', '', 'g')) IN
        ('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT')
      OR lower(regexp_replace(p_value, '^\s+|\s+$', '', 'g')) IN
        ('alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland and labrador',
         'nova scotia', 'northwest territories', 'nunavut', 'ontario', 'prince edward island',
         'quebec', 'saskatchewan', 'yukon',
         'québec', 'newfoundland & labrador', 'newfoundland', 'p.e.i.', 'pei')
  END;
$$;

-- ── Office currency (resolveOfficeCurrency + pickEventCurrency) ───────────────
-- The office's QuickBooks currency when it is CAD or USD (trimmed, upper case); otherwise CAD if the
-- office address is in a Canadian province, otherwise USD. No office, a deleted office or an office
-- that does not exist gives USD.
CREATE FUNCTION public.ar_office_currency(p_office uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_qbo      text;
  v_province text;
BEGIN
  IF p_office IS NULL THEN
    RETURN 'USD';
  END IF;

  SELECT upper(regexp_replace(q.currency, '^\s+|\s+$', '', 'g')), a.state_province
    INTO v_qbo, v_province
  FROM public."SalesOffices" so
  LEFT JOIN public."QboConnections" q ON q.id = so.quickbook_uuid
  LEFT JOIN public."Addresses" a ON a.id = so.address_uuid
  WHERE so.id = p_office AND so.deleted = false;

  IF NOT FOUND THEN
    RETURN 'USD';
  END IF;
  IF v_qbo IN ('CAD', 'USD') THEN
    RETURN v_qbo;
  END IF;
  RETURN CASE WHEN public.ar_is_canadian_province(v_province) THEN 'CAD' ELSE 'USD' END;
END;
$$;

-- ── Event total (eventTotalCents + Math.max(0, Math.round(...))) ──────────────
-- Σ coalesce(quantity, 1) x coalesce(value_cents, 0) over lines with deleted = false, plus the saved
-- tax (tax_amount_cents) or, when there is none, the rounded tax the percent implies. Never negative.
-- A missing event gives 0.
CREATE FUNCTION public.ar_event_total_cents(p_event uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tax_pct   numeric;
  v_tax_cents integer;
  v_lines     bigint;
  v_tax       double precision;
BEGIN
  SELECT e.tax_percent, e.tax_amount_cents
    INTO v_tax_pct, v_tax_cents
  FROM public."Events" e
  WHERE e.id = p_event;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT coalesce(sum(coalesce(li.quantity, 1)::bigint * coalesce(li.value_cents, 0)::bigint), 0)
    INTO v_lines
  FROM public."EventLineItems" li
  WHERE li.event_uuid = p_event AND li.deleted = false;

  -- Math.round(lineTotal * (taxPercent / 100)) = floor(x + 0.5), in double precision.
  v_tax := coalesce(
    v_tax_cents::double precision,
    floor(v_lines::double precision * (coalesce(v_tax_pct, 0)::double precision / 100) + 0.5)
  );

  RETURN greatest(0, floor(v_lines::double precision + v_tax + 0.5))::bigint;
END;
$$;

-- ── The four figures (resolvePaymentSchedule + allocatePayments + computeAmountDue) ──
-- One row: the total, what has been received (every counted cent of either sign, so it may be
-- negative), the remaining balance and the Amount Due. All zeros for a missing event.
--
--   1. total, and the event's currency (its office's);
--   2. the installments ordered by due_date, id, with their amounts by the schedule rule: each is
--      total x percentage_bps / 10000 in double precision; when the percentages add to exactly 10000
--      the amounts are the floors plus one extra cent each for the largest remainders (ties by due
--      date, then id) until they add to the total; otherwise each is round()ed on its own;
--   3. the counted payments: not deleted, status 'succeeded', in the event's currency;
--   4. the allocation: a payment aimed at an installment stays on it, clamped to [0, amount]; the
--      excess and every other counted payment (also one aimed at another event's installment) go into
--      a pool; a positive pool fills installments forwards up to their amounts, a negative one
--      (a refund) un-fills them backwards, newest first;
--   5. remaining = greatest(total - received, 0);
--   6. with installments: Σ greatest(0, amount - allocated) over those due on or before p_today;
--      WITHOUT installments: the whole remaining when event_start - 7 <= p_today, else 0;
--   7. amount due = least(that, remaining).
--
-- COST 1000: Postgres does not promise the order of WHERE conditions, and a high cost makes the
-- planner run this after the cheap ones.
CREATE FUNCTION public.ar_event_balances(p_event uuid, p_today date)
RETURNS TABLE (
  total_cents      bigint,
  received_cents   bigint,
  remaining_cents  bigint,
  amount_due_cents bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
COST 1000
SET search_path = public
AS $$
DECLARE
  v_start     date;
  v_office    uuid;
  v_currency  text;
  v_total     bigint;
  v_received  bigint;
  v_remaining bigint;
  v_due       bigint := 0;

  v_bps_sum   bigint;
  v_floor_sum bigint;
  v_balanced  boolean;
  v_extra     bigint;

  v_n         integer := 0;
  v_dates     date[]   := '{}';
  v_nominal   bigint[] := '{}';
  v_alloc     bigint[] := '{}';

  v_pool      bigint;
  v_move      bigint;
  v_cap       bigint;
  r           record;
  i           integer;
BEGIN
  SELECT e.event_start, e.sales_office_uuid
    INTO v_start, v_office
  FROM public."Events" e
  WHERE e.id = p_event;

  IF NOT FOUND THEN
    total_cents := 0; received_cents := 0; remaining_cents := 0; amount_due_cents := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_total    := public.ar_event_total_cents(p_event);
  v_currency := public.ar_office_currency(v_office);

  -- Everything counted, of either sign.
  SELECT coalesce(sum(ph.amount_cents::bigint), 0)
    INTO v_received
  FROM public."PaymentHistory" ph
  WHERE ph.event_uuid = p_event
    AND ph.deleted_at IS NULL
    AND ph.status = 'succeeded'
    AND upper(regexp_replace(ph.currency, '^\s+|\s+$', '', 'g')) = v_currency;

  v_remaining := greatest(v_total - v_received, 0);

  -- Do the percentages add to exactly 10000, and how many cents do the floors leave over?
  SELECT coalesce(sum(coalesce(pi.percentage_bps, 0)::bigint), 0),
         coalesce(sum(floor((v_total::double precision * coalesce(pi.percentage_bps, 0)::double precision) / 10000)), 0)::bigint
    INTO v_bps_sum, v_floor_sum
  FROM public."PaymentInstallments" pi
  WHERE pi.event_uuid = p_event;

  v_balanced := v_bps_sum = 10000;
  v_extra    := v_total - v_floor_sum;

  -- The installments in due-date order, with their amount and what is aimed straight at each.
  FOR r IN
    WITH base AS (
      SELECT pi.id, pi.due_date,
             (v_total::double precision * coalesce(pi.percentage_bps, 0)::double precision) / 10000 AS val
      FROM public."PaymentInstallments" pi
      WHERE pi.event_uuid = p_event
    ), ranked AS (
      SELECT b.*,
             row_number() OVER (ORDER BY b.due_date, b.id) AS pos,
             row_number() OVER (ORDER BY (b.val - floor(b.val)) DESC, b.due_date, b.id) AS rk
      FROM base b
    )
    SELECT k.pos, k.due_date,
           greatest(
             0,
             CASE WHEN v_balanced
                  THEN floor(k.val)::bigint + CASE WHEN k.rk <= v_extra THEN 1 ELSE 0 END
                  ELSE floor(k.val + 0.5)::bigint
             END
           ) AS nominal,
           coalesce((
             SELECT sum(ph.amount_cents::bigint)
             FROM public."PaymentHistory" ph
             WHERE ph.installment_id = k.id
               AND ph.event_uuid = p_event
               AND ph.deleted_at IS NULL
               AND ph.status = 'succeeded'
               AND upper(regexp_replace(ph.currency, '^\s+|\s+$', '', 'g')) = v_currency
           ), 0) AS net
    FROM ranked k
    ORDER BY k.pos
  LOOP
    v_n := v_n + 1;
    v_dates   := v_dates || r.due_date;
    v_nominal := v_nominal || r.nominal;
    -- Targeted money stays on its installment, never below 0 and never above its amount.
    v_alloc   := v_alloc || least(greatest(r.net, 0::bigint), r.nominal);
    -- ...and what that clamp leaves outside goes to the pool.
    v_pool := coalesce(v_pool, v_received) - least(greatest(r.net, 0::bigint), r.nominal);
  END LOOP;

  IF v_n = 0 THEN
    -- No schedule: the whole balance falls due 7 days before the event starts.
    IF v_start - 7 <= p_today THEN
      v_due := v_remaining;
    END IF;
  ELSE
    -- Fill forwards (positive pool) or un-fill backwards (a refund), up to each installment's room.
    IF v_pool > 0 THEN
      FOR i IN 1 .. v_n LOOP
        EXIT WHEN v_pool = 0;
        v_cap  := v_nominal[i] - v_alloc[i];
        v_move := least(v_pool, v_cap);
        v_alloc[i] := v_alloc[i] + v_move;
        v_pool := v_pool - v_move;
      END LOOP;
    ELSIF v_pool < 0 THEN
      FOR i IN REVERSE v_n .. 1 LOOP
        EXIT WHEN v_pool = 0;
        v_cap  := -v_alloc[i];
        v_move := greatest(v_pool, v_cap);
        v_alloc[i] := v_alloc[i] + v_move;
        v_pool := v_pool - v_move;
      END LOOP;
    END IF;

    FOR i IN 1 .. v_n LOOP
      IF v_dates[i] <= p_today THEN
        v_due := v_due + greatest(0, v_nominal[i] - v_alloc[i]);
      END IF;
    END LOOP;
  END IF;

  total_cents      := v_total;
  received_cents   := v_received;
  remaining_cents  := v_remaining;
  amount_due_cents := least(v_due, v_remaining);
  RETURN NEXT;
END;
$$;

-- ── What the cron and the triggers call ───────────────────────────────────────
CREATE FUNCTION public.ar_event_amount_due(p_event uuid, p_today date)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
COST 1000
SET search_path = public
AS $$
  SELECT b.amount_due_cents FROM public.ar_event_balances(p_event, p_today) b;
$$;

-- Nobody can call these over PostgREST. The cron and the triggers run as the owner.
REVOKE ALL ON FUNCTION public.ar_is_canadian_province(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_office_currency(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_event_total_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_event_balances(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar_event_amount_due(uuid, date) FROM PUBLIC, anon, authenticated;
