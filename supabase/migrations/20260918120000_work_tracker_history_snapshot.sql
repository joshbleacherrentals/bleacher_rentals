-- ============================================================================
-- Finished-trip snapshot: WorkTrackers.history_json
-- Spec: br_driver/docs/specs/sync-bucket-limit.md
-- ============================================================================
-- The driver app's sync rules JOIN addresses, line items and inspections
-- through WorkTrackers, and PowerSync turns each of those JOINs into one
-- bucket per trip. A driver with a long history blew through
-- max_parameter_query_results (PSYNC_S2305). The fix stops syncing those rows
-- once a trip is finished; Trip History reads this snapshot instead.
--
-- Built only here, by triggers — the app never writes it — so a trip the
-- office closes gets one too, and later office edits flow into it.
-- ============================================================================

alter table public."WorkTrackers"
  add column if not exists history_json jsonb;

-- "street, city, state_province zip_postal", blank parts skipped; null when
-- nothing is left.
create or replace function public.format_history_address(address_uuid uuid)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.city), ''),
           nullif(btrim(concat_ws(' ', nullif(btrim(a.state_province), ''),
                                       nullif(btrim(a.zip_postal), ''))), '')
         ), '')
    from public."Addresses" a
   where a.id = address_uuid;
$$;

-- Takes the row rather than an id so the BEFORE trigger can pass NEW.
create or replace function public.build_work_tracker_history(tracker public."WorkTrackers")
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'pick_up_address', public.format_history_address(tracker.pickup_address_uuid),
    'drop_off_address', public.format_history_address(tracker.dropoff_address_uuid),
    -- `quantity` is qty_decimal: the integer `quantity` column is a deprecated
    -- whole-unit mirror kept for old builds.
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', li.type,
               'quantity', li.qty_decimal,
               'unit_amt_cents', li.unit_amt_cents,
               'description', li.description)
             order by li.created_at, li.id)
        from public."WorkTrackerLineItems" li
       where li.work_tracker_uuid = tracker.id
    ), '[]'::jsonb),
    -- The whole row, same fields the app's inspection summary already reads;
    -- answers_json is a text column, so it stays a string.
    'pre_inspection', (select to_jsonb(i) from public."WorkTrackerInspections" i
                        where i.id = tracker.pre_inspection_uuid),
    'post_inspection', (select to_jsonb(i) from public."WorkTrackerInspections" i
                         where i.id = tracker.post_inspection_uuid)
  );
$$;

create or replace function public.is_work_tracker_finished(tracker public."WorkTrackers")
returns boolean
language sql
immutable
as $$
  select tracker.completed_at is not null
      or tracker.declined_at is not null
      or tracker.abandoned_at is not null;
$$;

-- Fires on every insert/update, not `UPDATE OF completed_at, …`: the finish
-- timestamps are usually stamped by set_worktracker_status_timestamps from a
-- status-only update, and a column list only sees the statement's SET list.
-- The name sorts after set_worktracker_status_timestamps so it sees them.
create or replace function public.work_tracker_history_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_work_tracker_finished(new) then
    new.history_json := null;
  else
    new.history_json := public.build_work_tracker_history(new);
  end if;
  return new;
end;
$$;

drop trigger if exists work_tracker_history_snapshot on public."WorkTrackers";
create trigger work_tracker_history_snapshot
  before insert or update on public."WorkTrackers"
  for each row execute function public.work_tracker_history_snapshot();

