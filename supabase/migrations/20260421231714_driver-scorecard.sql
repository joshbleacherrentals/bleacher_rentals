-- ============================================================================
-- DriverScorecardStatsPerDriver: aggregate per-driver per-year work-tracker metrics
-- ============================================================================

CREATE TABLE "DriverScorecardStatsPerDriver" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_uuid     UUID NOT NULL REFERENCES public."Drivers"(id) ON DELETE CASCADE,
  year            SMALLINT NOT NULL,
  distance_meters BIGINT NOT NULL DEFAULT 0,
  drive_minutes   BIGINT NOT NULL DEFAULT 0,
  pay_cents       BIGINT NOT NULL DEFAULT 0,
  trip_count      INTEGER NOT NULL DEFAULT 0,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT driver_scorecard_stats_per_driver_unique UNIQUE (driver_uuid, year)
);

CREATE INDEX idx_driver_scorecard_stats_per_driver_driver
  ON public."DriverScorecardStatsPerDriver" (driver_uuid);

-- Enable RLS
ALTER TABLE public."DriverScorecardStatsPerDriver" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow All for Auth"
  ON public."DriverScorecardStatsPerDriver"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true);

-- Auto-update last_updated on row changes
CREATE OR REPLACE FUNCTION public.update_driver_scorecard_stats_per_driver_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_driver_scorecard_stats_per_driver_last_updated
  BEFORE UPDATE ON public."DriverScorecardStatsPerDriver"
  FOR EACH ROW EXECUTE FUNCTION public.update_driver_scorecard_stats_per_driver_last_updated();


-- ============================================================================
-- Trigger function: keep DriverScorecardStatsPerDriver in sync with WorkTrackers
-- ============================================================================
--
-- Tracks distance_meters, drive_minutes, pay_cents, and trip_count
-- (one trip per work tracker row).
--
-- Strategy: per-bucket recompute. For each affected (driver_uuid, year) bucket
-- (the OLD bucket and/or the NEW bucket), recompute the aggregate from
-- WorkTrackers via SUM/COUNT and upsert. If the bucket has no contributing
-- rows after the change, delete it. This is drift-proof — the row in
-- DriverScorecardStatsPerDriver always equals the SUM of its source rows.
--
-- A row contributes only when driver_uuid AND date are non-null.
-- NULL metrics are treated as 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_driver_scorecard_bucket(
  p_driver UUID,
  p_year   SMALLINT
)
RETURNS VOID AS $$
BEGIN
  IF p_driver IS NULL OR p_year IS NULL THEN
    RETURN;
  END IF;

  WITH agg AS (
    SELECT
      COALESCE(SUM(distance_meters), 0)::BIGINT AS distance_meters,
      COALESCE(SUM(drive_minutes), 0)::BIGINT   AS drive_minutes,
      COALESCE(SUM(pay_cents), 0)::BIGINT       AS pay_cents,
      COUNT(*)::INTEGER                         AS trip_count
    FROM public."WorkTrackers"
    WHERE driver_uuid = p_driver
      AND date IS NOT NULL
      AND EXTRACT(YEAR FROM date)::SMALLINT = p_year
  )
  INSERT INTO public."DriverScorecardStatsPerDriver" (
    driver_uuid, year, distance_meters, drive_minutes, pay_cents, trip_count
  )
  SELECT p_driver, p_year, distance_meters, drive_minutes, pay_cents, trip_count
  FROM agg
  WHERE trip_count > 0
  ON CONFLICT (driver_uuid, year) DO UPDATE SET
    distance_meters = EXCLUDED.distance_meters,
    drive_minutes   = EXCLUDED.drive_minutes,
    pay_cents       = EXCLUDED.pay_cents,
    trip_count      = EXCLUDED.trip_count;

  -- If no source rows remain for this bucket, drop the aggregate row.
  DELETE FROM public."DriverScorecardStatsPerDriver"
  WHERE driver_uuid = p_driver
    AND year = p_year
    AND NOT EXISTS (
      SELECT 1 FROM public."WorkTrackers"
      WHERE driver_uuid = p_driver
        AND date IS NOT NULL
        AND EXTRACT(YEAR FROM date)::SMALLINT = p_year
    );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.sync_driver_scorecard_stats_per_driver()
RETURNS TRIGGER AS $$
DECLARE
  old_driver UUID     := NULL;
  old_year   SMALLINT := NULL;
  new_driver UUID     := NULL;
  new_year   SMALLINT := NULL;
BEGIN
  -- Recompute OLD bucket
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    IF OLD.driver_uuid IS NOT NULL AND OLD.date IS NOT NULL THEN
      old_driver := OLD.driver_uuid;
      old_year   := EXTRACT(YEAR FROM OLD.date)::SMALLINT;
      PERFORM public.recompute_driver_scorecard_bucket(old_driver, old_year);
    END IF;
  END IF;

  -- Recompute NEW bucket (skip if identical to OLD bucket — already recomputed)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.driver_uuid IS NOT NULL AND NEW.date IS NOT NULL THEN
      new_driver := NEW.driver_uuid;
      new_year   := EXTRACT(YEAR FROM NEW.date)::SMALLINT;
      IF new_driver IS DISTINCT FROM old_driver OR new_year IS DISTINCT FROM old_year THEN
        PERFORM public.recompute_driver_scorecard_bucket(new_driver, new_year);
      END IF;
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_driver_scorecard_stats_per_driver
  AFTER INSERT OR UPDATE OR DELETE ON public."WorkTrackers"
  FOR EACH ROW EXECUTE FUNCTION public.sync_driver_scorecard_stats_per_driver();


