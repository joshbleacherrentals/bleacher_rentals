# QuickBooks invoice — finding the customer the accountants already have

Status: **Implemented 2026-11-03 (approved in chat).** 0 open decisions; four readings to confirm
(§1, last paragraph). Two points where the code differs from the draft of this spec are marked
**As implemented** (§4, §5, §6, §9). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md). Branch: `q4-sprint3-bug-fix`.
Builds on: [02](qbo-invoice-02-customer.md) (amends its §1 and §4) and
[07](qbo-invoice-07-card-buttons.md) (the customer window).

## 0. The request, and what it is not

**What happened (2026-11-03).** Create invoice on a Toronto quote answered "QuickBooks already has a
customer, vendor or employee named Jennifer Green; create the customer by hand and try again".
The customer exists. In its QuickBooks card First name, Last name and Email are empty; the name
is only in Company name and Customer display name; it has an invoice from last year. The
accountant said: "this is the only information we generally fill in when we add a new customer".

Spec 02 looks for a customer by email and by given plus family names. A customer entered the way
the accountants enter them has none of these, so it is not found, the app tries to create one, and
QuickBooks refuses the name because a Display name is unique.

This spec makes two changes:

- the search also looks at the fields the accountants fill (Display name and Company name);
- when QuickBooks still refuses a new customer because the name is taken, the app looks that name
  up and offers that customer in place of the error, turning an inactive one on.

**Not part of this spec:** the link table, the routes, the invoice itself, and anything that edits
a QuickBooks customer other than turning an inactive one on (§4).

## 1. Decisions (all taken by the user)

**Question 1 — which fields find an existing customer (several may be chosen)**

- **Display name = the contact's name:** the customer's Display name equals the contact's full name.
- **Display name or Company name = the contact's company:** for a customer named after the
  organisation.
- **Company name = the contact's name:** the customer's Company name equals the contact's full name.
- **Keep the email and the given plus family names rules.**
- **User's answer: all four.**

**Question 2 — exactly one match, found only by the company's name**

- **Option A — use it without asking.** The contact is linked to that customer and the invoice is
  made on it.
- **Option B — show the customer window with the "Create a new customer" button.**
- **User's answer: A**, with the reason "a company has a unique name too, there cannot be two
  Sonys". Said to the user before the answer was final: only a Display name is unique in
  QuickBooks (across customers, vendors and employees); the Company name field is not. So the
  answer applies to **exactly one** matching customer; several matches open the window as spec 02
  already does (§4).

**Question 3 — nothing is found**

- **Option A — create a new customer, as now.**
- **Option B — a window with a search where the accountant picks a customer or creates one.**
- **Option C — create as now, and only when QuickBooks refuses the name as taken, look that name
  up and offer that customer in place of the error.**
- **User's answer: C.**

**Question 4 — the refused name belongs to an inactive customer, or to a vendor or employee**

- **Option A — keep today's error for both.**
- **Option B — offer an inactive customer in the same window and, after the pick, turn it on in
  QuickBooks; a vendor or employee keeps the error.**
- **User's answer: B.**

**From the user's own words (not options):**

- **Existing customers are named only in Company name and Display name** (the accountant's words
  above). This is the rule, not an exception.
- **The link is unchanged:** per contact and connection, written when a customer is found, chosen
  or created (spec 02 §3).

**Readings to confirm at review.** The answers above can be read two ways in four places; this
spec reads them so:

1. "Offer that customer in place of the error" is the customer window of spec 07 with its text
   changed for this case and **without** the "Create a new customer" button (it would fail again
   with the same name).
2. The look-up after a refused name runs only when the create had **no** choice behind it. When the
   accountant pressed "Create a new customer" in the several-matches window and the name is taken,
   the error stays as it is today.
3. "Turn on" is a sparse update of the customer with `Active` true (QuickBooks wants the customer's
   current SyncToken, read first). Nothing else of the customer changes.
