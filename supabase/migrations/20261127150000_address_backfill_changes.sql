-- =============================================================
-- Address Backfill change log (Dev Tools → Address Backfill)
--
-- The backfill fills in the map position of addresses saved without one, from the
-- administrator's browser. Every address it writes gets a row here with what the
-- address held before and what was written, so a run (or part of one) can be
-- reverted. A revert only restores rows that still hold exactly what the run wrote,
-- and stamps reverted_at; a row someone has edited since is left alone.
--
-- Administrators only, for reading and writing: the page writes these rows through
-- PowerSync, in the same batch as the address it changed.
-- =============================================================

create table if not exists public."AddressBackfillChanges" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user_uuid uuid references public."Users"(id) on delete set null,
  -- One backfill run: every change made by one press of Run shares it.
  run_uuid uuid not null,
  address_uuid uuid not null references public."Addresses"(id) on delete cascade,
  -- twin: copied from an identical address; google: Google's confident answer.
  source text not null check (source in ('twin', 'google')),
  -- Google's formatted address for a google change, to check by eye.
  google_answer text,
  -- { latitude, longitude, place_id, country } before and after the change.
  before jsonb not null,
  after jsonb not null,
  reverted_at timestamptz,
  reverted_by_user_uuid uuid references public."Users"(id) on delete set null
);

create index if not exists address_backfill_changes_run_idx
  on public."AddressBackfillChanges" (run_uuid);
create index if not exists address_backfill_changes_address_idx
  on public."AddressBackfillChanges" (address_uuid);

alter table public."AddressBackfillChanges" enable row level security;

create policy "rbac_select" on public."AddressBackfillChanges"
  as permissive for select to authenticated
  using (public.get_user_roles() && '{admin}'::text[]);

create policy "rbac_insert" on public."AddressBackfillChanges"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && '{admin}'::text[]);

-- PowerSync uploads are upserts, and a revert stamps reverted_at.
create policy "rbac_update" on public."AddressBackfillChanges"
  as permissive for update to authenticated
  using (public.get_user_roles() && '{admin}'::text[])
  with check (public.get_user_roles() && '{admin}'::text[]);

comment on table public."AddressBackfillChanges" is
  'One row per address the Address Backfill wrote: before/after map position, for reverting a run.';
