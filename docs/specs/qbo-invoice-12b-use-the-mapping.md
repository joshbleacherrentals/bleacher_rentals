# QuickBooks invoice — the invoice line uses the assigned Product/Service

Status: **Implemented 2026-10-26 (approved in chat).** 0 open decisions; three readings to confirm
(§1, last paragraph). Implementation order: [12](qbo-invoice-12-event-type-services.md),
[12a](qbo-invoice-12a-quote-types-page.md), then **12b**. Plan:
[qbo-invoice-plan.md](qbo-invoice-plan.md). Branch: `q4-sprint1-finance-role`.
Builds on: [12](qbo-invoice-12-event-type-services.md) (the table).

## 0. The request, and what it is not

The invoice line's Product/Service is no longer the Item named `Bleacher Rental - {event type}`.
It is the Product/Service **assigned** to the quote's event type, for the QuickBooks connection of
the quote's sales office, on the Quote Types page (12a). This spec makes create, update and the
invoice check read that assignment, and refuse (or skip) a quote whose type has none.

**Not part of this spec:** the table, the Items route and the page (12, 12a); the line's other
fields (Qty, Amount, Description from the Item, Class, tax code), which are unchanged.

## 1. Decisions (all taken by the user)

**Question — a quote type with no Product/Service assigned for the quote's connection**

- **Option A — refuse with a message:** Create and Update do not run; the check is skipped with the
  same message; the old name `Bleacher Rental - {type}` is not used anywhere.
- **Option B — fall back to the old name.**
- **User's answer: A — refuse with a message.** The message reads that no Product/Service is
  assigned to the type, and that an admin or an accountant assigns it on the Quote Types page.

**From the user's own words (not options):**

- Event types are no longer turned into an Item name; each is assigned its Product/Service.

**Readings to confirm at review.**

- **The Item is read by its id** (`select * from Item where Id = '…' and Active = true`), once per
  create, update or check, as the lookup by name was. Its Name and Description still come from
  QuickBooks, so the line's Description is still "the Item's own Description" (plan §1). The `Id =`
  query is to verify in a QuickBooks sandbox.
- **Invoices already made keep matching only if the assignment points at the Item they were made
  with.** The invoice check compares the line's Item id (reason `service`, spec 06). A type assigned
  to a different Item than `Bleacher Rental - {type}` shows `service` on the next check of every
  invoice of that type (the next save, update, create or Check again; nothing checks by itself), and
  those quotes land on Need attention until the invoices are updated.
