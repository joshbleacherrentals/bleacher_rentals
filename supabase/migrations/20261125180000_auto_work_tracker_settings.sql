-- AutoWorkTrackerSettings: the Auto Work Trackers model's tunable settings, so an admin can change
-- them from the page (Advanced settings) and run the model again without a deploy.
--
-- One row (id = 'global'), one typed column per setting. Null means "use the default": the defaults,
-- labels and help text live in the app (src/features/autoWorkTrackers/planner/settings.ts), so a
-- default is never written twice, and "Reset to default" sets the column back to null. The checks
-- only keep values sane; the app enforces the same ranges.
--
-- Read by admins and account managers (the roles that open the page, synced through PowerSync);
-- changed by admins only. No insert or delete: the row is created here and always exists.

create table if not exists public."AutoWorkTrackerSettings" (
  id text primary key default 'global' check (id = 'global'),
  -- What the solver minimises: total distance driven, or total drive time.
  objective text check (objective in ('distance', 'time')),
  -- Employees before contractors: off, prefer (a contractor trip costs employee_priority_minutes of
  -- extra driving), or first (a contractor only takes a trip no employee can fit).
  employee_priority text check (employee_priority in ('off', 'prefer', 'first')),
  employee_priority_minutes integer check (employee_priority_minutes between 0 and 720),
  max_day_minutes integer check (max_day_minutes between 60 and 1440),
  setup_minutes integer check (setup_minutes between 0 and 480),
  teardown_minutes integer check (teardown_minutes between 0 and 480),
  day_start_hour integer check (day_start_hour between 0 and 23),
  search_seconds integer check (search_seconds between 1 and 6),
  updated_at timestamptz,
  updated_by_user_uuid uuid references public."Users"(id) on delete set null
);

insert into public."AutoWorkTrackerSettings" (id) values ('global') on conflict (id) do nothing;

alter table public."AutoWorkTrackerSettings" enable row level security;

create policy "rbac_select" on public."AutoWorkTrackerSettings"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[]);

create policy "rbac_update" on public."AutoWorkTrackerSettings"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);

comment on table public."AutoWorkTrackerSettings" is
  'The Auto Work Trackers model''s settings: one row, null = the app''s default. Admins edit them on the page.';
