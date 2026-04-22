-- ============================================================================
-- Tests for driver-scorecard recompute triggers
-- ============================================================================
-- Run against a local Supabase DB that already has the
-- 20260421231714_driver-scorecard.sql migration applied.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/driver-scorecard.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end, so the
-- local database is left untouched. Any failed ASSERT aborts the test run
-- with a clear message.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

DO $$
DECLARE
  driver_a UUID;
  driver_b UUID;
  wt1      UUID;
  wt2      UUID;
  wt3      UUID;
  me1      UUID;
  me2      UUID;
  v_dist   BIGINT;
  v_min    BIGINT;
  v_pay    BIGINT;
  v_count  INTEGER;
  v_value  BIGINT;
  v_exists BOOLEAN;
BEGIN
  RAISE NOTICE '--- driver-scorecard recompute trigger tests ---';

  -- --------------------------------------------------------------------------
  -- Setup: two drivers
  -- --------------------------------------------------------------------------
  INSERT INTO public."Drivers" DEFAULT VALUES RETURNING id INTO driver_a;
  INSERT INTO public."Drivers" DEFAULT VALUES RETURNING id INTO driver_b;

  -- ==========================================================================
  -- WorkTrackers → DriverScorecardStatsPerDriver
  -- ==========================================================================

  ----------------------------------------------------------------------------
  -- TEST 1: INSERT creates bucket with correct totals
  ----------------------------------------------------------------------------
  INSERT INTO public."WorkTrackers" (driver_uuid, date, distance_meters, drive_minutes, pay_cents)
  VALUES (driver_a, DATE '2024-06-15', 1000, 30, 5000)
  RETURNING id INTO wt1;

  INSERT INTO public."WorkTrackers" (driver_uuid, date, distance_meters, drive_minutes, pay_cents)
  VALUES (driver_a, DATE '2024-08-01', 2500, 70, 12500)
  RETURNING id INTO wt2;

  SELECT distance_meters, drive_minutes, pay_cents, trip_count
    INTO v_dist, v_min, v_pay, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2024;

  ASSERT v_dist  = 3500,  format('TEST 1 distance: expected 3500, got %s', v_dist);
  ASSERT v_min   = 100,   format('TEST 1 minutes: expected 100, got %s', v_min);
  ASSERT v_pay   = 17500, format('TEST 1 pay: expected 17500, got %s', v_pay);
  ASSERT v_count = 2,     format('TEST 1 trip_count: expected 2, got %s', v_count);
  RAISE NOTICE 'TEST 1 (insert into bucket) ✓';

  ----------------------------------------------------------------------------
  -- TEST 2: INSERT into a different year creates a separate bucket
  ----------------------------------------------------------------------------
  INSERT INTO public."WorkTrackers" (driver_uuid, date, distance_meters, drive_minutes, pay_cents)
  VALUES (driver_a, DATE '2025-01-10', 999, 9, 99)
  RETURNING id INTO wt3;

  SELECT trip_count INTO v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2025;
  ASSERT v_count = 1, format('TEST 2 2025 trip_count: expected 1, got %s', v_count);

  -- 2024 bucket should still be intact
  SELECT trip_count INTO v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2024;
  ASSERT v_count = 2, format('TEST 2 2024 trip_count unchanged: expected 2, got %s', v_count);
  RAISE NOTICE 'TEST 2 (separate year buckets) ✓';

  ----------------------------------------------------------------------------
  -- TEST 3: UPDATE moving a row to a new year recomputes BOTH buckets
  ----------------------------------------------------------------------------
  UPDATE public."WorkTrackers" SET date = DATE '2025-07-04' WHERE id = wt2;

  SELECT distance_meters, trip_count INTO v_dist, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2024;
  ASSERT v_dist  = 1000, format('TEST 3 2024 distance after move: expected 1000, got %s', v_dist);
  ASSERT v_count = 1,    format('TEST 3 2024 trip_count after move: expected 1, got %s', v_count);

  SELECT distance_meters, trip_count INTO v_dist, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2025;
  ASSERT v_dist  = 3499, format('TEST 3 2025 distance after move: expected 3499, got %s', v_dist);
  ASSERT v_count = 2,    format('TEST 3 2025 trip_count after move: expected 2, got %s', v_count);
  RAISE NOTICE 'TEST 3 (year change recomputes both buckets) ✓';

  ----------------------------------------------------------------------------
  -- TEST 4: UPDATE moving a row to a new driver recomputes both drivers
  ----------------------------------------------------------------------------
  UPDATE public."WorkTrackers" SET driver_uuid = driver_b WHERE id = wt2;

  SELECT trip_count INTO v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2025;
  ASSERT v_count = 1, format('TEST 4 driver_a 2025 trip_count: expected 1, got %s', v_count);

  SELECT distance_meters, trip_count INTO v_dist, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_b AND year = 2025;
  ASSERT v_dist  = 2500, format('TEST 4 driver_b 2025 distance: expected 2500, got %s', v_dist);
  ASSERT v_count = 1,    format('TEST 4 driver_b 2025 trip_count: expected 1, got %s', v_count);
  RAISE NOTICE 'TEST 4 (driver change recomputes both drivers) ✓';

  ----------------------------------------------------------------------------
  -- TEST 5: UPDATE in-bucket (metric change only) — bucket recomputed correctly
  ----------------------------------------------------------------------------
  UPDATE public."WorkTrackers" SET distance_meters = 50 WHERE id = wt1;

  SELECT distance_meters, trip_count INTO v_dist, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2024;
  ASSERT v_dist  = 50, format('TEST 5 2024 distance after metric change: expected 50, got %s', v_dist);
  ASSERT v_count = 1,  format('TEST 5 2024 trip_count after metric change: expected 1, got %s', v_count);
  RAISE NOTICE 'TEST 5 (in-bucket metric change) ✓';

  ----------------------------------------------------------------------------
  -- TEST 6: DELETE last row in a bucket removes the aggregate row
  ----------------------------------------------------------------------------
  DELETE FROM public."WorkTrackers" WHERE id = wt1;

  SELECT EXISTS (
    SELECT 1 FROM public."DriverScorecardStatsPerDriver"
    WHERE driver_uuid = driver_a AND year = 2024
  ) INTO v_exists;
  ASSERT v_exists = FALSE, 'TEST 6: empty 2024 bucket should be deleted';
  RAISE NOTICE 'TEST 6 (empty bucket removed) ✓';

  ----------------------------------------------------------------------------
  -- TEST 7: NULL driver_uuid / NULL date contributes nothing
  ----------------------------------------------------------------------------
  INSERT INTO public."WorkTrackers" (driver_uuid, date, distance_meters)
  VALUES (NULL, DATE '2025-09-01', 12345);
  INSERT INTO public."WorkTrackers" (driver_uuid, date, distance_meters)
  VALUES (driver_a, NULL, 67890);

  SELECT trip_count INTO v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_a AND year = 2025;
  ASSERT v_count = 1, format('TEST 7 NULL handling: trip_count should still be 1, got %s', v_count);
  RAISE NOTICE 'TEST 7 (NULLs ignored) ✓';

  ----------------------------------------------------------------------------
  -- TEST 8: Drift repair — corrupt aggregate, then any source UPDATE fixes it
  -- This is THE key benefit of the recompute pattern.
  ----------------------------------------------------------------------------
  -- Corrupt the bucket to a wrong value
  UPDATE public."DriverScorecardStatsPerDriver"
    SET distance_meters = 999999, pay_cents = 999999, trip_count = 999
    WHERE driver_uuid = driver_b AND year = 2025;

  -- Touch any row in that bucket — must self-heal
  UPDATE public."WorkTrackers" SET notes = 'touch' WHERE id = wt2;

  SELECT distance_meters, pay_cents, trip_count INTO v_dist, v_pay, v_count
  FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = driver_b AND year = 2025;
  ASSERT v_dist  = 2500,  format('TEST 8 drift repair distance: expected 2500, got %s', v_dist);
  ASSERT v_pay   = 12500, format('TEST 8 drift repair pay: expected 12500, got %s', v_pay);
  ASSERT v_count = 1,     format('TEST 8 drift repair trip_count: expected 1, got %s', v_count);
  RAISE NOTICE 'TEST 8 (drift self-heals on next write) ✓';

  -- ==========================================================================
  -- MaintenanceEvents → DriverScoreCardStats (key='maintenance_cost_per_year')
  -- ==========================================================================

  ----------------------------------------------------------------------------
  -- TEST 9: INSERT, UPDATE across years, DELETE
  ----------------------------------------------------------------------------
  INSERT INTO public."MaintenanceEvents" (event_start, event_end, cost_cents, event_name)
  VALUES (TIMESTAMPTZ '2024-03-01 12:00', TIMESTAMPTZ '2024-03-02 12:00', 10000, 'me1')
  RETURNING id INTO me1;

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, cost_cents, event_name)
  VALUES (TIMESTAMPTZ '2024-05-15 12:00', TIMESTAMPTZ '2024-05-16 12:00', 25000, 'me2')
  RETURNING id INTO me2;

  SELECT value INTO v_value
  FROM public."DriverScoreCardStats"
  WHERE year = 2024 AND key = 'maintenance_cost_per_year';
  ASSERT v_value = 35000, format('TEST 9a 2024 cost: expected 35000, got %s', v_value);

  -- Move me2 to a different year
  UPDATE public."MaintenanceEvents"
    SET event_start = TIMESTAMPTZ '2025-05-15 12:00', event_end = TIMESTAMPTZ '2025-05-16 12:00'
    WHERE id = me2;

  SELECT value INTO v_value
  FROM public."DriverScoreCardStats"
  WHERE year = 2024 AND key = 'maintenance_cost_per_year';
  ASSERT v_value = 10000, format('TEST 9b 2024 after move: expected 10000, got %s', v_value);

  SELECT value INTO v_value
  FROM public."DriverScoreCardStats"
  WHERE year = 2025 AND key = 'maintenance_cost_per_year';
  ASSERT v_value = 25000, format('TEST 9c 2025 after move: expected 25000, got %s', v_value);

  -- Delete the only 2025 row → bucket should disappear
  DELETE FROM public."MaintenanceEvents" WHERE id = me2;

  SELECT EXISTS (
    SELECT 1 FROM public."DriverScoreCardStats"
    WHERE year = 2025 AND key = 'maintenance_cost_per_year'
  ) INTO v_exists;
  ASSERT v_exists = FALSE, 'TEST 9d: empty 2025 maintenance bucket should be deleted';
  RAISE NOTICE 'TEST 9 (maintenance insert/move/delete) ✓';

  ----------------------------------------------------------------------------
  -- TEST 10: Maintenance drift repair
  ----------------------------------------------------------------------------
  UPDATE public."DriverScoreCardStats"
    SET value = 99999999
    WHERE year = 2024 AND key = 'maintenance_cost_per_year';

  UPDATE public."MaintenanceEvents" SET notes = 'touch' WHERE id = me1;

  SELECT value INTO v_value
  FROM public."DriverScoreCardStats"
  WHERE year = 2024 AND key = 'maintenance_cost_per_year';
  ASSERT v_value = 10000, format('TEST 10 drift repair: expected 10000, got %s', v_value);
  RAISE NOTICE 'TEST 10 (maintenance drift self-heals) ✓';

  RAISE NOTICE '--- ALL TESTS PASSED ---';
END
$$ LANGUAGE plpgsql;

ROLLBACK;
