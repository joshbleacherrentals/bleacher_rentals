-- ============================================================================
-- Tests for the finished-trip snapshot, WorkTrackers.history_json.
-- Migration: 20260918120000_work_tracker_history_snapshot.sql
-- Spec: br_driver/docs/specs/sync-bucket-limit.md
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/work_tracker_history_snapshot.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- The driver app stops syncing a trip's addresses, line items and inspections
-- once the trip is finished (completed, declined or abandoned) — those JOINs
-- cost one PowerSync bucket per trip. The snapshot is what Trip History reads
-- instead, so it has to exist the moment a trip finishes and follow every
-- later office edit.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(19);

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Drivers" (id) VALUES
  ('d0000000-0000-0000-0000-000000000001');

INSERT INTO public."Addresses" (id, street, city, state_province, zip_postal) VALUES
  ('a0000000-0000-0000-0000-000000000001', '123 Main St', 'Calgary', 'AB', 'T2P 1J9'),
  ('a0000000-0000-0000-0000-000000000002', '9 Stadium Rd', 'Edmonton', 'AB', NULL);

-- ── Finishing a trip snapshots both addresses ───────────────────────────────

INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pickup_address_uuid, dropoff_address_uuid)
VALUES ('10000000-0000-0000-0000-000000000001', 'dropoff_inspection',
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002');

UPDATE public."WorkTrackers" SET status = 'completed'
 WHERE id = '10000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT jsonb_build_object(
            'pick_up_address', history_json -> 'pick_up_address',
            'drop_off_address', history_json -> 'drop_off_address')
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000001'),
  '{"pick_up_address": "123 Main St, Calgary, AB T2P 1J9",
    "drop_off_address": "9 Stadium Rd, Edmonton, AB"}'::jsonb,
  'completing a trip snapshots both addresses as "street, city, state zip", skipping a missing zip'
);

-- ── Line items: decimal quantity, oldest first; none is an empty list ──────

SELECT is(
  (SELECT history_json -> 'line_items' FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000001'),
  '[]'::jsonb,
  'a finished trip with no line items snapshots an empty list, not null'
);

INSERT INTO public."WorkTrackers" (id, status, driver_uuid)
VALUES ('10000000-0000-0000-0000-000000000002', 'dropoff_inspection',
        'd0000000-0000-0000-0000-000000000001');

INSERT INTO public."WorkTrackerLineItems"
  (id, work_tracker_uuid, type, qty_decimal, unit_amt_cents, description, created_at) VALUES
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   'setup', 1, 5000, 'Setup', '2026-09-01 10:00:00+00'),
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
   'hauling', 198.8, 300, '198.8MI × $3.00/MI = $596.36', '2026-09-01 09:00:00+00');

UPDATE public."WorkTrackers" SET status = 'completed'
 WHERE id = '10000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT history_json -> 'line_items' FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000002'),
  '[{"type": "hauling", "quantity": 198.8, "unit_amt_cents": 300,
     "description": "198.8MI × $3.00/MI = $596.36"},
    {"type": "setup", "quantity": 1.0, "unit_amt_cents": 5000,
     "description": "Setup"}]'::jsonb,
  'line items are snapshotted oldest first, with the decimal quantity'
);

-- ── Inspections: the row as it is, answers_json kept a string ──────────────

INSERT INTO public."WorkTrackerInspections"
  (id, created_at, walk_around_complete, issues_found, issue_description, answers_json) VALUES
  ('f0000000-0000-0000-0000-000000000001', '2026-09-01 08:00:00+00',
   true, false, NULL, '{"q1":{"checked":true}}');

INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pre_inspection_uuid)
VALUES ('10000000-0000-0000-0000-000000000003', 'dropoff_inspection',
        'd0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000001');

UPDATE public."WorkTrackers" SET status = 'completed'
 WHERE id = '10000000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT jsonb_build_object('pre', history_json -> 'pre_inspection',
                             'post', history_json -> 'post_inspection')
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000003'),
  '{"pre": {"id": "f0000000-0000-0000-0000-000000000001",
            "created_at": "2026-09-01T08:00:00+00:00",
            "walk_around_complete": true, "issues_found": false,
            "issue_description": null,
            "answers_json": "{\"q1\":{\"checked\":true}}",
            "bleacher_uuid": null},
    "post": null}'::jsonb,
  'the pre-inspection is snapshotted whole, answers_json as a string; a missing post is null'
);

