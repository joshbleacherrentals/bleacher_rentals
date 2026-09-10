-- ============================================================================
-- Tests for "Fixed by driver" on DamageReports
-- Migration: 20260909120000_damage_reports_fixed_by_driver.sql
-- Spec: br_driver/docs/specs/driver-fixed-damage-reports.md
--
-- Run via docker:
--   docker exec -i $(docker ps --filter "name=supabase_db" --format "{{.ID}}" | head -1) \
--     psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/damage_reports_fixed_by_driver.test.sql
--
-- What is under test:
--   1. the three columns exist, with the defaults the app relies on;
--   2. the CHECK constraint makes a half-filled "fixed" state unwritable;
--   3. a driver may mark ANOTHER driver's report fixed (the product decision:
--      whoever was on site fixed it, not whoever filed the report);
--   4. that same driver may change NOTHING ELSE on the report — the write is
--      deliberately cross-driver, so its blast radius is fenced server-side
--      rather than by the client being polite;
--   5. and that the fence does not catch the database's OWN writes: the photo
--      queue's status update cascades into `photos_uploaded` under the same
--      driver JWT, and rejecting it stalls that driver's whole upload queue.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(4);

-- ── Column contract ─────────────────────────────────────────────────────────

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DamageReports'
      AND column_name = 'fixed_by_driver'),
  'boolean',
  'fixed_by_driver is boolean'
);

SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DamageReports'
      AND column_name = 'fixed_by_driver'),
  'false',
  'fixed_by_driver defaults to false'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DamageReports'
      AND column_name = 'fixed_by_driver'),
  'NO',
  'fixed_by_driver is NOT NULL'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public."DamageReports"'::regclass
       AND conname  = 'damage_reports_fixed_consistent'
  ),
  'the fixed/fixed_at/fixed_by_user_uuid consistency constraint exists'
);

-- ── Behaviour ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  user_one      UUID;
  user_two      UUID;
  clerk_one     TEXT := 'clerk_driver_fixed_one';
  clerk_two     TEXT := 'clerk_driver_fixed_two';
  driver_one    UUID;
  driver_two    UUID;
  bleacher_id   UUID;
  dr_id         UUID;
  v_count       INTEGER;
  v_fixed       BOOLEAN;
  v_fixed_at    TIMESTAMPTZ;
  v_fixed_by    UUID;
  v_note        TEXT;
  v_raised      BOOLEAN;

  -- The photo-queue regression below seeds its own driver, bleacher and
  -- report, so nothing it does can be explained by the rows above.
  user_queue    UUID;
  clerk_queue   TEXT := 'clerk_driver_queue';
  driver_queue  UUID;
  bleacher_queue UUID;
  dr_queue      UUID;
  photo_id      UUID;
  v_uploaded    BOOLEAN;