- **A quote whose assignment is missing is refused before any QuickBooks call,** so a check that is
  skipped for this reason records only when it was tried (spec 06's rule for a skipped check) and
  leaves the flag and the reasons as they were.

## 2. Research findings

- **Where the name is built.** Only `findQboItem(connectionId, eventTypeName)` builds
  `Bleacher Rental - …`; it is called by `createInvoice.ts`, `updateInvoice.ts` (twice: update and
  overwrite) and `checkInvoice.ts`, each after `validateInvoiceSource`.
- **The loader.** `loadInvoiceSource` reads the event type's name (`readEventTypeName`) and the
  connection of the sales office (`readConnectionId`) with the service role, in one
  `Promise.all`; the connection is therefore known only after it.
- **The validation.** `validateInvoiceSource` returns `InvoiceIssue`s with a code and a message
  written for the person who pressed the button; the routes join them into a 400, and the check
  joins them into `skipped`.
- **The message reaches the user** as the route's error: spec 07 shows any error as an error toast
  with the route's message.
- **The comparison** (`compareInvoice`, spec 06) compares `ItemRef.value` of the line with the
  Item id of the built body; nothing there changes.

## 3. Database

None (12 added the table). The invoice routes read it with the service role.

## 4. App changes

- **`invoiceTypes.ts`** (changed): `InvoiceSource` gains `qboServiceId: string | null` — the
  assignment for the quote's event type and the connection of its sales office; null when the quote
  has no type or no connection, or the pair has no row. `InvoiceIssueCode` gains `no_service`.
- **`loadInvoiceSource.ts`** (changed): `readQboServiceId(supabase, eventTypeId, connectionId)`
  reads `qbo_service_id` from `EventTypeQboServices` for that pair (`maybeSingle`; null when either id
  is missing; a read error throws "Failed to read the Product/Service of the quote type: …"). It runs
  after the connection is known. The result is `qboServiceId`.
- **`buildInvoicePayload.ts`** (changed): `validateInvoiceSource` adds, when the quote has an event
  type and a connection but `qboServiceId` is null, the issue `no_service` with the message
  `No QuickBooks Product/Service is assigned to the quote type "{type}" for this quote's QuickBooks
company. An admin or an accountant assigns it on the Quote Types page.` (A quote with no type, or
  no connection, already has its own issue; this one is not added on top.)
- **`findQboItem.ts`** (changed): `findQboItem(connectionId, itemId)` asks QuickBooks for the active
  Item with that id (the id is escaped as in spec 02) and returns the same `QboItemRef`. No Item →
  the error `The QuickBooks Product/Service assigned to this quote type (id {itemId}) is not an
active Item in this company. Assign another on the Quote Types page.` The "more than one" error
  goes (an id is unique). It never creates an Item. The file's header comment loses
  `Bleacher Rental - {event type}`.
- **`createInvoice.ts`, `updateInvoice.ts`, `checkInvoice.ts`** (changed): each passes
  `source.qboServiceId!` (set, because `validateInvoiceSource` refused a quote without it) to
  `findQboItem` in place of the event type's name. The error plumbing is as before: create and
  update turn a failed lookup into their setup failure, the check into a `QboReadError`.
- **`permissionPageData.ts`** (changed): the description of **QuickBooks Invoice (create and
  update)** gains: "The line's Product/Service is the one assigned to the quote's type on the Quote
  Types page; a quote whose type has none cannot be invoiced." No role's level changes.

## 5. Behaviour scenarios

Playwright, written, **not run**. The invoice routes reach QuickBooks, which a browser test cannot
replace; the scenario below is refused before any QuickBooks call.

- **S1** the real create route, called as an admin for a booked quote that has an event type and a
  sales office with a connection but no assignment: 400, and the message contains the type's name and
  "Quote Types". Any other issue the seeded quote has is joined into the same message, so the
  assertion is `toContain`.

The assigned-Item path (create, update and check using the id) is asserted in the unit tests of §7.

## 6. Files

**Counted — 8 files** (limit 10):

1. `src/features/quickbooks-integration/invoice/invoiceTypes.ts` — changed
2. `src/features/quickbooks-integration/invoice/loadInvoiceSource.ts` — changed
3. `src/features/quickbooks-integration/invoice/buildInvoicePayload.ts` — changed
4. `src/features/quickbooks-integration/invoice/findQboItem.ts` — changed
5. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed
6. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — changed
7. `src/features/quickbooks-integration/invoice/checkInvoice.ts` — changed
8. `src/features/userAccess/permissionPageData.ts` — changed

**Not counted:** `findQboItem.test.ts` (rewritten for the id), `validateInvoiceSource.test.ts`,
`loadInvoiceSource.test.ts`, `buildInvoicePayload.test.ts` and the other tests that build an
`InvoiceSource` (the fixture gains `qboServiceId`), `createInvoice.test.ts`, `updateInvoice.test.ts`,
`checkInvoice.test.ts`, `permissionPageData.test.ts` (edited); the Playwright file of §5 (new). No
migration, no `database.types.ts` (12 added the table), no `AppSchema.ts`, no `sync_rules.yaml`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`findQboItem.test.ts`:** the query asks for the Item by `Id`, with `Active = true`; an Item found
  is returned with its id, name and Description (absent Description → null); none found → the error of
  §4 naming the id; an id with an apostrophe is escaped; a QuickBooks refusal passes its message on;
  no query mentions `Bleacher Rental`.
- **`validateInvoiceSource.test.ts`:** a quote with a type and a connection but no `qboServiceId` has
  the `no_service` issue and its message names the type; with `qboServiceId` it does not; with no type,
  or with no connection, it has the earlier issue and **not** `no_service`.
- **`loadInvoiceSource.test.ts`:** the assignment is read for the quote's type and the office's
  connection (both ids in the query) and returned as `qboServiceId`; none → null; no type or no
  connection → null and no query on the table; a read error throws.
- **`createInvoice.test.ts`, `updateInvoice.test.ts` (update and overwrite), `checkInvoice.test.ts`:**
  `findQboItem` is called with the connection and `source.qboServiceId`, never with the type's name; a
  quote without an assignment ends in 400 (create, update, overwrite) or `skipped` (check) with the
  message of §4 **before** `findQboItem` or any other QuickBooks call is made; a `findQboItem`
  failure ends as before (setup failure; `QboReadError`).
- **`permissionPageData.test.ts`:** the description of the row names the Quote Types page.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **The assigned Item is made inactive or deleted in QuickBooks.** The lookup finds nothing; the
  message of §4 names the id and the page.
- **The assignment is changed after an invoice was made.** The next check of the invoice reports
  `service`; Update replaces the line's Item (spec 05).
- **The quote's type is changed.** As before: the invoice line differs until Update.
- **The sales office is moved to the other QuickBooks file.** Not detected (plan §2); the assignment of
  the new file is read from then on, or the quote is refused if it has none.
- **A type deleted (soft) after it was assigned.** Its rows stay and work. If it never had one, the
  quote is refused and the page does not list the type (12a, R3).
- **Two quote types assigned the same Item.** Allowed: the table does not forbid it.
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The routes already check the role (specs 04, 05, 06).

## 9. Risks

- **R1 — nothing is assigned at deploy.** Until an admin or an accountant assigns every type for every
  connection, Create and Update refuse and checks are skipped (§1, §8). See the deploy order in the plan.
- **R2 — a wrong Item assigned** puts that Item on every new invoice of the type; the invoice check
  reports it only against invoices made with another Item.
- **R3 — the `Id =` query and an Inventory Item** are unverified against a sandbox (§1, 12 R2).

## 10. Out of scope

- A screen, notice or count for a type with no assignment (the refusal message is the only signal).
- Falling back to the old name, or creating an Item.
- Reassigning or re-checking existing invoices when an assignment changes.
- Detecting an Item changed or deleted in QuickBooks before an invoice is made.