-- ── Every way of finishing counts; only finished trips carry one ───────────

INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pickup_address_uuid) VALUES
  ('10000000-0000-0000-0000-000000000004', 'released',
   'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000005', 'accepted',
   'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

SELECT is(
  (SELECT history_json FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000004'),
  NULL,
  'an active trip has no snapshot'
);

UPDATE public."WorkTrackers" SET status = 'declined'
 WHERE id = '10000000-0000-0000-0000-000000000004';
UPDATE public."WorkTrackers" SET status = 'abandoned'
 WHERE id = '10000000-0000-0000-0000-000000000005';

SELECT is(
  (SELECT array_agg(history_json ->> 'pick_up_address' ORDER BY id)
     FROM public."WorkTrackers"
    WHERE id IN ('10000000-0000-0000-0000-000000000004',
                 '10000000-0000-0000-0000-000000000005')),
  ARRAY['123 Main St, Calgary, AB T2P 1J9', '123 Main St, Calgary, AB T2P 1J9'],
  'declining and abandoning snapshot the trip too'
);

SELECT is(
  (SELECT (history_json -> 'version')::int FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000004'),
  1,
  'the snapshot carries its shape version'
);

-- The office reopens a trip by clearing the finish time; it is active again.
UPDATE public."WorkTrackers" SET status = 'accepted', declined_at = NULL
 WHERE id = '10000000-0000-0000-0000-000000000004';

SELECT is(
  (SELECT history_json FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000004'),
  NULL,
  'a reopened trip drops its snapshot'
);

-- ── Office edits to line items after the trip finished ─────────────────────
-- Trip …02 is completed with hauling + setup (above).

INSERT INTO public."WorkTrackerLineItems"
  (id, work_tracker_uuid, type, qty_decimal, unit_amt_cents, description, created_at) VALUES
  ('e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   'per_diem', 1, 7500, 'Per diem', '2026-09-02 09:00:00+00');

SELECT is(
  (SELECT jsonb_path_query_array(history_json, '$.line_items[*].type')
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000002'),
  '["hauling", "setup", "per_diem"]'::jsonb,
  'a line item added after completion appears in the snapshot'
);

UPDATE public."WorkTrackerLineItems" SET unit_amt_cents = 9000
 WHERE id = 'e0000000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT history_json #> '{line_items,2,unit_amt_cents}'
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000002'),
  '9000'::jsonb,
  'a line item edited after completion is updated in the snapshot'
);

DELETE FROM public."WorkTrackerLineItems"
 WHERE id = 'e0000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT jsonb_path_query_array(history_json, '$.line_items[*].type')
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000002'),
  '["hauling", "per_diem"]'::jsonb,
  'a line item deleted after completion leaves the snapshot'
);

-- Moving the per diem from trip …02 to the completed trip …01.
UPDATE public."WorkTrackerLineItems"
   SET work_tracker_uuid = '10000000-0000-0000-0000-000000000001'
 WHERE id = 'e0000000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT jsonb_agg(jsonb_path_query_array(history_json, '$.line_items[*].type') ORDER BY id)
     FROM public."WorkTrackers"
    WHERE id IN ('10000000-0000-0000-0000-000000000001',
                 '10000000-0000-0000-0000-000000000002')),
  '[["per_diem"], ["hauling"]]'::jsonb,
  'a line item moved between finished trips updates both snapshots'
);

-- A line item on an active trip leaves it without a snapshot.
INSERT INTO public."WorkTrackerLineItems" (work_tracker_uuid, type, unit_amt_cents)
VALUES ('10000000-0000-0000-0000-000000000005', 'custom', 100);
INSERT INTO public."WorkTrackerLineItems" (work_tracker_uuid, type, unit_amt_cents)
VALUES ('10000000-0000-0000-0000-000000000004', 'custom', 100);

SELECT is(
  (SELECT history_json FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000004'),
  NULL,
  'a line item on an active trip does not give it a snapshot'
);

-- ── Office edits to addresses and inspections after the trip finished ──────
-- Address a…01 is the pickup of completed …01, abandoned …05 and reopened …04.

UPDATE public."Addresses" SET street = '125 Main St'
 WHERE id = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT jsonb_agg(history_json -> 'pick_up_address' ORDER BY id)
     FROM public."WorkTrackers"
    WHERE id IN ('10000000-0000-0000-0000-000000000001',
                 '10000000-0000-0000-0000-000000000004',
                 '10000000-0000-0000-0000-000000000005')),
  '["125 Main St, Calgary, AB T2P 1J9", null, "125 Main St, Calgary, AB T2P 1J9"]'::jsonb,
  'an address edit reaches every finished trip that uses it, and no active one'
);

UPDATE public."WorkTrackerInspections" SET issues_found = true, issue_description = 'Bent rail'
 WHERE id = 'f0000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT history_json #>> '{pre_inspection,issue_description}'
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000003'),
  'Bent rail',
  'an inspection edit after completion is updated in the snapshot'
);

