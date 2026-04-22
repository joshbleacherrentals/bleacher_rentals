-- ============================================================================
-- Fuzz test for driver-scorecard recompute triggers
-- ============================================================================
-- Generates a random workload (inserts, updates, deletes) on WorkTrackers and
-- MaintenanceEvents, then asserts that every aggregate row in
-- DriverScorecardStatsPerDriver / DriverScoreCardStats matches the
-- ground-truth SUM/COUNT recomputed directly from the source tables.
--
-- Run after the ASSERT-style suite:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/driver-scorecard.fuzz.sql
--
-- Wrapped in a transaction + ROLLBACK so the local DB is left untouched.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  N_DRIVERS  CONSTANT INT := 5;
  N_INSERTS  CONSTANT INT := 200;
  N_UPDATES  CONSTANT INT := 100;
  N_DELETES  CONSTANT INT := 30;
  N_ME_INS   CONSTANT INT := 50;
  N_ME_UPD   CONSTANT INT := 25;
  N_ME_DEL   CONSTANT INT := 10;

  drivers   UUID[] := ARRAY[]::UUID[];
  wt_ids    UUID[] := ARRAY[]::UUID[];
  me_ids    UUID[] := ARRAY[]::UUID[];

  i           INT;
  pick        INT;
  rand_year   INT;
  rand_month  INT;
  rand_day    INT;
  d           DATE;
  ts          TIMESTAMPTZ;
  new_id      UUID;
  drift_count INT;
  null_bucket_count INT;
