-- =============================================================
-- Venues Migration
--
-- See docs/specs/venue-history.md for the full design.
--
-- 1. Create Venues table (name + its own private Addresses row)
-- 2. Add Events.venue_uuid (nullable FK)
-- 3. Add Contacts.default_venue_uuid (nullable FK)
-- 4. Trigger: keep Events.address_uuid in sync with its venue
-- 5. RLS: mirrors Contacts (select: admin/account_manager/viewer,
--    insert/update: admin/account_manager)
-- =============================================================

-- =====================
-- 1. Venues
-- =====================
create table public."Venues" (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null,
  address_uuid          uuid        not null references public."Addresses"(id),
  created_by_user_uuid  uuid        references public."Users"(id)
                          default public.get_current_user_uuid(),
  created_at            timestamptz not null default now(),
  deleted               boolean     not null default false
);

create index "Venues_address_uuid_idx" on public."Venues" (address_uuid);

alter table public."Venues" enable row level security;

create policy "venues_select" on public."Venues"
  as permissive for select to authenticated
  using (
    public.get_user_roles() && '{admin,account_manager,viewer}'::text[]
  );

create policy "venues_insert" on public."Venues"
  as permissive for insert to authenticated
  with check (
    public.get_user_roles() && '{admin,account_manager}'::text[]
  );

create policy "venues_update" on public."Venues"
  as permissive for update to authenticated
  using (
    public.get_user_roles() && '{admin,account_manager}'::text[]
  )
  with check (
    public.get_user_roles() && '{admin,account_manager}'::text[]
  );

-- =====================
-- 2. Events.venue_uuid
-- =====================
alter table public."Events"
  add column if not exists venue_uuid uuid references public."Venues"(id);

create index if not exists "Events_venue_uuid_idx" on public."Events" (venue_uuid);

-- =====================
-- 3. Contacts.default_venue_uuid
-- =====================
alter table public."Contacts"
  add column if not exists default_venue_uuid uuid references public."Venues"(id);

-- =====================
-- 4. Trigger: keep Events.address_uuid in sync with its venue.
--    Fires only when venue_uuid itself changes (picking a venue, or a
--    different one). App code is responsible for setting venue_uuid = null
--    on "detach" (manual address edit) so this trigger never runs then.
-- =====================
create or replace function public.sync_event_address_from_venue()
returns trigger
language plpgsql
as $$
begin
  if NEW.venue_uuid is not null then
    select address_uuid into NEW.address_uuid
    from public."Venues"
    where id = NEW.venue_uuid;
  end if;
  return NEW;
end;
$$;

create trigger events_sync_address_from_venue
  before insert or update of venue_uuid on public."Events"
  for each row
  execute function public.sync_event_address_from_venue();
