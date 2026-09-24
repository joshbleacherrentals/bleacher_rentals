-- ============================================================================
-- Tests for WorkTrackers.{pickup,dropoff}_event_uuid — server-computed event
-- links, replacing the phone-side heuristic in resolveLegEvent.ts.
-- Migration: 20260922140000_work_tracker_event_links.sql
-- Spec: br_driver/docs/specs/event-bleacher-roster.md §4
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/work_tracker_event_links.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Seam S7: address_text_matches — rule #3, pure (no table reads). The
-- threshold (0.34) and the two known false-positive classes below were
-- calibrated against the dev database's hand-geocoded coordinates
-- (2026-09-22): 99.35% recall, 2.28% false positives on the actual runtime
-- candidate set. Both known-FP pairs are asserted here as MATCHING on
-- purpose — see §4.3 — so a future threshold change shows exactly what it
-- moves, instead of silently drifting.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(49);

-- ── Index: same ZIP prefix matches regardless of street text ───────────────

SELECT ok(
  address_text_matches('completely different street', 'L7K 0Y5', 'nothing alike here', 'L7K 0Y5'),
  'same ZIP index matches even with unrelated street text'
);

SELECT ok(
  address_text_matches('123 Main St', NULL, '123 Main St', NULL),
  'identical street text matches via shared words even with no ZIP on either side'
);

SELECT ok(
  NOT address_text_matches('123 Main St', '', '456 Other Ave', ''),
  'blank ZIP on both sides never counts as an index match, and unrelated streets do not match on words either'
);

-- ── Real matching pairs from the spec (different formats, same place) ──────

SELECT ok(
  address_text_matches(
    'Essa Agriplex - Home of the Barrie Fair, 10th Line', 'L0L 1B4',
    '7505 10th Line, Thornton', 'L0L 1B4'
  ),
  'venue-name format matches a plain street-number format when the ZIP agrees (words alone are too thin here: jaccard 0.2)'
);

SELECT ok(
  address_text_matches('500 Elm Street, Springfield', NULL, '500 Elm St, Springfield', NULL),
  'shared street words alone (no ZIP) are enough when they clear the threshold'
);

-- ── A real non-matching pair ─────────────────────────────────────────────────

SELECT ok(
  NOT address_text_matches('Fort Erie, ON', NULL, 'Syracuse, NY', NULL),
  'unrelated places do not match'
);

-- ── Directions are words, not stopwords ─────────────────────────────────────

SELECT ok(
  public.normalize_street_words('1561 Lake Shore Blvd W') @> ARRAY['w']
    AND NOT (public.normalize_street_words('1561 Lake Shore Blvd W') @> ARRAY['e']),
  'W and E normalize to distinct word sets'
);

SELECT ok(
  public.normalize_street_words('17 First St North') @> ARRAY['north']
    AND public.normalize_street_words('17 First St South') @> ARRAY['south'],
  'spelled-out directions are kept too, not just the single-letter form'
);

-- ── Stopwords are dropped ────────────────────────────────────────────────────

SELECT ok(
  NOT (public.normalize_street_words('123 Main Street, Canada') @> ARRAY['street']
    OR public.normalize_street_words('123 Main Street, Canada') @> ARRAY['canada']),
  'street-type and country words are stripped'
);

SELECT is(
  public.normalize_street_words('123 Main St'),
  public.normalize_street_words('123 Main Rd'),
  'st and rd both strip to the same word set (both are stopwords)'
);

-- ── Known false-positive class 1: rural ZIP-index collision ────────────────
-- Timmermans' Ranch and horse stables, Nixon Road, Simcoe, ON vs
-- 1258 Turkey Point Rd, Simcoe, Norfolk County, ON — 11km apart in reality,
-- sharing a ZIP prefix common to a wide rural area. Frozen as a known,
-- accepted false positive (§4.3) so raising the bar on this pair is a
-- conscious choice, not an accident.

