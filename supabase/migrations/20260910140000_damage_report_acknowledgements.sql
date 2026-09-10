-- ============================================================================
-- DamageReportAcknowledgements — "select all that apply"
--
-- Spec: br_driver/docs/specs/damage-report-dedupe.md
-- Tests: supabase/tests/damage_report_acknowledgements.test.sql
--
-- Managers were getting several reports about the SAME damage: driver one
-- files it, a week later driver two sees it and their inspection demands a
-- report too. A minor issue collects three to five reports before anyone gets
-- to it.
--
-- So a driver is now shown the bleacher's open reports first and ticks the
-- ones describing what they see. What that writes is this: a light row saying
-- "I saw this one too", instead of a duplicate report.
--
-- WHY A ROW AT ALL, when the product ask was "don't create anything"
--   * an inspection saying `damage found = yes` with nothing attached reads as
--     a lost report, on the driver's own summary screen;
--   * the manager would otherwise see no change — just fewer reports. What
--     they need is the opposite: "three drivers confirmed this, most recently
--     on the 8th", which is both prioritisation and evidence it is still
--     broken;
--   * and there would be no record that the driver saw the damage on that
--     trip, which is exactly what a dropoff dispute turns on.
-- ============================================================================

-- The `powersync` publication is FOR ALL TABLES, so nothing has to be added to
-- it here; the sync rules in br_powersync decide who receives these rows.
create table if not exists public."DamageReportAcknowledgements" (
  id                        uuid        not null default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  damage_report_uuid        uuid        not null,
  -- NULL when acknowledged from the Damage Reports screen rather than during
  -- an inspection. Both are real: one is "I am filling in an inspection", the
  -- other "I am about to file a report and found it is already known".
  inspection_uuid           uuid,
  work_tracker_uuid         uuid,
  acknowledged_by_user_uuid uuid        not null default public.get_current_user_uuid(),
  deleted                   boolean     not null default false,
  -- Mirror of the parent's resolved_at — see the sync section below. NOT a
  -- denormalisation for speed; the mobile sync rule cannot be written without
  -- it.
  report_resolved_at        timestamptz,
  constraint damage_report_acks_pkey primary key (id),
  constraint damage_report_acks_report_fkey
    foreign key (damage_report_uuid) references public."DamageReports" (id) on delete cascade,
  constraint damage_report_acks_inspection_fkey
    foreign key (inspection_uuid) references public."WorkTrackerInspections" (id) on delete set null,
  constraint damage_report_acks_work_tracker_fkey
    foreign key (work_tracker_uuid) references public."WorkTrackers" (id) on delete set null,
  constraint damage_report_acks_user_fkey
    foreign key (acknowledged_by_user_uuid) references public."Users" (id)
) tablespace pg_default;

comment on table public."DamageReportAcknowledgements" is
  'A driver confirming an existing damage report describes what they are '
  'looking at, filed instead of a duplicate report.';

create index if not exists "DamageReportAcks_report_idx"
  on public."DamageReportAcknowledgements" using btree (damage_report_uuid);

create index if not exists "DamageReportAcks_user_idx"
  on public."DamageReportAcknowledgements" using btree (acknowledged_by_user_uuid);

-- One acknowledgement per (report, inspection): re-submitting an inspection,
-- or retrying an upload, must not inflate the count a manager reads. Partial,
-- because the standalone path has no inspection and "I saw it again three
-- weeks later" is a real second event, not a duplicate.
create unique index if not exists "DamageReportAcks_report_inspection_uniq"
  on public."DamageReportAcknowledgements" (damage_report_uuid, inspection_uuid)
  where inspection_uuid is not null and deleted = false;

-- ════════════════════════════════════════════════════════════════════════════
-- A duplicate is a NO-OP, never an error
-- ════════════════════════════════════════════════════════════════════════════
--
-- The index above would otherwise raise 23505 at the client, and PowerSync
-- retries a rejected write forever without moving past it — one duplicate ack
-- would stall that driver's ENTIRE upload queue, every photo of every report
-- behind it. (That is not hypothetical: the fixed-by-driver guard did exactly
-- this, see 20260909120000.) Returning NULL from a BEFORE INSERT trigger drops
-- the row silently, which is precisely the semantics wanted: the
-- acknowledgement already exists.