4. The contact's full name is the first name, a space and the last name; the first name alone when
   there is no last name. It is the same string `createCustomer` uses as the Display name.

## 2. Research findings

- **Names are unique.** A Display name must be unique across customers, vendors and employees,
  inactive ones included (spec 02 §2). That is why a create is refused for a customer the search
  did not see.
- **Today's search** (`findCandidates`, `customers.ts`): active customers whose primary email
  equals the contact's, and active customers whose `GivenName` and `FamilyName` equal the contact's
  first and last names, merged by id and compared in code without regard to case.
- **The query language.** One field per query (no OR across fields). How inactive customers are
  asked for (spec 02 uses `Active = true`; this spec adds `Active = false`) is to be confirmed on
  the real file (R4).
- **The customer window** (`CustomerChoiceDialog.tsx`) lists candidates with Use this customer, a
  Create a new customer button and Cancel; it is opened by the `choose_customer` answer that
  `createInvoice.ts` and `updateInvoice.ts` return.

## 3. Database

None. No migration, no `database.types.ts`, no `AppSchema.ts`, no `sync_rules.yaml`.

## 4. App changes

**`src/features/quickbooks-integration/customers.ts`**

- `QboCustomerSummary` gets `active: boolean`.
- `findCandidates` runs these queries, each for active customers, merged by id, each result
  compared in code (trimmed, without regard to case) as today:
  1. primary email equals the contact's email (today);
  2. given and family names equal the contact's (today);
  3. Display name equals the contact's full name, or the contact's company name when it has one;
  4. Company name equals the contact's full name, or the company name.

  **As implemented:** 3 and 4 are one `=` query per value (the full name, the company name; a value
  that repeats the other, case aside, is asked once), so a contact with both asks up to six
  queries, not four. The `in (…)` form of the draft is not used: only the form that already runs in
  production is.

- `CustomerResolution` — the `choose` variant gets `reason`: `"several"` (today) or
  `"name_taken"`.
- A refused create is a typed error (`QboDuplicateNameError`) carrying today's message, so callers
  that print the message print the same text.
- `resolveInvoiceCustomer`, the steps that change:
  - step 3 (`choice: existing`): when the customer read by id is inactive it is turned on (reading 3) before the link is written; an active one is not touched. → `customer / chosen`.
  - step 5 (no choice): one candidate → link → `customer / found` (unchanged, and now also for a
    match by Display name or Company name); several → `choose / several`; none → create. When
    the create is refused as a duplicate name, the customers whose Display name is the name that
    was tried are looked up, **inactive ones included**:
    - one customer → `choose / name_taken` with that one candidate; nothing is linked or written;
    - none (the name belongs to a vendor or an employee) → today's error is thrown.
  - step 4 (`choice: new`) is unchanged (reading 2).

**`invoice/createInvoice.ts`, `invoice/updateInvoice.ts`** — the `choose_customer` answer carries
`reason`.

**`quoteDetail/invoice/invoiceActions.ts`, `InvoiceButtons.tsx`** — the `choose_customer` dialog
state carries `reason` to the window.

**`quoteDetail/invoice/CustomerChoiceDialog.tsx`** — new prop `reason`. For `several` nothing
changes. For `name_taken` (the texts are mine, to adjust at review):

- title "QuickBooks already has this customer";
- description "QuickBooks already has a customer named {name}, so a new one cannot be made. Use it
  for this quote's invoice.";
- a candidate with `active` false shows the line "Inactive in QuickBooks. Using it turns it on.";
- the "Create a new customer" button is not drawn; Cancel stays.

## 5. Behaviour scenarios (Playwright, written and not run)

Added to `qboInvoiceButtons.admin.spec.ts`; the fake answers as in spec 07 S5. **As implemented:**
not added to `qboInvoiceButtons.accountant.spec.ts`, which presses nothing by design (its header
says why); the window is the same component for both roles.

