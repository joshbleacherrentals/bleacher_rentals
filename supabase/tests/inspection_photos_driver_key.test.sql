-- ============================================================================
-- Tests for InspectionPhotos.created_by_driver_uuid — the photo's own sync key.
-- Migration: 20260918120000_work_tracker_history_snapshot.sql
-- Spec: br_driver/docs/specs/sync-bucket-limit.md §4
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/inspection_photos_driver_key.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- The driver app's sync rule keys photos on this column (one bucket per
-- driver) instead of JOINing through WorkTrackers (one bucket per trip). New
-- builds write it; builds already on phones don't, so the server fills it —
-- a photo left without it would sync to nobody, and a pending one would never
-- upload.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(5);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Drivers" (id) VALUES
  ('d0000000-0000-0000-0000-000000000011'),
  ('d0000000-0000-0000-0000-000000000012');

INSERT INTO public."WorkTrackerInspections" (id) VALUES
  ('f0000000-0000-0000-0000-000000000011'),
  ('f0000000-0000-0000-0000-000000000012'),
  ('f0000000-0000-0000-0000-000000000013');

-- ── New builds write the column; the server keeps it ────────────────────────

INSERT INTO public."InspectionPhotos" (id, inspection_uuid, storage_path, created_by_driver_uuid)
VALUES ('c0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011',
        'f0000000/q1/photo_0.jpg', 'd0000000-0000-0000-0000-000000000012');

INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pre_inspection_uuid)
VALUES ('10000000-0000-0000-0000-000000000011', 'pickup_inspection',
        'd0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011');

SELECT is(
  (SELECT created_by_driver_uuid FROM public."InspectionPhotos"
    WHERE id = 'c0000000-0000-0000-0000-000000000011'),
  'd0000000-0000-0000-0000-000000000012'::uuid,
  'a driver the app wrote is never overwritten'
);

-- ── Old builds: photo, then inspection, then the tracker update ─────────────

INSERT INTO public."InspectionPhotos" (id, inspection_uuid, storage_path)
VALUES ('c0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000012',
        'f0000000/q1/photo_1.jpg');

SELECT is(
  (SELECT created_by_driver_uuid FROM public."InspectionPhotos"
    WHERE id = 'c0000000-0000-0000-0000-000000000012'),
  NULL,
  'a photo whose inspection no trip points at yet has no driver to take'
);

INSERT INTO public."WorkTrackers" (id, status, driver_uuid)
VALUES ('10000000-0000-0000-0000-000000000012', 'dropoff_inspection',
        'd0000000-0000-0000-0000-000000000011');
UPDATE public."WorkTrackers" SET post_inspection_uuid = 'f0000000-0000-0000-0000-000000000012'
 WHERE id = '10000000-0000-0000-0000-000000000012';

SELECT is(
  (SELECT created_by_driver_uuid FROM public."InspectionPhotos"
    WHERE id = 'c0000000-0000-0000-0000-000000000012'),
  'd0000000-0000-0000-0000-000000000011'::uuid,
  'linking the inspection to a trip gives its photos that trip''s driver'
);

-- ── A photo added once the trip already points at the inspection ───────────

INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pre_inspection_uuid)
VALUES ('10000000-0000-0000-0000-000000000013', 'pickup_inspection',
        'd0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000013');
INSERT INTO public."InspectionPhotos" (id, inspection_uuid, storage_path)
VALUES ('c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000013',
        'f0000000/q1/photo_2.jpg');

SELECT is(
  (SELECT created_by_driver_uuid FROM public."InspectionPhotos"
    WHERE id = 'c0000000-0000-0000-0000-000000000013'),
  'd0000000-0000-0000-0000-000000000011'::uuid,
  'a photo inserted after its inspection is linked takes the trip''s driver on insert'
);

-- ── Backfill: nothing already in the table was left behind ─────────────────
-- Fixture rows above aren't what this checks; it is every photo that existed
-- when the migration ran.

SELECT is(
  (SELECT count(*)::int FROM public."InspectionPhotos" p
     JOIN public."WorkTrackers" wt
       ON p.inspection_uuid IN (wt.pre_inspection_uuid, wt.post_inspection_uuid)
    WHERE wt.driver_uuid IS NOT NULL AND p.created_by_driver_uuid IS NULL),
  0,
  'every photo of an inspection a driver''s trip points at has a driver'
);

SELECT * FROM finish();
ROLLBACK;