BEGIN
  RAISE NOTICE '--- damage report fixed_by_driver tests ---';

  -- ══ SETUP (superuser, RLS bypassed) ══════════════════════════════════════

  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
  VALUES ('Fixed', 'DriverOne', 'fixed_one@test.com', clerk_one, false, false)
  RETURNING id INTO user_one;

  INSERT INTO "Drivers" (user_uuid, is_active) VALUES (user_one, true)
  RETURNING id INTO driver_one;

  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
  VALUES ('Fixed', 'DriverTwo', 'fixed_two@test.com', clerk_two, false, false)
  RETURNING id INTO user_two;

  INSERT INTO "Drivers" (user_uuid, is_active) VALUES (user_two, true)
  RETURNING id INTO driver_two;

  INSERT INTO "Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
  VALUES (8871, 5, 50)
  RETURNING id INTO bleacher_id;

  INSERT INTO "DamageReports" (bleacher_uuid, seat_damage, haul_damage, note, created_by_user_uuid)
  VALUES (bleacher_id, 'minor', 'none', 'loose seat bolt', user_one)
  RETURNING id INTO dr_id;

  -- ── T1: a fresh report is not fixed ──
  SELECT fixed_by_driver, fixed_at, fixed_by_user_uuid
    INTO v_fixed, v_fixed_at, v_fixed_by
    FROM "DamageReports" WHERE id = dr_id;
  ASSERT v_fixed = false AND v_fixed_at IS NULL AND v_fixed_by IS NULL,
    'T1 FAIL: a new report should be unfixed with both audit columns null';
  RAISE NOTICE 'T1  new report defaults to not fixed ✓';

  -- ── T2: CHECK rejects "fixed by nobody" ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReports" SET fixed_by_driver = true WHERE id = dr_id;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T2 FAIL: fixed_by_driver = true with a null fixed_at must be rejected';
  RAISE NOTICE 'T2  CHECK rejects fixed=true without who/when ✓';

  -- ── T3: CHECK rejects a stale audit trail on an unfixed report ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReports"
       SET fixed_by_driver = false, fixed_at = now(), fixed_by_user_uuid = user_one
     WHERE id = dr_id;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T3 FAIL: fixed_by_driver = false with a non-null fixed_at must be rejected';
  RAISE NOTICE 'T3  CHECK rejects leftover who/when on an unfixed report ✓';

  -- ══ RLS active, acting as the OTHER driver ═══════════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', clerk_two)::text, true);

  -- ── T4: driver two marks driver one's report fixed ──
  UPDATE "DamageReports"
     SET fixed_by_driver = true, fixed_at = now(), fixed_by_user_uuid = user_two
   WHERE id = dr_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, format('T4 FAIL: expected 1 updated row, got %s', v_count);
  RAISE NOTICE 'T4  a driver can mark another driver''s report fixed ✓';

  SELECT fixed_by_driver, fixed_by_user_uuid INTO v_fixed, v_fixed_by
    FROM "DamageReports" WHERE id = dr_id;
  ASSERT v_fixed = true AND v_fixed_by = user_two,
    'T4b FAIL: the mark should record the driver who pressed it';
  RAISE NOTICE 'T4b the mark records who pressed it ✓';

  -- ── T5: that driver may change nothing else ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReports" SET note = 'rewritten by a driver' WHERE id = dr_id;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T5 FAIL: a driver must not be able to edit a report''s note';
  RAISE NOTICE 'T5  a driver cannot edit anything but the fixed columns ✓';

  SELECT note INTO v_note FROM "DamageReports" WHERE id = dr_id;
  ASSERT v_note = 'loose seat bolt', 'T5b FAIL: the note should be untouched';
  RAISE NOTICE 'T5b the note survived the rejected write ✓';

  -- ── T6: a driver must not resolve a report ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReports" SET resolved_at = now() WHERE id = dr_id;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T6 FAIL: resolving is a manager action, not a driver one';
  RAISE NOTICE 'T6  a driver cannot resolve a report ✓';

  -- ── T7: unmarking clears all three columns ──
  UPDATE "DamageReports"
     SET fixed_by_driver = false, fixed_at = NULL, fixed_by_user_uuid = NULL
   WHERE id = dr_id;
  SELECT fixed_by_driver, fixed_at, fixed_by_user_uuid
    INTO v_fixed, v_fixed_at, v_fixed_by
    FROM "DamageReports" WHERE id = dr_id;
  ASSERT v_fixed = false AND v_fixed_at IS NULL AND v_fixed_by IS NULL,
    'T7 FAIL: unmarking should leave no trace of the mark';
  RAISE NOTICE 'T7  a driver can remove the fixed mark ✓';

  -- ══ Staff are unaffected ═════════════════════════════════════════════════
  RESET ROLE;
  UPDATE "Users" SET is_admin = true WHERE id = user_two;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', clerk_two)::text, true);

  -- ── T8: an admin still edits the report normally ──
  UPDATE "DamageReports" SET note = 'edited by admin', resolved_at = now() WHERE id = dr_id;
  SELECT note INTO v_note FROM "DamageReports" WHERE id = dr_id;
  ASSERT v_note = 'edited by admin', 'T8 FAIL: the driver guard must not touch staff writes';
  RAISE NOTICE 'T8  staff writes are unaffected by the driver guard ✓';


  -- ══════════════════════════════════════════════════════════════════════════
  -- The photo upload queue must survive the guard
  --
  -- The fence above compares every column, and the database writes some of
  -- them itself in the middle of a driver's request: a photo-status update
  -- cascades into `UPDATE "DamageReports" SET photos_uploaded = …`, still
  -- under the driver's JWT. Rejecting that stalls the driver's ENTIRE upload
  -- queue, because PowerSync retries a failed operation forever and never
  -- moves past it. So the assertion that matters below is not a column value;
  -- it is that the driver's write SUCCEEDS AT ALL — and that the exemption
  -- belongs to the database's write, not to the driver.
  -- ══════════════════════════════════════════════════════════════════════════

  -- Back to superuser: this half seeds its own actors, and seeding them under
  -- the admin session left over from T8 would make the setup itself part of
  -- what is being tested.
  RESET ROLE;

  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
  VALUES ('Queue', 'Driver', 'queue_driver@test.com', clerk_queue, false, false)
  RETURNING id INTO user_queue;

  INSERT INTO "Drivers" (user_uuid, is_active) VALUES (user_queue, true)
  RETURNING id INTO driver_queue;

  INSERT INTO "Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
  VALUES (8872, 5, 50)
  RETURNING id INTO bleacher_queue;

  -- ══ RLS active, acting as the driver whose queue this is ═════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', clerk_queue)::text, true);

  INSERT INTO "DamageReports" (bleacher_uuid, seat_damage, haul_damage, note, created_by_user_uuid)
  VALUES (bleacher_queue, 'minor', 'none', 'loose seat bolt', user_queue)
  RETURNING id INTO dr_queue;

  INSERT INTO "DamageReportPhotos" (damage_report_uuid, photo_path, upload_status)
  VALUES (dr_queue, format('%s/photo.jpg', dr_queue), 'pending')
  RETURNING id INTO photo_id;

  -- ── T9: the queue's own write goes through ──
  -- This is verbatim what `photoUploadService` sends once a file lands in the
  -- bucket. Before the fix it raised, and the driver's entire queue stopped.
  UPDATE "DamageReportPhotos" SET upload_status = 'uploaded' WHERE id = photo_id;
  RAISE NOTICE 'T9  a driver can confirm a photo upload ✓';

  -- ── T10: and the derived column was actually recomputed ──
  SELECT photos_uploaded INTO v_uploaded FROM "DamageReports" WHERE id = dr_queue;
  ASSERT v_uploaded, 'T10 FAIL: photos_uploaded should be true once every photo is uploaded';
  RAISE NOTICE 'T10  photos_uploaded recomputed under the driver''s session ✓';

  -- ── T11: the exemption did not leak to the rest of the transaction ──
  v_raised := false;
  BEGIN
    UPDATE "DamageReports" SET note = 'rewritten by a driver' WHERE id = dr_queue;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T11 FAIL: the guard must still refuse a driver editing a report';
  RAISE NOTICE 'T11  the marker is not a standing exemption for the driver ✓';

  SELECT note INTO v_note FROM "DamageReports" WHERE id = dr_queue;
  ASSERT v_note = 'loose seat bolt', 'T11b FAIL: the note should be untouched';
  RAISE NOTICE 'T11b the note survived the rejected write ✓';

  -- ── T12: a driver cannot claim the evidence is delivered ──
  -- The reason this fix marks the server's write instead of excluding
  -- `photos_uploaded` from the comparison: the flag stays out of a driver's
  -- reach either way round.
  v_raised := false;
  BEGIN
    -- false, not true: T10 already left the flag true, and the fence compares
    -- values — writing back the value it already has changes nothing and is
    -- correctly let through, which would prove nothing here.
    UPDATE "DamageReports" SET photos_uploaded = false WHERE id = dr_queue;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'T12 FAIL: photos_uploaded is server-derived and must stay unwritable by a driver';
  RAISE NOTICE 'T12  a driver still cannot set photos_uploaded ✓';

  -- ── T13: marking the report fixed still works after all that ──
  UPDATE "DamageReports"
     SET fixed_by_driver = true, fixed_at = now(), fixed_by_user_uuid = user_queue
   WHERE id = dr_queue;
  RAISE NOTICE 'T13  the fixed mark still writes ✓';

  RESET ROLE;
END;
$$;

SELECT * FROM finish();

ROLLBACK;