SELECT ok(
  address_text_matches(
    'Timmermans'' Ranch and horse stables, Nixon Road, Simcoe, ON', 'N3Y 4K6',
    '1258 Turkey Point Rd, Simcoe, Norfolk County, ON', 'N3Y 4K1'
  ),
  'known false positive: rural ZIP-index collision (Timmermans'' Ranch / Turkey Point Rd, 11km apart) matches -- accepted, see spec section 4.3'
);

-- ── Known false-positive class 2: same street, different direction ─────────
-- 1561 Lake Shore Blvd W vs …E, Toronto — 11km apart, genuinely different
-- ZIPs (so the index correctly disagrees), but the shared house number and
-- street name alone clear the 0.34 threshold. Directions are kept and DO
-- distinguish this pair's word sets (w vs e never overlap) — they just
-- aren't enough on their own once four other words already carry the match.

SELECT ok(
  address_text_matches(
    '1561 Lake Shore Blvd W, Toronto, ON', 'M6K 1J7',
    '1561 Lake Shore Blvd E, Old Toronto, Toronto, ON', 'M4L 3W6'
  ),
  'known false positive: same street number/name, different direction (Lake Shore Blvd W/E, 11km apart) matches -- accepted, see spec section 4.3'
);

-- ── Threshold boundary ───────────────────────────────────────────────────────

SELECT ok(
  address_text_matches('a b c', NULL, 'a b d', NULL),
  'jaccard 0.5 (2 shared of 4 union words) clears the 0.34 threshold'
);

SELECT ok(
  NOT address_text_matches('a b c d e', NULL, 'a x y z w', NULL),
  'low overlap (jaccard 1/9 = 0.11) does not match'
);

-- ── addresses_match: thin wrapper over real Addresses rows ─────────────────

CREATE TEMP TABLE _addr AS
SELECT gen_random_uuid() AS a_id, gen_random_uuid() AS b_id, gen_random_uuid() AS c_id;

INSERT INTO "Addresses" (id, street, city, state_province, zip_postal)
SELECT a_id, '215 Sydney Washer Road', 'Dover', 'FL', '33527' FROM _addr
UNION ALL
SELECT b_id, 'Greater Hillsborough County Fair, 215 Sydney Washer Rd', 'Dover', 'FL', '33527' FROM _addr
UNION ALL
SELECT c_id, '9999 Nowhere Ln', 'Fargo', 'ND', '58102' FROM _addr;

SELECT ok(
  addresses_match((SELECT a_id FROM _addr), (SELECT b_id FROM _addr)),
  'addresses_match reads street/zip_postal off two real Addresses rows and matches'
);

SELECT ok(
  NOT addresses_match((SELECT a_id FROM _addr), (SELECT c_id FROM _addr)),
  'addresses_match correctly rejects two unrelated Addresses rows'
);

SELECT ok(
  NOT addresses_match((SELECT a_id FROM _addr), gen_random_uuid()),
  'addresses_match is false, not an error, when one id does not exist'
);

-- ── normalize_street_words / address_zip_index edge cases ──────────────────

SELECT is(
  public.normalize_street_words(NULL),
  ARRAY[]::text[],
  'normalize_street_words on NULL returns an empty array, not an error'
);

SELECT is(
  public.address_zip_index(NULL),
  NULL,
  'address_zip_index on NULL is NULL'
);

SELECT is(
  public.address_zip_index('l7k 0y5'),
  public.address_zip_index('L7K0Y5'),
  'address_zip_index ignores case and punctuation'
);

SELECT is(
  public.address_zip_index('AB'),
  'ab',
  'address_zip_index of a string shorter than 5 chars just uses what is there'
);

-- ============================================================================
-- Seam S8: resolve_work_tracker_dropoff_event / resolve_work_tracker_pickup_event
-- (spec section 4.4) — which event a tracker's leg belongs to, given its
-- assigned bleacher, its date, and one of its addresses.
-- ============================================================================

CREATE TEMP TABLE _s8_addr AS
SELECT gen_random_uuid() AS match_addr, gen_random_uuid() AS other_addr;

