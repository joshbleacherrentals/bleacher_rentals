-- ============================================================================
-- Events.lost_reason — why a quote/event was lost.
--
-- Marking something Lost is the end of the line for that quote, so it is the
-- last moment the reason can still be captured. Both places that set the status
-- (the quote edit page and the dashboard event modal) now require one.
--
-- Deliberately NOT enforced here: "event_status = 'lost' implies lost_reason is
-- not null". Events lost before this column existed have no reason, and
-- backfilling them with a guess would put fiction into the very report this
-- column exists to produce. Old rows keep a null reason and read as "not
-- recorded"; the requirement is enforced in the app, on save.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_lost_reason') then
    create type public.event_lost_reason as enum (
      'out_of_service_area',
      'sold_out',
      'size_does_not_work',
      'price_too_high',
      'other'
    );
  end if;
end
$$;

alter table public."Events"
  add column if not exists lost_reason public.event_lost_reason null,
  add column if not exists lost_reason_note text null;

-- 'Other' is only worth recording together with the note that explains it.
alter table public."Events"
  drop constraint if exists events_lost_reason_other_needs_note;
alter table public."Events"
  add constraint events_lost_reason_other_needs_note
  check (lost_reason is distinct from 'other' or lost_reason_note is not null);

comment on column public."Events".lost_reason is
  'Why the quote was lost. Required by the app whenever event_status = ''lost'', '
  'cleared on any save that leaves another status. Null on events lost before '
  'this column existed.';
comment on column public."Events".lost_reason_note is
  'Free-text explanation, required when lost_reason = ''other'' and null otherwise.';
