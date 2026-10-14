-- ============================================================================
-- Putting a withdrawn tracker back on the board clears the withdrawal.
--
-- A driver who declines or abandons a tracker stamps WorkTrackers.declined_at /
-- abandoned_at. The office then takes it back — Back to Draft, fix the date or
-- the address or the driver, flip it to Released — and nothing ever cleared the
-- stamp. The driver app's sync rules (br_powersync, sync_version 2) only send a
-- tracker's addresses, contacts, line items and inspections while
-- completed_at, declined_at and abandoned_at are all NULL, so the driver who
-- was offered the re-released trip — the next one, or the same one — saw a trip
-- with no addresses on it. The same three columns decide
-- is_work_tracker_finished(), so the tracker also kept a stale history_json.
--
-- Fix: a status change to 'draft' or 'released' clears both columns. Both,
-- because a tracker the office takes back is out of the withdrawn state
-- whichever of the two it was in.
--
-- This reverses a choice made in 20260911120100_worktracker_withdrawal_timestamps.sql,
-- which kept the two columns apart so that a tracker a second driver abandoned
-- "still carries the first driver's decline". After this migration the row
-- describes only the latest withdrawal. Nothing reads the older one — the web
-- UI never selects these columns and the sync rules only test them for NULL —
-- but nowhere else keeps it either.
--
-- Deliberately narrow:
--   * Only a status CHANGE clears. The office edits pay and notes on finished
--     trackers all the time, and none of that may wipe the record.
--   * 'completed' and 'cancelled' do not clear. completed_at already keeps a
--     tracker out of the driver's sync, so clearing there would fix nothing and
--     only erase the earlier withdrawal.
--   * INSERT is untouched.
--
-- The logic lives in set_worktracker_status_timestamps() rather than in a new
-- trigger: that function owns the status timestamps on this table (see
-- 20260921131500_work_tracker_status_changed_at.sql), and BEFORE triggers fire
-- by name, so work_tracker_history_snapshot — which sorts after it — sees the
-- cleared columns and drops history_json on its own.
--
-- Tests: supabase/tests/work_tracker_withdrawal_reset.test.sql
-- ============================================================================

-- Everything outside the new block is unchanged from
-- 20260921131500_work_tracker_status_changed_at.sql.
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

    -- The office took the work back from the driver who handed it in. Cleared
    -- unconditionally, not "only if unset": a client that writes the whole row
    -- sends the old stamp back in this very UPDATE.
    if new.status in ('draft', 'released') then
      new.declined_at := null;
      new.abandoned_at := null;
    end if;

    -- We *don't* clear the other timestamps if you move backwards
    -- (e.g. completed -> cancelled). You can still override manually
    -- by explicitly setting the *_at fields in an UPDATE.
  end if;

  return new;
end;
$function$;

-- ============================================================================
-- Backfill: trackers already stuck
-- ============================================================================
-- Trackers that went back on the board before this migration still carry the
-- stamp and are invisible to their driver today — including ones a second
-- driver has already accepted. Only live statuses with no completed_at are
-- touched: those are the rows where clearing changes what a driver receives.
-- Finished and cancelled trackers keep their record.
--
-- The status does not change here, so the trigger above does not fire for the
-- clear; it is spelled out. The UPDATE still runs work_tracker_history_snapshot,
-- which drops history_json now that the tracker is no longer finished, and
-- bumps updated_at, so each row re-syncs to its driver once. No reader orders
-- or compares WorkTrackers.updated_at.

update public."WorkTrackers"
   set declined_at  = null,
       abandoned_at = null
 where status in ('draft', 'released', 'accepted', 'dest_pickup',
                  'pickup_inspection', 'dest_dropoff', 'dropoff_inspection')
   and completed_at is null
   and (declined_at is not null or abandoned_at is not null);