-- Rebuilds the snapshot of whichever of these trackers are finished. Called by
-- the triggers below when something a snapshot contains changes after the
-- trip finished — the office edits pay, fixes an address, and so on.
create or replace function public.refresh_work_tracker_history(tracker_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public."WorkTrackers" wt
     set history_json = public.build_work_tracker_history(wt)
   where wt.id = any(tracker_ids)
     and public.is_work_tracker_finished(wt);
$$;

-- ── Line items ──────────────────────────────────────────────────────────────
-- Both OLD and NEW, so a line item moved between trackers updates both.
create or replace function public.work_tracker_line_item_history_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_history(array_remove(array[
    case when tg_op <> 'INSERT' then old.work_tracker_uuid end,
    case when tg_op <> 'DELETE' then new.work_tracker_uuid end
  ], null));
  return null;
end;
$$;

drop trigger if exists work_tracker_line_item_history_refresh on public."WorkTrackerLineItems";
create trigger work_tracker_line_item_history_refresh
  after insert or update or delete on public."WorkTrackerLineItems"
  for each row execute function public.work_tracker_line_item_history_refresh();

-- ── Addresses ───────────────────────────────────────────────────────────────
-- A shared row: one fix in the address book reaches every finished trip that
-- was picked up or dropped off there.
create or replace function public.address_history_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_history(array(
    select wt.id from public."WorkTrackers" wt
     where wt.pickup_address_uuid = new.id or wt.dropoff_address_uuid = new.id
  ));
  return null;
end;
$$;

drop trigger if exists address_history_refresh on public."Addresses";
create trigger address_history_refresh
  after update of street, city, state_province, zip_postal on public."Addresses"
  for each row execute function public.address_history_refresh();

-- ── Inspections ─────────────────────────────────────────────────────────────
-- Linking an inspection to a finished trip is a WorkTrackers update and is
-- covered above; this is for edits to the inspection row itself.
create or replace function public.work_tracker_inspection_history_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_history(array(
    select wt.id from public."WorkTrackers" wt
     where wt.pre_inspection_uuid = new.id or wt.post_inspection_uuid = new.id
  ));
  return null;
end;
$$;

drop trigger if exists work_tracker_inspection_history_refresh on public."WorkTrackerInspections";
create trigger work_tracker_inspection_history_refresh
  after update on public."WorkTrackerInspections"
  for each row execute function public.work_tracker_inspection_history_refresh();

-- The trigger functions above are SECURITY DEFINER, like the other mirror
-- triggers: a driver's upload fires them under RLS, and a driver fixing a
-- shared address must still refresh every other driver's finished trips there.
-- The helpers are only for those triggers — not an RPC anyone can call.
revoke execute on function public.refresh_work_tracker_history(uuid[]) from public, anon, authenticated;
revoke execute on function public.build_work_tracker_history(public."WorkTrackers") from public, anon, authenticated;
revoke execute on function public.format_history_address(uuid) from public, anon, authenticated;

-- ============================================================================
-- InspectionPhotos.created_by_driver_uuid — the photo's own sync key
-- ============================================================================
-- The mobile rule keys photos on this (one bucket per driver) rather than
-- JOINing through WorkTrackers (one per trip). They can't use the active-trip
-- filter the other tables use: a photo still waiting to upload when its trip
-- finishes would leave the phone and never upload. New builds write the
-- column; builds already on phones don't, so the server fills it here.
-- Deliberately never rewritten on reassignment — it is who took the photo.

alter table public."InspectionPhotos"
  add column if not exists created_by_driver_uuid uuid references public."Drivers"(id);

create index if not exists "InspectionPhotos_created_by_driver_uuid_idx"
  on public."InspectionPhotos" (created_by_driver_uuid);

-- A photo inserted once a trip already points at its inspection.
create or replace function public.inspection_photo_fill_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_driver_uuid is null then
    select wt.driver_uuid
      into new.created_by_driver_uuid
      from public."WorkTrackers" wt
     where new.inspection_uuid in (wt.pre_inspection_uuid, wt.post_inspection_uuid)
       and wt.driver_uuid is not null
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists inspection_photo_fill_driver on public."InspectionPhotos";
create trigger inspection_photo_fill_driver
  before insert on public."InspectionPhotos"
  for each row execute function public.inspection_photo_fill_driver();

-- Old builds upload photo → inspection → tracker update, so at the photo's
-- insert no trip points at the inspection yet; this catches them.
create or replace function public.work_tracker_inspection_photos_fill_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.driver_uuid is not null then
    update public."InspectionPhotos"
       set created_by_driver_uuid = new.driver_uuid
     where inspection_uuid in (new.pre_inspection_uuid, new.post_inspection_uuid)
       and created_by_driver_uuid is null;
  end if;
  return null;
end;
$$;

drop trigger if exists work_tracker_inspection_photos_fill_driver on public."WorkTrackers";
create trigger work_tracker_inspection_photos_fill_driver
  after insert or update of pre_inspection_uuid, post_inspection_uuid, driver_uuid
  on public."WorkTrackers"
  for each row execute function public.work_tracker_inspection_photos_fill_driver();

-- ============================================================================
-- Backfill
-- ============================================================================
-- Rewrites every finished tracker once, so each one re-syncs to its driver a
-- single time. set_worktracker_status_timestamps bumps their updated_at; no
-- reader orders or compares WorkTrackers.updated_at.

update public."InspectionPhotos" p
   set created_by_driver_uuid = wt.driver_uuid
  from public."WorkTrackers" wt
 where p.inspection_uuid in (wt.pre_inspection_uuid, wt.post_inspection_uuid)
   and wt.driver_uuid is not null
   and p.created_by_driver_uuid is null;

update public."WorkTrackers" wt
   set history_json = public.build_work_tracker_history(wt)
 where public.is_work_tracker_finished(wt);
