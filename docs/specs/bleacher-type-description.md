# Bleacher type description (`BleacherTypes.description`)

## Why

A bleacher type is only a name, a row count and a roof type. Account managers
building a quote have nowhere to read what they are actually selling: capacity,
dimensions, what the rental includes. The text is written once on the bleacher
type (`/pricing-matrix`). **When the type is added to a quote, the text is copied
onto that line item**, so a quote that has been sent keeps saying what it said,
even if the type's description changes later.

## Decisions (locked)

| Question                                            | Answer                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where does a line item's description live?          | **Copied** into `EventLineItems.description` (the column already exists and is written as `NULL` today) when a bleacher line item is **added** in the Add Line Item modal.              |
| Does editing the type later change existing quotes? | **No.** The quote, PDF and public `/quote` page read the line item's own copy.                                                                                                          |
| Can the line item description be edited on a quote? | **Not yet.** Read-only everywhere. The data model allows a later editor.                                                                                                                |
| Which line items?                                   | **Bleachers only** get a copy. Logistics, services and discounts keep `description = NULL`.                                                                                             |
| Line items saved before this feature                | Stay `NULL`. No backfill, so old sent quotes don't change.                                                                                                                              |
| Re-saving an existing quote (edit page)             | Keeps each line item's stored description. It is **not** refreshed from the type.                                                                                                       |
| Where is it shown?                                  | Pricing matrix detail + new (editable), Add Line Item modal (type's current text), quote form rows (new + edit), `/quotes-bookings/{id}` Contract tab, quote PDF, public `/quote` page. |
| Who edits a type's description?                     | Whoever can already create/edit a type: the pricing matrix is admin-only per `accessConfig.ts`.                                                                                         |
| Sync rules                                          | PowerSync is already configured correctly (confirmed). No dashboard change.                                                                                                             |
| E2E                                                 | **Skipped for this task** (by decision). Covered with Vitest.                                                                                                                           |

## 1. Database (Supabase)

New migration `supabase/migrations/20260917120000_bleacher_type_description.sql`:

```sql
alter table public."BleacherTypes"
  add column if not exists description text;

comment on column public."BleacherTypes".description is
  'Free-text description of the bleacher type (1-2 paragraphs, may contain line breaks / bullet lines). Copied into EventLineItems.description when the type is added to a quote. NULL = none.';
```

- Nullable, no default, no length check.
- `EventLineItems.description` already exists (`text`, nullable), so it has no schema change.
- Test appended to `supabase/tests/pricing_matrix.test.sql`: the `BleacherTypes.description` column exists, is `text`, and is nullable.
- Then `npm run gtl` to regenerate `database.types.ts`.

## 2. PowerSync

`src/lib/powersync/AppSchema.ts`, `BleacherTypesCols` gains `description: column.text`.
`EventLineItems` already declares `description`.

## 3. TypeScript types

```ts
// src/features/pricingMatrix/utils/normalizeDescription.ts  (new, pure)
/** Trims; returns null for empty / whitespace-only input. Keeps inner newlines. */
export function normalizeDescription(raw: string | null | undefined): string | null;

// src/features/pricingMatrix/db/bleacherTypeCrud.ts
type CreateInput = {
  name: string;
  row_count: number;
  roof_type: "canopy" | "none";
  description: string | null; // NEW (Partial<> on update)
};

// src/features/quotesAndBookings/types/quoteTypes.ts
export type LineItem = {
  // ...existing fields
  description: string | null; // NEW — snapshot, read-only in UI
};

// src/features/quotesAndBookings/hooks/useBleacherTypes.ts
export type BleacherTypeOption = {
  id: string;
  name: string;
  rowCount: number;
  description: string | null; // NEW
};

// src/features/quotesAndBookings/components/LineItemDescription.tsx (new)
type LineItemDescriptionProps = { description: string | null | undefined; className?: string };
/** Renders nothing for null/blank. Otherwise a block <span> (valid inside <button>/<td>) with `whitespace-pre-line`
 *  so paragraphs and "- bullet" lines keep their breaks. Plain text: no markdown, no HTML. */
export function LineItemDescription(props: LineItemDescriptionProps): React.ReactNode;
```

`EventLineItemRow.description` (`useEventLineItems`) and
`QuoteDocumentData.lineItems[].description` (`quoteDocumentData.ts`) already
exist, so neither type changes.

### Persisted draft compatibility

`useCreateQuoteStore` persists drafts. A draft saved before this change has line
items without `description`. Every reader treats `undefined` as `null`
(`li.description ?? null`), so an old draft saves `NULL`.

## 4. Data flow

| Step              | File                                 | Change                                                         |
| ----------------- | ------------------------------------ | -------------------------------------------------------------- |
| Add bleacher      | `AddLineItemModal.tsx` `addBleacher` | `description: bt.description` (non-bleacher templates: `null`) |
| Create quote      | `createQuoteEvent.ts`                | `description: li.description ?? null` (was `null`)             |
| Update quote      | `updateQuoteEvent.ts`                | `description: li.description ?? null` (was `null`)             |
| Load for edit     | `fetchLineItems.ts`                  | select `description`, map to `LineItem.description`            |
| Detail page       | `useEventLineItems.ts`               | already selects `li.description`, no change                    |
| PDF / public page | `quoteDocumentData.ts`               | already selects `description`, no change                       |

The helper that builds the `EventLineItems` row is pulled out of both writers as a
pure `toEventLineItemValues(li, eventUuid, currency)`. Both writers then persist
the description the same way, and it can be tested.

## 5. UI

### 5.1 `/pricing-matrix/{id}` (`BleacherTypeDetail.tsx`) and `/pricing-matrix/new`

- A full-width **Description** `<textarea>` (5 rows, vertically resizable) under the Name / Row Count / Roof Type fields.
- Placeholder: `Describe this bleacher type — copied onto the line item when it's added to a quote.`
- Detail page: filled from `bt.description`, saved by **Save Type** with `normalizeDescription(text)`.
- New page: sent in `createBleacherType({ ..., description: normalizeDescription(text) })`.

### 5.2 Add Line Item modal, Bleachers tab

- Each type button shows the type's current description under "{n} rows", clamped to 3 lines (`line-clamp-3`).

### 5.3 `/quotes-bookings/new` and `/{id}/edit`: `LineItemsSection.tsx`

- In each bleacher row, `<LineItemDescription description={item.description} />` goes under the label input in the Item cell. It is read-only.

### 5.4 `/quotes-bookings/{id}`: Contract tab

- The existing `<span className="block ...">{li.description}</span>` is replaced by `<LineItemDescription>` so line breaks show.

### 5.5 Public `/quote` page (`QuotePublicView.tsx`)

- Same replacement: `<LineItemDescription>` under the item label, so line breaks show.

### 5.6 Quote PDF (`QuotePdfDocument.tsx`)

- The existing `item.description` `<Text>` stays. react-pdf already renders `\n` as line breaks, so there is no layout change. A Vitest checks that a multi-line description reaches the rendered text.

## 6. Permissions

`permissionPageData.ts` gets a new **Pricing Matrix** entry (Configuration). No such entry exists today:

- admin: `full`, covering creating, editing and deleting bleacher types, their prices and their descriptions.
- account_manager: `none` for the page. They see a type's description in the Add Line Item modal and on quotes they can open, but cannot change it.
- viewer, maintainer, developer, driver: `none`.

## 7. Tests (Vitest, written first: red → green)

- `normalizeDescription.test.ts`: `null`/`undefined`/`""`/`"  \n "` → `null`; trims the outer whitespace; keeps inner `\n` and `- bullet` lines.
- `LineItemDescription.test.tsx`: renders nothing for null/undefined/blank; keeps `\n` in text content with the `whitespace-pre-line` class; renders `<b>x</b>` as literal text.
- `toEventLineItemValues.test.ts`: a bleacher line item carries its description; non-bleacher / `undefined` → `null`; the existing header/value/qty mapping is unchanged (discount → `lineTotalCents`).
- `fetchLineItems.test.ts` (extend): `description` is selected and mapped; `NULL` → `null`.
- `useBleacherTypes`: the pure `mapBleacherTypeRow` maps `description`.
- `newBleacherLineItem.test.ts`: the modal's bleacher builder, moved into `utils/newBleacherLineItem.ts` (the Vitest env is `node`, so there are no click tests). The line item carries the type's description (`null` when the type has none); with no matrix price, the price is unlocked. Logistics/service/discount templates set `description: null` inline.
- `quoteDocumentData.test.ts`: the pure `toQuoteLineItem` (used by the PDF and public page) keeps the saved description and its line breaks.
- `LineItemDescription.test.tsx` already listed above.
- `bleacherTypeCrud.test.ts`: `createBleacherType` / `updateBleacherType` pass `description` through.
- `QuotePublicView.test.tsx` (extend): a line item's multi-line description is rendered.

E2E: skipped for this task by decision.

## 8. Edge cases

| Case                                      | Behaviour                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type has no description                   | Line item gets `NULL`. Nothing is rendered, no empty gap.                                                                                                                                                                                                                |
| Whitespace-only input on pricing matrix   | Saved as `NULL`.                                                                                                                                                                                                                                                         |
| Type description edited after quoting     | Existing line items keep their copy. Only line items added later get the new text.                                                                                                                                                                                       |
| Same type added twice                     | Each line item gets its own copy.                                                                                                                                                                                                                                        |
| Line item label renamed                   | Description unchanged.                                                                                                                                                                                                                                                   |
| Quote edited and re-saved                 | `updateQuoteEvent` deletes and re-inserts rows. The copy comes from the store (`LineItem.description`, loaded by `fetchLineItems`), so it survives.                                                                                                                      |
| Old persisted draft without `description` | Treated as `null`.                                                                                                                                                                                                                                                       |
| Very long text                            | Shown in full on the form, Contract tab, PDF and public page; clamped to 3 lines only in the modal.                                                                                                                                                                      |
| HTML / markdown in text                   | Literal text (React escaping; react-pdf `<Text>`).                                                                                                                                                                                                                       |
| PowerSync offline                         | The modal reads the type from the local DB, and the quote create path already writes locally. Pricing matrix saves use the existing Supabase call, which fails while offline with the existing "Update failed"/create error toast. The typed text stays in the textarea. |
| Clerk session expired while saving        | The Supabase call errors, the existing toast shows the message, and the form is not reset.                                                                                                                                                                               |
