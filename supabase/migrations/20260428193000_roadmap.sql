-- =============================================================
-- Roadmap (Quarters, Sprints, Features, Tasks, Developers, Messaging)
-- is_backlog = true  → backlog item
-- is_backlog = false → sprint task (sprint_id should be set)
-- =============================================================

-- Enums (snake_case values)
create type roadmap_feature_status as enum (
  'draft',
  'locked_in',
  'in_progress',
  'completed'
);

create type roadmap_task_status as enum (
  'to_do',
  'in_progress',
  'completed'
);

create type roadmap_attachment_parent_type as enum (
  'task',
  'feature'
);

-- =====================
-- Quarters
-- =====================
create table public."RoadmapQuarters" (
  id       uuid primary key default gen_random_uuid(),
  year     smallint not null check (year between 2000 and 3000),
  quarter  smallint not null check (quarter between 1 and 4),
  created_at timestamptz not null default now(),
  unique (year, quarter)
);

alter table public."RoadmapQuarters" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapQuarters"
  as permissive for all to authenticated using (true);

-- =====================
-- Sprints
-- =====================
create table public."RoadmapSprints" (
  id             uuid primary key default gen_random_uuid(),
  quarter_id     uuid not null references public."RoadmapQuarters"(id) on delete cascade,
  sprint_number  smallint not null check (sprint_number between 1 and 6),
  start_date     date not null,
  end_date       date not null,
  created_at     timestamptz not null default now(),
  unique (quarter_id, sprint_number)
);

alter table public."RoadmapSprints" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapSprints"
  as permissive for all to authenticated using (true);

