-- DeliveryProofs: GPS proof that a completed work tracker's bleacher reached its drop-off.
--
-- A daily cron (/api/cron/delivery-proof) looks at each work tracker completed in the last 7 days,
-- reads the hauled bleacher's Linxup GPS stops and position from shortly before the driver tapped
-- Complete until the bleacher's next move began (or now), and records one row per work tracker:
--
--   verified   - the bleacher stood within 500 m of the drop-off in that window
--   not_found  - it reported after completion, but never within 500 m
--   waiting    - no GPS report yet since completion; checked again tomorrow
--   no_gps     - none will come: the bleacher has no tracker, or nothing was reported before its
--                next move began or within 3 days
--   no_location - the drop-off address has no map coordinates
--
-- `final` is true when the cron will not look again (the window is over). The row stays even after
-- the bleacher moves on, so a work tracker keeps its proof. Written only by the cron with the
-- service role (no write policy); read by everyone who can open work trackers on the web.

create table if not exists public."DeliveryProofs" (
  id uuid primary key default gen_random_uuid(),
  work_tracker_uuid uuid not null unique
    references public."WorkTrackers"(id) on delete cascade,
  status text not null
    check (status in ('verified', 'not_found', 'waiting', 'no_gps', 'no_location')),
  final boolean not null default false,
  checked_at timestamptz not null default now(),
  attempts integer not null default 1,
  -- The bleacher actually hauled (actual_bleacher_uuid, else bleacher_uuid) and its tracker.
  bleacher_uuid uuid references public."Bleachers"(id) on delete set null,
  imei text,
  -- The drop-off as checked.
  dropoff_latitude double precision,
  dropoff_longitude double precision,
  -- The GPS evidence: the closest stop or position in the window (within 500 m when verified).
  evidence_kind text check (evidence_kind in ('stop', 'position')),
  evidence_at timestamptz,
  evidence_latitude double precision,
  evidence_longitude double precision,
  distance_meters integer,
  -- Where the GPS saw it: Linxup's geofence name, else the stop's street and city.
  evidence_place text,
  -- When that stop ended (null: still there when checked, or a single position).
  evidence_until timestamptz,
  -- The tracker's last report of any kind when checked, to tell a quiet tracker from a dead one.
  gps_last_report_at timestamptz,
  -- What the window was: from the completion until the bleacher's next move (null: still open).
  window_end timestamptz
);

alter table public."DeliveryProofs" enable row level security;

create policy "rbac_select" on public."DeliveryProofs"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

comment on table public."DeliveryProofs" is
  'GPS proof of delivery per completed work tracker (Linxup), written by a daily cron. One row per tracker.';
