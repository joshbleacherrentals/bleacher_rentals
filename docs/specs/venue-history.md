# Spec: Venues (address history, like the Contact history sidesheet)

Status: **APPROVED** (2026-09-11)
Owner: quotesAndBookings
Surface affected: `ContractTab` (Contract tab of the quote detail view), `EventDetailsSection`
(create/edit quote), `CreateContactModal`, `CoreTab` (dashboard event modal, `eventConfiguration`)

Related work already shipped: [`ContactHistorySheet`](../../src/features/quotesAndBookings/components/quoteDetail/tabs/ContactHistorySheet.tsx)

- [`fetchContactEvents`](../../src/features/quotesAndBookings/db/fetchContactEvents.ts) — the
  Contact-side version of this exact feature. This spec's sidesheet reuses the same accordion
  layout and row shape.

---

## 0. Why not just reuse `Addresses`?

Investigated and rejected. Three problems, in order of severity:

1. **Not deduped.** [`createQuoteEvent.ts`](../../src/features/quotesAndBookings/db/createQuoteEvent.ts#L16-L36)
   inserts a brand-new `Addresses` row on every quote, even when the venue is identical to one
   already on file. There is no lookup-by-`place_id` or lookup-by-street before insert.
2. **Edits mutate in place.** [`updateQuoteEvent.ts`](../../src/features/quotesAndBookings/db/updateQuoteEvent.ts#L57-L84)
   does `UPDATE Addresses SET ... WHERE id = existingAddressUuid`. If we started sharing one
   `Addresses` row across events, editing one event's address would silently corrupt every other
   event (and every Company/StorageLocation/SalesOffice) pointing at the same row — none of that
   call site does copy-on-write today.
3. **No stable dedup key.** `place_id` is only populated when the address came through Google
   Places autocomplete; a manually-typed address has none. Grouping "same venue" by fuzzy-matching
   street text is unreliable (typos, "St" vs "Street", suite numbers).
4. **No name field.** `Addresses` is raw geocoded fields only; the ask is to show something like
   "Lincoln High School Stadium," not a street string.

`Addresses` stays exactly as-is (still shared by Companies/StorageLocations/SalesOffices/etc,
still mutate-in-place on edit). A new `Venues` table sits on top of it with an explicit,
user-driven link, so nothing about today's behavior changes for anyone who isn't touching venues.

### 0.1 Should editing an event's address ever propagate back up to the Venue?

Considered and rejected, for the same reason as §0: it would recreate the exact "edit one, quietly
mutate many" hazard Venues exists to prevent. If fixing one event's address silently rewrote the
shared Venue — and thus every _other_ event pointing at it — a single typo correction on one
booking could redirect delivery trucks for unrelated future bookings at "the same" venue. Editing
an event's address and correcting a venue's real address are two different intents ("this booking
is different this time" vs. "the venue's data was wrong") that only a human can tell apart, so they
stay two different, deliberate actions: editing an event's address **detaches** it from the venue
(§ Locked decisions); a future, explicit "Edit Venue" flow — not built here — is where a real
address correction would propagate to every linked event, with the user shown how many events that
affects before confirming.

---

## Locked decisions (confirmed by owner)

- **No backfill.** Existing events keep `venue_uuid = null` forever unless someone re-saves them
  through the new picker. The Contract tab's Venue section for those events stays exactly as it
  renders today: plain address text, not clickable.
- **Venue picker = autocomplete existing + "add new."** Typing searches existing `Venues` by name
  or address; if nothing matches, falls through to today's Google Places address entry and a new
  `Venues` row is created behind the scenes.
- **Contacts get a venue picker on creation.** `CreateContactModal` gets the same picker,
  optional. Result is stored as `Contacts.default_venue_uuid`.
- **Auto-fill, never overwrite.** On the quote form, selecting a contact fills the venue field
  **only if it is currently empty**. If a venue is already picked, choosing a different contact
  never touches it. Contact and venue are otherwise fully independent selections.
- **No write-back.** Assigning a venue to an event never updates `Contacts.default_venue_uuid`,
  even if the contact didn't have one. The default is set only via the contact's own record
  (creation, or a future "edit contact" venue field — not in scope here).
- **Required to send, not to save a draft.** Matches the existing convention: a draft can be saved
  with no venue at all ([`draftSaveDefaults`](../../src/features/quotesAndBookings/utils/quoteValidation.ts)
  never blocks on address today), but [`validateQuoteForSend`](../../src/features/quotesAndBookings/utils/quoteValidation.ts#L27-L53)
  already refuses to send/preview without `eventAddressData` — that check becomes a `venueId`
  check (§3.1). In the dashboard event modal (`CoreTab`, §3.5), address is required to _save_ at
  all today (`checkEventFormRules`) — venue keeps that same strictness there; the two flows are
  allowed to differ because they already did.
- **`Events.address_uuid` sync is a DB trigger, not app code.** See §1.3. Removes the need for
  `createQuoteEvent.ts` / `updateQuoteEvent.ts` / dashboard's `updateEvent.ts` to each carry their
  own copy of "when venue_uuid is set, copy its address_uuid down" — one trigger, can't drift.
- **Editing an event's address while linked to a venue detaches it.** No auto-propagation from an
  event's address back up to the Venue (see §0.1 for why). Typing a different address into the
  `VenuePicker`'s address field while a venue is selected clears that event's `venue_uuid` back to
  `null` and gives the event its own private `Addresses` row — the Venue and every other event
  linked to it are untouched. Correcting a Venue's real address for every event that uses it is
  explicitly out of scope (see Non-goals) — a future, deliberate "Edit Venue" action, not a side
  effect of editing one booking.

### Non-goals

- Editing an existing Venue's name/address from inside the quote flow (pick or create-new only,
  mirrors how `+ New Contact` works today — no inline "edit this venue").
- Backfilling `venue_uuid` on historical events.
- An "edit contact" modal venue field (only `CreateContactModal` gets the picker; changing a
  contact's default venue later is out of scope).
- Deleting/merging venues.
- Changing anything about how `Addresses` itself is created, updated, or shared today.

---

## 1. DB schema

### 1.1 Migration

`supabase/migrations/<ts>_venues.sql`

```sql
create table public."Venues" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_uuid uuid not null references public."Addresses"(id),
  created_at timestamptz not null default now(),
  created_by_user_uuid uuid references public."Users"(id),
  deleted boolean not null default false
);

create index venues_address_uuid_idx on public."Venues"(address_uuid);

alter table public."Events"
  add column if not exists venue_uuid uuid references public."Venues"(id);

alter table public."Contacts"
  add column if not exists default_venue_uuid uuid references public."Venues"(id);
```

- `Venues.address_uuid` points at its **own private** `Addresses` row — created alongside the
  Venue, never shared with an unrelated Company/StorageLocation/Event the way today's per-event
  addresses aren't shared either. This sidesteps the mutate-in-place hazard from §0: editing a
  Venue's address only ever touches that Venue's own row.
- `Events.address_uuid` is untouched and stays populated exactly as today (still used by anything
  that reads an event's address directly, e.g. transportation/PDF/bill-of-lading code). `venue_uuid`
  is additive. When a venue is picked, `venue_uuid` is written on the Event and a DB trigger (§1.3)
  — not app code — keeps `address_uuid` in sync, so no existing reader of `Events.address_uuid`
  needs to change.
- `Contacts.default_venue_uuid` nullable, no default, no back-fill.

### 1.2 PowerSync

`src/lib/powersync/AppSchema.ts`:

```ts
const VenuesCols = {
  created_at: column.text,
  name: column.text,
  address_uuid: column.text,
  created_by_user_uuid: column.text,
  deleted: column.integer,
} satisfies PowerSyncColsFor<"Venues">;
const Venues = new Table(VenuesCols, {
  indexes: { address_uuid: ["address_uuid"] },
});
```

- Add `venue_uuid: column.text` to `EventsCols` (indexed, same pattern as `contact_uuid`).
- Add `default_venue_uuid: column.text` to `ContactsCols`.
- Register `Venues` in the schema export + sync rules (bucket definitions on the PowerSync
  dashboard need the new table added — same step as any new table per
  [POWERSYNC_ARCHITECTURE.md](../POWERSYNC_ARCHITECTURE.md)).
- `npm run gtl` after the migration lands, to regen `database.types.ts`.

### 1.3 Trigger: keep `Events.address_uuid` in sync with its venue

```sql
create or replace function sync_event_address_from_venue()
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
  execute function sync_event_address_from_venue();
```

- Fires only when `venue_uuid` itself changes (picking a venue, or picking a different one) — not
  on every `Events` update, so unrelated saves aren't touched.
- `Events.address_uuid` ends up literally equal to `Venues.address_uuid` (the venue's own private
  row id), not a copy. That means a future "Edit Venue" flow that updates the _contents_ of that
  `Addresses` row in place (not swap-in-a-new-row) needs **no second trigger** — every linked
  event already points at the same row. Worth keeping in mind if that flow is ever designed
  differently (row-swap instead of in-place edit), which would need its own
  `Venues.address_uuid`-change trigger to fan out.
- App code still explicitly writes `venue_uuid = null` (never lets the trigger run) on detach —
  see §3.1 and §3.5 — so a manually-typed address doesn't get quietly re-pointed back through this
  trigger.

---

## 2. TypeScript contracts

### 2.1 `fetchVenueEvents.ts` (mirrors `fetchContactEvents.ts`)

```ts
// src/features/quotesAndBookings/db/fetchVenueEvents.ts
export type VenueEvent = {
  id: string;
  eventName: string | null;
  invoiceNumber: number | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
};
export type VenueEventBuckets = { past: VenueEvent[]; future: VenueEvent[] };

export function bucketAndSortVenueEvents(rows: VenueEventRow[], nowIso?: string): VenueEventBuckets; // same past/future split + sort as bucketAndSortContactEvents, no `relation` tag needed (single match key: venue_uuid)

export async function fetchVenueEvents(
  venueUuid: string,
  nowIso?: string,
): Promise<VenueEventBuckets>;
```

`WHERE venue_uuid = :venueUuid AND deleted = 0` — single-key match, simpler than the Contact
version's `contact_uuid OR finance_contact_uuid`.

### 2.2 `VenueHistorySheet.tsx`

Same shell as `ContactHistorySheet` (two-item accordion, Past/Future, row = event name + invoice
number + dates + status badge, opens `/quotes-bookings/{id}` in a new tab). No relation badge
(every row's relation is "this is the venue"). Given the near-total structural overlap with
`ContactHistorySheet`, during implementation extract the shared row/list/accordion-shell JSX into
one `EventHistorySheet` component parameterized by title + fetch fn, rather than hand-duplicating
~140 lines. (Judgment call at implementation time; not re-litigating in this spec.)

### 2.3 `VenuePicker` component

New shared component, used by both `EventDetailsSection` (quote form) and `CreateContactModal`.
Lives at the top level (`src/components/VenuePicker.tsx`), same pattern as the existing
`AddressAutoComplete.tsx` — neither `quotesAndBookings` nor `companiesContacts` imports across the
other's feature boundary to use it.

```ts
// src/components/VenuePicker.tsx
export type VenuePickerValue =
  | { mode: "venue"; venueId: string; name: string; address: AddressFields }
  | { mode: "manual"; venueId: null; address: AddressFields } // detached: address typed/edited directly
  | { mode: "empty"; venueId: null; address: null };

type VenuePickerProps = {
  value: VenuePickerValue;
  onChange: (value: VenuePickerValue) => void;
  required?: boolean; // drives the red asterisk only — each caller's own validate fn still gates saving
};
```

Behavior — two distinct ways to change what's populated, which is the whole point:

1. **`SearchableSelect` over existing `Venues`** (search by name + street/city), same pattern as
   `ClientInfoSection`'s contact select. Picking a row emits `{ mode: "venue", venueId, name,
address }`.
   - Last row: "+ Add new venue" → reveals a small inline form: `name` text field +
     `AddressAutocomplete` (reuse [`AddressAutoComplete`](../../src/components/AddressAutoComplete.tsx)
     exactly as `EventDetailsSection` uses it today) + a confirm button that creates the `Venues`
     row (and its private `Addresses` row) immediately, then emits `{ mode: "venue", ... }` for it.
     Implementer's call whether this opens as a small modal or an inline panel; the DB write and
     resulting value are what's locked.
2. **An address field, pre-filled from whatever's currently selected** (the venue's address, or
   blank). Directly editing this — typing a different address, or re-picking a different real-world
   place via Google Places, without going through the venue select above — emits
   `{ mode: "manual", venueId: null, address }`. This is the detach path (§ Locked decisions,
   §0.1): the caller is responsible for clearing any previously-set `venue_uuid` and treating the
   typed address as this record's own private one, exactly like address entry worked before Venues
   existed.

`mode` is the signal every write path (§3.1, §3.5) branches on: `"venue"` → write `venue_uuid`,
let the trigger handle `address_uuid`; `"manual"` → write `address_uuid` directly (insert-or-update
its own private `Addresses` row, same logic as today's `createQuoteEvent`/`updateEvent`) and set
`venue_uuid = null` explicitly, never leaving a stale value for the trigger to act on later.

### 2.4 Store / form field additions

`useCreateQuoteStore.ts`: add `venueId: string | null` (default `null`), included in the
`RESETTABLE_FIELDS`-style list next to `contactId` (check current reset list at
[`useCreateQuoteStore.ts:188`](../../src/features/quotesAndBookings/state/useCreateQuoteStore.ts#L188)).
`eventAddress`/`eventAddressData` stay as the fields that actually hold the resolved address
(written from either `VenuePickerValue` mode, per §2.3) — `venueId` is purely "is this event
linked to a venue, and which one."

`CreateContactModal.tsx`: add local `venueId` state, passed through `CreatedContact` and into
`createContact()`. (No "manual" mode concern here — a brand-new contact's default venue is either
picked/created or left blank; there's nothing to detach from yet.)

`useCurrentEventStore.ts` (dashboard, §3.5): add `venueUuid: string | null` (default `null`)
alongside the existing `addressData`.

---

## 3. Behaviour

### 3.1 Quote form — `EventDetailsSection.tsx`

Replace the "Event Address" `AddressAutocomplete` field with the `VenuePicker`. Selecting a venue
sets `eventAddress` / `eventAddressData` from the venue's own address (so every existing
downstream consumer of those store fields — PDF, tax lookup, transportation alerts — needs no
changes) **and** `venueId`. The field stays optional for draft saves (`draftSaveDefaults` is
untouched) — only `validateQuoteForSend` gates on it, swapping its existing
`if (!state.eventAddressData) missing.push("Event Address")` check for
`if (!state.venueId) missing.push("Venue")`.

### 3.2 Quote form — `ClientInfoSection.tsx`, `handleContactSelect`

```ts
const handleContactSelect = (cId: string | null) => {
  setField("contactId", cId);
  if (!cId) return;
  const contact = contacts.find((c) => c.id === cId);
  if (contact) {
    setField("contactName", ...);
    if (contact.email) setField("companyEmail", contact.email);
    if (contact.phone) setField("phone", contact.phone);
    // NEW: auto-fill venue only if the field is currently blank.
    if (!useCreateQuoteStore.getState().venueId && contact.defaultVenueId) {
      // load the venue's address + set venueId, eventAddress, eventAddressData
    }
  }
};
```

Needs `useContacts()` (or its underlying query) to also select `default_venue_uuid`, and a small
helper to resolve a venue id → its address fields (reuse `fetchVenueEvents`'s row shape or a
one-off `fetchVenueAddress(venueId)`).

### 3.3 `CreateContactModal.tsx`

Add a `VenuePicker` field (optional, no `required`) below Company. On save, pass `venueId` through
to `createContact()`, which writes `default_venue_uuid`.

### 3.4 Contract tab — `ContractTab.tsx`

Venue block:

```tsx
{
  quote.venue ? (
    <button onClick={() => setVenueSheetOpen(true)} className="...">
      {quote.venue.name}
    </button>
  ) : (
    <p>{quote.address.street}...</p> // unchanged fallback for events with no venue_uuid
  );
}
```

`fetchQuoteDetail.ts` needs a `venue: { id: string; name: string } | null` field (left join
`Events.venue_uuid → Venues.id`).

### 3.5 Dashboard event modal — `CoreTab.tsx`

[`CoreTab.tsx`](../../src/features/eventConfiguration/components/tabs/CoreTab.tsx#L131-L142)
replaces its `AddressAutocomplete` with the same `VenuePicker`, wired to a new `venueUuid` field on
[`useCurrentEventStore`](../../src/features/eventConfiguration/state/useCurrentEventStore.ts)
(§2.4). This is a separate flow from the quote form (no Contact field on this tab, so no
auto-fill-from-contact logic applies here — §3.2 stays scoped to `ClientInfoSection` only).

- **Load**: [`loadEventForModal.ts`](../../src/features/eventConfiguration/functions/loadEventForModal.ts#L48-L79)
  adds `e.venue_uuid` and a `leftJoin("Venues as v", "e.venue_uuid", "v.id")` for the venue's
  `name`, setting `venueUuid` on the store alongside today's `addressData` load.
- **Save**: [`updateEvent.ts`](../../src/features/dashboard/db/client/updateEvent.ts#L30-L70) (the
  dashboard client, not the quotesAndBookings one) branches on the same `VenuePickerValue.mode` as
  §3.1/§4: `"venue"` → write `venue_uuid`, skip the existing `Addresses` insert/update block
  entirely (the trigger handles `address_uuid`); `"manual"` → keep today's exact
  insert-if-no-uuid/update-if-has-uuid `Addresses` logic unchanged, and additionally write
  `venue_uuid: null` to detach.
- **Required-ness**: this flow's own existing rule stays as strict as it already is —
  [`checkEventFormRules`](../../src/features/dashboard/functions.ts#L22-L37) requires an address to
  save at all (no draft concept here, unlike quotesAndBookings). Swap its
  `addressData == null || addressData.address == ""` check for "no venue picked and no manual
  address entered" (i.e. `VenuePickerValue.mode === "empty"`). Same strictness as today, just
  re-pointed at the new field.

---

## 4. Write path

All three event-saving call sites branch on `VenuePickerValue.mode` (§2.3) the same way:

- **`mode: "venue"`** → write `venue_uuid` on the `Events` insert/update. Do **not** also write
  `address_uuid` — the trigger (§1.3) sets it from the venue. Do **not** route this through the
  existing `UPDATE Addresses SET ...` in-place path either — that path is reserved for `"manual"`.
- **`mode: "manual"`** → write `venue_uuid: null` explicitly (detach — matters most on _edit_,
  where an event may currently have a non-null `venue_uuid`) and `address_uuid` exactly as each
  call site already handles it today (insert-new / update-in-place-if-owned).
- **`mode: "empty"`** → both null. Only reachable where the field isn't required (quote drafts).

Concretely:

- `createQuoteEvent.ts`: branch as above instead of always inserting a fresh `Addresses` row.
- `updateQuoteEvent.ts`: same branch. The existing "look up `existingAddressUuid` from the current
  Event, then update-in-place-or-insert" logic only runs for `"manual"`.
- `updateEvent.ts` (dashboard client, §3.5): same branch, replacing its current unconditional
  `Addresses` insert/update block.
- `createContact.ts`: accept optional `defaultVenueUuid: string | null`, write
  `default_venue_uuid`.

---

## 5. Test plan

### Unit (Vitest), written first

- `bucketAndSortVenueEvents` — same coverage as `bucketAndSortContactEvents.test.ts` minus the
  relation-tagging cases (past/future split, no-end-date fallback, sort order both directions,
  field mapping).
- `handleContactSelect` auto-fill logic (extract to a pure function
  `resolveVenueOnContactSelect(currentVenueId, contact) => venueId | null` so it's testable without
  mounting `ClientInfoSection`) — covers: blank venue + contact has default → fills; venue already
  set + contact has default → untouched; contact has no default → untouched.
- `createContact` / `createQuoteEvent` / `updateQuoteEvent` / dashboard `updateEvent` — extend
  existing test files to cover all three `VenuePickerValue` modes, especially: `"manual"` on an
  event that currently has a non-null `venue_uuid` writes `venue_uuid: null` (the detach case).

### Component (Vitest)

- `VenueHistorySheet` (or shared `EventHistorySheet`) — same shape of tests as
  `ContactHistorySheet`'s existing coverage.

### E2E (Playwright)

Skipped by default per standing instruction not to run/add e2e unprompted — flag if you want a
spec covering "create quote → pick existing venue → Contract tab → venue history sidesheet shows
it."

### Definition of Done

Same cycle as always: `npm run tc`, `npm run test`, `npm run lint`, and `npm run gtl` after the
migration is applied locally.

---

## 6. Edge cases

- Venue picked, then its underlying `Addresses` row edited via some other surface later (none
  exist today, but future-proofing): Contract tab's venue name/history stay correct since it's
  keyed by `venue_uuid`, not address text.
- Contact has a `default_venue_uuid` that was since soft-deleted (`Venues.deleted = true`): don't
  auto-fill from a deleted venue — resolver should filter `deleted = 0`.
- Two venues with the same name, different address (e.g. two schools named "Central"): both show
  up in the picker; `searchValue` should include the address so they're distinguishable, same
  pattern as `companyOptions.searchValue` in `CreateContactModal`.
- Detach mid-edit: an event linked to Venue A has its address hand-edited to a new place. The event
  now has `venue_uuid = null` and its own private `Addresses` row — it must disappear from Venue
  A's history sidesheet immediately (query is `venue_uuid = A`, so this falls out for free, but
  worth a regression test) and must not affect Venue A's other events at all.
- Trigger + `"manual"` write race: app code always writes `venue_uuid` and `address_uuid` in the
  same statement/transaction per mode, so the trigger (which only fires `before ... of venue_uuid`)
  never fights with a `"manual"` write that leaves `venue_uuid` untouched-but-still-null.

---

## 7. Work breakdown

1. Migration (`Venues` table, `Events.venue_uuid`, `Contacts.default_venue_uuid`, the
   `events_sync_address_from_venue` trigger) + `AppSchema.ts` + PowerSync dashboard bucket update +
   `npm run gtl`.
2. `fetchVenueEvents.ts` + tests (TDD).
3. `VenueHistorySheet.tsx` (extract shared shell from `ContactHistorySheet` if time allows).
4. `VenuePicker.tsx` (both modes: venue select, manual/detach address edit).
5. `EventDetailsSection.tsx` wiring + `useCreateQuoteStore` field.
6. `ClientInfoSection.tsx` auto-fill logic + tests.
7. `CreateContactModal.tsx` + `createContact.ts` wiring.
8. `ContractTab.tsx` + `fetchQuoteDetail.ts` venue join.
9. `createQuoteEvent.ts` / `updateQuoteEvent.ts` write-path changes (mode branching + detach) +
   tests.
10. `CoreTab.tsx` + `useCurrentEventStore` + `loadEventForModal.ts` + dashboard `updateEvent.ts` +
    `checkEventFormRules` (§3.5) + tests.
11. Full Definition of Done pass.

---

## 8. Decisions confirmed 2026-09-11

- **Naming**: `Venues`.
- **`VenuePicker` location**: `src/components/VenuePicker.tsx`.
- **Required-ness**: optional for draft save, required for send in quotesAndBookings (§3.1);
  required to save at all in the dashboard event modal, matching that flow's existing rule (§3.5).
- **`Events.address_uuid` sync**: a DB trigger (§1.3), not duplicated app code.
- **Editing an event's address never propagates to its Venue**: detaches instead (§0.1, §2.3).
- **`CoreTab.tsx` in scope**: gets the same `VenuePicker`, wired independently of the quote flow
  (§3.5).
