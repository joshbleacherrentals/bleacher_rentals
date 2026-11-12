-- =============================================================
-- Collections: an event with no payment schedule is overdue from its start day
-- (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md)
--
-- The rule, for Collections only: an event with NO payment schedule owes its whole remaining balance
-- from the day `event_start` arrives, and not 7 days before it as the first version of
-- ar_event_balances (20261030130000_ar_amount_due.sql) had it. An event with a schedule is overdue by
-- the dates of its schedule, as before. The AR tabs and the public Pay tab keep their own rule.
--
--   * D1, from when the days count: the unpaid amount of an event with no schedule is overdue from
--     `event_start` and stays overdue until it is paid; only the threshold moves, from 7 days before
--     the start to 0. Its Days Overdue count from `event_start`, always (the TypeScript twin does
--     that); `booked_at` is no longer used for the figures;
--   * D2, the deploy: the open tasks that the new rule makes not overdue are closed by this
--     migration, at once, by one pass of ar_sync_event_tasks (spec 11). They are not deleted: they
--     stay in Task History as closed, and the trigger of spec 18 stamps their finished_at with the
--     moment of this migration. The pass visits only events that already have an open task, so it
--     creates nothing.
--
-- Part 1 replaces the one function; its signature, return type, COST, volatility, SECURITY INVOKER and
-- search_path stay, so ar_event_amount_due and the grants and revokes of 20261030130000 stay as they
-- are. Part 2 is the closing pass. A migration file is a batch under the Supabase CLI, so nothing
-- here needs BEGIN and COMMIT. It can run twice: the function is replaced, and the second pass finds
-- nothing left to close.
--
-- Rolling back: a new migration that puts `v_start - 7` back. The tasks this one closed come back by
-- themselves, because the old rule makes a task for every event that owes (the next nightly run, or
-- the next change to the event).
-- =============================================================

-- ── Part 1: the function ──────────────────────────────────────────────────────
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
--      WITHOUT installments: the whole remaining when event_start <= p_today, else 0;
--   7. amount due = least(that, remaining).
--
-- COST 1000: Postgres does not promise the order of WHERE conditions, and a high cost makes the
-- planner run this after the cheap ones.
CREATE OR REPLACE FUNCTION public.ar_event_balances(p_event uuid, p_today date)
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
    -- No schedule: the whole balance falls due on the day the event starts.
    IF v_start <= p_today THEN
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

-- ── Part 2: the closing pass (D2) ─────────────────────────────────────────────
-- For every event that has an open task, ar_sync_event_tasks completes the open tasks when its Amount
-- Due is 0 (or it is Lost), leaves them when Amount Due is above 0, and keeps them for any other status
-- or a deleted event. It is the work the next nightly run would do for these events; this does it at
-- the deploy. For an event that already has an open task the insert hits the one-open-task index and
-- does nothing, so no task is created.
DO $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_event uuid;
BEGIN
  FOR v_event IN
    SELECT DISTINCT t.event_uuid FROM public."ArEventTasks" t WHERE t.completed = false
  LOOP
    PERFORM public.ar_sync_event_tasks(v_event, v_today);
  END LOOP;
END;
$$;
