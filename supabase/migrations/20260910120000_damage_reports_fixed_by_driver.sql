-- ============================================================================
-- "Fixed by driver" on damage reports.
--
-- Spec: br_driver/docs/specs/driver-fixed-damage-reports.md
-- Tests: supabase/tests/damage_reports_fixed_by_driver.test.sql
--
-- A driver who physically fixed a small piece of damage had no way to say so:
-- the report stayed open until a manager created a maintenance event, and
-- every driver after them kept seeing it and kept filing about it.
--
-- Three columns rather than one bool: "fixed" without "who" and "when" is the
-- first thing a manager asks about, and a bool alone cannot answer it. They
-- are one fact, so a CHECK constraint keeps them consistent — a half-filled
-- state ("fixed, but by nobody") is not writable.
--
-- The mark is NOT a resolve. It is a signal to the web app, where a manager
-- can turn it into `resolved_at` with one click (Mark as Resolved), which is
-- also what finally drops the row off every driver's phone: mobile sync ships
-- every unresolved report to every device, and that set only grows.
-- ============================================================================

alter table public."DamageReports"
  add column if not exists fixed_by_driver     boolean     not null default false,
  add column if not exists fixed_at            timestamptz,
  add column if not exists fixed_by_user_uuid  uuid;

alter table public."DamageReports"
  drop constraint if exists damage_reports_fixed_by_user_uuid_fkey;

alter table public."DamageReports"
  add constraint damage_reports_fixed_by_user_uuid_fkey
    foreign key (fixed_by_user_uuid) references public."Users" (id) on delete set null;

alter table public."DamageReports"
  drop constraint if exists damage_reports_fixed_consistent;

alter table public."DamageReports"
  add constraint damage_reports_fixed_consistent check (
    (    fixed_by_driver and fixed_at is not null and fixed_by_user_uuid is not null)
 or (not fixed_by_driver and fixed_at is     null and fixed_by_user_uuid is     null)
  );

comment on column public."DamageReports".fixed_by_driver is
  'A driver reported this damage as physically fixed. Not a resolve — a '
  'manager still closes the report on the web (Mark as Resolved).';
comment on column public."DamageReports".fixed_at is
  'When the mark was last set. Cleared together with fixed_by_driver.';
comment on column public."DamageReports".fixed_by_user_uuid is
  'Who set the mark. Any driver may — whoever was on site fixed it, not '
  'necessarily whoever filed the report.';

-- ── The queue a manager works from ──────────────────────────────────────────
-- "open reports a driver says are already fixed" is the cheap end of the
-- backlog, and the only new query shape this feature adds on the web.
create index if not exists "DamageReports_fixed_by_driver_open_idx"
  on public."DamageReports" (fixed_by_driver)
  where resolved_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS: drivers may write this mark, and nothing else
-- ════════════════════════════════════════════════════════════════════════════
--
-- Drivers had SELECT and INSERT on "DamageReports" (20260605110000) but no
-- UPDATE at all, so without a policy here the mark would be written into the
-- phone's local database, pushed, and silently dropped by RLS — the worst
-- possible failure, because the driver sees it succeed.
--
-- The policy has to be unscoped by author: the product decision is that ANY
-- driver may mark a report fixed, because the driver on site is the one who
-- fixed it. RLS cannot restrict WHICH COLUMNS a write may touch, and column
-- grants are no help here — the web app authenticates as the same
-- `authenticated` role and legitimately edits every column. So the column
-- fence is a trigger, below.

drop policy if exists "driver_damage_report_fixed_update" on public."DamageReports";

create policy "driver_damage_report_fixed_update"
  on public."DamageReports"
  as permissive for update to authenticated
  using      (public.get_current_driver_id() is not null)
  with check (public.get_current_driver_id() is not null);