INSERT INTO "Addresses" (id, street, city, state_province, zip_postal)
SELECT match_addr, '100 Fairgrounds Rd', 'Springfield', 'IL', '62701' FROM _s8_addr
UNION ALL
SELECT other_addr, '900 Warehouse Way', 'Springfield', 'IL', '62704' FROM _s8_addr;

-- Helper: a fresh bleacher per scenario, so BleacherEvents scoping between
-- scenarios can never leak into each other.
CREATE OR REPLACE FUNCTION pg_temp.new_bleacher() RETURNS uuid AS $$
  INSERT INTO "Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
  VALUES ((SELECT coalesce(max(bleacher_number), 0) + 1 FROM "Bleachers"), 5, 50)
  RETURNING id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.new_event(
  p_start date, p_end date, p_address uuid,
  p_status text DEFAULT 'booked', p_deleted boolean DEFAULT false
) RETURNS uuid AS $$
  INSERT INTO "Events" (event_name, event_start, event_end, lenient, must_be_clean,
                         address_uuid, event_status, deleted)
  VALUES ('S8 test event', p_start, p_end, false, false,
          p_address, p_status::event_status, p_deleted)
  RETURNING id;
$$ LANGUAGE sql;

-- ── Picks the earliest matching future event, not just any matching one ────

CREATE TEMP TABLE _s8_1 AS
SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s8_1 ADD COLUMN near_event uuid, ADD COLUMN far_event uuid;
UPDATE _s8_1 SET
  near_event = pg_temp.new_event('2026-10-05', '2026-10-07', (SELECT match_addr FROM _s8_addr)),
  far_event = pg_temp.new_event('2026-11-01', '2026-11-03', (SELECT match_addr FROM _s8_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, near_event FROM _s8_1
UNION ALL
SELECT bleacher, far_event FROM _s8_1;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_1), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  (SELECT near_event FROM _s8_1),
  'drop-off resolves to the earliest matching future event, not a later one on the same bleacher'
);

-- ── Picks the latest matching past event ────────────────────────────────────

CREATE TEMP TABLE _s8_2 AS
SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s8_2 ADD COLUMN older_event uuid, ADD COLUMN newer_event uuid;
UPDATE _s8_2 SET
  older_event = pg_temp.new_event('2026-08-01', '2026-08-03', (SELECT match_addr FROM _s8_addr)),
  newer_event = pg_temp.new_event('2026-09-01', '2026-09-03', (SELECT match_addr FROM _s8_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, older_event FROM _s8_2
UNION ALL
SELECT bleacher, newer_event FROM _s8_2;

SELECT is(
  public.resolve_work_tracker_pickup_event((SELECT bleacher FROM _s8_2), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  (SELECT newer_event FROM _s8_2),
  'pick-up resolves to the latest matching past event, not an earlier one on the same bleacher'
);

-- ── Address has to match; date proximity alone is not enough ───────────────

CREATE TEMP TABLE _s8_3 AS
SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s8_3 ADD COLUMN wrong_address_event uuid, ADD COLUMN right_address_event uuid;
UPDATE _s8_3 SET
  wrong_address_event = pg_temp.new_event('2026-09-21', '2026-09-22', (SELECT other_addr FROM _s8_addr)),
  right_address_event = pg_temp.new_event('2026-10-10', '2026-10-12', (SELECT match_addr FROM _s8_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, wrong_address_event FROM _s8_3
UNION ALL
SELECT bleacher, right_address_event FROM _s8_3;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_3), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  (SELECT right_address_event FROM _s8_3),
  'skips a nearer event whose address does not match and picks the further one that does'
);

-- ── Deleted events are ignored ──────────────────────────────────────────────

CREATE TEMP TABLE _s8_4 AS SELECT pg_temp.new_bleacher() AS bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, pg_temp.new_event('2026-09-25', '2026-09-27', (SELECT match_addr FROM _s8_addr), 'booked', true) FROM _s8_4;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_4), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'a deleted event never counts, even with a matching address and date'
);

-- ── Non-booked events are ignored ───────────────────────────────────────────

CREATE TEMP TABLE _s8_5 AS SELECT pg_temp.new_bleacher() AS bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, pg_temp.new_event('2026-09-25', '2026-09-27', (SELECT match_addr FROM _s8_addr), 'quoted') FROM _s8_5;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_5), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'a quoted (not booked) event never counts'
);

