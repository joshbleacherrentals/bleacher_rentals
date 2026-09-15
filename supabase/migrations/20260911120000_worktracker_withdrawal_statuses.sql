-- ============================================================================
-- Two new `worktracker_status` values: 'declined' and 'abandoned'.
--
-- A driver had exactly one way to step away from work — the mobile app's Skip
-- button, which wrote 'cancelled', the same value the office writes when IT
-- calls a job off. The board could therefore not tell "the office cancelled
-- this" from "the driver would not take it", nor either of those from "the
-- driver started and walked away", which is the one the office has to react to
-- within the hour.
--
--   declined  — the driver was offered the work and never took it on
--   abandoned — the driver took it on and handed it back, started or not
--
-- This file adds nothing but the enum values. ALTER TYPE ... ADD VALUE commits
-- before any statement may USE the new value, so the columns and the trigger
-- that reference them live in the migration that follows this one.
-- ============================================================================

alter type worktracker_status add value if not exists 'declined';
alter type worktracker_status add value if not exists 'abandoned';
