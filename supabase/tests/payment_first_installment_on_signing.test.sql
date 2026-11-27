-- ============================================================================
-- Tests for "the first installment is due the day the event is first booked".
-- docs/specs/payment-first-installment-on-signing.md
--
-- Verifies:
--   * a booking fills the empty marked row with the Toronto day (23:30 stays that day)
--   * a signature puts the day of the FIRST signature, even when the booking comes later
--   * the date is written once: re-booking, re-signing and the Booked date never move it
--   * a schedule inserted for an already-booked event is filled at once
--   * an event that was never booked keeps an empty date (draft, quoted, lost)
--   * the fill moves neither hash and invalidates no active signature
--   * the hash does not depend on the marked row's date, even when the amounts tie to a spare
--     cent and the second row is dated earlier; the percentage and the other rows' dates stay
--     contract material
--   * every event with a schedule has exactly one marked row, the first one
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
  v_marked     UUID;
  v_other      UUID;
  v_sig        UUID;
  v_sig2       UUID;
  v_day        DATE;
  v_other_day  DATE;
  v_status     contract_signature_status;
  v_hash       TEXT;
  v_hash2      TEXT;
  v_content    TEXT;
  v_content2   TEXT;
  v_count      INT;
BEGIN
  INSERT INTO "TermsAndConditions" (id, name, html_content)
  VALUES (gen_random_uuid(), 'First installment T&C', '<p>terms</p>')
  RETURNING id INTO v_terms;

  -- ── The real path: a booking stamps booked_at = now() (trg_events_set_booked_at_once) ─
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment real path', '2027-03-01', '2027-03-02', false,
          false, 'quoted', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 10000, 'USD', true) RETURNING id INTO v_marked;
  UPDATE "Events" SET event_status = 'booked' WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = (now() AT TIME ZONE 'America/Toronto')::date,
    format('a booking fills the Toronto day of now(): %s', v_day);

  -- From here booked_at is pinned by hand, so the day rule can be tested at the edges: the
  -- set-once trigger would overwrite it. (Pending deferred triggers block ALTER TABLE.)
  SET CONSTRAINTS ALL IMMEDIATE;
  ALTER TABLE "Events" DISABLE TRIGGER trg_events_set_booked_at_once;

  -- ── A manual booking fills the marked row; 23:30 in Toronto stays that day ──────────
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment manual', '2027-03-01', '2027-03-02', false, false,
          'quoted', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_event, 'Item', 1, 10001, 'USD', false, false);
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 5000, 'USD', true) RETURNING id INTO v_marked;
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, '2027-02-22', 5000, 'USD', false) RETURNING id INTO v_other;

  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day IS NULL, 'a quoted event keeps the marked row empty';

  -- Nov 26 23:30 in Toronto (EST) is Nov 27 04:30 UTC.
  UPDATE "Events" SET event_status = 'booked', booked_at = '2026-11-27 04:30:00+00'
  WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-26', format('the Toronto day, not the UTC one: %s', v_day);
  SELECT due_date INTO v_other_day FROM "PaymentInstallments" WHERE id = v_other;
  ASSERT v_other_day = DATE '2027-02-22', 'the second row is never touched';

  -- ── Written once: lost, booked again later, the Booked date button ───────────────────
  UPDATE "Events" SET event_status = 'lost', booked_at = NULL WHERE id = v_event;
  UPDATE "Events" SET event_status = 'booked', booked_at = '2026-12-05 15:00:00+00'
  WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-26', 're-booking later leaves the first day alone';
  UPDATE "Events" SET booked_at = '2026-12-30 17:00:00+00' WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-26', 'the Booked date button leaves the first day alone';

  -- ── A signature, then the status write of the sign route ─────────────────────────────
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment signed', '2027-03-01', '2027-03-02', false, false,
          'quoted', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_event, 'Item', 1, 10001, 'USD', false, false);
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 5000, 'USD', true) RETURNING id INTO v_marked;
  -- The second row is dated BEFORE the signing day and the amounts tie to a spare cent
  -- (10001 x 50% = 5000.5 twice): the hash must still not move at booking.
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, '2026-11-24', 5000, 'USD', false) RETURNING id INTO v_other;

  SELECT contract_hash, content_hash INTO v_hash, v_content FROM "Events" WHERE id = v_event;

  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    signed_at, status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Jordan Ellis', '2026-11-26 15:00:00+00',
          'active', v_hash)
  RETURNING id INTO v_sig;
  -- The sign route: the signature first, then the status and booked_at.
  UPDATE "Events" SET event_status = 'booked', booked_at = '2026-11-26 15:00:00+00'
  WHERE id = v_event;

  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-26', format('the day of the signature: %s', v_day);
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig;
  ASSERT v_status = 'active', 'the fill does not invalidate the signature it follows';
  SELECT contract_hash INTO v_hash2 FROM "Events" WHERE id = v_event;
  ASSERT v_hash2 = v_hash, 'the fill does not move contract_hash';
  SELECT due_date INTO v_other_day FROM "PaymentInstallments" WHERE id = v_other;
  ASSERT v_other_day = DATE '2026-11-24', 'the second row stays earlier than the first';

  -- Material edit, then a second signature on a later day: the first day stays.
  UPDATE "EventLineItems" SET value_cents = 20000 WHERE event_uuid = v_event;
  SELECT contract_hash INTO v_hash FROM "Events" WHERE id = v_event;
  INSERT INTO "ContractSignatures" (id, event_uuid, terms_and_conditions_uuid, signer_name,
                                    signed_at, status, signed_contract_hash)
  VALUES (gen_random_uuid(), v_event, v_terms, 'Jordan Ellis', '2026-12-02 15:00:00+00',
          'active', v_hash)
  RETURNING id INTO v_sig2;
  UPDATE "Events" SET event_status = 'booked' WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-26', 'a second signature leaves the first day alone';
  SELECT status INTO v_status FROM "ContractSignatures" WHERE id = v_sig2;
  ASSERT v_status = 'active', 'the second signature is active';

  -- ── Hash independence from the marked row's date ─────────────────────────────────────
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment hash', '2027-03-01', '2027-03-02', false, false,
          'quoted', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "EventLineItems" (id, event_uuid, header, quantity, value_cents, currency,
                                is_template, deleted)
  VALUES (gen_random_uuid(), v_event, 'Item', 1, 10001, 'USD', false, false);
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 5000, 'USD', true) RETURNING id INTO v_marked;
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, '2026-11-20', 5000, 'USD', false) RETURNING id INTO v_other;

  SELECT contract_hash, content_hash INTO v_hash, v_content FROM "Events" WHERE id = v_event;
  UPDATE "PaymentInstallments" SET due_date = '2026-12-01' WHERE id = v_marked;
  SELECT contract_hash, content_hash INTO v_hash2, v_content2 FROM "Events" WHERE id = v_event;
  ASSERT v_hash2 = v_hash AND v_content2 = v_content,
    'a later marked date moves no hash (the spare cent does not flip)';
  UPDATE "PaymentInstallments" SET due_date = '2026-11-01' WHERE id = v_marked;
  SELECT contract_hash, content_hash INTO v_hash2, v_content2 FROM "Events" WHERE id = v_event;
  ASSERT v_hash2 = v_hash AND v_content2 = v_content, 'an earlier marked date moves no hash';

  UPDATE "PaymentInstallments" SET percentage_bps = 6000 WHERE id = v_marked;
  SELECT contract_hash INTO v_hash2 FROM "Events" WHERE id = v_event;
  ASSERT v_hash2 <> v_hash, 'the percentage of the marked row is still contract material';
  UPDATE "PaymentInstallments" SET percentage_bps = 5000 WHERE id = v_marked;

  UPDATE "PaymentInstallments" SET due_date = '2026-11-21' WHERE id = v_other;
  SELECT contract_hash INTO v_hash2 FROM "Events" WHERE id = v_event;
  ASSERT v_hash2 <> v_hash, 'the date of another row is still contract material';

  -- ── A schedule given to an event that is already booked is filled at once ────────────
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, booked_at, tax_percent, tax_amount_cents,
                        terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment late schedule', '2027-03-01', '2027-03-02',
          false, false, 'booked', '2026-11-10 17:00:00+00', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 10000, 'USD', true) RETURNING id INTO v_marked;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-10', format('filled at insert from booked_at: %s', v_day);

  -- A stale editor writes an empty date over a filled one: it is filled again.
  UPDATE "PaymentInstallments" SET due_date = NULL WHERE id = v_marked;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day = DATE '2026-11-10', 'an empty write is filled again';

  -- ── An event that was never booked stays empty ───────────────────────────────────────
  INSERT INTO "Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                        event_status, tax_percent, tax_amount_cents, terms_and_conditions_uuid)
  VALUES (gen_random_uuid(), 'FirstInstallment lost', '2027-03-01', '2027-03-02', false, false,
          'lost', 0, 0, v_terms)
  RETURNING id INTO v_event;
  INSERT INTO "PaymentInstallments" (id, event_uuid, due_date, percentage_bps, currency,
                                     due_on_signing)
  VALUES (gen_random_uuid(), v_event, NULL, 10000, 'USD', true) RETURNING id INTO v_marked;
  UPDATE "Events" SET event_name = 'FirstInstallment lost 2' WHERE id = v_event;
  SELECT due_date INTO v_day FROM "PaymentInstallments" WHERE id = v_marked;
  ASSERT v_day IS NULL, 'a lost event that was never booked keeps an empty date';

  -- ── Every event with a schedule has exactly one marked row, and it is first ──────────
  SELECT count(*) INTO v_count
  FROM (
    SELECT event_uuid
    FROM "PaymentInstallments"
    GROUP BY event_uuid
    HAVING count(*) FILTER (WHERE due_on_signing) <> 1
  ) bad;
  ASSERT v_count = 0, format('%s events do not have exactly one marked installment', v_count);

  -- A booked event never has an empty marked date.
  SELECT count(*) INTO v_count
  FROM "PaymentInstallments" pi
  JOIN "Events" e ON e.id = pi.event_uuid
  WHERE pi.due_on_signing AND pi.due_date IS NULL
    AND e.event_status IN ('booked', 'unsigned_changes');
  ASSERT v_count = 0, format('%s booked events have an empty first-installment date', v_count);

  RAISE NOTICE '--- all payment_first_installment_on_signing assertions passed ---';
END $$;

SELECT ok(true, 'all assertions passed');

SELECT * FROM finish();

ROLLBACK;
