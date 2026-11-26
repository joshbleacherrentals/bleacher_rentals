-- =============================================================
-- Vendors page: the vendor type, and a maintainer's rights on a vendor's address
-- Spec: docs/specs/vendors-page.md (D1, D2, D3)
--
-- Vendors.type tells a driver's vendor company ('driver') from a repair or parts
-- company ('repairs'). It is NOT NULL with a default, so every vendor that exists
-- today becomes 'driver', and an old client that inserts a vendor without a type
-- (an old open tab, an unsent PowerSync queue) still works.
--
-- The one RLS change: the two maintainer policies on Addresses admit an address that
-- a vendor points at (Vendors.address_uuid), not only one a repair points at. They are
-- ALTERed; no policy is created. A customer's address stays out of a maintainer's reach.
-- =============================================================

create type public.vendor_type as enum ('driver', 'repairs');

alter table public."Vendors"
  add column type public.vendor_type not null default 'driver';

comment on column public."Vendors".type is
  'driver: a company that employs our drivers and is paid through QuickBooks bills. '
  'repairs: a repair or parts company.';

-- D3: a maintainer also changes and deletes an address a vendor points at.
alter policy maintainer_addresses_update on public."Addresses"
  using (
    public.get_user_roles() && '{maintainer}'::text[]
    and (
      exists (select 1 from public."MaintenanceEvents" me where me.address_uuid = "Addresses".id)
      or exists (select 1 from public."Vendors" v where v.address_uuid = "Addresses".id)
    )
  );

alter policy maintainer_addresses_delete on public."Addresses"
  using (
    public.get_user_roles() && '{maintainer}'::text[]
    and (
      exists (select 1 from public."MaintenanceEvents" me where me.address_uuid = "Addresses".id)
      or exists (select 1 from public."Vendors" v where v.address_uuid = "Addresses".id)
    )
  );