BEGIN
  RAISE NOTICE '--- driver-scorecard fuzz test ---';

  -- ---------- create drivers ----------
  FOR i IN 1..N_DRIVERS LOOP
    INSERT INTO public."Drivers" DEFAULT VALUES RETURNING id INTO new_id;
    drivers := drivers || new_id;
  END LOOP;

  -- ---------- random WorkTrackers inserts ----------
  FOR i IN 1..N_INSERTS LOOP
    rand_year  := 2023 + (random() * 3)::INT; -- 2023..2025
    rand_month := 1 + (random() * 11)::INT;
    rand_day   := 1 + (random() * 27)::INT;
    d := make_date(rand_year, rand_month, rand_day);

    INSERT INTO public."WorkTrackers" (
      driver_uuid, date, distance_meters, drive_minutes, pay_cents
    ) VALUES (
      drivers[1 + (random() * (N_DRIVERS - 1))::INT],
      d,
      (random() * 100000)::BIGINT,
      (random() * 600)::BIGINT,
      (random() * 50000)::BIGINT
    )
    RETURNING id INTO new_id;
    wt_ids := wt_ids || new_id;
  END LOOP;

  -- ---------- random WorkTrackers updates (driver, date, metrics) ----------
  FOR i IN 1..N_UPDATES LOOP
    pick := 1 + (random() * (array_length(wt_ids, 1) - 1))::INT;
    rand_year  := 2023 + (random() * 3)::INT;
    rand_month := 1 + (random() * 11)::INT;
    rand_day   := 1 + (random() * 27)::INT;
    d := make_date(rand_year, rand_month, rand_day);

    UPDATE public."WorkTrackers"
       SET driver_uuid     = drivers[1 + (random() * (N_DRIVERS - 1))::INT],
           date            = d,
           distance_meters = (random() * 100000)::BIGINT,
           drive_minutes   = (random() * 600)::BIGINT,
           pay_cents       = (random() * 50000)::BIGINT
     WHERE id = wt_ids[pick];
  END LOOP;

  -- ---------- random WorkTrackers deletes ----------
  FOR i IN 1..N_DELETES LOOP
    IF array_length(wt_ids, 1) IS NULL OR array_length(wt_ids, 1) = 0 THEN
      EXIT;
    END IF;
    pick := 1 + (random() * (array_length(wt_ids, 1) - 1))::INT;
    DELETE FROM public."WorkTrackers" WHERE id = wt_ids[pick];
    -- remove from local array
    wt_ids := wt_ids[1:pick-1] || wt_ids[pick+1:];
  END LOOP;

  -- ---------- random MaintenanceEvents inserts ----------
  FOR i IN 1..N_ME_INS LOOP
    rand_year  := 2023 + (random() * 3)::INT;
    rand_month := 1 + (random() * 11)::INT;
    rand_day   := 1 + (random() * 27)::INT;
    ts := make_timestamptz(rand_year, rand_month, rand_day, 12, 0, 0);

    INSERT INTO public."MaintenanceEvents" (
      event_start, event_end, cost_cents, event_name
    ) VALUES (
      ts, ts + INTERVAL '1 day',
      (random() * 100000)::BIGINT,
      'fuzz-' || i::TEXT
    )
    RETURNING id INTO new_id;
    me_ids := me_ids || new_id;
  END LOOP;

  -- ---------- random MaintenanceEvents updates ----------
  FOR i IN 1..N_ME_UPD LOOP
    pick := 1 + (random() * (array_length(me_ids, 1) - 1))::INT;
    rand_year  := 2023 + (random() * 3)::INT;
    rand_month := 1 + (random() * 11)::INT;
    rand_day   := 1 + (random() * 27)::INT;
    ts := make_timestamptz(rand_year, rand_month, rand_day, 12, 0, 0);

    UPDATE public."MaintenanceEvents"
       SET event_start = ts,
           event_end   = ts + INTERVAL '1 day',
           cost_cents  = (random() * 100000)::BIGINT
     WHERE id = me_ids[pick];
  END LOOP;

  -- ---------- random MaintenanceEvents deletes ----------
  FOR i IN 1..N_ME_DEL LOOP
    IF array_length(me_ids, 1) IS NULL OR array_length(me_ids, 1) = 0 THEN
      EXIT;
    END IF;
    pick := 1 + (random() * (array_length(me_ids, 1) - 1))::INT;
    DELETE FROM public."MaintenanceEvents" WHERE id = me_ids[pick];
    me_ids := me_ids[1:pick-1] || me_ids[pick+1:];
  END LOOP;

  -- ==========================================================================
  -- ASSERT: every aggregate row matches a fresh SUM from source.
  -- ==========================================================================

  -- DriverScorecardStatsPerDriver vs WorkTrackers
  SELECT COUNT(*) INTO drift_count
  FROM public."DriverScorecardStatsPerDriver" agg
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(distance_meters), 0)::BIGINT AS distance_meters,
      COALESCE(SUM(drive_minutes), 0)::BIGINT   AS drive_minutes,
      COALESCE(SUM(pay_cents), 0)::BIGINT       AS pay_cents,
      COUNT(*)::INTEGER                         AS trip_count
    FROM public."WorkTrackers" wt
    WHERE wt.driver_uuid = agg.driver_uuid
      AND wt.date IS NOT NULL
      AND EXTRACT(YEAR FROM wt.date)::SMALLINT = agg.year
  ) truth ON TRUE
  WHERE agg.distance_meters IS DISTINCT FROM truth.distance_meters
     OR agg.drive_minutes   IS DISTINCT FROM truth.drive_minutes
     OR agg.pay_cents       IS DISTINCT FROM truth.pay_cents
     OR agg.trip_count      IS DISTINCT FROM truth.trip_count;

  ASSERT drift_count = 0,
    format('FUZZ: %s DriverScorecardStatsPerDriver row(s) drifted from source SUM', drift_count);

  -- ASSERT: no aggregate row exists for an empty (driver, year) bucket
  SELECT COUNT(*) INTO null_bucket_count
  FROM public."DriverScorecardStatsPerDriver" agg
  WHERE NOT EXISTS (
    SELECT 1 FROM public."WorkTrackers" wt
    WHERE wt.driver_uuid = agg.driver_uuid
      AND wt.date IS NOT NULL
      AND EXTRACT(YEAR FROM wt.date)::SMALLINT = agg.year
  );
  ASSERT null_bucket_count = 0,
    format('FUZZ: %s DriverScorecardStatsPerDriver row(s) exist for empty buckets', null_bucket_count);

  -- ASSERT: every (driver, year) bucket present in source has an aggregate row
  SELECT COUNT(*) INTO null_bucket_count
  FROM (
    SELECT DISTINCT driver_uuid, EXTRACT(YEAR FROM date)::SMALLINT AS y
    FROM public."WorkTrackers"
    WHERE driver_uuid IS NOT NULL AND date IS NOT NULL
  ) src
  WHERE NOT EXISTS (
    SELECT 1 FROM public."DriverScorecardStatsPerDriver" agg
    WHERE agg.driver_uuid = src.driver_uuid AND agg.year = src.y
  );
  ASSERT null_bucket_count = 0,
    format('FUZZ: %s source (driver, year) bucket(s) missing an aggregate row', null_bucket_count);

  RAISE NOTICE 'FUZZ: WorkTrackers ↔ DriverScorecardStatsPerDriver consistent across % buckets',
    (SELECT COUNT(*) FROM public."DriverScorecardStatsPerDriver");

  -- DriverScoreCardStats vs MaintenanceEvents (key='maintenance_cost_per_year')
  SELECT COUNT(*) INTO drift_count
  FROM public."DriverScoreCardStats" agg
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(cost_cents), 0)::BIGINT AS value,
      COUNT(*)::INTEGER                    AS row_count
    FROM public."MaintenanceEvents" me
    WHERE me.event_start IS NOT NULL
      AND EXTRACT(YEAR FROM me.event_start)::SMALLINT = agg.year
  ) truth ON TRUE
  WHERE agg.key = 'maintenance_cost_per_year'
    AND agg.value IS DISTINCT FROM truth.value;

  ASSERT drift_count = 0,
    format('FUZZ: %s DriverScoreCardStats row(s) drifted from source SUM', drift_count);

  SELECT COUNT(*) INTO null_bucket_count
  FROM public."DriverScoreCardStats" agg
  WHERE agg.key = 'maintenance_cost_per_year'
    AND NOT EXISTS (
      SELECT 1 FROM public."MaintenanceEvents" me
      WHERE me.event_start IS NOT NULL
        AND EXTRACT(YEAR FROM me.event_start)::SMALLINT = agg.year
    );
  ASSERT null_bucket_count = 0,
    format('FUZZ: %s DriverScoreCardStats row(s) exist for empty maintenance buckets', null_bucket_count);

  SELECT COUNT(*) INTO null_bucket_count
  FROM (
    SELECT DISTINCT EXTRACT(YEAR FROM event_start)::SMALLINT AS y
    FROM public."MaintenanceEvents"
    WHERE event_start IS NOT NULL
  ) src
  WHERE NOT EXISTS (
    SELECT 1 FROM public."DriverScoreCardStats" agg
    WHERE agg.year = src.y AND agg.key = 'maintenance_cost_per_year'
  );
  ASSERT null_bucket_count = 0,
    format('FUZZ: %s source maintenance year(s) missing an aggregate row', null_bucket_count);

  RAISE NOTICE 'FUZZ: MaintenanceEvents ↔ DriverScoreCardStats consistent across % buckets',
    (SELECT COUNT(*) FROM public."DriverScoreCardStats" WHERE key = 'maintenance_cost_per_year');

  RAISE NOTICE '--- FUZZ TEST PASSED ---';
END
$$ LANGUAGE plpgsql;

ROLLBACK;