-- ============================================================================
-- Backfill existing data
-- ============================================================================

INSERT INTO public."DriverScorecardStatsPerDriver" (
  driver_uuid, year, distance_meters, drive_minutes, pay_cents, trip_count
)
SELECT
  driver_uuid,
  EXTRACT(YEAR FROM date)::SMALLINT AS year,
  COALESCE(SUM(distance_meters), 0)::BIGINT AS distance_meters,
  COALESCE(SUM(drive_minutes), 0)::BIGINT   AS drive_minutes,
  COALESCE(SUM(pay_cents), 0)::BIGINT       AS pay_cents,
  COUNT(*)::INTEGER                         AS trip_count
FROM public."WorkTrackers"
WHERE driver_uuid IS NOT NULL
  AND date IS NOT NULL
GROUP BY driver_uuid, EXTRACT(YEAR FROM date)
ON CONFLICT (driver_uuid, year) DO NOTHING;


-- ============================================================================
-- DriverScoreCardStats: generic per-year key/value scorecard stats
-- ============================================================================
--
-- Stores arbitrary aggregate stats keyed by (year, key). For example:
--   key = 'maintenance_cost_per_year', value = total maintenance spend in cents
-- ============================================================================

CREATE TABLE "DriverScoreCardStats" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year         SMALLINT NOT NULL,
  key          TEXT NOT NULL,
  value        BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT driver_scorecard_stats_year_key_unique UNIQUE (year, key)
);

CREATE INDEX idx_driver_scorecard_stats_key
  ON public."DriverScoreCardStats" (key);

ALTER TABLE public."DriverScoreCardStats" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow All for Auth"
  ON public."DriverScoreCardStats"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_driver_scorecard_stats_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_driver_scorecard_stats_last_updated
  BEFORE UPDATE ON public."DriverScoreCardStats"
  FOR EACH ROW EXECUTE FUNCTION public.update_driver_scorecard_stats_last_updated();


-- ============================================================================
-- Trigger function: keep 'maintenance_cost_per_year' in sync with MaintenanceEvents
-- ============================================================================
--
-- Aggregates SUM(cost_cents) per year(event_start) into DriverScoreCardStats
-- under key 'maintenance_cost_per_year'.
--
-- Strategy: per-bucket recompute. For each affected year (the OLD year and/or
-- the NEW year), recompute SUM(cost_cents) from MaintenanceEvents and upsert.
-- If the bucket has no contributing rows after the change, delete it.
--
-- Rows only contribute when event_start is non-null. NULL cost_cents treated as 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_maintenance_cost_per_year_bucket(
  p_year SMALLINT
)
RETURNS VOID AS $$
DECLARE
  k CONSTANT TEXT := 'maintenance_cost_per_year';
BEGIN
  IF p_year IS NULL THEN
    RETURN;
  END IF;

  WITH agg AS (
    SELECT COALESCE(SUM(cost_cents), 0)::BIGINT AS value,
           COUNT(*)::INTEGER                    AS row_count
    FROM public."MaintenanceEvents"
    WHERE event_start IS NOT NULL
      AND EXTRACT(YEAR FROM event_start)::SMALLINT = p_year
  )
  INSERT INTO public."DriverScoreCardStats" (year, key, value)
  SELECT p_year, k, value
  FROM agg
  WHERE row_count > 0
  ON CONFLICT (year, key) DO UPDATE SET
    value = EXCLUDED.value;

  DELETE FROM public."DriverScoreCardStats"
  WHERE year = p_year
    AND key = k
    AND NOT EXISTS (
      SELECT 1 FROM public."MaintenanceEvents"
      WHERE event_start IS NOT NULL
        AND EXTRACT(YEAR FROM event_start)::SMALLINT = p_year
    );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.sync_maintenance_cost_per_year()
RETURNS TRIGGER AS $$
DECLARE
  old_year SMALLINT := NULL;
  new_year SMALLINT := NULL;
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    IF OLD.event_start IS NOT NULL THEN
      old_year := EXTRACT(YEAR FROM OLD.event_start)::SMALLINT;
      PERFORM public.recompute_maintenance_cost_per_year_bucket(old_year);
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.event_start IS NOT NULL THEN
      new_year := EXTRACT(YEAR FROM NEW.event_start)::SMALLINT;
      IF new_year IS DISTINCT FROM old_year THEN
        PERFORM public.recompute_maintenance_cost_per_year_bucket(new_year);
      END IF;
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_maintenance_cost_per_year
  AFTER INSERT OR UPDATE OR DELETE ON public."MaintenanceEvents"
  FOR EACH ROW EXECUTE FUNCTION public.sync_maintenance_cost_per_year();


-- ============================================================================
-- Backfill existing maintenance cost data
-- ============================================================================

INSERT INTO public."DriverScoreCardStats" (year, key, value)
SELECT
  EXTRACT(YEAR FROM event_start)::SMALLINT AS year,
  'maintenance_cost_per_year'              AS key,
  COALESCE(SUM(cost_cents), 0)::BIGINT     AS value
FROM public."MaintenanceEvents"
WHERE event_start IS NOT NULL
GROUP BY EXTRACT(YEAR FROM event_start)
ON CONFLICT (year, key) DO NOTHING;

