-- ============================================================================
-- WorkTrackers.{pickup,dropoff}_event_uuid — server-computed event links
--
-- The driver app's event roster (br_driver/docs/specs/event-bleacher-roster.md
-- section 4) used to guess which event a trip served with a phone-side
-- heuristic: the nearest booked event on the tracker's bleacher within a
-- window, no address check. Measured at ~35% misattribution on dev data —
-- good enough to ship a first cut, not good enough to trust.
--
-- This computes the real link in Postgres instead: an event only counts if
-- its address actually matches the tracker's pickup/dropoff address, and
-- there is no time window — distance in time is only a tie-break among
-- address-matching candidates, never a filter on its own. Nothing recorded
-- which event a tracker serves (a tracker is created from a dashboard cell,
-- bleacher + date, and its addresses are copies, not references to the
-- event's address), so the link is still inferred, just no longer guessed
-- from a bare heuristic.
-- ============================================================================

-- ── Section 1: address matching ("rule #3") — seam S7 ───────────────────────
--
-- Two addresses are the same place if their ZIP/postal-code index matches, or
-- their street text overlaps enough. Calibrated against the dev database's
-- hand-geocoded coordinates (2026-09-22): 99.35% recall, 2.28% false
-- positives on the actual runtime candidate set (the nearest-in-time booked
-- event per leg). Both known false-positive classes are frozen as MATCHING
-- in work_tracker_event_links.test.sql so a future threshold change shows
-- exactly what it moves. See spec section 4.3 for the full calibration.

-- Lowercase, strip everything outside [a-z0-9 ], split on whitespace, drop
-- stopwords, dedupe. Directions (n s e w, north south east west) are
-- deliberately NOT stopwords -- see spec section 4.3 for why that is
-- necessary but, for at least one known pair, not sufficient on its own.
-- Sorted so two equal word sets compare equal as arrays, not just as sets.
create or replace function public.normalize_street_words(s text)
returns text[]
language sql
immutable
as $$
  select coalesce(array(
    select distinct w from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(s, '')), '[^a-z0-9 ]', ' ', 'g'),
        '\s+'
      )
    ) as w
    where w <> ''
      and w not in ('st','street','ave','avenue','rd','road','dr','drive','blvd',
                     'boulevard','usa','canada','county','regional','municipality',
                     'on','lot','unit','of')
    order by w
  ), array[]::text[]);
$$;

-- First 5 lowercase alphanumeric characters of a ZIP/postal code, NULL if
-- nothing is left. Reads the ZIP column, not the street text -- an earlier
-- version of this rule mistakenly took the index from the address string
-- itself, which made e.g. "1561 Lake Shore Blvd W..." and "...E..." collide
-- on "1561l" (any two same-house-number addresses starting with the same
-- letter collide within 5 characters, regardless of street). The ZIP ties
-- the index to an actual geographic signal instead.
create or replace function public.address_zip_index(z text)
returns text
language sql
immutable
as $$
  select nullif(left(regexp_replace(lower(coalesce(z, '')), '[^a-z0-9]', '', 'g'), 5), '');
$$;

-- Pure -- no table reads. This is the pgTAP seam (S1 in the seam agreement,
-- S7 in the spec's numbering): a pair matches on index OR words, either
-- signal is enough. Threshold calibrated at 0.34 -- see spec section 4.3.
create or replace function public.address_text_matches(
  a_street text, a_zip text, b_street text, b_zip text
)
returns boolean
language plpgsql
immutable
as $$
declare
  a_idx text := public.address_zip_index(a_zip);
  b_idx text := public.address_zip_index(b_zip);
  a_words text[] := public.normalize_street_words(a_street);
  b_words text[] := public.normalize_street_words(b_street);
  overlap_count int;
  union_count int;
begin
  if a_idx is not null and a_idx = b_idx then
    return true;
  end if;

  if array_length(a_words, 1) is null or array_length(b_words, 1) is null then
    return false;
  end if;

  select count(*) into overlap_count from unnest(a_words) w where w = any(b_words);
  select count(distinct e) into union_count from unnest(a_words || b_words) e;

  return union_count > 0 and (overlap_count::numeric / union_count) >= 0.34;
end;
$$;

-- Thin wrapper for the trigger logic below: reads street/zip_postal off two
-- real Addresses rows and delegates. A missing id reads as no match, not an
-- error -- a tracker's address should never make event linking fail outright.
create or replace function public.addresses_match(a_id uuid, b_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select public.address_text_matches(a.street, a.zip_postal, b.street, b.zip_postal)
       from public."Addresses" a, public."Addresses" b
      where a.id = a_id and b.id = b_id),
    false
  );
