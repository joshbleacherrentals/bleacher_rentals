-- ============================================================================
-- The Accountant role.
--
-- Spec: docs/specs/accountant-role.md
--
-- A seventh web role, for the employees who work with finances. This is
-- Stage 1 of that feature and nothing more: the role exists and can be granted,
-- and it carries NO permissions and NO access to any data. What the role is
-- later allowed to do is deliberately undecided, so no existing policy is
-- touched here.
--
-- Modelled on "Maintainers" — a role someone is granted, not a flag on a role
-- they already have. Same shape, same admin-only RLS.
-- ============================================================================

create table if not exists public."Accountants" (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  is_active  boolean     not null default true,
  user_uuid  uuid        not null,
  constraint accountants_pkey primary key (id),
  constraint accountants_user_uuid_fkey
    foreign key (user_uuid) references public."Users" (id) on delete cascade
) tablespace pg_default;

create index if not exists "Accountants_user_uuid_idx"
  on public."Accountants" using btree (user_uuid) tablespace pg_default;

comment on table public."Accountants" is
  'Grants the accountant web role. Mirrors "Maintainers": an inactive row leaves '
  'the role ungranted rather than deleting the history of it.';

-- ── RLS: administrators only, exactly as on "Maintainers" ──────────────────
--
-- Handing out a role is an administrator's job, and nobody else has a reason
-- to read the list of who holds one.

alter table public."Accountants" enable row level security;

drop policy if exists "rbac_select" on public."Accountants";
create policy "rbac_select" on public."Accountants"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_insert" on public."Accountants";
create policy "rbac_insert" on public."Accountants"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_update" on public."Accountants";
create policy "rbac_update" on public."Accountants"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);

drop policy if exists "rbac_delete" on public."Accountants";
create policy "rbac_delete" on public."Accountants"
  as permissive for delete to authenticated
  using (public.get_user_roles() && '{admin}'::text[]);

-- ── get_user_roles() learns the role ───────────────────────────────────────
--
-- Re-created from its CURRENT definition in 20260910130000_maintainer_role.sql
-- — not from the older copies in 20260525120000 / 20260513153019, which have no
-- 'maintainer' arm and would silently revoke that role — with one arm added.
-- The inactive-user short circuit is untouched and stays first: a deactivated
-- user has no roles, whatever rows point at them.
--
-- Every RLS policy in this database, and the TypeScript mirror of this
-- function in determineAccess.ts, reads roles from here. A role that is not
-- named in this function does not exist.
--
-- No policy names 'accountant', so until one does (a later, separately approved
-- change) an accountant-only user is refused by every role-gated table.

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
          union all
          select 'accountant'
            where exists (
              select 1 from "Accountants" a
              where a.user_uuid = u.id and a.is_active = true
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