-- ── Not every write under a driver's JWT comes from the driver ──────────────
--
-- The column fence below compares OLD and NEW values, which is what makes it
-- immune to a client that sends the whole row back (PowerSync's connector
-- does). But it would also catch the database writing its OWN derived columns
-- in the middle of a driver's request: the photo queue's ordinary
-- `PATCH DamageReportPhotos SET upload_status = 'uploaded'` cascades through
-- `trg_drp_photos_uploaded_upd` into
-- `UPDATE "DamageReports" SET photos_uploaded = …` (20260820130000), and the
-- INSERT path does the same when a report is created. `SECURITY DEFINER` on
-- the recompute function does not disguise that: it changes the executing
-- role, not the JWT, so `get_current_driver_id()` still answers "a driver".
--
-- The blast radius is why this is handled here rather than left to chance:
-- PowerSync retries a rejected operation forever and does not move past it, so
-- one rejected photo-status update stalls a driver's ENTIRE upload queue —
-- every photo of every report, silently, on a phone in the field.
--
-- So server-side writers mark themselves for the length of their write, and
-- the fence passes those through. `grep app.server_write` finds every one; any
-- future server-side writer to "DamageReports" that can run under a driver's
-- JWT must do the same. A client cannot set this itself: PostgREST exposes
-- only the `request.*` settings it derives from the JWT and gives no caller a
-- way to run set_config.
--
-- The alternative — excluding `photos_uploaded` from the comparison — was
-- rejected: it makes the fence depend on a hand-maintained list of
-- server-derived columns, so the next one added re-breaks the queue the same
-- silent way, and it hands a driver the flag that decides whether a report's
-- photo evidence counts as delivered.
--
-- Recreated verbatim from 20260820130000 apart from the two marker lines.

create or replace function public.damage_reports_recompute_photos_uploaded(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  -- Serialize concurrent recomputes of the SAME report before reading its
  -- photos, closing a lost-update race under concurrent photo uploads.
  perform 1
  from public."DamageReports"
  where id = any (p_ids)
  order by id
  for update;

  -- The database writing its own derived column, not the driver whose JWT
  -- happens to be on the session. Transaction-local (the `true`), and switched
  -- off immediately, so nothing outside this statement inherits the exemption.
  perform set_config('app.server_write', 'on', true);

  update public."DamageReports" dr
  set photos_uploaded = c.ready
  from (
    select r.id,
           exists (select 1 from public."DamageReportPhotos" p
                   where p.damage_report_uuid = r.id)
           and not exists (select 1 from public."DamageReportPhotos" p
                           where p.damage_report_uuid = r.id
                             and p.upload_status is distinct from 'uploaded')
             as ready
    from public."DamageReports" r
    where r.id = any (p_ids)
  ) as c
  where dr.id = c.id
    and dr.photos_uploaded is distinct from c.ready;

  perform set_config('app.server_write', 'off', true);
end;
$$;

-- Column fence. Compares VALUES, not the SET list, so a client that sends the
-- whole row back is judged by what it actually changed. Staff, server-side
-- writers and non-drivers are passed straight through.
create or replace function public.damage_reports_driver_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The database writing its own derived columns — see above. Checked first,
  -- because it is true regardless of who is signed in.
  if coalesce(current_setting('app.server_write', true), 'off') = 'on' then
    return new;
  end if;

  if public.get_user_roles() && '{admin,account_manager,viewer}'::text[] then
    return new;
  end if;

  if public.get_current_driver_id() is null then
    return new;
  end if;

  if (to_jsonb(new) - 'fixed_by_driver' - 'fixed_at' - 'fixed_by_user_uuid')
     is distinct from
     (to_jsonb(old) - 'fixed_by_driver' - 'fixed_at' - 'fixed_by_user_uuid')
  then
    raise exception
      'A driver may only change fixed_by_driver / fixed_at / fixed_by_user_uuid on a damage report';
  end if;

  return new;
end;
$$;

drop trigger if exists damage_reports_driver_update_guard on public."DamageReports";

create trigger damage_reports_driver_update_guard
  before update on public."DamageReports"
  for each row
  execute function public.damage_reports_driver_update_guard();
