# Lost with Reason

When an event/quote is marked **Lost**, the person marking it must say _why_.
Today `Events.event_status = 'lost'` is a dead end: nothing records whether we
lost on price, on capacity, or because the site was outside our service area, so
nobody can answer "why are we losing quotes?" from the data.

Status is editable in two places, and both must ask the same question in the
same way:

1. `/quotes-bookings/{id}/edit` — the Status dropdown in **Quote Details**.
2. `/dashboard` — the event modal, **Details** tab.

Plus one unrelated cleanup requested with it: remove **Contract Revenue** from
the dashboard Details tab.

---

## 1. Database

New migration: `supabase/migrations/<ts>_events_lost_reason.sql`

```sql
create type public.event_lost_reason as enum (
  'out_of_service_area',
  'sold_out',
  'size_does_not_work',
  'price_too_high',
  'other'
);

alter table public."Events"
  add column if not exists lost_reason public.event_lost_reason null,
  add column if not exists lost_reason_note text null;

-- 'Other' is only meaningful with the note that explains it.
alter table public."Events"
  add constraint events_lost_reason_other_needs_note
  check (lost_reason is distinct from 'other' or lost_reason_note is not null);
```

Deliberately **not** enforced in Postgres: "status = lost implies lost_reason is
not null". Events already marked lost predate this column and would fail the
constraint; backfilling them with a guessed reason would put fiction into the
very report this feature exists to produce. Old lost events keep a null reason
and read as "not recorded"; the requirement is enforced in the app, on save.

Labels (single source of truth in the app, see §3):

| value                 | label                      |
| --------------------- | -------------------------- |
| `out_of_service_area` | Out of service area        |
| `sold_out`            | Sold out                   |
| `size_does_not_work`  | Size doesn't work (indoor) |
| `price_too_high`      | Price too high             |
| `other`               | Other (note required)      |

Follow-up after the migration: `npx supabase db reset` (or `db push`) then
`npm run gtl` to regenerate `database.types.ts`.

### PowerSync

`src/lib/powersync/AppSchema.ts`, `EventsCols`:

```ts
lost_reason: column.text,
lost_reason_note: column.text,
```

(Postgres enum → text locally, as `event_status` already is.)

---

## 2. Rules

- `status !== 'lost'` → `lost_reason` and `lost_reason_note` are **forced to
  null** on save, whatever the form last held. Saving is never blocked.
- `status === 'lost'` → `lost_reason` is **required**; save is blocked without
  it, with an error toast naming the field.
- `lost_reason === 'other'` → a non-empty note is **required** too.
- Switching status away from lost and back does not resurrect a stale reason
  (normalization runs on every save, and the note field clears with it).

---

## 3. Shared domain module (new)

`src/features/quotesAndBookings/utils/lostReason.ts` — one module both screens
import, so the two forms cannot drift apart:

```ts
export type LostReason =
  | "out_of_service_area"
  | "sold_out"
  | "size_does_not_work"
  | "price_too_high"
  | "other";

export const LOST_REASON_OPTIONS: { label: string; value: LostReason }[];

/** Human label for a stored value (change log, read-only views). */
export function lostReasonLabel(value: string | null | undefined): string | null;

/** Blocking validation. `[]` = save allowed. */
export function validateLostReason(input: {
  status: string;
  lostReason: LostReason | null;
  lostReasonNote: string;
}): string[];

/** What actually gets written — nulls everything when status !== 'lost'. */
export function normalizeLostFields(input: {
  status: string;
  lostReason: LostReason | null;
  lostReasonNote: string;
}): { lost_reason: LostReason | null; lost_reason_note: string | null };
```

This is the whole rule set. Both screens do UI only.

---

## 4. `/quotes-bookings/{id}/edit`

- `useCreateQuoteStore`: `lostReason: LostReason | null` (init `null`),
  `lostReasonNote: string` (init `""`). Both join the unsaved-changes baseline
  automatically (it snapshots the whole state).
- `QuoteDetailsSection`: the Status cell sits in a `grid-cols-4` row whose 4th
  cell is empty — **Lost Reason renders there, immediately right of Status**,
  only when `status === 'lost'`. When the reason is `other`, a note input
  appears below it in the same cell.
- `CreateQuoteForm.persistQuote()` (the Save path) runs `validateLostReason`
  first; on failure it shows `createErrorToastNoThrow(errors)` and returns
  `null` without writing (the throwing variant would skip the caller's own
  handling — this is a refusal, not a failure). `handlePreviewPdf` / `handleSendQuote` also run it —
  `handleSendQuote` forces status to `quoted`, so it only ever fails when the
  user deliberately left a broken lost state, and the check is cheap.
