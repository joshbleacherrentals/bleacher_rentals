# Spec: Event pickup/dropoff instructions + locate-from-neighbour-event

Status: **DRAFT — awaiting approval**
Owner: quotesAndBookings
Surface affected: `/quotes-bookings/[id]/edit` (`CreateQuoteForm`), new section between
`EventDetailsSection` and `NotesSection`.

Existing assets reused (no rewrite):

- [`localDayStartInstant` / `localDayEndInstant`](src/features/alerts/util/localDayInstant.ts) —
  the same day-boundary comparison the address/POC locate buttons use.
- The `BleacherEvents` ⋈ `Events` query shape from
  [`getExpectedAddressFullForWorkTracker`](src/features/alerts/util/workTrackerTransportation.ts:140) —
  this spec reuses that **half** of the existing dual-source lookup (the Events side), not the
  work-tracker merge, since this feature pulls Event → Event, never Event → WorkTracker.
- `NotesSection.tsx`'s plain-textarea layout as the visual template for the new section.

### Locked decisions (confirmed by owner)

- **D1 — field meaning is event-lifecycle, not trip-leg.** Unlike `WorkTrackers.pickup_instructions`
  / `dropoff_instructions` (which describe the two ends of one truck trip), on `Events` these
  describe the same single venue at two different moments:
  - `pickup_instructions` — notes for the driver **picking bleachers up from** this venue, i.e.
    **after** the event ends (teardown/removal).
  - `dropoff_instructions` — notes for the driver **dropping bleachers off at** this venue, i.e.
    **before** the event starts (setup/delivery).
  This is a deliberate naming collision with the `WorkTrackers` columns of the same name — same
  words, different axis (lifecycle-of-this-venue vs. two-ends-of-one-trip). Called out here so it
  isn't mistaken for a copy-paste of the `WorkTrackers` feature.
- **D2 — same-field pull, not cross-field.** The address/POC locate buttons pull the *opposite*
  field from the neighbour (pickup ← neighbour's dropoff). This feature does **not**: pulling
  Pickup Instructions copies the **previous** event's **own** `pickup_instructions`; pulling
  Dropoff Instructions copies the **next** event's **own** `dropoff_instructions`. This is a
  "reuse what I typed last time as a starting draft" convenience, not a physical-continuity
  derivation — the account manager is expected to review/edit after pulling, unlike the address
  button where the pulled value is asserted to be correct.
- **D3 — neighbour = nearest booked event sharing a bleacher, found via `BleacherEvents`.** An
  event has zero or more bleachers through the `BleacherEvents` junction (not a single
  `bleacher_uuid` column, unlike `WorkTrackers`). The previous/next lookup runs against **every
  bleacher assigned to this event at once** (`be.bleacher_uuid in (...)`), letting one ordered
  SQL query pick the nearest neighbour across all of them — no separate per-bleacher merge step.
- **D4 — booked events only, `deleted = 0`.** Same filter `resolveAddressFull` already applies.
- **D5 — with a migration.** New nullable text columns on `Events`, no default, no back-fill.
- **D6 — silent no-op on empty result**, matching the **address** buttons' behaviour (not POC's
  explicit-toast pattern), because there is no "wrong data" risk here (D2) — worst case is
  nothing happens, which reads the same as "there was nothing to pull." A toast **is** shown for
  the "this event has no bleacher assigned yet" case (§4.4), since that is worth surfacing.

### Non-goals

- Any change to `WorkTrackers.pickup_instructions` / `dropoff_instructions` or their modal — they
  already exist and already have no locate button; out of scope here.
- Pulling instructions from a neighbouring `WorkTracker` — this feature is Event ↔ Event only.
- Printing these fields on the quote PDF, contract, or Bill of Lading.
- Per-bleacher instructions when an event has more than one bleacher — the two new fields are
  **one pair per event**, not one pair per bleacher-on-event. (`BleacherEvents.setup_text` /
  `teardown_text` already exist for a *different* purpose — dashboard calendar block labels with
  a `confirmed` flag — and are not reused or touched here.)

