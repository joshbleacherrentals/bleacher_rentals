-- ============================================================================
-- Tests for DamageReportAcknowledgements ("select all that apply")
-- Migration: 20260909140000_damage_report_acknowledgements.sql
-- Spec: br_driver/docs/specs/damage-report-dedupe.md
--
-- Run via docker:
--   docker exec -i $(docker ps --filter "name=supabase_db" --format "{{.ID}}" | head -1) \
--     psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/damage_report_acknowledgements.test.sql
--
-- An acknowledgement is what a driver writes INSTEAD of a duplicate damage
-- report: "I see this one too". Three things make it worth a test file of its
-- own rather than a column somewhere:
--
--   1. `report_resolved_at` mirrors the parent's `resolved_at` onto every ack,
--      because the mobile sync rule filters on it. A JOIN there compiles into a
--      parameter query capped at 1000 rows, which is exactly how first sync
--      broke once already (PSYNC_S2305) — so the mirror is load-bearing, and
--      these tests are what say it stays maintained in both directions.
--   2. A duplicate ack must be a NO-OP, never an error. PowerSync retries a
--      rejected write forever without moving past it, so a 23505 on one ack
--      would stall the driver's entire upload queue.
--   3. An ack is a record, not a document: a driver files their own and can
--      neither rewrite nor withdraw it.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(2);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'DamageReportAcknowledgements'
       AND column_name  = 'report_resolved_at'
  ),
  'the mirrored report_resolved_at column exists (the sync rule reads it)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'DamageReportAcknowledgements'
       AND indexname  = 'DamageReportAcks_report_inspection_uniq'
  ),
  'one acknowledgement per (report, inspection) is enforced by an index'
);

DO $$
DECLARE
  user_one      UUID;
  user_two      UUID;
  clerk_one     TEXT := 'clerk_driver_ack_one';
  clerk_two     TEXT := 'clerk_driver_ack_two';
  driver_one    UUID;
  driver_two    UUID;
  bleacher_id   UUID;
  dr_open       UUID;
  dr_resolved   UUID;
  inspection_id UUID;
  ack_id        UUID;
  v_count       INTEGER;
  v_mirror      TIMESTAMPTZ;
  v_by          UUID;
  v_raised      BOOLEAN;
