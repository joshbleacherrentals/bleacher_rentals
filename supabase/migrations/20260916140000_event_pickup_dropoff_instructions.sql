-- ============================================================================
-- Events.pickup_instructions / dropoff_instructions
--
-- Driver-facing notes about this event's single venue at two different
-- moments — NOT the two ends of one truck trip like the identically-named
-- columns on WorkTrackers:
--   pickup_instructions  — notes for picking bleachers UP from this venue,
--                           i.e. after the event ends (teardown/removal).
--   dropoff_instructions — notes for dropping bleachers OFF at this venue,
--                           i.e. before the event starts (setup/delivery).
--
-- See docs/specs/event-pickup-dropoff-instructions.md for the locate-from-
-- neighbour-event feature this backs.
-- ============================================================================

alter table public."Events"
  add column if not exists pickup_instructions text null,
  add column if not exists dropoff_instructions text null;

comment on column public."Events".pickup_instructions is
  'Notes for the driver picking bleachers up from this venue (after the event ends).';
comment on column public."Events".dropoff_instructions is
  'Notes for the driver dropping bleachers off at this venue (before the event starts).';
