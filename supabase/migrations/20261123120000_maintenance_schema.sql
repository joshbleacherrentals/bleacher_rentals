-- =============================================================
-- Maintenance 01: schema for repairs, invoices and line items
-- Spec: docs/specs/maintenance-01-database-schema.md
--
-- One MaintenanceEvents row is one repair and one invoice. Its services are
-- MaintenanceLineItems. Damage reports can carry several categories
-- (DamageReportCategories). Vendors, Bleachers and MaintenanceEvents get the
-- columns the Maintenance module needs.
--
-- The database is shared with the driver app: everything new on an existing
-- table is nullable or has a default, so old driver builds keep working.
-- =============================================================

-- =====================
-- 1. Enums
-- =====================
create type public.maintenance_severity as enum ('minor', 'major', 'routine');

create type public.repair_status as enum (
  'inbound',
  'triaged',
  'waiting_repair',
  'in_repair',
  'confirm_repair',
  'completed'
);

create type public.vendor_status as enum (
  'verified',
  'caution',
  'under_review',
  'prospect',
  'do_not_use'
);

-- =====================
-- 2. DamageCategories
--    A table, not an enum, so categories can be added and switched off.
-- =====================
create table public."DamageCategories" (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  is_active boolean not null default true,
  constraint DamageCategories_pkey primary key (id),
  constraint DamageCategories_name_key unique (name)
);

insert into public."DamageCategories" (name) values
  ('Tires'),
  ('Wiring'),
  ('Jacks'),
  ('Hydraulics'),
  ('Welding'),
  ('Batteries'),
  ('Seating'),
  ('Hauling'),
  ('Unassigned')
on conflict (name) do nothing;

-- =====================
-- 3. DamageReportCategories
--    Many categories per damage report.
-- =====================
create table public."DamageReportCategories" (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  damage_report_uuid uuid not null,
  damage_category_uuid uuid not null,
  -- Mirror of DamageReports.resolved_at for the mobile sync rule, the same
  -- pattern as DamageReportAcknowledgements (20260910140000): a JOIN back to
  -- DamageReports would hit the 1000-row parameter cap (PSYNC_S2305).
  report_resolved_at timestamptz,
  constraint DamageReportCategories_pkey primary key (id),
  constraint DamageReportCategories_report_fkey
    foreign key (damage_report_uuid) references public."DamageReports" (id) on delete cascade,
  constraint DamageReportCategories_category_fkey
    foreign key (damage_category_uuid) references public."DamageCategories" (id)
);

create unique index "DamageReportCategories_report_category_uniq"
  on public."DamageReportCategories" (damage_report_uuid, damage_category_uuid);

create index "DamageReportCategories_category_idx"
  on public."DamageReportCategories" (damage_category_uuid);

-- A repeated pair is a NO-OP, never an error. A unique violation (23505) coming
-- from a phone would stall that driver's whole upload queue.
create or replace function public.damage_report_category_skip_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."DamageReportCategories" c
    where c.damage_report_uuid = new.damage_report_uuid
      and c.damage_category_uuid = new.damage_category_uuid
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists damage_report_category_skip_duplicate on public."DamageReportCategories";

create trigger damage_report_category_skip_duplicate
  before insert on public."DamageReportCategories"
  for each row
  execute function public.damage_report_category_skip_duplicate();

create or replace function public.damage_report_category_fill_resolved_at()
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

drop trigger if exists damage_report_category_fill_resolved_at on public."DamageReportCategories";

-- After the duplicate check, so a dropped row costs nothing.
create trigger damage_report_category_fill_resolved_at
  before insert or update of damage_report_uuid
  on public."DamageReportCategories"
  for each row
  execute function public.damage_report_category_fill_resolved_at();

create or replace function public.damage_report_categories_sync_resolved_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."DamageReportCategories"
     set report_resolved_at = new.resolved_at
   where damage_report_uuid = new.id
     and report_resolved_at is distinct from new.resolved_at;

  return null;
end;
$$;

drop trigger if exists damage_report_categories_sync_resolved_at on public."DamageReports";

create trigger damage_report_categories_sync_resolved_at
  after update of resolved_at on public."DamageReports"
  for each row
  when (old.resolved_at is distinct from new.resolved_at)
  execute function public.damage_report_categories_sync_resolved_at();

-- =====================
-- 4. New columns on MaintenanceEvents (the invoice header)
-- =====================
alter table public."MaintenanceEvents"
  add column vendor_uuid uuid,
  add column invoice_number text,
  add column status public.repair_status not null default 'inbound',
  add column completed_at timestamptz,
  -- Every existing event is USD: the default fills the existing rows.
  add column currency public.currency not null default 'USD',
  add column zone_uuid uuid,
  add constraint MaintenanceEvents_vendor_uuid_fkey
    foreign key (vendor_uuid) references public."Vendors" (id),
  add constraint MaintenanceEvents_zone_uuid_fkey
    foreign key (zone_uuid) references public."Zones" (id);