- The navigation guard's "Save" button inherits the same block: `persistQuote`
  returns null → `guard.cancel()` → the user stays on the page, as with any
  other failed save.
- `createQuoteEvent` / `updateQuoteEvent` write `normalizeLostFields(state)`.
- `fetchQuoteDetail` + `loadQuoteIntoStore` read both columns back.
- `TRACKED_FIELDS` / `FIELD_LABELS` in `logEventChanges.ts` gain
  `lost_reason` → "Lost Reason" and `lost_reason_note` → "Lost Reason Note", so
  the change log shows why a quote was lost and who recorded it. The log renders
  the label ("Price too high"), not the stored enum value.

## 5. `/dashboard` event modal → Details tab

- `useCurrentEventStore`: same two fields.
- `DetailsTab`: Lost Reason dropdown renders in the existing
  `flex gap-4` status row, directly right of Status, when
  `selectedStatus === 'lost'`; note input appears under it for `other`.
- `EventConfigurationForm.handleUpdateEvent` / `handleCreateEvent` validate
  before calling `updateEvent` / `createEvent`; on failure, error toast and no
  write (`setLoading(false)` in `finally` as today).
- `loadEventForModal` reads both columns into the store.
- `updateEvent` / `createEvent` (`db/client`) write `normalizeLostFields`.

### Contract Revenue removal (the small extra task)

- `DetailsTab` drops the Contract Revenue input, the `revenueDisplay` state, its
  `useEffect`, and the `CentsInput` import.
- `updateEvent` (`src/features/dashboard/db/client/updateEvent.ts`) **stops
  writing `contract_revenue_cents`**. That column is derived from line items +
  tax in the quote flow; leaving the dashboard path writing a hand-typed value
  is exactly the "breaks the logic" part — with the input gone, the write would
  clobber the computed number with a stale one.
- `contractRevenueCents` stays in the store and is still written by
  `createEvent` (a dashboard-created event has no line items yet), and the
  quote-side `create/updateQuoteEvent` keep computing it as they do today.

---

## 6. Types

```ts
// quoteTypes.ts — unchanged QuoteStatus, re-export for convenience
export type { LostReason } from "../utils/lostReason";
```

No change to `EventStatus`. No API/route changes. No new tables.

## 7. Permissions

No role gains or loses an ability: this only adds a required field inside an
edit both screens already gate (`canEdit` / `canEditOwnedEntity`). Nothing to
change in `permissionPageData.ts` — noted here so the omission is a decision,
not an oversight.

---

## 8. Tests

**Unit (Vitest, written first)** — `utils/lostReason.test.ts`:

- status `quoted`/`booked`/`draft` + no reason → valid; normalizes to
  `{ null, null }`.
- status `quoted` with a leftover reason and note → valid, normalizes to
  `{ null, null }` (stale reason is dropped).
- status `lost`, no reason → one error naming Lost Reason.
- status `lost`, reason `price_too_high` → valid; note normalized to null.
- status `lost`, reason `other`, empty/whitespace note → error.
- status `lost`, reason `other`, note `"went with a competitor"` → valid, note
  preserved trimmed.
- `lostReasonLabel` maps every enum value and returns null for unknown/null.

**Store (Vitest)** — `useCreateQuoteStore.test.ts`: `resetForm` clears the two
new fields; they participate in `hasUnsavedChanges`.

**E2E (Playwright)** — `lostReason.admin.spec.ts`, three tests on the quote
form. It creates its own quote rather than borrowing a seeded row, since it
flips the status and that would leak into any other spec sharing the row:

1. Status = Lost → the Lost Reason select appears; Save → refused, error toast
   names the field, URL unchanged; pick "Price too high" → Save succeeds; reopen
   the saved quote for editing → the reason is still there.
2. Reason "Other" with no note → refused; add the note → saves.
3. Lost then back to Quoted → the field disappears and Save goes straight
   through.

## 9. Edge cases

- **Offline / PowerSync**: validation is pure and local; the write is a local
  PowerSync mutation as today, so a lost reason saves offline and uploads later.
- **Legacy lost events** open with an empty Lost Reason. The first save of such
  an event now requires one — accepted, and the point of the feature.
- **Send Quote** forces status to `quoted`, so a quote can never be emailed to a
  client while carrying a lost reason; normalization nulls it on that write.
- **Dashboard grid**: `usePsEvents` already filters `event_status != 'lost'`, so
  marking an event lost from the modal still removes it from the grid — the
  reason lives on the row for reporting.
- **Note length**: `lost_reason_note` is unbounded text; the input caps at 200
  chars client-side to keep the change log readable.
