-- ============================================================================
-- When the driver handed the work back.
--
-- Companion to 20260911120000_worktracker_withdrawal_statuses.sql, which added
-- the 'declined' and 'abandoned' statuses. Separate file because ALTER TYPE
-- ... ADD VALUE must commit before anything can reference the new values.
--
-- Two columns rather than one shared "withdrawn_at": the status already says
-- which of the two happened, but keeping the timestamps apart means a tracker
-- the office re-released and a second driver then abandoned still carries the
-- first driver's decline. One column would have been overwritten.
--
-- The client stamps these itself (see br_driver/utils/withdrawTracker.ts) and
-- the trigger below is the backstop: the mobile app is offline-first, so a row
-- can arrive days after the fact, and a `now()` default would have recorded
-- the moment of sync instead of the moment the driver walked away. The trigger
-- only fills in what the client did not send.
--
-- Tests: supabase/tests/worktracker_withdrawal.test.sql
-- ============================================================================

alter table public."WorkTrackers"
  add column if not exists declined_at  timestamptz,
  add column if not exists abandoned_at timestamptz;

comment on column public."WorkTrackers".declined_at is
  'When the driver declined work they had been offered but never accepted.';
comment on column public."WorkTrackers".abandoned_at is
  'When the driver handed back work they had already accepted or started.';

-- Extends the existing status-timestamp trigger with the two new statuses.
-- Everything else in this function is unchanged from
-- 20260105160017_powersync.sql.
create or replace function public.set_worktracker_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  -- Always keep updated_at fresh on any change
  new.updated_at := now();

  -- Handle INSERT: no OLD row, so just set based on initial status
  if tg_op = 'INSERT' then
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
$$;