---

## 1. Summary

1. Two new nullable text columns on `Events`: `pickup_instructions`, `dropoff_instructions`.
2. A new "Instructions" section on the Quotes & Bookings edit page, between the venue section and
   Notes, with two labelled textareas.
3. A `LocateFixed` button beside each textarea:
   - **Pickup Instructions** button → nearest **previous** (earlier `event_start`) booked event
     sharing a bleacher with this event → copies **its** `pickup_instructions`.
   - **Dropoff Instructions** button → nearest **next** (later `event_start`) booked event
     sharing a bleacher → copies **its** `dropoff_instructions`.

---

## 2. DB schema

### 2.1 Migration

`supabase/migrations/<ts>_event_pickup_dropoff_instructions.sql`

```sql
alter table public."Events"
  add column if not exists pickup_instructions text,
  add column if not exists dropoff_instructions text;
```

Both nullable, no default, no back-fill.

### 2.2 PowerSync

- [`EventsCols`](src/lib/powersync/AppSchema.ts:201) — add `pickup_instructions: column.text` and
  `dropoff_instructions: column.text`.
- Run `npm run gtl` after the migration is applied locally (regenerates `database.types.ts`;
  `PowerSyncColsFor<"Events">` won't compile until then).
- `Events` is already a registered table with its own bucket; per the "Adding a New Table"
  checklist in `POWERSYNC_ARCHITECTURE.md` this is a column addition to an existing table, not a
  new table, so no new registry entry. **Confirm with owner** whether the existing `Events` sync
  bucket definition needs a dashboard-side column allowlist update (the POC spec needed this
  checked and got a "no" from the owner — same question applies here, not assumed).

---

## 3. TypeScript contracts

### 3.1 Resolver

New file `src/features/quotesAndBookings/util/resolveEventInstructions.ts`.

```ts
export type EventInstructionsRow = {
  eventStart: string; // ISO timestamp
  booked: boolean;
  instructions: string | null;
};

/**
 * Pure — the unit-tested core. Picks the nearest candidate in `direction`,
 * requiring both `booked` and a non-empty `instructions` value to qualify.
 * Mirrors resolveAddress's date-boundary semantics (see localDayInstant.ts):
 * candidates are pre-filtered to the correct side of targetDate by the caller,
 * so this just picks the nearest of what's left.
 */
export function resolveEventInstructions(
  candidates: EventInstructionsRow[],
  direction: "past" | "future",
): string | null;

/**
 * Data-access wrapper. Looks up every bleacher on `eventUuid` via
 * `BleacherEvents`, then the nearest booked, non-deleted neighbour event
 * sharing any of those bleachers, reading that neighbour's OWN
 * pickup_instructions (direction "past") or dropoff_instructions ("future") —
 * see D2. Returns null if the event has no bleacher, or no qualifying
 * neighbour exists.
 */
export async function getExpectedInstructionsForEvent(params: {
  eventUuid: string;
  targetDate: string; // this event's event_start
  direction: "past" | "future";
}): Promise<{ kind: "ok"; text: string } | { kind: "no-bleacher" } | { kind: "not-found" }>;
```

Three-state return (not a plain nullable) so the caller can distinguish "nothing to pull" from
"this event has no bleacher yet" — see §4.4.

### 3.2 Store field

[`useCreateQuoteStore`](src/features/quotesAndBookings/state/useCreateQuoteStore.ts) gains two
string fields, same pattern as `clientFacingNotes` / `internalNotes`:

```ts
pickupInstructions: string;
dropoffInstructions: string;
```

Both default to `""`, both settable through the store's existing generic `setField`.

### 3.3 Component

New file
`src/features/quotesAndBookings/components/createQuote/sections/InstructionsSection.tsx`, same
shape as `NotesSection.tsx` plus the two locate buttons.

---

## 4. Behaviour

### 4.1 Placement

New `<InstructionsSection />` rendered in `CreateQuoteForm.tsx` between `<EventDetailsSection />`
and `<LineItemsSection />` (i.e. right after the venue/address is chosen, before line items) —
picked over placing it inside `NotesSection` because these are structured driver-facing
instructions, not free-form notes, and over placing it inside `EventDetailsSection` because the
venue picker there is about *which* address, not the operational detail of showing up to it.

### 4.2 Fields

Two textareas, each with a label and a `LocateFixed` button, styled identically to
`NotesSection.tsx`'s existing textareas (`rows={3}`, same classes) so the new section reads as a
sibling, not a redesign:

| Field                 | Label                 | Locate tooltip                    | Direction |
| ---------------------- | ---------------------- | ---------------------------------- | --------- |
| `pickupInstructions`  | Pickup Instructions   | `Populate from previous event`     | `past`    |
| `dropoffInstructions` | Dropoff Instructions  | `Populate from next event`         | `future`  |

A one-line explanatory caption sits under the section heading, since the pickup/dropoff meaning
here is easy to misread against the identically-named `WorkTrackers` fields (D1):
`"Pickup = notes for retrieving bleachers after the event. Dropoff = notes for delivering them
before it."`

### 4.3 Locate button behaviour

On click, calls `getExpectedInstructionsForEvent({ eventUuid, targetDate: eventStart, direction })`
using the event's own `event_start` (falling back to `setup_start` if `event_start` is empty — same
fallback order as elsewhere in this form) as `targetDate`.

