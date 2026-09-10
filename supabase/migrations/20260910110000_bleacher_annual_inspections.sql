-- ============================================================================
-- Bleacher annual inspections — a due date per bleacher, and the paperwork
-- that goes with it.
--
-- Spec: docs/specs/bleacher-annual-inspections.md
--
-- WHY A TABLE AND NOT A COLUMN ON "Bleachers"
--
-- The obvious shape is `Bleachers.next_inspection_due` plus a PDF path beside
-- `nvis_pdf_path`, and it is wrong for one concrete reason: the inspection
-- document is replaced every year. A single column would overwrite last year's
-- certificate, and with it the only record that the inspection ever happened —
-- which is the first thing an insurer asks for. One row per inspection keeps
-- the history and costs a join that PowerSync runs locally for free.
--
-- Deliberately NOT cached back onto "Bleachers" as a denormalised due date.
-- 20260903130000_drop_payment_installment_cache_columns.sql is this codebase's
-- own record of how that ends.
--
-- WHY `date` AND NOT `timestamptz`
--
-- An annual inspection happens on a calendar day. Stored as a timestamp, a
-- bleacher would sit in the yellow band for one reader and the red band for
-- another purely because of where they are, and the "30 days out" line the
-- warehouse works to would stop meaning one thing.
--
-- WHY `inspected_on` IS NULLABLE
--
-- The first thing anyone needs is to type in the dates they already keep on a
-- spreadsheet — a row that says only "the next one is due 2027-03-14", with no
-- inspection recorded behind it. Requiring an inspection date would make the
-- feature unusable on day one, when there is nothing but due dates to enter.
--
-- WHICH ROW IS CURRENT
--
-- The most recently created row for a bleacher (created_at desc, id desc).
-- Correcting a mistake means editing that row; a new row means a new
-- inspection happened. No is_active flag, and so no way for two rows to both
-- claim to be the current one.
-- ============================================================================

create table if not exists public."BleacherAnnualInspections" (
  id            uuid        not null default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid        null,
  bleacher_uuid uuid        not null,
  inspected_on  date        null,
  next_due_on   date        not null,
  document_path text        null,
  notes         text        null,
  constraint bleacher_annual_inspections_pkey primary key (id),
  constraint bleacher_annual_inspections_bleacher_uuid_fkey
    foreign key (bleacher_uuid) references public."Bleachers" (id) on delete cascade,
  constraint bleacher_annual_inspections_created_by_fkey
    foreign key (created_by) references public."Users" (id) on delete set null
) tablespace pg_default;

create index if not exists "BleacherAnnualInspections_bleacher_uuid_idx"
  on public."BleacherAnnualInspections" using btree (bleacher_uuid) tablespace pg_default;

create index if not exists "BleacherAnnualInspections_next_due_on_idx"
  on public."BleacherAnnualInspections" using btree (next_due_on) tablespace pg_default;

comment on table public."BleacherAnnualInspections" is
  'One row per annual inspection of a bleacher. The current record is the most '
  'recently created row (created_at desc, id desc); older rows are the history, '
  'each with the certificate that was issued at the time.';

-- ── RLS: mirrors who may see and edit a bleacher ────────────────────────────
--
-- Drivers get no policy at all. The mobile app has no screen for this, and a
-- row a client can never render is a row it should never sync.

alter table public."BleacherAnnualInspections" enable row level security;

drop policy if exists "bleacher_annual_inspections_select" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_select" on public."BleacherAnnualInspections"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager,viewer}'::text[]);

drop policy if exists "bleacher_annual_inspections_insert" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_insert" on public."BleacherAnnualInspections"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager}'::text[]);

drop policy if exists "bleacher_annual_inspections_update" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_update" on public."BleacherAnnualInspections"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[])
  with check (public.get_user_roles() && '{admin,account_manager}'::text[]);

drop policy if exists "bleacher_annual_inspections_delete" on public."BleacherAnnualInspections";
create policy "bleacher_annual_inspections_delete" on public."BleacherAnnualInspections"
  as permissive for delete to authenticated
  using (public.get_user_roles() && '{admin,account_manager}'::text[]);

-- ── The whole notification system ───────────────────────────────────────────
--
-- One column, and no notifications table anywhere.
--
-- A bleacher changes status on three days that are pure arithmetic on
-- next_due_on: 30 days before, 7 days before, and the date itself. So "what is
-- new since I last looked" is a comparison, not a stored event: a crossing
-- counts when it falls in (inspection_queue_last_seen_at, today]. Nothing to
-- write when a threshold passes, nothing to clean up, and it works offline —
-- the same shape as Users.changelog_last_read_at.

alter table public."Users"
  add column if not exists inspection_queue_last_seen_at timestamptz null;

comment on column public."Users".inspection_queue_last_seen_at is
  'When this user last opened /annual-inspections. Bleachers that crossed a '
  '30-day, 7-day or overdue threshold after this moment are highlighted once, '
  'then stop being highlighted on the next visit.';

-- ── Storage for the inspection certificates ─────────────────────────────────
-- Same shape as bleacher-nvis (20260410205125_nvis-field.sql).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bleacher-inspections',
  'bleacher-inspections',
  true,
  10485760, -- 10MB, as with NVIS
  array['application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "bleacher-inspections: select" on storage.objects;
create policy "bleacher-inspections: select"
  on storage.objects for select to authenticated
  using (bucket_id = 'bleacher-inspections');

drop policy if exists "bleacher-inspections: insert" on storage.objects;
create policy "bleacher-inspections: insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'bleacher-inspections');

drop policy if exists "bleacher-inspections: update" on storage.objects;
create policy "bleacher-inspections: update"
  on storage.objects for update to authenticated
  using (bucket_id = 'bleacher-inspections');

drop policy if exists "bleacher-inspections: delete" on storage.objects;
create policy "bleacher-inspections: delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'bleacher-inspections');
