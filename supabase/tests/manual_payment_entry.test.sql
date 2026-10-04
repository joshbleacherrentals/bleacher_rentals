-- ============================================================================
-- Manual payment entry — constraints and the RLS boundary.
--
-- The write path is local-first: PowerSync replays a client INSERT to PostgREST
-- under the user's Clerk JWT. So this policy is the authorization boundary, and
-- the checks below are the only thing standing between accounting's typo and
-- the ledger. Nothing here is enforced by the dialog.
--
-- Verifies:
--   T1 — an admin may insert a manual row
--   T2 — an account manager may NOT, lead or not (accountant-quotes-06; until then
--        they could, on a quote they did not create)
--   T3 — a viewer may not
--   T4 — a client cannot write a row claiming to be a Stripe payment
--   T5 — amount_cents = 0 is refused; negatives are allowed
--   T6 — a manual row must name its method and its author
--   T7 — nobody may UPDATE or DELETE a payment row, ever
--   T8 — an account manager still READS the payment rows
--
-- See docs/specs/manual-payment-entry.md §4.2, §4.4, T3 and
-- docs/specs/accountant-quotes-06-am-read-only-payments.md §3, §7.1.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(1);

DO $$
DECLARE
  v_admin_id    UUID;
  v_am_id       UUID;
  v_lead_id     UUID;
  v_viewer_id   UUID;
  v_lead_row    UUID;
  v_zone        UUID;
  v_event       UUID;
  v_row         UUID;
BEGIN
  -- ── Fixtures ────────────────────────────────────────────────────────────
  INSERT INTO public."Users" (email, clerk_user_id, is_admin)
    VALUES ('t-admin@example.test', 'clerk_t_admin', true)
    RETURNING id INTO v_admin_id;

  INSERT INTO public."Users" (email, clerk_user_id)
    VALUES ('t-am@example.test', 'clerk_t_am')
    RETURNING id INTO v_am_id;

  INSERT INTO public."Users" (email, clerk_user_id, is_viewer)
    VALUES ('t-viewer@example.test', 'clerk_t_viewer', true)
    RETURNING id INTO v_viewer_id;

  INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (v_am_id, true);

  -- A lead account manager: AccountManagerZones.is_lead. The policy never looks at it; the
  -- fixture exists so that the test can say "lead or not" and mean it.
  INSERT INTO public."Users" (email, clerk_user_id)
    VALUES ('t-lead@example.test', 'clerk_t_lead')
    RETURNING id INTO v_lead_id;

  INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (v_lead_id, true)
    RETURNING id INTO v_lead_row;

  INSERT INTO public."Zones" (display_name) VALUES ('ManualPaymentEntry lead zone')
    RETURNING id INTO v_zone;

  INSERT INTO public."AccountManagerZones" (account_manager_uuid, zone_uuid, is_lead)
    VALUES (v_lead_row, v_zone, true);

  -- The policy never looks at the event; that is the point of T2. It is built
  -- here rather than borrowed from the seed, because CI runs the suite against
  -- migrations only (`supabase db reset --no-seed`).
  INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient,
                               must_be_clean, event_status, tax_percent, tax_amount_cents)
  VALUES (gen_random_uuid(), 'ManualPaymentEntry probe', '2026-07-01', '2026-07-02',
          false, false, 'booked', 0, 0)
  RETURNING id INTO v_event;

  GRANT INSERT, SELECT, UPDATE, DELETE ON public."PaymentHistory" TO authenticated;

  -- ── T5 / T6 — constraints, checked as the service role so that only the
  -- constraint can be the reason for a refusal ────────────────────────────
  BEGIN
    INSERT INTO public."PaymentHistory"
      (event_uuid, amount_cents, currency, status, payer_name, entry_source,
       payment_method_type, recorded_by_user_uuid)
    VALUES (v_event, 0, 'USD', 'succeeded', 'Zero', 'manual', 'check', v_admin_id);
    RAISE EXCEPTION 'T5 FAILED: a zero-amount payment was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The mechanism this feature runs on: a refund is a negative row.
  INSERT INTO public."PaymentHistory"
    (event_uuid, amount_cents, currency, status, payer_name, entry_source,
     payment_method_type, recorded_by_user_uuid, reference)
  VALUES (v_event, -270000, 'USD', 'succeeded', 'NSF', 'manual', 'check',
          v_admin_id, 'check 1041')
  RETURNING id INTO v_row;

  BEGIN
    INSERT INTO public."PaymentHistory"
      (event_uuid, amount_cents, currency, status, payer_name, entry_source,
       payment_method_type)
    VALUES (v_event, 5000, 'USD', 'succeeded', 'Anon', 'manual', 'check');
    RAISE EXCEPTION 'T6 FAILED: a manual row without an author was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public."PaymentHistory"
      (event_uuid, amount_cents, currency, status, payer_name, entry_source,
       payment_method_type, recorded_by_user_uuid)
    VALUES (v_event, 5000, 'USD', 'succeeded', 'Anon', 'manual', 'card', v_admin_id);
    RAISE EXCEPTION 'T6 FAILED: a manual row with a non-manual method was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public."PaymentHistory"
      (event_uuid, amount_cents, currency, status, payer_name, entry_source,
       payment_method_type, recorded_by_user_uuid, stripe_payment_intent_id)
    VALUES (v_event, 5000, 'USD', 'succeeded', 'Anon', 'manual', 'check',
            v_admin_id, 'pi_123');
    RAISE EXCEPTION 'T6 FAILED: a manual row carrying a Stripe id was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'constraints: OK';
