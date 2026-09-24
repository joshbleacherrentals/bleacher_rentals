-- ============================================================================
-- Paying an installment must not invalidate the contract signature.
--
-- A client who paid was being asked to re-sign a contract nobody had changed:
-- the webhook wrote PaymentInstallments.status, that column sat inside the
-- canonical document behind contract_hash, the hash moved, and the invalidation
-- trigger fired. Payment state is a cache of allocatePayments, never a term of
-- the agreement, so it has no business in either hash.
--
-- See docs/specs/payment-does-not-invalidate-signature.md §5, §9.
--
-- Verifies:
--   * T1 — recording a payment leaves contract_hash byte-identical and the
--          signature active
--   * T2 — it leaves content_hash byte-identical too (no "quote updated" modal
--          on the payer's own screen)
--   * T3 — the terms that ARE contract-material still invalidate: installment
--          amount, installment due date, adding one, removing one
--   * T4 — the re-anchoring invariant holds across the whole database: no
--          active signature disagrees with its event's current contract_hash
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(1);

DO $$
DECLARE
  v_terms      UUID;
  v_event      UUID;
  v_line       UUID;
  v_inst_a     UUID;
  v_inst_b     UUID;
  v_sig        UUID;
  h_contract   TEXT;
  h_content    TEXT;
  h_contract_2 TEXT;
  h_content_2  TEXT;
  v_status     contract_signature_status;
BEGIN
  INSERT INTO "TermsAndConditions" (id, name, html_content)
  VALUES (gen_random_uuid(), 'PaymentNoResign T&C', '<p>terms</p>')
  RETURNING id INTO v_terms;

  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents,
                        terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'PaymentNoResign', '2026-07-01', '2026-07-02', false, false,
          'booked', 0, 0, v_terms)
  RETURNING id INTO v_event;

  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_event, 'Bleachers', 1, 360000, 'USD', false, false)
  RETURNING id INTO v_line;

  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
  VALUES (gen_random_uuid(), v_event, '2026-06-01', 5000, 'USD')
  RETURNING id INTO v_inst_a;

  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
  VALUES (gen_random_uuid(), v_event, '2026-06-15', 5000, 'USD')
  RETURNING id INTO v_inst_b;

  -- The client signs against the terms as they stand.
  SELECT contract_hash, content_hash INTO h_contract, h_content
  FROM "Events" WHERE id = v_event;
  ASSERT h_contract IS NOT NULL, 'contract_hash populated before signing';
  ASSERT h_content IS NOT NULL, 'content_hash populated before signing';

  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Dana Reyes', 'active', h_contract)
  RETURNING id INTO v_sig;

  -- Signing itself moves content_hash (the signed state is on the page), so
  -- re-read the baseline the payment assertions compare against.
  SELECT contract_hash, content_hash INTO h_contract, h_content
  FROM "Events" WHERE id = v_event;

  -- ── T1 / T2: money arriving is not a change to the quote ─────────────────
  -- A partial payment first: the shape that used to close a whole installment.
  INSERT INTO "PaymentHistory" (id, event_uuid, installment_id, intended_installment_id,
                                amount_cents, currency, status, payer_name, paid_at)
  VALUES (gen_random_uuid(), v_event, v_inst_a, v_inst_a,
          100, 'USD', 'succeeded', 'Dana Reyes', now());

  SELECT contract_hash, content_hash INTO h_contract_2, h_content_2
  FROM "Events" WHERE id = v_event;
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;

  ASSERT h_contract_2 = h_contract, 'a partial payment leaves contract_hash unchanged';
  ASSERT h_content_2 = h_content, 'a partial payment leaves content_hash unchanged';
  ASSERT v_status = 'active', 'a partial payment leaves the signature active';

  -- Then a payment that covers the installment in full.
  INSERT INTO "PaymentHistory" (id, event_uuid, installment_id, intended_installment_id,
                                amount_cents, currency, status, payer_name, paid_at)
  VALUES (gen_random_uuid(), v_event, v_inst_a, v_inst_a,
          179900, 'USD', 'succeeded', 'Dana Reyes', now());

  SELECT contract_hash, content_hash INTO h_contract_2, h_content_2
  FROM "Events" WHERE id = v_event;
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;

  ASSERT h_contract_2 = h_contract, 'a completing payment leaves contract_hash unchanged';
  ASSERT h_content_2 = h_content, 'a completing payment leaves content_hash unchanged';
  ASSERT v_status = 'active', 'a completing payment leaves the signature active';

  -- The write that actually caused the bug was the webhook's reconcile step
  -- setting PaymentInstallments.status / paid_at. Those columns no longer
  -- exist, so the guarantee above is now structural: there is nothing on the
  -- schedule row for a payment to write.

  -- ── T3: the real contract terms still invalidate ─────────────────────────
  -- Guard against over-fixing. Each of these is a term the client agreed to.
  UPDATE "PaymentInstallments" SET percentage_bps = 6000 WHERE id = v_inst_b;
  SELECT contract_hash INTO h_contract_2 FROM "Events" WHERE id = v_event;
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;
  ASSERT h_contract_2 <> h_contract, 'an installment amount change moves contract_hash';
  ASSERT v_status = 'invalidated', 'an installment amount change invalidates the signature';

  -- Re-sign against the revised terms, then move a due date.
  UPDATE "ContractSignatures" SET status = 'invalidated' WHERE event_uuid = v_event;
  SELECT contract_hash INTO h_contract FROM "Events" WHERE id = v_event;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Dana Reyes', 'active', h_contract)
  RETURNING id INTO v_sig;

  UPDATE "PaymentInstallments" SET due_date = '2026-06-20' WHERE id = v_inst_b;
  SELECT contract_hash INTO h_contract_2 FROM "Events" WHERE id = v_event;
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;
  ASSERT h_contract_2 <> h_contract, 'an installment due-date change moves contract_hash';
  ASSERT v_status = 'invalidated', 'an installment due-date change invalidates the signature';

  -- Adding an installment.
  UPDATE "ContractSignatures" SET status = 'invalidated' WHERE event_uuid = v_event;
  SELECT contract_hash INTO h_contract FROM "Events" WHERE id = v_event;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Dana Reyes', 'active', h_contract)
  RETURNING id INTO v_sig;

  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency)
  VALUES (gen_random_uuid(), v_event, '2026-07-01', 5000, 'USD');
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;
  ASSERT v_status = 'invalidated', 'adding an installment invalidates the signature';

  -- Removing one. (An installment that has received money cannot be deleted —
  -- payment-accounting-truth.md §4.1 — so this removes the untouched one.)
  UPDATE "ContractSignatures" SET status = 'invalidated' WHERE event_uuid = v_event;
  SELECT contract_hash INTO h_contract FROM "Events" WHERE id = v_event;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Dana Reyes', 'active', h_contract)
  RETURNING id INTO v_sig;

  DELETE FROM "PaymentInstallments" WHERE id = v_inst_b;
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;
  ASSERT v_status = 'invalidated', 'removing an installment invalidates the signature';

  RAISE NOTICE '--- all payment_does_not_invalidate_signature assertions passed ---';