create or replace function public.damage_report_ack_skip_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inspection_uuid is not null and exists (
    select 1
    from public."DamageReportAcknowledgements" a
    where a.damage_report_uuid = new.damage_report_uuid
      and a.inspection_uuid    = new.inspection_uuid
      and a.deleted            = false
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists damage_report_ack_skip_duplicate on public."DamageReportAcknowledgements";

create trigger damage_report_ack_skip_duplicate
  before insert on public."DamageReportAcknowledgements"
  for each row
  execute function public.damage_report_ack_skip_duplicate();

-- ════════════════════════════════════════════════════════════════════════════
-- report_resolved_at — the mirror the mobile sync rule reads
-- ════════════════════════════════════════════════════════════════════════════
--
-- Phones sync acknowledgements whose parent report is still open. Expressing
-- that as a JOIN back to "DamageReports" compiles into a parameter query
-- returning one row per open report, capped at 1000: at ~1000 open reports
-- every driver's first sync failed with PSYNC_S2305 and the app sat on the
-- poor-connection screen. The count is company-wide and only grows, so there
-- is no version of the JOIN that stays under the cap — the same reason
-- "DamageReportPhotos" carries this column.
--
-- Maintained in both directions: filled from the parent when an ack is
-- written, and rewritten across the children whenever a report is resolved or
-- reopened.

create or replace function public.damage_report_ack_fill_resolved_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select dr.resolved_at
    into new.report_resolved_at
  from public."DamageReports" dr
  where dr.id = new.damage_report_uuid;

  return new;
end;
$$;

drop trigger if exists damage_report_ack_fill_resolved_at on public."DamageReportAcknowledgements";

-- After the duplicate check, so a dropped row costs nothing.
create trigger damage_report_ack_fill_resolved_at
  before insert or update of damage_report_uuid
  on public."DamageReportAcknowledgements"
  for each row
  execute function public.damage_report_ack_fill_resolved_at();

create or replace function public.damage_report_acks_sync_resolved_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."DamageReportAcknowledgements"
     set report_resolved_at = new.resolved_at
   where damage_report_uuid = new.id
     and report_resolved_at is distinct from new.resolved_at;

  return null;
end;
$$;

drop trigger if exists damage_report_acks_sync_resolved_at on public."DamageReports";

create trigger damage_report_acks_sync_resolved_at
  after update of resolved_at on public."DamageReports"
  for each row
  when (old.resolved_at is distinct from new.resolved_at)
  execute function public.damage_report_acks_sync_resolved_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- An acknowledgement is a record, not a document. A driver files their own and
-- can neither rewrite nor withdraw it — the same shape as a survey answer
-- (20260827130000), and for the same reason: it is evidence of what someone
-- saw on a given day.
--
-- Reads are deliberately cross-driver. The count a driver sees ("confirmed by
-- 3 drivers") is the thing that stops them filing a fourth report, and it is
-- worthless if it only counts themselves.

alter table public."DamageReportAcknowledgements" enable row level security;

drop policy if exists "damage_report_acks_select" on public."DamageReportAcknowledgements";
create policy "damage_report_acks_select" on public."DamageReportAcknowledgements"
  as permissive for select to authenticated
  using (
    public.get_current_driver_id() is not null
    or public.get_user_roles() && '{admin,account_manager,developer,viewer}'::text[]
  );

drop policy if exists "damage_report_acks_insert" on public."DamageReportAcknowledgements";
create policy "damage_report_acks_insert" on public."DamageReportAcknowledgements"
  as permissive for insert to authenticated
  with check (
    acknowledged_by_user_uuid = public.get_current_user_uuid()
    and (
      public.get_current_driver_id() is not null
      or public.get_user_roles() && '{admin}'::text[]
    )
  );

drop policy if exists "damage_report_acks_admin_write" on public."DamageReportAcknowledgements";
create policy "damage_report_acks_admin_write" on public."DamageReportAcknowledgements"
  as permissive for all to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);