END $$;

-- ── T1–T4, T7 — RLS, each as a real authenticated identity ────────────────
--
-- SET ROLE plus a jwt claim is what PostgREST does; get_user_roles() reads
-- auth.jwt() ->> 'sub' and matches Users.clerk_user_id.

CREATE OR REPLACE FUNCTION pg_temp.insert_as(p_sub TEXT, p_entry_source TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_event UUID;
  v_user  UUID;
BEGIN
  SELECT id INTO v_event FROM public."Events" WHERE event_name = 'ManualPaymentEntry probe';
  SELECT id INTO v_user FROM public."Users" WHERE clerk_user_id = p_sub;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);

  INSERT INTO public."PaymentHistory"
    (event_uuid, amount_cents, currency, status, payer_name, entry_source,
     payment_method_type, recorded_by_user_uuid)
  VALUES (v_event, 12345, 'USD', 'succeeded', 'RLS probe', p_entry_source,
          CASE WHEN p_entry_source = 'manual' THEN 'check' ELSE NULL END,
          CASE WHEN p_entry_source = 'manual' THEN v_user ELSE NULL END);

  RESET ROLE;
  RETURN 'allowed';
EXCEPTION
  WHEN insufficient_privilege THEN RESET ROLE; RETURN 'denied';
  WHEN check_violation THEN RESET ROLE; RETURN 'denied';
END $$;

DO $$
DECLARE
  v_result TEXT;
BEGIN
  v_result := pg_temp.insert_as('clerk_t_admin', 'manual');
  IF v_result <> 'allowed' THEN RAISE EXCEPTION 'T1 FAILED: admin was denied (%)', v_result; END IF;

  v_result := pg_temp.insert_as('clerk_t_am', 'manual');
  IF v_result <> 'denied' THEN RAISE EXCEPTION 'T2 FAILED: a non-lead account manager recorded a payment'; END IF;

  v_result := pg_temp.insert_as('clerk_t_lead', 'manual');
  IF v_result <> 'denied' THEN RAISE EXCEPTION 'T2 FAILED: a lead account manager recorded a payment'; END IF;

  v_result := pg_temp.insert_as('clerk_t_viewer', 'manual');
  IF v_result <> 'denied' THEN RAISE EXCEPTION 'T3 FAILED: a viewer recorded a payment'; END IF;

  v_result := pg_temp.insert_as('clerk_t_admin', 'stripe');
  IF v_result <> 'denied' THEN RAISE EXCEPTION 'T4 FAILED: a client wrote a row claiming to be Stripe'; END IF;

  RAISE NOTICE 'rls insert: OK';
END $$;

-- T7 — the ledger is append-only. No UPDATE or DELETE policy exists, so every
-- role sees zero rows to change, which is how RLS expresses "forbidden" for a
-- statement that names no rows. Checked for every identity the fixtures hold, so
-- that "for anyone" is asserted and not assumed.
DO $$
DECLARE
  v_sub     TEXT;
  v_updated INT;
  v_deleted INT;
BEGIN
  FOREACH v_sub IN ARRAY ARRAY['clerk_t_admin', 'clerk_t_am', 'clerk_t_lead', 'clerk_t_viewer'] LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub)::text, true);

    UPDATE public."PaymentHistory" SET amount_cents = 1;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    DELETE FROM public."PaymentHistory";
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RESET ROLE;

    IF v_updated <> 0 THEN RAISE EXCEPTION 'T7 FAILED: % payment rows were edited by %', v_updated, v_sub; END IF;
    IF v_deleted <> 0 THEN RAISE EXCEPTION 'T7 FAILED: % payment rows were deleted by %', v_deleted, v_sub; END IF;
  END LOOP;

  RAISE NOTICE 'append-only: OK';
END $$;

-- T8 — taking the right to write away from an account manager must not take the right to
-- read. The rows T1 and the constraint checks left behind are visible to a lead and to a
-- non-lead account manager alike.
DO $$
DECLARE
  v_sub   TEXT;
  v_total INT;
  v_seen  INT;
BEGIN
  SELECT count(*) INTO v_total FROM public."PaymentHistory";
  IF v_total = 0 THEN RAISE EXCEPTION 'T8 FAILED: the fixtures left no payment rows to read'; END IF;

  FOREACH v_sub IN ARRAY ARRAY['clerk_t_am', 'clerk_t_lead'] LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub)::text, true);

    SELECT count(*) INTO v_seen FROM public."PaymentHistory";

    RESET ROLE;

    IF v_seen <> v_total THEN
      RAISE EXCEPTION 'T8 FAILED: % sees % of % payment rows', v_sub, v_seen, v_total;
    END IF;
  END LOOP;

  RAISE NOTICE 'account manager reads: OK';
END $$;

-- Every check above raises on failure, so reaching here is the pass condition.
SELECT ok(true, 'manual payment entry: constraints and RLS behave as specified');

SELECT * FROM finish();

ROLLBACK;
