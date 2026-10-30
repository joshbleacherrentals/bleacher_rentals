# QuickBooks invoice — finding or creating the customer

Status: **Implemented 2026-10-22.** 0 open decisions; one reading to confirm
(§1, last paragraph).
Implementation order: **02** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: spec 01 is not required; this spec is independent of it.

## 0. The request, and what it is not

A QuickBooks invoice needs a customer, and the app has none stored. In QuickBooks a customer
is a contact, usually with a company. This spec adds:

- a table that remembers, per **contact and QuickBooks connection**, which QuickBooks
  customer it is;
- a server module that, given a quote's billed contact, finds the customer, asks for a
  choice when it cannot tell, or creates a new one.

**Not part of this spec:** any route or screen (the picker is spec 07; the route that calls
the module is spec 04); the invoice itself; merging the contacts and companies tables.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Who the customer is:** the quote's finance contact when set, otherwise its contact. The
  caller passes the billed contact; this module does not choose it.
- **Search:** by company, by name and by email.
- **Result:** one match is used; several open a choice for the accountant; none creates a
  new customer.
- **Where it is remembered:** per contact and per connection ("contact + connection"), so the
  accountant is not asked again.
- **A new customer when the company already exists:** a **flat** customer — a top-level
  customer named after the person, with the company in its Company name field.
- **Two QuickBooks files:** the link is per connection, so the same contact may be a
  different customer in each.

**Reading to confirm at review.** The words "search by company, name and email" and "a person
who is not there but whose company exists is created as another user of that company" can be
read two ways. This spec reads them so:

- a **match** is a QuickBooks customer whose email equals the contact's email, or whose given
  and family names equal the contact's first and last names (compared without regard to case);
- the **company** never makes a customer a match by itself: it is shown next to every
  candidate in the choice, and a new customer is created carrying it;
- so a person missing from QuickBooks whose company exists is created as a new flat
  customer, without asking;
- the choice also offers **"Create a new customer"** (for the case that none of the listed
  ones is right).

## 2. Research findings

- **Credentials.** `getQboAccessTokenAndRealmId(connectionId)` returns a valid token (it
  refreshes an expired one) and `getBaseUrl()` the API host. Errors from the refresh are
  already worded by `describeQboAuthError`.
- **A table the browser must not read.** `QboConnections` is server-only for this reason; the
  precedent is the same here: no policy, no sync.
- **The query language.** QuickBooks queries cannot combine two different fields with OR, so
  the matches come from separate queries merged by id. A value goes inside single quotes and
  must be escaped (backslash and single quote) or a name such as O'Brien breaks the query.
  Whether `=` ignores case is not documented well enough to rely on: to verify in a sandbox.
- **Names are unique.** A QuickBooks DisplayName must be unique across customers, vendors and
  employees; creating a customer whose name is taken fails with a duplicate-name error.
- **The contact's shape.** `Contacts` has `first_name`, `last_name` (nullable), `email`
  (nullable) and `company_uuid`; the company's name is `Companies.company_name`.
- **Service role.** Server code that reads and writes without the user's rights creates its
  client as `quoteDocumentData.ts` does (`SUPABASE_SERVICE_ROLE_KEY`).

## 3. Database — `supabase/migrations/20261022140000_contact_qbo_customers.sql`

**`public."ContactQboCustomers"`:**

- `id` — `uuid`, primary key, `gen_random_uuid()`.
- `contact_uuid` — `uuid`, not null, references `"Contacts"(id)` `ON DELETE CASCADE`.
- `qbo_connection_uuid` — `uuid`, not null, references `"QboConnections"(id)`
  `ON DELETE CASCADE`.
- `qbo_customer_id` — `text`, not null. QuickBooks' own customer id.
- `created_at` — `timestamptz`, not null, `now()`.
- Unique on `(contact_uuid, qbo_connection_uuid)`.

Row level security is **enabled with no policy**: no signed-in user can read or write it; only
the service role does. Not added to `AppSchema.ts` and not synced.

## 4. App changes — `src/features/quickbooks-integration/customers.ts` (new)

Server-only. All calls go to the QuickBooks API of one connection.

**Types:**

- `QboCustomerSummary` — `id`, `displayName`, `companyName` (or null), `email` (or null).
- `BilledContact` — `id`, `firstName`, `lastName` (or null), `email` (or null),
  `companyName` (or null).
- `CustomerChoice` — either `{ kind: "existing", customerId }` or `{ kind: "new" }`.
- `CustomerResolution` — either `{ kind: "customer", customerId, how }` where `how` is
  `linked`, `found`, `chosen` or `created`; or `{ kind: "choose", candidates }`.