- **S1** the fake answers `choose_customer` with `reason: "name_taken"` and one active customer:
  the window shows the name-taken text and no "Create a new customer"; Use this customer re-sends
  with `customerChoice: { kind: "existing", customerId }`.
- **S2** the same with an inactive customer: the window also shows the inactive line.
- **S3** `reason: "several"`: the window is unchanged, "Create a new customer" is there.

## 6. Files

**Counted — 6 files** (limit 10):

1. `src/features/quickbooks-integration/customers.ts` — changed
2. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed
3. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — changed
4. `src/features/quotesAndBookings/components/quoteDetail/invoice/invoiceActions.ts` — changed
5. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceButtons.tsx` — changed
6. `src/features/quotesAndBookings/components/quoteDetail/invoice/CustomerChoiceDialog.tsx` —
   changed

**Not counted:** `customers.test.ts`, `createInvoice.test.ts`, `updateInvoice.test.ts`,
`invoiceActions.test.ts`, `InvoiceButtons.test.tsx` (the window's texts), and the Playwright file
of §5 (changed). No
`permissionPageData.ts`: the same roles press the same buttons, and no role gains or loses
anything.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

**`customers.test.ts`**, the QuickBooks API replaced by the fake that records every call:

- A customer with only a Display name "Jennifer Green" and a contact Jennifer Green with no email
  → found, link written, nothing created.
- Display name equal to the contact's company → found; Company name equal to the company → found;
  Company name equal to the contact's full name → found.
- The comparison ignores case and surrounding spaces.
- One customer found by two rules → one candidate (merged by id); two different customers →
  `choose / several`.
- An inactive customer is not found by the search.
- A contact with no company skips the company rules; a contact with no last name is matched on the
  first name alone.
- A refused name, one active customer with that Display name → `choose / name_taken`, no link, no
  write.
- A refused name, one inactive customer → `choose / name_taken` with `active: false`.
- A refused name, no customer (a vendor) → today's message is thrown.
- `choice: existing` on an inactive customer → the update with `Active` true and the SyncToken is
  sent, then the link; on an active one no update is sent.
- `choice: new` with a refused name → today's message, no look-up.
- A name with an apostrophe reaches every new query escaped.
- Nothing in the module writes `Events`.

**`createInvoice.test.ts`, `updateInvoice.test.ts`:** `choose_customer` carries `reason`.
**`invoiceActions.test.ts`:** the dialog state carries `reason`.

**Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
(not run locally, by instruction).

## 8. Edge cases and error handling

- **Two contacts of one company** are each linked, separately, to the same customer.
- **A customer offered as `name_taken`, picked, and the invoice then fails:** the link stays; the
  next attempt finds it as `linked` (as spec 02 §8).
- **QuickBooks refuses to turn a customer on:** the error is passed on and nothing is linked.
- **Several customers match by Company name** (the field is not unique): the window of spec 07
  opens with all of them.
- **Offline / PowerSync:** not applicable, server-only. **Clerk:** the route checks the role as
  before (spec 04).

## 9. Risks

- **R1 — case of `=`.** Spec 02 R1 is still open. QuickBooks refuses a taken name regardless of
  case; if `=` is case-sensitive, a customer written "jennifer green" is missed by the search and
  by the look-up after the refusal. The fallback is a `like` query compared in code.
- **R2 — silent matches are wider.** A match by Company name or by the company's name links the
  contact without asking (question 2). A person whose name equals an unrelated organisation's
  Company name is linked to it until an accountant corrects it.
- **R3 — more calls.** A contact with no link now costs up to six searches instead of two, once;
  afterwards the link answers without a search.
- **R4 — query forms.** The code uses only `=` queries, with `Active = true` and, for the look-up
  after a refused name, `Active = false` as a second query. `Active = false` is the one form not yet
  seen to run on the real file.

## 10. Out of scope

- A window with a typed search over all customers (question 3, option B).
- Offering or using a vendor or an employee.
- Editing a customer beyond turning it on; merging customers.