END $$;

-- ── T4: the re-anchoring invariant, database-wide ──────────────────────────
-- Migration A changes the hash formula for every event at once. If its backfill
-- ran without re-anchoring signed_contract_hash, every active signature in the
-- database would now disagree with its event. Nothing should.
DO $$
DECLARE
  v_drifted INT;
BEGIN
  SELECT count(*) INTO v_drifted
  FROM "ContractSignatures" s
  JOIN "Events" e ON e.id = s.event_uuid
  WHERE s.status = 'active'
    AND s.signed_contract_hash IS DISTINCT FROM e.contract_hash;

  ASSERT v_drifted = 0,
    format('%s active signature(s) drifted from their event contract_hash — '
           'the hash-formula migration backfilled without re-anchoring', v_drifted);
END $$;

-- The migration disables the invalidation trigger around its backfill. Left
-- disabled, it would fail silently and forever: no edit would ever invalidate a
-- signature again, and nothing else in the suite would notice.
DO $$
DECLARE
  v_enabled "char";
BEGIN
  SELECT tgenabled INTO v_enabled
  FROM pg_trigger
  WHERE tgname = 'invalidate_signature_on_contract_change'
    AND tgrelid = 'public."Events"'::regclass;

  ASSERT v_enabled IS NOT NULL, 'the invalidation trigger still exists';
  ASSERT v_enabled = 'O', 'the invalidation trigger is enabled after the hash migration';
END $$;

SELECT ok(true, 'all assertions passed');

SELECT * FROM finish();

ROLLBACK;