-- =====================
-- Features (a.k.a. quarter milestones)
-- =====================
create table public."RoadmapFeatures" (
  id            uuid primary key default gen_random_uuid(),
  quarter_id    uuid not null references public."RoadmapQuarters"(id) on delete cascade,
  title         text not null,
  description   text,
  status        roadmap_feature_status not null default 'draft',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

alter table public."RoadmapFeatures" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapFeatures"
  as permissive for all to authenticated using (true);

-- Junction: feature <-> sprint (Sprint 1..6 labels)
-- PowerSync requires a uuid `id` PK on every synced table. The natural
-- composite key is enforced via UNIQUE.
create table public."RoadmapFeatureSprintLabels" (
  id          uuid primary key default gen_random_uuid(),
  feature_id  uuid not null references public."RoadmapFeatures"(id) on delete cascade,
  sprint_id   uuid not null references public."RoadmapSprints"(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (feature_id, sprint_id)
);

alter table public."RoadmapFeatureSprintLabels" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapFeatureSprintLabels"
  as permissive for all to authenticated using (true);

-- =====================
-- Tasks
-- is_backlog = true  → backlog item (sprint_id may be null)
-- is_backlog = false → sprint task (sprint_id should be set)
-- =====================
create table public."RoadmapTasks" (
  id                    uuid primary key default gen_random_uuid(),
  sprint_id             uuid references public."RoadmapSprints"(id) on delete cascade,
  feature_id            uuid references public."RoadmapFeatures"(id) on delete set null,
  title                 text not null,
  description           text,
  status                roadmap_task_status not null default 'to_do',
  sort_order            integer not null default 0,
  is_backlog            boolean not null default false,
  developer_uuid        uuid references public."Users"(id) on delete set null,
  created_by_user_uuid  uuid references public."Users"(id) on delete set null,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,
  deleted_at            timestamptz
);

alter table public."RoadmapTasks" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapTasks"
  as permissive for all to authenticated using (true);

-- Auto-stamp completed_at when status flips to/from completed
create or replace function public.set_roadmap_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    elsif new.status <> 'completed' then
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_roadmap_task_completed_at
before insert or update on public."RoadmapTasks"
for each row execute function public.set_roadmap_task_completed_at();

-- Same trigger for features
create or replace function public.set_roadmap_feature_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    elsif new.status <> 'completed' then
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_roadmap_feature_completed_at
before insert or update on public."RoadmapFeatures"
for each row execute function public.set_roadmap_feature_completed_at();

-- =====================
-- Task Subscriptions
-- =====================
create table public."RoadmapTaskSubscriptions" (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public."RoadmapTasks"(id) on delete cascade,
  user_uuid   uuid not null references public."Users"(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (task_id, user_uuid)
);

alter table public."RoadmapTaskSubscriptions" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapTaskSubscriptions"
  as permissive for all to authenticated using (true);

-- =====================
-- Task Messages
-- =====================
create table public."RoadmapTaskMessages" (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public."RoadmapTasks"(id) on delete cascade,
  user_uuid   uuid not null references public."Users"(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  is_system   boolean not null default false
);

alter table public."RoadmapTaskMessages" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapTaskMessages"
  as permissive for all to authenticated using (true);

-- =====================
-- Message Read Receipts
-- =====================
create table public."RoadmapTaskMessageReadReceipts" (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public."RoadmapTaskMessages"(id) on delete cascade,
  user_uuid   uuid not null references public."Users"(id) on delete cascade,
  read_at     timestamptz not null default now(),
  unique (message_id, user_uuid)
);

alter table public."RoadmapTaskMessageReadReceipts" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapTaskMessageReadReceipts"
  as permissive for all to authenticated using (true);

-- =====================
-- Typing Indicators
-- =====================
create table public."RoadmapTaskTypingIndicators" (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public."RoadmapTasks"(id) on delete cascade,
  user_uuid   uuid not null references public."Users"(id) on delete cascade,
  is_typing   boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (task_id, user_uuid)
);

alter table public."RoadmapTaskTypingIndicators" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapTaskTypingIndicators"
  as permissive for all to authenticated using (true);

-- =====================
-- Attachments (polymorphic: task / feature)
-- =====================
create table public."RoadmapAttachments" (
  id                      uuid primary key default gen_random_uuid(),
  parent_type             roadmap_attachment_parent_type not null,
  parent_id               uuid not null,
  storage_bucket          text not null,
  storage_path            text not null,
  file_name               text not null,
  mime_type               text,
  file_size_bytes         bigint,
  uploaded_by_user_uuid   uuid references public."Users"(id) on delete set null,
  created_at              timestamptz not null default now()
);

create index on public."RoadmapAttachments" (parent_type, parent_id);

alter table public."RoadmapAttachments" enable row level security;
create policy "Allow All for Auth"
  on public."RoadmapAttachments"
  as permissive for all to authenticated using (true);

-- =====================
-- Storage bucket for roadmap attachments
-- =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roadmap-attachments',
  'roadmap-attachments',
  true,
  20971520, -- 20MB
  null      -- accept any mime type
)
on conflict (id) do nothing;

create policy "roadmap-attachments: select"
on storage.objects for select to authenticated
using (bucket_id = 'roadmap-attachments');

create policy "roadmap-attachments: insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'roadmap-attachments');

create policy "roadmap-attachments: update"
on storage.objects for update to authenticated
using (bucket_id = 'roadmap-attachments');

create policy "roadmap-attachments: delete"
on storage.objects for delete to authenticated
using (bucket_id = 'roadmap-attachments');

-- =====================
-- Developers
-- =====================
create table public."Developers" (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now() not null,
  user_uuid   uuid references public."Users"(id) on delete cascade not null,
  is_active   boolean not null default true,
  auto_subscribe_to_new_tickets boolean not null default true
);

alter table public."Developers" enable row level security;
create policy "Allow All for Auth"
  on public."Developers"
  as permissive for all to authenticated using (true);

-- =====================
-- Enforce: a task cannot have is_backlog = false unless it has a sprint_id.
-- If sprint_id is null, force is_backlog = true.
-- =====================
create or replace function public.enforce_roadmap_task_backlog()
returns trigger
language plpgsql
as $$
begin
  if new.sprint_id is null then
    new.is_backlog := true;
  end if;
  return new;
end;
$$;

create trigger trg_roadmap_task_backlog_guard
before insert or update on public."RoadmapTasks"
for each row execute function public.enforce_roadmap_task_backlog();

-- =====================
-- Backfill: migrate old Tasks → RoadmapTasks
-- Maps old task_status to roadmap_task_status:
--   in_progress  → in_progress
--   in_staging   → in_progress
--   complete     → completed
--   approved     → completed
--   backlog/paused/null → to_do
-- All migrated tasks are marked as backlog items (is_backlog = true).
-- =====================
insert into public."RoadmapTasks" (
  id,
  title,
  description,
  status,
  is_backlog,
  created_by_user_uuid,
  created_at
)
select
  t.id,
  t.name,
  nullif(trim(t.description), ''),
  case t.status
    when 'in_progress' then 'in_progress'::roadmap_task_status
    when 'in_staging'  then 'in_progress'::roadmap_task_status
    when 'complete'    then 'completed'::roadmap_task_status
    when 'approved'    then 'completed'::roadmap_task_status
    else                    'to_do'::roadmap_task_status
  end,
  true,
  t.created_by_user_uuid,
  t.created_at
from public."Tasks" t
on conflict (id) do nothing;

-- Subscribe the original creator to each migrated task
insert into public."RoadmapTaskSubscriptions" (task_id, user_uuid, created_at)
select t.id, t.created_by_user_uuid, t.created_at
from public."Tasks" t
where t.created_by_user_uuid is not null
on conflict (task_id, user_uuid) do nothing;
