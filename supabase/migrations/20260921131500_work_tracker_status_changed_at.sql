-- ============================================================================
-- WorkTrackers.status_changed_at — when the status last actually changed.
--
-- The driver app's event roster (br_driver/docs/specs/event-bleacher-roster.md)
-- tells a driver what the other drivers at the same event are doing, and since
-- when, so they can answer "when are the others coming?".
--
-- Nothing recorded that moment. `accepted_at`, `started_at`, `completed_at`,
-- `declined_at` and `abandoned_at` cover only five of the transitions —
-- `pickup_inspection`, `dest_dropoff` and `dropoff_inspection` have none — and
-- `updated_at` moves whenever the office edits a note or a pay amount, which
-- would read on the driver's phone as "that driver moved 2 minutes ago".
--
-- Filled by the existing status-timestamp trigger, which is replaced below
-- rather than joined by a second trigger on the same table: one function owns
-- the status timestamps on this table.
-- ============================================================================

ALTER TABLE public."WorkTrackers"
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamptz;

COMMENT ON COLUMN public."WorkTrackers"."status_changed_at" IS
  'When status last changed. Set by set_worktracker_status_timestamps(); an '
  'UPDATE that supplies its own value keeps it, so a phone that was offline '
  'reports when the driver acted, not when it reconnected.';

-- Backfill: the best evidence each existing row already carries, newest first.
-- `updated_at` is the last resort — wrong in detail, but it bounds the age of
-- the status rather than leaving the app with nothing to show.
UPDATE public."WorkTrackers"
   SET "status_changed_at" = COALESCE(
         "completed_at", "abandoned_at", "declined_at",
         "started_at", "accepted_at", "released_at", "updated_at"
       )
 WHERE "status_changed_at" IS NULL;

CREATE OR REPLACE FUNCTION public.set_worktracker_status_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Always keep updated_at fresh on any change
  new.updated_at := now();

  -- Handle INSERT: no OLD row, so just set based on initial status
  if tg_op = 'INSERT' then
    -- Every tracker has said something since it was created, even if that is
    -- still 'draft'; a NULL here would read as "no status change ever".
    if new.status_changed_at is null then
      new.status_changed_at := now();
    end if;

    if new.status = 'released' and new.released_at is null then
      new.released_at := now();
    end if;

    -- Fixes a copy-paste bug carried since 20260105160017_powersync.sql: this
    -- branch tested `accepted_at` but stamped `released_at`, so a tracker
    -- inserted straight as 'accepted' never got an acceptance time at all.
    -- A tracker that arrives already accepted was released too, by definition,
    -- so both moments are stamped.
    if new.status = 'accepted' then
      if new.released_at is null then
        new.released_at := now();
      end if;

      if new.accepted_at is null then
        new.accepted_at := now();
      end if;
    end if;

    if new.status = 'dest_pickup' and new.started_at is null then
      new.started_at := now();
    end if;

    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    end if;

    if new.status = 'declined' and new.declined_at is null then
      new.declined_at := now();
    end if;

    if new.status = 'abandoned' and new.abandoned_at is null then
      new.abandoned_at := now();
    end if;

    return new;
  end if;

  -- Handle UPDATE: only react when status actually changes
  if new.status is distinct from old.status then

    -- Same rule as the withdrawal timestamps below: a phone that was offline
    -- sends the moment the driver acted, and only an update that says nothing
    -- about it gets stamped with now().
    if new.status_changed_at is not distinct from old.status_changed_at then
      new.status_changed_at := now();
    end if;

    if new.status = 'released' and new.released_at is null then
      new.released_at := now();
    end if;

    if new.status = 'accepted' and new.accepted_at is null then
      new.accepted_at := now();
    end if;

    if new.status = 'dest_pickup' and new.started_at is null then
      new.started_at := now();
    end if;

    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    end if;

    -- A phone that was offline for a day sends the real moment with the row;
    -- only stamp when it did not, or the record says "synced at" instead of
    -- "walked away at".
    if new.status = 'declined' and new.declined_at is null then
      new.declined_at := now();
    end if;

    if new.status = 'abandoned' and new.abandoned_at is null then
      new.abandoned_at := now();
    end if;

    -- We *don't* clear timestamps if you move backwards
    -- (e.g. completed -> cancelled). You can still override manually
    -- by explicitly setting the *_at fields in an UPDATE.
  end if;

  return new;
end;
$function$;