| Result             | UI                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `{ kind: "ok" }`    | `setField(...)` overwrites the field with `text` — same as a manual edit (D6, silent). |
| `{ kind: "not-found" }` | No-op, no toast (D6) — mirrors the address buttons' silent-empty behaviour.        |
| `{ kind: "no-bleacher" }` | `createErrorToast(["This event has no bleacher assigned yet."])` (D6).           |

Buttons are disabled (not hidden) when the event is unsaved (`isNew` / no `eventUuid` yet), since
an unsaved event cannot have a `BleacherEvents` row either — same reasoning as `{ kind:
"no-bleacher" }` but caught before the query even runs, to avoid a needless round-trip.

### 4.4 Permissions

No new permission-matrix entry: the existing **Events** row in
[`permissionPageData.ts`](src/features/userAccess/permissionPageData.ts) already governs who can
edit an event's fields generally, and these two are ordinary event fields. Buttons and textareas
follow whatever `canEdit` gate already wraps the rest of this form (**confirm exact prop/gate
name with the form's current disabled-state wiring** — this spec doesn't have that name pinned
down and will use whatever `EventDetailsSection`/`NotesSection` already use, for consistency).

---

## 5. Write path

- `loadQuoteIntoStore` — reads `pickup_instructions` / `dropoff_instructions` off the fetched
  `Events` row into the two new store fields (`""` when null, same convention as the other text
  fields there).
- `createQuoteEvent` / `updateQuoteEvent` — both write `pickup_instructions:
  pickupInstructions || null` and `dropoff_instructions: dropoffInstructions || null` (empty
  string persisted as `null`, matching how `internalNotes`/`clientFacingNotes` are written — **to
  confirm**: check their exact null-vs-empty-string convention in `updateQuoteEvent.ts` /
  `createQuoteEvent.ts` and mirror it exactly rather than assuming).

---

## 6. Test plan

### Unit (Vitest) — `resolveEventInstructions.test.ts`, TDD, written first

1. `past` picks the latest booked event with `event_start <= targetDate` (day-end inclusive, per
   `localDayEndInstant`); `future` picks the earliest with `event_start >= targetDate` (day-start
   inclusive).
2. Non-booked (`event_status != "booked"`) and soft-deleted candidates are excluded — asserted at
   the data-access layer (SQL `where`), and the pure resolver additionally drops any row with
   `booked: false` defensively.
3. A candidate with `instructions: null` or `""` does not win, even if nearest; the next-nearest
   qualifying one does.
4. Event with zero rows in `BleacherEvents` → `{ kind: "no-bleacher" }`.
5. Event with bleachers but no qualifying neighbour → `{ kind: "not-found" }`.
6. Event sharing **two** bleachers with two different neighbour events on either side → the
   nearer of the two wins (exercises the `bleacher_uuid in (...)` multi-bleacher path from D3).