$$;

-- ── Section 2: event selection for one tracker leg — seam S8 ────────────────
--
-- Booked, non-deleted events on the ASSIGNED bleacher (never
-- actual_bleacher_uuid -- see spec section 4.4) whose address matches, tied
-- broken by proximity to the trip date. NULL when nothing matches: a run to
-- storage. There is no time window -- distance in time only breaks ties
-- among address-matching candidates, never filters on its own.

create or replace function public.resolve_work_tracker_dropoff_event(
  p_bleacher_uuid uuid, p_date date, p_address_uuid uuid
)
returns uuid
language sql
stable
set search_path = public
as $$
  select e.id
    from public."BleacherEvents" be
    join public."Events" e on e.id = be.event_uuid
   where be.bleacher_uuid = p_bleacher_uuid
     and e.deleted = false
     and e.event_status = 'booked'
     and e.event_start >= p_date
     and public.addresses_match(e.address_uuid, p_address_uuid)
   order by e.event_start asc
   limit 1;
$$;

create or replace function public.resolve_work_tracker_pickup_event(
  p_bleacher_uuid uuid, p_date date, p_address_uuid uuid
)
returns uuid
language sql
stable
set search_path = public
as $$
  select e.id
    from public."BleacherEvents" be
    join public."Events" e on e.id = be.event_uuid
   where be.bleacher_uuid = p_bleacher_uuid
     and e.deleted = false
     and e.event_status = 'booked'
     and coalesce(e.event_end, e.event_start) <= p_date
     and public.addresses_match(e.address_uuid, p_address_uuid)
   order by coalesce(e.event_end, e.event_start) desc
   limit 1;
$$;

-- ── Section 3: the columns and the recompute triggers — seam S9 ────────────
--
-- Additive only: old builds don't see the new columns. Nothing in the app
-- writes them; the triggers below keep them current as the underlying data
-- changes (spec section 4.5).

alter table public."WorkTrackers"
  add column if not exists "dropoff_event_uuid" uuid references public."Events"(id),
  add column if not exists "pickup_event_uuid" uuid references public."Events"(id);

comment on column public."WorkTrackers"."dropoff_event_uuid" is
  'Set by work_tracker_event_links_recompute(). The earliest booked, '
  'non-deleted event on the assigned bleacher whose address matches '
  'dropoff_address_uuid, at or after date. NULL for a run to storage.';
comment on column public."WorkTrackers"."pickup_event_uuid" is
  'Set by work_tracker_event_links_recompute(). The latest booked, '
  'non-deleted event on the assigned bleacher whose address matches '
  'pickup_address_uuid, at or before date. NULL for a run to storage.';

-- Row 1 of the recompute table: the tracker's own date / bleacher / address
-- columns. Fires on every insert/update, not `UPDATE OF …` -- same reasoning
-- as work_tracker_history_snapshot (sync-bucket-limit.md): a column-scoped
-- trigger only sees the statement's own SET list, and this needs to recompute
-- whenever ANY of the four inputs could have changed, including through a
-- trigger higher up the chain that itself uses a plain UPDATE.
--
-- Reads only NEW's own columns -- never reaches out to Addresses, Events or
-- BleacherEvents -- so the AFTER triggers on those tables below, which UPDATE
-- WorkTrackers to force a refresh, cannot recurse back into themselves.
--
-- SECURITY DEFINER, like the AFTER cascade triggers below: it calls
-- resolve_work_tracker_{pickup,dropoff}_event, which has EXECUTE revoked
-- from authenticated/anon (they are internal helpers, not an RPC). Without
-- this, ANY WorkTrackers write from the web app or the driver app -- not
-- just the cascades -- hits "permission denied for function
-- resolve_work_tracker_dropoff_event", because a non-SECURITY-DEFINER
-- trigger still runs as the invoking role for privilege-checking purposes on
-- every call it makes, not just for firing itself. Caught live against the
-- web app before pgTAP caught it: every test above ran as the `postgres`
-- superuser, which ignores GRANT/REVOKE entirely, so only a test that
-- explicitly switches to `authenticated` (SET LOCAL ROLE, like driver_rls.test.sql)
-- exercises this path -- see work_tracker_event_links.test.sql's regression test.
create or replace function public.work_tracker_event_links_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.dropoff_event_uuid := public.resolve_work_tracker_dropoff_event(
    new.bleacher_uuid, new.date, new.dropoff_address_uuid
  );
  new.pickup_event_uuid := public.resolve_work_tracker_pickup_event(
    new.bleacher_uuid, new.date, new.pickup_address_uuid
  );
  return new;
