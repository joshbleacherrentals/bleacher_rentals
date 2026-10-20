-- ============================================================================
-- Tests for the `unsigned_changes` event status.
-- Migration: 20261018150000_unsigned_changes_status.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/unsigned_changes_status.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Verifies, in the signature-invalidation trigger:
--   * a material edit to a BOOKED quote moves it to unsigned_changes
--   * a non-material edit leaves it booked
--   * a QUOTED quote (signed earlier, never booked) keeps its status
--   * an edit to a quote already in unsigned_changes keeps that status
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(1);

DO $$
DECLARE
  v_terms    UUID;
  v_booked   UUID;
  v_quoted   UUID;
  v_line_b   UUID;
  v_line_q   UUID;
  h          TEXT;
  v_status   event_status;
BEGIN
  INSERT INTO "TermsAndConditions" (id, name, html_content)
  VALUES (gen_random_uuid(), 'Unsigned T&C', '<p>terms</p>')
  RETURNING id INTO v_terms;

  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, external_notes, tax_percent, tax_amount_cents,
                        terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'Unsigned booked', '2026-07-01', '2026-07-02', false, false,
          'booked', 'note A', 0, 0, v_terms)
  RETURNING id INTO v_booked;
  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_booked, 'Item', 1, 10000, 'USD', false, false)
  RETURNING id INTO v_line_b;
  SELECT contract_hash INTO h FROM "Events" WHERE id = v_booked;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_booked, v_terms, 'Jordan Ellis', 'active', h);

  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, external_notes, tax_percent, tax_amount_cents,
                        terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'Unsigned quoted', '2026-07-01', '2026-07-02', false, false,
          'quoted', 'note A', 0, 0, v_terms)
  RETURNING id INTO v_quoted;
  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_quoted, 'Item', 1, 10000, 'USD', false, false)
  RETURNING id INTO v_line_q;
  SELECT contract_hash INTO h FROM "Events" WHERE id = v_quoted;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_quoted, v_terms, 'Jordan Ellis', 'active', h);

  -- Non-material edit: still booked.
  UPDATE "Events" SET external_notes = 'note B' WHERE id = v_booked;
  SELECT event_status INTO v_status FROM "Events" WHERE id = v_booked;
  ASSERT v_status = 'booked', 'a non-material edit leaves a booked quote booked';

  -- Material edit: booked becomes unsigned_changes.
  UPDATE "EventLineItems" SET value_cents = 20000 WHERE id = v_line_b;
  SELECT event_status INTO v_status FROM "Events" WHERE id = v_booked;
  ASSERT v_status = 'unsigned_changes', 'a material edit moves a booked quote to unsigned_changes';

  -- Another material edit: stays unsigned_changes (never falls back to quoted).
  UPDATE "EventLineItems" SET value_cents = 30000 WHERE id = v_line_b;
  SELECT event_status INTO v_status FROM "Events" WHERE id = v_booked;
  ASSERT v_status = 'unsigned_changes', 'a further edit keeps unsigned_changes';

  -- A quote that was only quoted keeps its status when its contract changes.
  UPDATE "EventLineItems" SET value_cents = 20000 WHERE id = v_line_q;
  SELECT event_status INTO v_status FROM "Events" WHERE id = v_quoted;
  ASSERT v_status = 'quoted', 'a quoted quote stays quoted when its contract changes';

  RAISE NOTICE '--- all unsigned_changes_status assertions passed ---';
END $$;

SELECT ok(true, 'all assertions passed');

SELECT * FROM finish();

ROLLBACK;
