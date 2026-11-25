-- ============================================================================
-- Repairs: one line item (service) for every bleacher of an existing repair
-- Follows: 20261123120000_maintenance_schema.sql (MaintenanceLineItems and its total trigger)
-- ============================================================================
--
-- Before the Repairs page, a repair (MaintenanceEvents) had its bleachers only in the junction
-- BleacherMaintEvents and one lump sum in cost_cents. The page shows services (MaintenanceLineItems),
-- so every old repair showed as a "repair without services". This migration gives each of them the
-- services it lacks.
--
-- Which rows
--   * live repairs only (deleted = false). Deleted repairs get no services.
--   * one service per distinct (repair, bleacher) pair of the junction. A bleacher that is itself
--     deleted gets its service too (the junction row is the fact; the service records it).
--   * a pair that already has a service (live or deleted) is skipped, so a service made in the app
--     is never duplicated and a service deleted by hand is never brought back. A second run adds
--     nothing.
--
-- What a service gets
--   * severity    'minor' (the column is not null and old repairs have no severity).
--   * category    empty (damage_category_uuid stays null).
--   * description the repair's notes, copied as they are; empty or blank notes give null.
--   * created_at  the repair's created_at.
--   * amounts     labor_cents = the repair's cost_cents (null counts as 0); parts, tax and freight 0.
--                 The whole amount sits on ONE service per repair, so the services add up to the
--                 repair's total:
--                   - several bleachers: the service of the bleacher with the lowest number
--                     (then the lowest id) takes the amount, the others stay at 0. (No live repair
--                     has several bleachers when this is written; the rule only covers one that
--                     appears before the release.)
--                   - the repair already has a live service: the new services stay at 0, because
--                     the repair's total already is the sum of the services it has.
--
-- What is not touched
--   * cost_cents of every repair. The total trigger maintenance_line_items_sync_cost is switched off
--     while the services are inserted: with it on, a repair with an empty total would become $0.00.
--     So a repair with an empty total keeps an empty total, although its service is 0. The next
--     change of a service on that repair makes the total the sum of its services (spec
--     repairs-09b1 D160).
--   * zone_uuid, the junction BleacherMaintEvents and the damage reports (no link, no closing).
--
-- One DO block: a single statement is atomic under any runner (the Supabase CLI sends a file as a
-- batch, not a transaction block), so a failure can never leave the trigger switched off.
-- On an empty database (CI: `supabase db reset --no-seed`) it inserts nothing.
-- ============================================================================

DO $$
DECLARE
  v_inserted integer;
BEGIN
  ALTER TABLE public."MaintenanceLineItems"
    DISABLE TRIGGER maintenance_line_items_sync_cost;

  WITH pairs AS (
    SELECT DISTINCT ON (b.maintenance_event_uuid, b.bleacher_uuid)
           me.id AS event_uuid,
           b.bleacher_uuid,
           bl.bleacher_number,
           me.cost_cents,
           me.notes,
           me.created_at AS event_created_at
    FROM public."BleacherMaintEvents" b
    JOIN public."MaintenanceEvents" me ON me.id = b.maintenance_event_uuid
    JOIN public."Bleachers" bl ON bl.id = b.bleacher_uuid
    WHERE me.deleted = false
      AND NOT EXISTS (
        SELECT 1
        FROM public."MaintenanceLineItems" li
        WHERE li.maintenance_event_uuid = b.maintenance_event_uuid
          AND li.bleacher_uuid = b.bleacher_uuid
      )
    ORDER BY b.maintenance_event_uuid, b.bleacher_uuid, b.created_at
  ),
  ranked AS (
    SELECT p.*,
           row_number() OVER (
             PARTITION BY p.event_uuid
             ORDER BY p.bleacher_number, p.bleacher_uuid
           ) AS rn,
           EXISTS (
             SELECT 1
             FROM public."MaintenanceLineItems" li
             WHERE li.maintenance_event_uuid = p.event_uuid
               AND li.deleted = false
           ) AS has_live_service
    FROM pairs p
  )
  INSERT INTO public."MaintenanceLineItems" (
    maintenance_event_uuid,
    bleacher_uuid,
    severity,
    description,
    labor_cents,
    created_at
  )
  SELECT r.event_uuid,
         r.bleacher_uuid,
         'minor'::public.maintenance_severity,
         CASE WHEN btrim(r.notes, E' \t\r\n') = '' THEN NULL ELSE r.notes END,
         CASE WHEN r.rn = 1 AND NOT r.has_live_service THEN coalesce(r.cost_cents, 0) ELSE 0 END,
         r.event_created_at
  FROM ranked r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ALTER TABLE public."MaintenanceLineItems"
    ENABLE TRIGGER maintenance_line_items_sync_cost;

  RAISE NOTICE 'maintenance line items backfill: % services created', v_inserted;
END
$$;