**Functions:**

- `escapeQboQueryValue(value)` — pure; escapes backslash and single quote.
- `findCustomerCandidates(connectionId, contact)` — active customers matching by email, and
  by given plus family name; merged by id; the match rule of §1.
- `createCustomer(connectionId, contact)` — a flat customer: given name, family name,
  DisplayName = the full name, Company name when the contact has one, primary email when the
  contact has one. Nothing else is copied (no phone, no address).
- `resolveInvoiceCustomer(connectionId, contact, choice?)`, in this order:
  1. a link row for this contact and connection exists and the customer is still there and
     active → `customer / linked`;
  2. otherwise a link row that points at a missing or inactive customer is deleted, and the
     search runs;
  3. `choice` is `existing`: the customer is read from QuickBooks by id (it must exist in this
     connection); it is linked → `customer / chosen`;
  4. `choice` is `new`: create it, link it → `customer / created`;
  5. no `choice`: one candidate → link it → `customer / found`; several → `choose` with
     them, nothing written; none → create it, link it → `customer / created`.

The module writes the link row; it never writes `Events`.

## 5. Behaviour scenarios

No screen changes, so there is no Playwright scenario. The behaviour is asserted by the unit
tests of §7 and, for the picker, by spec 07.

## 6. Files

**Counted — 4 files** (limit 10):

1. `supabase/migrations/20261022140000_contact_qbo_customers.sql` — new
2. `database.types.ts` — changed: the new table, by hand
3. `src/features/quickbooks-integration/customers.ts` — new
4. `package.json` — changed: `test:db:contactqbocustomers`, added to `test:db:all`

**Not counted:** `supabase/tests/contact_qbo_customers.test.sql` (new);
`src/features/quickbooks-integration/customers.test.ts` (new). No `AppSchema.ts`, no
`sync_rules.yaml`, no `permissionPageData.ts` (no role gains anything).

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

**7.1 Database**

- **Asserts:** one row per contact and connection (a second insert fails); deleting the
  contact, or the connection, deletes the row; a signed-in `authenticated` user can neither
  select nor insert (admin, account manager and accountant each tried); the service role
  can.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals`
  container. A mutation run (a `create policy … using (true)` between migration and test)
  goes red.

**7.2 The module** — `customers.test.ts`, with the QuickBooks API replaced by a fake that
records every call:

- `escapeQboQueryValue`: a quote and a backslash are escaped; a plain name is unchanged.
- One email match → `found`, link written, nothing created.
- Several name matches → `choose` with their names, companies and emails; no link, no create.
- No match → one customer created with the right fields, link written.
- A company that exists but no person → still created (the company never matches alone).
- A linked customer that exists → `linked`, no search.
- A link to a deleted or inactive customer → the row is deleted, then searched.
- `choice: existing` with an id QuickBooks does not know → an error, no link written.
- `choice: new` creates even when candidates exist.
- A contact with no email, or no last name, is searched by what it has.
- A name with an apostrophe reaches QuickBooks escaped.
- QuickBooks' duplicate-name error becomes a readable message (§8).
- Nothing in the module writes `Events`.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 8. Edge cases and error handling

- **Duplicate name.** A vendor, employee or customer already has the name: the error is
  passed on as "QuickBooks already has a customer, vendor or employee named …; create the
  customer by hand and try again". Nothing is linked.
- **Token expired or refresh token gone.** The existing readable errors of
  `describeQboAuthError` are passed on.
- **A customer created, then the invoice fails later.** The customer and its link stay; the
  next attempt finds it as `linked`.
- **Two simultaneous attempts for the same contact.** Both may create a customer; the second
  link insert hits the unique index. The loser reads the winner's row; the extra QuickBooks
  customer stays (two with the same name make QuickBooks refuse the second create, so it is
  rare).
- **A contact deleted in the app** removes its link (cascade).
- **Offline / PowerSync.** Not applicable: server-only, no local copy.
- **Clerk.** The route that calls this module checks the role (spec 04).

## 9. Risks

- **R1 — case sensitivity of `=`.** If QuickBooks' `=` is case-sensitive, "john" and "John"
  look like two people. To verify in a sandbox; the fallback is a `LIKE` query compared in
  code.
- **R2 — a wrong match is silent.** One match by name alone is used without asking, so two
  different people with the same name and no email in common are confused until the
  accountant corrects the link by hand in QuickBooks.

## 10. Out of scope

- The picker dialog and the route (specs 04 and 07).
- Sub-customers, and any move of a customer between companies.
- Copying phone numbers or addresses to the customer.
- Editing or merging an existing QuickBooks customer.
- Any screen to see or delete the links.
