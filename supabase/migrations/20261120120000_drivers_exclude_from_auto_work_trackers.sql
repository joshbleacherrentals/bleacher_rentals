-- Lets the office leave a driver out of the Auto Work Trackers model: an excluded driver is never
-- given a trip when work trackers are created, and is listed apart on the Driver Data page, where
-- they can be added back. The driver is otherwise untouched (still active, still in their zones).
-- Set from the web app through PowerSync, under the existing drivers_update policy.

alter table public."Drivers"
  add column if not exists exclude_from_auto_work_trackers boolean not null default false;

comment on column public."Drivers".exclude_from_auto_work_trackers is
  'When true, the Auto Work Trackers model never assigns this driver a trip.';