7. The current event itself is excluded from its own neighbour search (`e.id != eventUuid`).

### Component — not written; infrastructure absent (same reason as the POC spec: no
`@testing-library/react`/jsdom in this project). `InstructionsSection.tsx` stays a thin render
over the tested `resolveEventInstructions` / store wiring.

### E2E (Playwright) — proposed, pending owner confirmation this form's existing e2e coverage has
a fixture event with `BleacherEvents` rows to hang a "before/after" pair off of. If not, skipped
like the POC spec's E2E, same reasoning (seed data gap), and flagged as an open item rather than
silently dropped.

### Definition of Done

`npm run tc`, `npm run test`, `npm run lint` — green. `npm run test:e2e` — run only if a suitable
fixture exists; otherwise explicitly marked skipped with the reason, per this repo's Definition
of Done rule (never silently pass off a skip as a pass).

---

## 7. Edge cases

| Case                                                        | Behaviour                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Event not yet saved (no `id`)                                 | Both locate buttons disabled (§4.3).                                    |
| Event has no `BleacherEvents` rows                            | `{ kind: "no-bleacher" }` → toast (§4.3).                                |
| Event has bleachers but no neighbour qualifies                | `{ kind: "not-found" }` → silent no-op (D6).                             |
| Nearest neighbour has the field blank                         | Skipped in favour of the next-nearest qualifying one (test 3).          |
| Event shares bleachers with itself only (single-event bleacher) | `{ kind: "not-found" }` — correct, nothing to pull.                    |
| PowerSync offline                                              | Query runs against the local DB; works fully offline like the others.  |
| Non-editable event (per whatever this form's edit gate is)     | Buttons not rendered / textareas disabled — mirrors §4.4.               |

---

## 8. Work breakdown

| #   | File                                                                                                | Change            |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| 1   | `supabase/migrations/<ts>_event_pickup_dropoff_instructions.sql`                                      | new                |
| 2   | `database.types.ts`                                                                                    | `npm run gtl`      |
| 3   | [AppSchema.ts](src/lib/powersync/AppSchema.ts:201)                                                     | +2 columns         |
| 4   | `quotesAndBookings/util/resolveEventInstructions.ts` + `.test.ts`                                     | new, TDD           |
| 5   | `quotesAndBookings/state/useCreateQuoteStore.ts`                                                       | +2 fields          |
| 6   | `quotesAndBookings/components/createQuote/sections/InstructionsSection.tsx`                            | new                |
| 7   | `quotesAndBookings/components/createQuote/CreateQuoteForm.tsx`                                         | render new section |
| 8   | `quotesAndBookings/db/loadQuoteIntoStore.ts`                                                            | read 2 fields       |
| 9   | `quotesAndBookings/db/createQuoteEvent.ts`, `updateQuoteEvent.ts`                                      | write 2 fields      |

Suggested commit split: **1–3** (schema), **4** (resolver + tests), **5–7** (UI), **8–9** (wiring).

---

## 9. Open items — need an answer before or during implementation

1. **Sync bucket check (§2.2):** does the `Events` bucket's column list on the PowerSync dashboard
   need updating, or does it already sync every column on the table (as the POC spec found for
   `WorkTrackers`)? Not assumed either way.
2. **Exact edit-gate name (§4.4, §7):** need the actual prop/variable that currently
   disables/enables editing on this form (equivalent to `WorkTrackerModal`'s `canEditFields`) to
   wire the buttons/textareas to it correctly — not yet located during research.
3. **Null vs. empty-string convention on write (§5):** confirm against the exact code in
   `createQuoteEvent.ts` / `updateQuoteEvent.ts` rather than assuming it matches
   `internalNotes`/`clientFacingNotes`.
4. **E2E fixture availability:** confirm whether a seeded event with `BleacherEvents` neighbours
   exists for this form's e2e suite; if not, this ships without E2E coverage like the POC feature.