comment on column public."MaintenanceEvents".invoice_number is
  'The vendor''s invoice number, as written on the invoice (text, e.g. "JJ-5"). Unique within a vendor.';
comment on column public."MaintenanceEvents".zone_uuid is
  'The zone the invoice belongs to, taken at event_start: the bleacher''s own zone, or the borrowing zone when an accepted sub-rental covers event_start. One zone per invoice.';
comment on column public."MaintenanceEvents".cost_cents is
  'The full invoice total. When the invoice has MaintenanceLineItems, a trigger keeps it equal to their sum.';

-- Existing events are history, not open work.
update public."MaintenanceEvents"
   set status = 'completed'
 where event_end < current_date;

-- Invoice number is unique within a vendor. Events without a number or a
-- vendor, and deleted events, do not count.
create unique index "MaintenanceEvents_vendor_invoice_uniq"
  on public."MaintenanceEvents" (vendor_uuid, invoice_number)
  where invoice_number is not null and vendor_uuid is not null and deleted = false;

create index "MaintenanceEvents_vendor_uuid_idx" on public."MaintenanceEvents" (vendor_uuid);
create index "MaintenanceEvents_zone_uuid_idx" on public."MaintenanceEvents" (zone_uuid);

-- =====================
-- 5. MaintenanceLineItems
--    One line = one damage category on one bleacher. Zone, currency and author
--    are on the invoice. The total of a line is the sum of the four amounts.
-- =====================
create table public."MaintenanceLineItems" (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maintenance_event_uuid uuid not null,
  bleacher_uuid uuid not null,
  damage_category_uuid uuid,
  severity public.maintenance_severity not null,
  description text,
  labor_cents integer not null default 0,
  parts_cents integer not null default 0,
  tax_cents integer not null default 0,
  freight_cents integer not null default 0,
  deleted boolean not null default false,
  constraint MaintenanceLineItems_pkey primary key (id),
  constraint MaintenanceLineItems_maintenance_event_uuid_fkey
    foreign key (maintenance_event_uuid) references public."MaintenanceEvents" (id),
  constraint MaintenanceLineItems_bleacher_uuid_fkey
    foreign key (bleacher_uuid) references public."Bleachers" (id),
  constraint MaintenanceLineItems_damage_category_uuid_fkey
    foreign key (damage_category_uuid) references public."DamageCategories" (id),
  constraint MaintenanceLineItems_amounts_check check (
    labor_cents >= 0 and parts_cents >= 0 and tax_cents >= 0 and freight_cents >= 0
  )
);

create index "MaintenanceLineItems_maintenance_event_uuid_idx"
  on public."MaintenanceLineItems" (maintenance_event_uuid);
create index "MaintenanceLineItems_bleacher_uuid_idx"
  on public."MaintenanceLineItems" (bleacher_uuid);
create index "MaintenanceLineItems_damage_category_uuid_idx"
  on public."MaintenanceLineItems" (damage_category_uuid);

-- cost_cents stays the full invoice total: recomputed from the lines whenever
-- they change. An invoice that never had lines is never touched, so it keeps
-- the number it has. An invoice whose lines are all deleted gets 0. A line
-- moved to another invoice recomputes both.
create or replace function public.maintenance_line_items_sync_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_total bigint;
begin
  for v_event in
    select distinct e
    from unnest(array[
      case when tg_op <> 'INSERT' then old.maintenance_event_uuid end,
      case when tg_op <> 'DELETE' then new.maintenance_event_uuid end
    ]) as e
    where e is not null
  loop
    select coalesce(sum(li.labor_cents + li.parts_cents + li.tax_cents + li.freight_cents), 0)
      into v_total
    from public."MaintenanceLineItems" li
    where li.maintenance_event_uuid = v_event
      and li.deleted = false;

    update public."MaintenanceEvents" me
       set cost_cents = v_total::integer
     where me.id = v_event
       and me.cost_cents is distinct from v_total::integer;
  end loop;

  return null;
end;
$$;

drop trigger if exists maintenance_line_items_sync_cost on public."MaintenanceLineItems";

create trigger maintenance_line_items_sync_cost
  after insert or update or delete on public."MaintenanceLineItems"
  for each row
  execute function public.maintenance_line_items_sync_cost();

