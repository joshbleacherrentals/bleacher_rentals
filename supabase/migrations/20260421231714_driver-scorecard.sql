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
-- On INSERT: add NEW contribution to (NEW.driver_uuid, year(NEW.date)).
-- On DELETE: subtract OLD contribution from (OLD.driver_uuid, year(OLD.date)).
-- On UPDATE: subtract OLD from old bucket, add NEW to new bucket
--   (handles driver change, date change across years, and metric changes).
--
-- A row contributes only when driver_uuid AND date are non-null. NULL metrics
-- are treated as 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_driver_scorecard_stats_per_driver()
RETURNS TRIGGER AS $$
DECLARE
  old_year SMALLINT;
  new_year SMALLINT;
BEGIN
  -- Subtract OLD contribution
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    IF OLD.driver_uuid IS NOT NULL AND OLD.date IS NOT NULL THEN
      old_year := EXTRACT(YEAR FROM OLD.date)::SMALLINT;

      UPDATE public."DriverScorecardStatsPerDriver"
        SET distance_meters = distance_meters - COALESCE(OLD.distance_meters, 0),
            drive_minutes   = drive_minutes   - COALESCE(OLD.drive_minutes, 0),
            pay_cents       = pay_cents       - COALESCE(OLD.pay_cents, 0),
            trip_count      = trip_count      - 1
        WHERE driver_uuid = OLD.driver_uuid AND year = old_year;
    END IF;
  END IF;

  -- Add NEW contribution
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.driver_uuid IS NOT NULL AND NEW.date IS NOT NULL THEN
      new_year := EXTRACT(YEAR FROM NEW.date)::SMALLINT;

      INSERT INTO public."DriverScorecardStatsPerDriver" (
        driver_uuid, year, distance_meters, drive_minutes, pay_cents, trip_count
      )
      VALUES (
        NEW.driver_uuid,
        new_year,
        COALESCE(NEW.distance_meters, 0),
        COALESCE(NEW.drive_minutes, 0),
        COALESCE(NEW.pay_cents, 0),
        1
      )
      ON CONFLICT (driver_uuid, year)
      DO UPDATE SET
        distance_meters = public."DriverScorecardStatsPerDriver".distance_meters + EXCLUDED.distance_meters,
        drive_minutes   = public."DriverScorecardStatsPerDriver".drive_minutes   + EXCLUDED.drive_minutes,
        pay_cents       = public."DriverScorecardStatsPerDriver".pay_cents       + EXCLUDED.pay_cents,
        trip_count      = public."DriverScorecardStatsPerDriver".trip_count      + EXCLUDED.trip_count;
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
-- On INSERT: add NEW.cost_cents to (year(NEW.event_start), 'maintenance_cost_per_year').
-- On DELETE: subtract OLD.cost_cents from (year(OLD.event_start), 'maintenance_cost_per_year').
-- On UPDATE: subtract OLD from old bucket, add NEW to new bucket.
--
-- Rows only contribute when event_start is non-null. NULL cost_cents treated as 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_maintenance_cost_per_year()
RETURNS TRIGGER AS $$
DECLARE
  old_year SMALLINT;
  new_year SMALLINT;
  k        CONSTANT TEXT := 'maintenance_cost_per_year';
BEGIN
  -- Subtract OLD contribution
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    IF OLD.event_start IS NOT NULL THEN
      old_year := EXTRACT(YEAR FROM OLD.event_start)::SMALLINT;

      UPDATE public."DriverScoreCardStats"
        SET value = value - COALESCE(OLD.cost_cents, 0)
        WHERE year = old_year AND key = k;
    END IF;
  END IF;

  -- Add NEW contribution
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.event_start IS NOT NULL THEN
      new_year := EXTRACT(YEAR FROM NEW.event_start)::SMALLINT;

      INSERT INTO public."DriverScoreCardStats" (year, key, value)
      VALUES (new_year, k, COALESCE(NEW.cost_cents, 0))
      ON CONFLICT (year, key)
      DO UPDATE SET
        value = public."DriverScoreCardStats".value + EXCLUDED.value;
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