-- ── Only the given bleacher's own calendar is searched ──────────────────────

CREATE TEMP TABLE _s8_6 AS SELECT pg_temp.new_bleacher() AS this_bleacher, pg_temp.new_bleacher() AS other_bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT other_bleacher, pg_temp.new_event('2026-09-25', '2026-09-27', (SELECT match_addr FROM _s8_addr)) FROM _s8_6;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT this_bleacher FROM _s8_6), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'an event booked on a different bleacher never answers this bleacher''s lookup'
);

-- ── Boundaries: event_start = date counts for drop-off (>=) ────────────────

CREATE TEMP TABLE _s8_7 AS
SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s8_7 ADD COLUMN ev uuid;
UPDATE _s8_7 SET ev = pg_temp.new_event('2026-09-20', '2026-09-22', (SELECT match_addr FROM _s8_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid) SELECT bleacher, ev FROM _s8_7;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_7), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  (SELECT ev FROM _s8_7),
  'an event starting exactly on the trip date counts for drop-off'
);

-- ── Boundaries: event_end = date counts for pick-up (<=) ───────────────────

CREATE TEMP TABLE _s8_8 AS
SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s8_8 ADD COLUMN ev uuid;
UPDATE _s8_8 SET ev = pg_temp.new_event('2026-09-18', '2026-09-20', (SELECT match_addr FROM _s8_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid) SELECT bleacher, ev FROM _s8_8;

SELECT is(
  public.resolve_work_tracker_pickup_event((SELECT bleacher FROM _s8_8), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  (SELECT ev FROM _s8_8),
  'an event ending exactly on the trip date counts for pick-up'
);

-- ── A run to storage (no matching event anywhere) resolves to NULL ─────────

CREATE TEMP TABLE _s8_9 AS SELECT pg_temp.new_bleacher() AS bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, pg_temp.new_event('2026-09-25', '2026-09-27', (SELECT other_addr FROM _s8_addr)) FROM _s8_9;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_9), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'no address-matching event on the bleacher resolves to NULL, not an error'
);

-- ── A bleacher with no events booked at all resolves to NULL ───────────────

CREATE TEMP TABLE _s8_10 AS SELECT pg_temp.new_bleacher() AS bleacher;