-- =====================
-- 6. MaintenanceBudgets
--    One budget per year and currency.
-- =====================
create table public."MaintenanceBudgets" (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  year integer not null,
  currency public.currency not null,
  amount_cents integer not null,
  constraint MaintenanceBudgets_pkey primary key (id),
  constraint MaintenanceBudgets_year_currency_key unique (year, currency),
  constraint MaintenanceBudgets_amount_check check (amount_cents >= 0)
);

-- =====================
-- 7. Bleachers: model number and asset value
--    asset_value_cents is USD for every bleacher. It must not reach the
--    drivers' phones: the mobile Bleachers rule in br_powersync has to become a
--    column list before the first value is stored (spec section 8).
-- =====================
alter table public."Bleachers"
  add column model_number text,
  add column asset_value_cents integer,
  add constraint Bleachers_asset_value_check check (asset_value_cents >= 0);

-- =====================
-- 8. Vendors: address, contact, services, status, notes
--    City, state or province and country come from Addresses.
-- =====================
alter table public."Vendors"
  add column address_uuid uuid,
  add column phone text,
  add column contact_name text,
  add column contact_email text,
  add column does_trailer_repair boolean not null default false,
  add column does_aluminum_welding boolean not null default false,
  add column does_mobile_repair boolean not null default false,
  add column is_parts_supplier boolean not null default false,
  add column status public.vendor_status,
  add column notes text,
  add constraint Vendors_address_uuid_fkey
    foreign key (address_uuid) references public."Addresses" (id);

create index "Vendors_address_uuid_idx" on public."Vendors" (address_uuid);

-- =====================
-- 9. Row level security
--    Staff rights follow repairs (MaintenanceEvents) and DamageReports.
--    DamageCategories and MaintenanceBudgets are written by admin + maintainer.
-- =====================
alter table public."DamageCategories" enable row level security;
alter table public."DamageReportCategories" enable row level security;
alter table public."MaintenanceLineItems" enable row level security;
alter table public."MaintenanceBudgets" enable row level security;

-- DamageCategories: read by drivers and staff; no delete policy (a category is
-- switched off with is_active).
create policy "rbac_select" on public."DamageCategories"
  as permissive for select to authenticated
  using (
    public.get_current_driver_id() is not null
    or public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]
  );

create policy "rbac_insert" on public."DamageCategories"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,maintainer}'::text[]);

create policy "rbac_update" on public."DamageCategories"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin,maintainer}'::text[])
  with check (public.get_user_roles() && '{admin,maintainer}'::text[]);

-- DamageReportCategories: the same staff as DamageReports. A driver adds
-- categories only to a report they created and cannot change or withdraw them.
create policy "rbac_select" on public."DamageReportCategories"
  as permissive for select to authenticated
  using (
    public.get_current_driver_id() is not null
    or public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]
  );

create policy "driver_insert_own_report" on public."DamageReportCategories"
  as permissive for insert to authenticated
  with check (
    public.get_current_driver_id() is not null
    and exists (
      select 1
      from public."DamageReports" dr
      where dr.id = damage_report_uuid
        and dr.created_by_user_uuid = public.get_current_user_uuid()
    )
  );

create policy "rbac_write" on public."DamageReportCategories"
  as permissive for all to authenticated
  using (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[])
  with check (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

-- MaintenanceLineItems: the same as MaintenanceEvents (the "account manager
-- edits only their own" rule lives in the interface, not in the database).
create policy "rbac_select" on public."MaintenanceLineItems"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

create policy "rbac_insert" on public."MaintenanceLineItems"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

create policy "rbac_update" on public."MaintenanceLineItems"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[])
  with check (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

create policy "rbac_delete" on public."MaintenanceLineItems"
  as permissive for delete to authenticated
  using (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

-- MaintenanceBudgets: read like repairs, written by admin + maintainer, no delete.
create policy "rbac_select" on public."MaintenanceBudgets"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

create policy "rbac_insert" on public."MaintenanceBudgets"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin,maintainer}'::text[]);

create policy "rbac_update" on public."MaintenanceBudgets"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin,maintainer}'::text[])
  with check (public.get_user_roles() && '{admin,maintainer}'::text[]);

-- Vendors: maintainer joins admin, account_manager and accountant for read, add
-- and edit. Delete stays admin + account_manager.
alter policy rbac_select on public."Vendors"
  using (public.get_user_roles() && '{admin,account_manager,accountant,maintainer}'::text[]);

alter policy rbac_insert on public."Vendors"
  with check (public.get_user_roles() && '{admin,account_manager,accountant,maintainer}'::text[]);

alter policy rbac_update on public."Vendors"
  using (public.get_user_roles() && '{admin,account_manager,accountant,maintainer}'::text[]);