-- A post-inspection linked after the trip is already completed.
INSERT INTO public."WorkTrackerInspections" (id, walk_around_complete)
VALUES ('f0000000-0000-0000-0000-000000000002', true);
UPDATE public."WorkTrackers" SET post_inspection_uuid = 'f0000000-0000-0000-0000-000000000002'
 WHERE id = '10000000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT history_json #>> '{post_inspection,id}'
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000003'),
  'f0000000-0000-0000-0000-000000000002',
  'an inspection linked after completion is added to the snapshot'
);

-- ── Edits made by a driver, under RLS ───────────────────────────────────────
-- Addresses are shared and drivers may update them. A driver fixing an address
-- must refresh every driver's finished trip there, not just the rows their own
-- RLS lets them see.

INSERT INTO public."Users" (id, email, clerk_user_id) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'snapshot-driver-2@example.com', 'clerk_snapshot_driver_2');
INSERT INTO public."Drivers" (id, user_uuid) VALUES
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"clerk_snapshot_driver_2"}', true);

UPDATE public."Addresses" SET street = '127 Main St'
 WHERE id = 'a0000000-0000-0000-0000-000000000001';

RESET ROLE;

SELECT is(
  (SELECT history_json ->> 'pick_up_address' FROM public."WorkTrackers"
    WHERE id = '10000000-0000-0000-0000-000000000001'),
  '127 Main St, Calgary, AB T2P 1J9',
  'another driver fixing a shared address still refreshes this driver''s finished trip'
);

-- The everyday path: the driver's own phone uploads the completion.
INSERT INTO public."WorkTrackers" (id, status, driver_uuid, pickup_address_uuid)
VALUES ('10000000-0000-0000-0000-000000000006', 'dropoff_inspection',
        'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002');
INSERT INTO public."WorkTrackerLineItems" (work_tracker_uuid, type, unit_amt_cents, description)
VALUES ('10000000-0000-0000-0000-000000000006', 'hauling', 300, 'Hauling');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"clerk_snapshot_driver_2"}', true);

UPDATE public."WorkTrackers" SET status = 'completed'
 WHERE id = '10000000-0000-0000-0000-000000000006';

RESET ROLE;

SELECT is(
  (SELECT jsonb_build_object('address', history_json -> 'pick_up_address',
                             'line_items', jsonb_path_query_array(history_json, '$.line_items[*].description'))
     FROM public."WorkTrackers" WHERE id = '10000000-0000-0000-0000-000000000006'),
  '{"address": "9 Stadium Rd, Edmonton, AB", "line_items": ["Hauling"]}'::jsonb,
  'a driver completing their own trip from the phone gets a full snapshot'
);

-- ── Backfill: every trip that existed when the migration ran ───────────────

SELECT is(
  (SELECT count(*)::int FROM public."WorkTrackers" wt
    WHERE (wt.history_json IS NOT NULL) <> (wt.completed_at IS NOT NULL
                                           OR wt.declined_at IS NOT NULL
                                           OR wt.abandoned_at IS NOT NULL)),
  0,
  'every finished trip has a snapshot and no active trip has one'
);

SELECT * FROM finish();
ROLLBACK;