end;
$$;

drop trigger if exists work_tracker_event_links_recompute on public."WorkTrackers";
create trigger work_tracker_event_links_recompute
  before insert or update on public."WorkTrackers"
  for each row execute function public.work_tracker_event_links_recompute();

-- Forces the BEFORE trigger above to recompute a set of trackers, by making
-- an ordinary UPDATE. Same pattern as refresh_work_tracker_history.
create or replace function public.refresh_work_tracker_event_links(tracker_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public."WorkTrackers"
     set updated_at = now()
   where id = any(tracker_ids);
$$;

-- Row 2: an Addresses edit. Two ways a tracker is affected -- it points at
-- this address directly (pickup/dropoff_address_uuid), or its assigned
-- bleacher is booked into an event whose address_uuid is this one.
create or replace function public.work_tracker_event_links_address_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_event_links(array(
    select wt.id from public."WorkTrackers" wt
     where wt.pickup_address_uuid = new.id or wt.dropoff_address_uuid = new.id
    union
    select wt.id from public."WorkTrackers" wt
     where wt.bleacher_uuid in (
       select be.bleacher_uuid from public."BleacherEvents" be
       join public."Events" e on e.id = be.event_uuid
      where e.address_uuid = new.id
     )
  ));
  return null;
end;
$$;

drop trigger if exists work_tracker_event_links_address_refresh on public."Addresses";
create trigger work_tracker_event_links_address_refresh
  after update of street, city, zip_postal on public."Addresses"
  for each row execute function public.work_tracker_event_links_address_refresh();

-- Row 3: an Events edit. Every tracker on every bleacher booked into this
-- event may now resolve differently.
create or replace function public.work_tracker_event_links_event_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_event_links(array(
    select wt.id from public."WorkTrackers" wt
     where wt.bleacher_uuid in (
       select be.bleacher_uuid from public."BleacherEvents" be
      where be.event_uuid = new.id
     )
  ));
  return null;
end;
$$;

drop trigger if exists work_tracker_event_links_event_refresh on public."Events";
create trigger work_tracker_event_links_event_refresh
  after update of event_start, event_end, event_status, deleted, address_uuid
  on public."Events"
  for each row execute function public.work_tracker_event_links_event_refresh();

-- Row 4: a BleacherEvents change -- booking or unbooking a bleacher from an
-- event. Both OLD and NEW bleacher, so a row moved between bleachers (or
-- deleted, or inserted) refreshes whichever side(s) actually exist.
create or replace function public.work_tracker_event_links_bleacher_event_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_work_tracker_event_links(array(
    select wt.id from public."WorkTrackers" wt
     where wt.bleacher_uuid = any(array_remove(array[
       case when tg_op <> 'INSERT' then old.bleacher_uuid end,
       case when tg_op <> 'DELETE' then new.bleacher_uuid end
     ], null))
  ));
  return null;
end;
$$;

drop trigger if exists work_tracker_event_links_bleacher_event_refresh on public."BleacherEvents";
create trigger work_tracker_event_links_bleacher_event_refresh
  after insert or update or delete on public."BleacherEvents"
  for each row execute function public.work_tracker_event_links_bleacher_event_refresh();

-- Internal helpers only -- never an RPC a client calls directly. Same
-- defense-in-depth as the history_json triggers.
revoke execute on function public.refresh_work_tracker_event_links(uuid[]) from public, anon, authenticated;
revoke execute on function public.addresses_match(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_work_tracker_dropoff_event(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_work_tracker_pickup_event(uuid, date, uuid) from public, anon, authenticated;

-- ============================================================================
-- One-time backfill: every existing tracker gets its columns computed once.
-- Bumps updated_at through the existing trigger, same as the history_json
-- backfill -- no reader orders or compares WorkTrackers.updated_at.
-- ============================================================================

update public."WorkTrackers" set updated_at = now();
