# Default contract template

One contract template can be marked the default. A new quote starts with it already selected, so
the common case needs no dropdown at all.

Status: **awaiting approval** — decisions recorded from Josh, 2026-09-21: admins only; radio control confirmed.

## 1. Behaviour

**Terms & Conditions page (`/terms-and-conditions`).** Each template row gets a "Default" control.
Marking one default clears the previous one — at most one template is ever the default. The default
row is labelled so it is obvious at a glance, and it can be unset, leaving none.

**New quote (`/quotes-bookings/new`).** The Terms and Conditions dropdown starts on the default
template instead of empty. The user can change it like today; the field stays required.

Prefilling follows the rule the starter notes already use (`shouldPrefillNewQuoteNotes`): only on a
genuinely fresh draft. Never while editing an existing quote, and never over a draft in progress —
so a resumed draft, or a template the user deliberately changed or cleared, is left alone.

Deleting the default template leaves no default; new quotes then start empty, as today.

## 2. Data

### 2.1 Migration

`supabase/migrations/<timestamp>_terms_default.sql`:

```sql
ALTER TABLE public."TermsAndConditions"
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- At most one default, enforced by the database rather than by the two writers that set it.
-- Partial unique index: many false rows are fine, only one true.
CREATE UNIQUE INDEX IF NOT EXISTS terms_and_conditions_single_default
  ON public."TermsAndConditions" ((is_default)) WHERE is_default AND NOT deleted;
```

Clearing the old default and setting the new one happen in one transaction (see 3.2), so the index
never trips during a legitimate switch.

### 2.2 PowerSync

`AppSchema.ts` → `TermsAndConditionsCols`: `is_default: column.integer` (0/1 locally).

Then `npm run gtl` to regenerate `database.types.ts`.

## 3. Types and code

### 3.1 Read path — `useTermsAndConditions.ts`

- `Row` gains `is_default: number | null`; the select gains `is_default`.
- `TermsAndConditionsItem` gains `isDefault: boolean`.
- Hook additionally returns `defaultId: string | null` — the id of the default item, or null.

### 3.2 Write path — `termsAndConditionsDb.ts`

```ts
export async function setDefaultTermsAndConditions(id: string | null): Promise<void>;
```

Writes to the local PowerSync DB with `typedExecute`, so the radio moves the moment it is clicked
and works offline; PowerSync uploads it. Clear `is_default` on whatever row holds it, then set it
on `id`, in that order — the two statements upload in the order applied, and setting first would
collide with the server's partial unique index.

The rest of this file (create, update, soft-delete) still writes straight to Supabase, so those
actions only show once the server answers. Converting them is worth doing, but is a separate
change — see the handover note.

### 3.3 Terms page

A "Default" column with a radio-style control per row, plus a badge on the default row. Setting
calls `setDefaultTermsAndConditions` and toasts.

### 3.4 New quote prefill — `src/app/quotes-bookings/new/page.tsx`

Prefilling runs on the new-quote page, not on the "+ Create Quote" button where the starter notes
used to do it: the button never runs when the URL is typed, bookmarked or refreshed, which left the
dropdown empty. The page waits for the templates to load, prefills once, and re-snapshots the
unsaved-changes baseline so a prefilled form does not count as dirty. The starter notes moved with
it, so both behave the same however the page is reached.

A new helper keeps the rule testable and out of the JSX:

```ts
// src/features/quotesAndBookings/utils/newQuoteDefaults.ts
export function newQuoteFieldsToPrefill(params: {
  editingEventId: string | null;
  hasUnsavedChanges: boolean;
  defaultTermsId: string | null;
}): { clientFacingNotes?: string; termsDocumentId?: string };
```

## 4. Tests

- `newQuoteDefaults.test.ts`: prefills both fields on a fresh draft; neither while editing; neither
  over an unsaved draft; omits the terms id when no default exists.
- `useTermsAndConditions.test.ts` (exists): `defaultId` reflects the flagged row, and is null when
  none is flagged.
- Integration over `node:sqlite` for `setDefaultTermsAndConditions`'s clear-then-set order.
- E2E (`termsDefault.admin.spec.ts`): mark a template default on the Terms page, click "+ Create
  Quote", and see it selected in the dropdown.

## 5. Permissions

**Josh, 2026-09-21: only admins can set these.** `/terms-and-conditions` has no entry in
`permissionPageData.ts` today, so a "Contract Templates" entry goes in with this change:

| Role          | Level | Note                                                                                                                                    |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`       | full  | Create, edit, delete templates and choose the default.                                                                                  |
| everyone else | none  | The page is admin-only, matching the Pricing Matrix entry. Account managers meet templates through the quote's dropdown, not this page. |

Implemented as **none** for account managers rather than the "read" first specced: the entry
describes access to the page, and the Pricing Matrix entry next to it sets that precedent. Their
ability to pick a template on a quote is unchanged and noted in the entry itself.

## 6. Edge cases

- Two people set different defaults at once: the unique index means the second write wins cleanly
  rather than leaving two defaults.
- The default is soft-deleted: it is excluded by `NOT deleted` in the index and by the page's
  existing `deleted = 0` filter, so no default remains and new quotes start empty.
- A quote already referencing a deleted template is untouched; this only changes what a _new_ quote
  starts with.