SELECT is(
  public.resolve_work_tracker_pickup_event((SELECT bleacher FROM _s8_10), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'a bleacher with no BleacherEvents rows at all resolves to NULL'
);

-- ── Drop-off never picks an event that already started before the date ─────

CREATE TEMP TABLE _s8_11 AS SELECT pg_temp.new_bleacher() AS bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, pg_temp.new_event('2026-09-10', '2026-09-12', (SELECT match_addr FROM _s8_addr)) FROM _s8_11;

SELECT is(
  public.resolve_work_tracker_dropoff_event((SELECT bleacher FROM _s8_11), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'drop-off ignores a matching event that already started before the trip date'
);

-- ── Pick-up never picks an event that has not ended by the date ────────────

CREATE TEMP TABLE _s8_12 AS SELECT pg_temp.new_bleacher() AS bleacher;
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, pg_temp.new_event('2026-09-25', '2026-09-27', (SELECT match_addr FROM _s8_addr)) FROM _s8_12;

SELECT is(
  public.resolve_work_tracker_pickup_event((SELECT bleacher FROM _s8_12), '2026-09-20'::date, (SELECT match_addr FROM _s8_addr)),
  NULL::uuid,
  'pick-up ignores a matching event that has not ended by the trip date'
);

-- ============================================================================
-- Seam S9: the recompute triggers (spec section 4.5) — one test per row of
-- the "what changed -> who gets recomputed" table, plus the one-time
-- backfill mechanism.
-- ============================================================================

CREATE TEMP TABLE _s9_addr AS
SELECT gen_random_uuid() AS match_addr, gen_random_uuid() AS other_addr;

INSERT INTO "Addresses" (id, street, city, state_province, zip_postal)
SELECT match_addr, '400 Trigger Test Rd', 'Peoria', 'IL', '61601' FROM _s9_addr
UNION ALL
SELECT other_addr, '999 Unrelated Ave', 'Peoria', 'IL', '61602' FROM _s9_addr;

CREATE TEMP TABLE _s9 AS SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s9 ADD COLUMN event1 uuid, ADD COLUMN tracker1 uuid;
UPDATE _s9 SET event1 = pg_temp.new_event('2026-10-05', '2026-10-07', (SELECT match_addr FROM _s9_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid) SELECT bleacher, event1 FROM _s9;

-- ── Row 1: WorkTrackers self (date/bleacher/address) — insert ──────────────

INSERT INTO "WorkTrackers" (id, status, date, bleacher_uuid, dropoff_address_uuid, pickup_address_uuid)
SELECT gen_random_uuid(), 'released', '2026-09-20', bleacher, (SELECT match_addr FROM _s9_addr), (SELECT other_addr FROM _s9_addr)
FROM _s9;

UPDATE _s9 SET tracker1 = (
  SELECT id FROM "WorkTrackers"
   WHERE bleacher_uuid = (SELECT bleacher FROM _s9) AND date = '2026-09-20'
   ORDER BY created_at DESC LIMIT 1
);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  (SELECT event1 FROM _s9),
  'inserting a WorkTrackers row populates dropoff_event_uuid via the trigger, with no manual resolve_* call'
);

-- ── Row 1: WorkTrackers self — update (date moves the tracker out of range) ─

UPDATE "WorkTrackers" SET date = '2026-12-25' WHERE id = (SELECT tracker1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  NULL::uuid,
  'updating date off the matching event''s range recomputes dropoff_event_uuid to NULL'
);

-- put it back in range for the rest of the scenarios
UPDATE "WorkTrackers" SET date = '2026-09-20' WHERE id = (SELECT tracker1 FROM _s9);

-- ── Row 1: WorkTrackers self — update (address starts matching) ────────────

SELECT ok(
  (SELECT pickup_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)) IS NULL,
  'sanity: pickup_event_uuid starts NULL (pickup_address_uuid points at the unrelated address)'
);

UPDATE "WorkTrackers" SET pickup_address_uuid = (SELECT match_addr FROM _s9_addr)
 WHERE id = (SELECT tracker1 FROM _s9);

SELECT is(
  (SELECT pickup_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  NULL::uuid,
  'pickup stays NULL: the event starts 2026-10-05, after the 2026-09-20 trip date, so it is a drop-off match only'
);

-- ── Row 2: Addresses, direct reference ──────────────────────────────────────
-- dropoff_address_uuid points straight at match_addr; edit ITS street and the
-- tracker must recompute even though nothing about the tracker row changed.

UPDATE "Addresses" SET street = '400 Trigger Test Road (renamed)'
 WHERE id = (SELECT match_addr FROM _s9_addr);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  (SELECT event1 FROM _s9),
  'editing the street of an address a tracker points at directly still resolves it correctly (self-consistent match survives the edit)'
);

-- ── Row 2: Addresses, indirect via an event's address ───────────────────────
-- A second tracker whose own dropoff address does NOT textually match
-- match_addr's ORIGINAL street, but does match a wording that address is
-- about to be edited to. This proves the cascade reaches trackers of
-- bleachers whose EVENT uses the edited address, not just direct references.

CREATE TEMP TABLE _s9b_addr AS SELECT gen_random_uuid() AS event_addr, gen_random_uuid() AS tracker_addr;
INSERT INTO "Addresses" (id, street, city, state_province, zip_postal)
SELECT event_addr, 'Original Fairgrounds Wording', 'Dayton', 'OH', '45401' FROM _s9b_addr
UNION ALL
SELECT tracker_addr, '55 Renamed Fairgrounds Rd', 'Dayton', 'OH', '45402' FROM _s9b_addr;

CREATE TEMP TABLE _s9b AS SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s9b ADD COLUMN event1 uuid, ADD COLUMN tracker1 uuid;
UPDATE _s9b SET event1 = pg_temp.new_event('2026-10-05', '2026-10-07', (SELECT event_addr FROM _s9b_addr));
INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid) SELECT bleacher, event1 FROM _s9b;

