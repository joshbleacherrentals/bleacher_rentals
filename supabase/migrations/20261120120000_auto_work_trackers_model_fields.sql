-- The Auto Work Trackers model's fields.
--
-- 1. Drivers.exclude_from_auto_work_trackers: lets the office leave a driver out of the model. An
--    excluded driver is never given a trip when work trackers are created, and is listed apart on
--    the Driver Data page, where they can be added back. The driver is otherwise untouched (still
--    active, still in their zones). Set from the web app through PowerSync, under drivers_update.
--
-- 2. WorkTrackers: a driver's day as a chain of trips. A trip starts from home, or straight from an
--    earlier trip's drop-off (previous_work_tracker_uuid); a trip no other trip follows ends the day
--    with the drive home. Each trip carries its own legs, so every kilometre a driver drives belongs
--    to exactly one work tracker:
--      - the haul (pickup -> drop-off): the existing distance_meters / drive_minutes,
--      - deadhead in (home or the previous drop-off -> this pickup): deadhead_in_*,
--      - the drive home (this drop-off -> home), only on the last trip of the day: return_home_*.
--    planned_pickup_at / planned_dropoff_at are the suggested times. Leaving home and getting back
--    are worked out from these, not stored. All nullable: existing work trackers are unaffected.

alter table public."Drivers"
  add column if not exists exclude_from_auto_work_trackers boolean not null default false;

comment on column public."Drivers".exclude_from_auto_work_trackers is
  'When true, the Auto Work Trackers model never assigns this driver a trip.';

alter table public."WorkTrackers"
  add column if not exists previous_work_tracker_uuid uuid
    references public."WorkTrackers"(id) on delete set null,
  add column if not exists planned_pickup_at timestamptz,
  add column if not exists planned_dropoff_at timestamptz,
  add column if not exists deadhead_in_distance_meters integer,
  add column if not exists deadhead_in_drive_minutes integer,
  add column if not exists return_home_distance_meters integer,
  add column if not exists return_home_drive_minutes integer;

alter table public."WorkTrackers"
  add constraint work_trackers_previous_not_self
    check (previous_work_tracker_uuid is null or previous_work_tracker_uuid <> id);

create index if not exists work_trackers_previous_work_tracker_uuid_idx
  on public."WorkTrackers" (previous_work_tracker_uuid);

comment on column public."WorkTrackers".previous_work_tracker_uuid is
  'The trip this one follows straight from its drop-off, same driver and day. Null: starts from home.';
comment on column public."WorkTrackers".planned_pickup_at is 'Suggested pickup time.';
comment on column public."WorkTrackers".planned_dropoff_at is 'Suggested drop-off time.';
comment on column public."WorkTrackers".deadhead_in_distance_meters is
  'Home, or the previous trip''s drop-off, to this pickup.';
comment on column public."WorkTrackers".deadhead_in_drive_minutes is
  'Home, or the previous trip''s drop-off, to this pickup.';
comment on column public."WorkTrackers".return_home_distance_meters is
  'This drop-off to the driver''s home; only on the last trip of the day.';
comment on column public."WorkTrackers".return_home_drive_minutes is
  'This drop-off to the driver''s home; only on the last trip of the day.';
