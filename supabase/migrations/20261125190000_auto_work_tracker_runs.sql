-- The Auto Work Trackers model's run log, so we can see how accurate it is: what each run planned,
-- what dispatch then changed or deleted, and why.
--
-- 1. AutoWorkTrackerRuns: one row per click of Create work trackers. The zone and week, who ran it,
--    the app version and git commit it ran on (git remembers how that code worked), the settings it
--    used and its totals. discarded_at is set when its drafts are bulk deleted (e.g. to try other
--    settings), so analysis of dispatch's edits can leave those tuning runs out.
--
-- 2. AutoWorkTrackerRunTrips: one row per work tracker a run created, with `snapshot`: the tracker's
--    values and line items exactly as the model wrote them (JSON, built from the same values the
--    insert used, so new columns are captured without a change here). work_tracker_uuid has no
--    foreign key on purpose: when dispatch deletes the tracker, the link must stay, because the
--    deletion is the signal.
--
-- 3. AutoWorkTrackerFeedback: why someone edited or deleted a model trip, or discarded a run, in
--    their own words. Optional; shown on the Runs page and read for analysis.
--
-- JSON columns are jsonb here and text in the app's local database (PowerSync has no JSON type).
-- The app writes them as JSON text; BackendConnector parses them back into objects before upload
-- (JSON_COLUMNS in src/lib/powersync/jsonColumns.ts), so they land as real JSON, not quoted strings.
-- Admins and account managers create runs (both can press Create); only admins discard them (the
-- bulk delete is admin-only).

create table if not exists public."AutoWorkTrackerRuns" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user_uuid uuid references public."Users"(id) on delete set null,
  zone_uuid uuid references public."Zones"(id) on delete set null,
  week_start date not null,
  -- The key the run stamped on its trackers (WorkTrackers.auto_work_tracker_id).
  auto_work_tracker_id text not null,
  app_version text,
  commit_sha text,
  -- The settings it planned with (PlannerSettings).
  settings jsonb,
  -- Its totals (PlanWeekResult without the settings).
  result jsonb,
  trips_created integer not null default 0,
  discarded_at timestamptz,
  discarded_by_user_uuid uuid references public."Users"(id) on delete set null
);

create index if not exists auto_work_tracker_runs_key_idx
  on public."AutoWorkTrackerRuns" (auto_work_tracker_id);

create table if not exists public."AutoWorkTrackerRunTrips" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_uuid uuid not null references public."AutoWorkTrackerRuns"(id) on delete cascade,
  work_tracker_uuid uuid not null,
  -- { "tracker": {...WorkTrackers columns}, "lineItems": [{...WorkTrackerLineItems columns}] }
  snapshot jsonb not null
);

create index if not exists auto_work_tracker_run_trips_run_idx
  on public."AutoWorkTrackerRunTrips" (run_uuid);
create index if not exists auto_work_tracker_run_trips_tracker_idx
  on public."AutoWorkTrackerRunTrips" (work_tracker_uuid);

create table if not exists public."AutoWorkTrackerFeedback" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user_uuid uuid references public."Users"(id) on delete set null,
  run_uuid uuid references public."AutoWorkTrackerRuns"(id) on delete cascade,
  run_trip_uuid uuid references public."AutoWorkTrackerRunTrips"(id) on delete cascade,
  work_tracker_uuid uuid,
  kind text not null check (kind in ('edit', 'delete', 'discard')),
  reason text not null check (length(btrim(reason)) > 0)
);

create index if not exists auto_work_tracker_feedback_run_idx
  on public."AutoWorkTrackerFeedback" (run_uuid);

alter table public."AutoWorkTrackerRuns" enable row level security;
alter table public."AutoWorkTrackerRunTrips" enable row level security;
alter table public."AutoWorkTrackerFeedback" enable row level security;

create policy "rbac_select" on public."AutoWorkTrackerRuns"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[]);
create policy "rbac_insert" on public."AutoWorkTrackerRuns"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager}'::text[]);
create policy "rbac_update" on public."AutoWorkTrackerRuns"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);

create policy "rbac_select" on public."AutoWorkTrackerRunTrips"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[]);
create policy "rbac_insert" on public."AutoWorkTrackerRunTrips"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager}'::text[]);

create policy "rbac_select" on public."AutoWorkTrackerFeedback"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[]);
create policy "rbac_insert" on public."AutoWorkTrackerFeedback"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager}'::text[]);

comment on table public."AutoWorkTrackerRuns" is
  'One row per Create work trackers run: zone, week, version, settings, totals; discarded_at when bulk deleted.';
comment on table public."AutoWorkTrackerRunTrips" is
  'Each work tracker a run created, with its values and line items as the model wrote them (snapshot JSON).';
comment on table public."AutoWorkTrackerFeedback" is
  'Why someone edited or deleted a model trip, or discarded a run. Optional, free text.';