INSERT INTO "WorkTrackers" (id, status, date, bleacher_uuid, dropoff_address_uuid, pickup_address_uuid)
SELECT gen_random_uuid(), 'released', '2026-09-20', bleacher, (SELECT tracker_addr FROM _s9b_addr), NULL
FROM _s9b;
UPDATE _s9b SET tracker1 = (
  SELECT id FROM "WorkTrackers" WHERE bleacher_uuid = (SELECT bleacher FROM _s9b) LIMIT 1
);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9b)),
  NULL::uuid,
  'sanity: before the edit, the event''s address wording does not match the tracker''s'
);

UPDATE "Addresses" SET street = '55 Renamed Fairgrounds Road'
 WHERE id = (SELECT event_addr FROM _s9b_addr);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9b)),
  (SELECT event1 FROM _s9b),
  'editing an EVENT''s address (not the tracker''s own) recomputes trackers of bleachers booked into that event'
);

-- ── Row 3: Events (dates/status/deleted/address_uuid) ───────────────────────

-- No time window exists in this rule (unlike the old heuristic) -- a future
-- date alone never disqualifies a candidate, so the only way to knock this
-- event out of drop-off eligibility is to move it to START BEFORE the trip.
UPDATE "Events" SET event_start = '2026-08-01', event_end = '2026-08-03'
 WHERE id = (SELECT event1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  NULL::uuid,
  'moving the linked event to start before the trip date recomputes the tracker to NULL'
);

UPDATE "Events" SET event_start = '2026-10-05', event_end = '2026-10-07'
 WHERE id = (SELECT event1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  (SELECT event1 FROM _s9),
  'sanity: moving the event''s dates back in range recomputes the match again'
);

UPDATE "Events" SET deleted = true WHERE id = (SELECT event1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  NULL::uuid,
  'marking the linked event deleted recomputes the tracker to NULL'
);

UPDATE "Events" SET deleted = false WHERE id = (SELECT event1 FROM _s9);

-- ── Row 4: BleacherEvents insert/update/delete ──────────────────────────────

DELETE FROM "BleacherEvents" WHERE bleacher_uuid = (SELECT bleacher FROM _s9) AND event_uuid = (SELECT event1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  NULL::uuid,
  'deleting the BleacherEvents row recomputes the tracker to NULL (the event is no longer booked for this bleacher)'
);

INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid)
SELECT bleacher, event1 FROM _s9;

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker1 FROM _s9)),
  (SELECT event1 FROM _s9),
  'inserting a BleacherEvents row recomputes trackers of that bleacher to pick up the newly booked event'
);

-- ── One-time backfill mechanism ──────────────────────────────────────────────
-- Simulates a row that existed before the migration: written with the
-- trigger disabled, so it starts out NULL despite matching, then the
-- migration's bulk recompute (an UPDATE, same as refresh_work_tracker_event_links
-- does) picks it up in one pass, exactly like the real backfill will for
-- every pre-existing row.

ALTER TABLE "WorkTrackers" DISABLE TRIGGER work_tracker_event_links_recompute;

INSERT INTO "WorkTrackers" (id, status, date, bleacher_uuid, dropoff_address_uuid, pickup_address_uuid)
SELECT gen_random_uuid(), 'released', '2026-09-20', bleacher, (SELECT match_addr FROM _s9_addr), NULL
FROM _s9;

ALTER TABLE "WorkTrackers" ENABLE TRIGGER work_tracker_event_links_recompute;

CREATE TEMP TABLE _s9_stale AS
SELECT id FROM "WorkTrackers"
 WHERE bleacher_uuid = (SELECT bleacher FROM _s9)
   AND dropoff_address_uuid = (SELECT match_addr FROM _s9_addr)
   AND id <> (SELECT tracker1 FROM _s9);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT id FROM _s9_stale)),
  NULL::uuid,
  'sanity: with the trigger disabled at insert time, the row starts out unlinked despite matching'
);