BEGIN
  RAISE NOTICE '--- damage report acknowledgement tests ---';

  -- ══ SETUP (superuser, RLS bypassed) ══════════════════════════════════════

  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
  VALUES ('Ack', 'DriverOne', 'ack_one@test.com', clerk_one, false, false)
  RETURNING id INTO user_one;
  INSERT INTO "Drivers" (user_uuid, is_active) VALUES (user_one, true)
  RETURNING id INTO driver_one;

  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
  VALUES ('Ack', 'DriverTwo', 'ack_two@test.com', clerk_two, false, false)
  RETURNING id INTO user_two;
  INSERT INTO "Drivers" (user_uuid, is_active) VALUES (user_two, true)
  RETURNING id INTO driver_two;

  INSERT INTO "Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
  VALUES (8873, 5, 50)
  RETURNING id INTO bleacher_id;

  -- One open report filed by driver one, and one already resolved.
  INSERT INTO "DamageReports" (bleacher_uuid, seat_damage, haul_damage, note, created_by_user_uuid)
  VALUES (bleacher_id, 'minor', 'none', 'loose seat bolt', user_one)
  RETURNING id INTO dr_open;

  INSERT INTO "DamageReports" (bleacher_uuid, seat_damage, haul_damage, note, created_by_user_uuid, resolved_at)
  VALUES (bleacher_id, 'minor', 'none', 'already handled', user_one, now())
  RETURNING id INTO dr_resolved;

  INSERT INTO "WorkTrackerInspections" (id) VALUES (gen_random_uuid())
  RETURNING id INTO inspection_id;

  -- ══ RLS active, acting as the SECOND driver — the one who would otherwise
  --    have filed a duplicate ═══════════════════════════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', clerk_two)::text, true);

  -- ── T1: a driver acknowledges another driver's open report ──
  INSERT INTO "DamageReportAcknowledgements"
    (damage_report_uuid, inspection_uuid, acknowledged_by_user_uuid)
  VALUES (dr_open, inspection_id, user_two)
  RETURNING id INTO ack_id;
  ASSERT ack_id IS NOT NULL, 'T1 FAIL: a driver must be able to acknowledge an open report';
  RAISE NOTICE 'T1  a driver can acknowledge another driver''s report ✓';

  -- ── T2: the mirror starts out matching an open parent ──
  SELECT report_resolved_at INTO v_mirror
    FROM "DamageReportAcknowledgements" WHERE id = ack_id;
  ASSERT v_mirror IS NULL,
    'T2 FAIL: an ack on an open report must mirror a NULL resolved_at, or it never reaches a phone';
  RAISE NOTICE 'T2  the mirror is NULL while the report is open ✓';

  -- ── T3: acking an already-resolved report mirrors its timestamp ──
  INSERT INTO "DamageReportAcknowledgements"
    (damage_report_uuid, inspection_uuid, acknowledged_by_user_uuid)
  VALUES (dr_resolved, NULL, user_two);
  SELECT report_resolved_at INTO v_mirror
    FROM "DamageReportAcknowledgements"
    WHERE damage_report_uuid = dr_resolved;
  ASSERT v_mirror IS NOT NULL,
    'T3 FAIL: the mirror must be filled at insert time, not only by later updates';
  RAISE NOTICE 'T3  the mirror is filled from the parent on insert ✓';

  -- ── T4: a duplicate is silently ignored, NOT rejected ──
  -- Two submissions of the same inspection, or a retry of one. An error here
  -- would stall the driver's whole upload queue, so the row is dropped instead.
  INSERT INTO "DamageReportAcknowledgements"
    (damage_report_uuid, inspection_uuid, acknowledged_by_user_uuid)
  VALUES (dr_open, inspection_id, user_two);

  SELECT count(*) INTO v_count FROM "DamageReportAcknowledgements"
   WHERE damage_report_uuid = dr_open AND inspection_uuid = inspection_id;
  ASSERT v_count = 1, format('T4 FAIL: expected 1 ack after a duplicate insert, got %s', v_count);
  RAISE NOTICE 'T4  a duplicate ack is a no-op, not an error ✓';

  -- ── T5: two drivers acknowledging the same report both count ──
  -- The whole point of writing acks: "three drivers have seen this".
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', clerk_one)::text, true);

  INSERT INTO "DamageReportAcknowledgements"
    (damage_report_uuid, inspection_uuid, acknowledged_by_user_uuid)
  VALUES (dr_open, NULL, user_one);

  SELECT count(*) INTO v_count FROM "DamageReportAcknowledgements"
   WHERE damage_report_uuid = dr_open;
  ASSERT v_count = 2, format('T5 FAIL: expected 2 acks from two drivers, got %s', v_count);
  RAISE NOTICE 'T5  acks from different drivers accumulate ✓';

  -- ── T6: a driver cannot file an ack in someone else's name ──
  v_raised := false;
  BEGIN
    INSERT INTO "DamageReportAcknowledgements"
      (damage_report_uuid, inspection_uuid, acknowledged_by_user_uuid)
    VALUES (dr_open, NULL, user_two);
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T6 FAIL: attribution must be the signed-in driver''s own';
  RAISE NOTICE 'T6  a driver cannot acknowledge as somebody else ✓';

  -- ── T7: an ack is a record — no edits, no withdrawals ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReportAcknowledgements" SET deleted = true WHERE id = ack_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN v_raised := true; END IF;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T7 FAIL: a driver must not be able to withdraw an acknowledgement';
  RAISE NOTICE 'T7  a driver cannot rewrite or withdraw an ack ✓';

  -- ── T8: resolving the parent updates every ack's mirror ──
  -- This is what takes the acks off the phones along with the report itself.
  RESET ROLE;
  -- RESET ROLE drops the database role, not the JWT: the driver's claims are
  -- still on the session, so the column fence would read this superuser write
  -- as a driver editing resolved_at and reject it. Clear the claims too.
  PERFORM set_config('request.jwt.claims', '{}', true);
  UPDATE "DamageReports" SET resolved_at = now() WHERE id = dr_open;

  SELECT count(*) INTO v_count FROM "DamageReportAcknowledgements"
   WHERE damage_report_uuid = dr_open AND report_resolved_at IS NULL;
  ASSERT v_count = 0, format('T8 FAIL: %s acks still look open after their report was resolved', v_count);
  RAISE NOTICE 'T8  resolving a report propagates to its acks ✓';

  -- ── T9: and re-opening one propagates back ──
  UPDATE "DamageReports" SET resolved_at = NULL WHERE id = dr_open;

  SELECT count(*) INTO v_count FROM "DamageReportAcknowledgements"
   WHERE damage_report_uuid = dr_open AND report_resolved_at IS NOT NULL;
  ASSERT v_count = 0, format('T9 FAIL: %s acks still look resolved after their report was reopened', v_count);
  RAISE NOTICE 'T9  reopening a report propagates too ✓';
END;
$$;

SELECT * FROM finish();

ROLLBACK;
