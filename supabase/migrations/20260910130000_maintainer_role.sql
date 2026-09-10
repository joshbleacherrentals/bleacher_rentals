-- ============================================================================
-- The Maintainer role.
--
-- Spec: docs/specs/maintainer-role.md
--
-- A sixth web role whose entire job today is the annual inspection queue
-- added in 20260908120000. Modelled on "Developers" rather than as a flag on
-- "AccountManagers": it is a role someone is granted, and the account managers
-- who keep write access to inspections are a different set of people from the
-- ones who own the queue.
--
-- Almost a mirror of "Developers" — same four columns, without
-- `auto_subscribe_to_new_tickets`, which is a roadmap notification setting
-- with no counterpart here.
-- ============================================================================

create table if not exists public."Maintainers" (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_uuid  uuid        not null,
  is_active  boolean     not null default true,
  constraint maintainers_pkey primary key (id),
  constraint maintainers_user_uuid_fkey
    foreign key (user_uuid) references public."Users" (id) on delete cascade
) tablespace pg_default;

create index if not exists "Maintainers_user_uuid_idx"
  on public."Maintainers" using btree (user_uuid) tablespace pg_default;

comment on table public."Maintainers" is
  'Grants the maintainer web role. Mirrors "Developers": an inactive row leaves '
  'the role ungranted rather than deleting the history of it.';

-- ── RLS: administrators only, exactly as on "Developers" ───────────────────
--
-- Handing out a role is an administrator's job, and nobody else has a reason
-- to read the list of who holds one.

alter table public."Maintainers" enable row level security;

drop policy if exists "rbac_select" on public."Maintainers";
create policy "rbac_select" on public."Maintainers"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_insert" on public."Maintainers";
create policy "rbac_insert" on public."Maintainers"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_update" on public."Maintainers";
create policy "rbac_update" on public."Maintainers"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_delete" on public."Maintainers";
create policy "rbac_delete" on public."Maintainers"
  as permissive for delete to authenticated
  using (public.get_user_roles() && '{admin}'::text[]);

-- ── get_user_roles() learns the role ───────────────────────────────────────
--
-- Re-created from its definition in 20260525120000_inactive_user_lockout.sql
-- with one arm added. The inactive-user short circuit is untouched and stays
-- first: a deactivated user has no roles, whatever rows point at them.
--
-- Every RLS policy in this database, and the TypeScript mirror of this
-- function in determineAccess.ts, reads roles from here. A role that is not
-- named in this function does not exist.

create or replace function public.get_user_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.status_uuid = '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5' then '{}'::text[]
    else coalesce(
      (
        select array_agg(role) from (
          select 'admin' as role
            where u.is_admin = true
          union all
          select 'account_manager'
            where exists (
              select 1 from "AccountManagers" am
              where am.user_uuid = u.id and am.is_active = true
            )
          union all
          select 'developer'
            where exists (
              select 1 from "Developers" d
              where d.user_uuid = u.id and d.is_active = true
            )
          union all
          select 'viewer'
            where u.is_viewer = true
          union all
          select 'maintainer'
            where exists (
              select 1 from "Maintainers" m
              where m.user_uuid = u.id and m.is_active = true
            )
        ) roles
      ),
      '{}'::text[]
    )
  end
  from "Users" u
  where u.clerk_user_id = (auth.jwt() ->> 'sub')
  limit 1;
$$;

-- ── The inspection policies learn the role ─────────────────────────────────
--
-- No new rules: the four policies from 20260908120000, with 'maintainer' added
-- to their role arrays. This cannot be deferred. PowerSync classifies an RLS
-- refusal (42501) as FATAL and drops the operation from its upload queue in
-- silence — a maintainer who is not also an admin would see the form, get an
-- "Inspection recorded" toast, and lose the record with nobody told.
--
-- `account_manager` stays in the write arrays on purpose. They no longer have
-- the queue page, but they still record inspections from the block inside the
-- bleacher modal.

drop policy if exists "bleacher_annual_inspections_select" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_select" on public."BleacherAnnualInspections"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

drop policy if exists "bleacher_annual_inspections_insert" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_insert" on public."BleacherAnnualInspections"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

drop policy if exists "bleacher_annual_inspections_update" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_update" on public."BleacherAnnualInspections"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[])
  with check (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

drop policy if exists "bleacher_annual_inspections_delete" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_delete" on public."BleacherAnnualInspections"
  as permissive for delete to authenticated
  using (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