UPDATE "WorkTrackers" SET updated_at = now() WHERE id = (SELECT id FROM _s9_stale);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT id FROM _s9_stale)),
  (SELECT event1 FROM _s9),
  'the same bulk-update mechanism the migration''s one-time backfill uses recomputes a pre-existing row'
);

-- ============================================================================
-- Regression: a web-app write runs as `authenticated`, not `postgres`, and
-- every test above ran as `postgres` (superuser), which ignores GRANT/REVOKE
-- entirely. `resolve_work_tracker_{pickup,dropoff}_event` had EXECUTE
-- revoked from authenticated/anon (intentional -- they are internal helpers,
-- not an RPC). The BEFORE trigger that calls them must be SECURITY DEFINER,
-- same as the AFTER cascade triggers already are, or that revoke blocks the
-- trigger itself: "permission denied for function
-- resolve_work_tracker_dropoff_event" on every WorkTrackers write from the
-- web app or the driver app. Caught live against the web app (2026-09-22)
-- before this test existed -- see spec section 4.5 implementation notes.
-- ============================================================================

CREATE TEMP TABLE _s10 AS SELECT pg_temp.new_bleacher() AS bleacher;
ALTER TABLE _s10 ADD COLUMN event1 uuid, ADD COLUMN admin_clerk_id text, ADD COLUMN admin_user_id uuid, ADD COLUMN match_addr uuid;

UPDATE _s10 SET admin_clerk_id = 'clerk_s10_admin_' || gen_random_uuid()::text;

WITH ins AS (
  INSERT INTO "Addresses" (id, street, city, state_province, zip_postal)
  VALUES (gen_random_uuid(), '700 Privilege Check Rd', 'Peoria', 'IL', '61603')
  RETURNING id
)
UPDATE _s10 SET match_addr = ins.id FROM ins;

UPDATE _s10 SET event1 = pg_temp.new_event('2026-10-05', '2026-10-07', match_addr);

INSERT INTO "BleacherEvents" (bleacher_uuid, event_uuid) SELECT bleacher, event1 FROM _s10;

WITH ins AS (
  INSERT INTO "Users" (first_name, last_name, email, clerk_user_id, is_admin)
  SELECT 'S10', 'Admin', 'wtel_s10_admin@test.com', admin_clerk_id, true FROM _s10
  RETURNING id
)
UPDATE _s10 SET admin_user_id = ins.id FROM ins;

CREATE TEMP TABLE _s10_result (ok boolean, message text, tracker_id uuid);

-- Temp tables are owned by `postgres`; the role switch below needs explicit
-- access, same as any other cross-role object.
GRANT SELECT ON _s10 TO authenticated;
GRANT SELECT, INSERT ON _s10_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT admin_clerk_id FROM _s10))::text, true);

DO $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO "WorkTrackers" (id, status, date, bleacher_uuid, dropoff_address_uuid, pickup_address_uuid, created_by_user_uuid)
  SELECT gen_random_uuid(), 'released', '2026-09-20', bleacher, match_addr, NULL, admin_user_id
    FROM _s10
  RETURNING id INTO new_id;
  INSERT INTO _s10_result VALUES (true, null, new_id);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _s10_result VALUES (false, SQLERRM, null);
END;
$$;

RESET ROLE;

SELECT ok(
  (SELECT ok FROM _s10_result),
  coalesce('a web-app write (authenticated role) does not hit permission denied on the event-link trigger -- got: ' || (SELECT message FROM _s10_result), 'a web-app write (authenticated role) does not hit permission denied on the event-link trigger')
);

SELECT is(
  (SELECT dropoff_event_uuid FROM "WorkTrackers" WHERE id = (SELECT tracker_id FROM _s10_result)),
  (SELECT event1 FROM _s10),
  'and once it is allowed to run, the trigger still resolves the event correctly under the authenticated role'
);

SELECT * FROM finish();
ROLLBACK;
