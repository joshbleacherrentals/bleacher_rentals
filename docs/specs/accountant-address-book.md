# Accountant — creates, edits and soft-deletes companies, contacts and venues

Status: **IMPLEMENTED 2026-10-06, awaiting review** — 0 open decisions (D1–D4 answered by the user, D1
revised after D4). Approved 2026-10-06. Not checked by hand in a browser (Clerk sign-in is unavailable
here); Playwright specs written, not run; the migration is not applied to any database but the local one,
and only inside a rolled-back transaction.
Original request: the user's task of 2026-10-06 — "the accountant can add and edit contacts, companies,
venues; CRU, create / read / update / soft delete (by update); and add `/companies-contacts` to the
sidebar".
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md)
(the accountant reads Addresses), [accountant-quotes-02](accountant-quotes-02-accountant-page.md) (it reads
Contacts and Companies), [accountant-quotes-04](accountant-quotes-04-accountant-quote-access.md) (it reads
Venues), [companies-contacts-forms.md](companies-contacts-forms.md) (the forms this spec reuses unchanged).

## 0. The request, and what it is not

**The accountant** creates, reads, updates and soft-deletes **companies, contacts and venues**, and has
**Companies & Contacts** in the sidebar and the page `/companies-contacts`.

- Soft delete is an `UPDATE` that sets `deleted`, as the app already does for admin and account manager.
- There is no hard delete, for anyone: none of these three tables has a DELETE policy.
- The rights are those an account manager has on the same records: the whole contact form, the Quote
  Language included.

**Not part of this spec, so not changed:**

- what any other role can do on these tables;
- the screens: no component, no hook, no form changes (D3: buttons are not hidden for any role);
- a Venues tab (D2): venues are added and edited from the **Default Venue** field of the contact form;
- the other pages the accountant cannot open (quote builder, Dashboard): their pickers stay out of reach;
- `sync_rules.yaml`, `AppSchema.ts`, `database.types.ts`: no table or column changes.

**To confirm at review:** "edit contacts" is read as the whole contact form, as for an account manager
(including the Quote Language), not as a subset of fields.

## 1. Decisions (all answered)

**D1 — how wide the accountant's write on `Addresses` is**

`Addresses` is shared: companies, venues, sales offices, storage locations, events, drivers and work
trackers all point at it, and a policy cannot tell which screen wrote a row.

- **Option A — narrow:** insert any new address; update only an address that a company (billing or
  shipping) or a venue points at. Sales office, storage location, event, driver and work tracker
  addresses cannot be changed by the accountant through the API.
- **Option B — as an account manager:** insert and update any address.
- **User's answer: A — narrow.** **Revised after D4 to B** (the user's answer to D4 below).

**D2 — where the accountant adds and edits venues**

- **Option A — only through the contact form:** no new UI; the Default Venue picker on
  `/companies-contacts` creates, edits and soft-deletes a venue, as it does today for admin and account
  manager.
- **Option B — a Venues tab** on `/companies-contacts`, with list, create, edit and soft delete, visible to
  every role that opens the page.
- **User's answer: A — only through the contact form.**

**D3 — hiding Create / Edit / Delete for roles without write**

Today every button shows to everyone, and only RLS stops a viewer.

- **Option A — no:** components are not touched; the database stays the lock.
- **Option B — yes:** a `getAddressBookCapabilities` function and about eight components gated by it
  (changes the admin and account manager screens too, and fixes the viewer's dead buttons).
- **User's answer: A — no, only grant access.**

**D4 — the replay window of a narrow `Addresses` policy**

Creating a company or venue writes the new address in one transaction and the company or venue, which
points at it, in the next. The connector sends a new row as an upsert. If the address request reaches the
server and its reply is lost, PowerSync sends it again: now a conflict, so the `UPDATE` path runs on an
address nothing points at yet, and Option A of D1 refuses it (`42501`, the transaction is discarded with a
toast).

- **Option A — accept:** the policy stays narrow. A lost reply costs the user one re-entry; the address
  stays an orphan. The maintainer's Addresses policy already has the same property.
- **Option B — widen:** also allow updating an address that nothing points at. The policy then lists all ten
  foreign keys to `Addresses`; a table that starts pointing at it later is unguarded until the policy is
  edited.
- **User's answer (own words): "then addresses can be stored and edited — any — and I will give or deny
  access to the pages at the front".** Read as **D1 Option B**: the accountant may insert and update any
  address, and the page-level access is what limits it. Neither A nor B of D4 as written; the replay window
  closes because the narrow policy is dropped. To confirm at review.

## 2. Research findings

**No role check exists in the UI** for these three entities. `CompaniesTab`, `ContactsTab`, both detail
modals, both create modals, `CompanyPicker`, `ContactPicker` and `VenuePicker` show their buttons to every
role; only RLS stops a viewer (the matrix row says so). A grant therefore changes the page gate, the
sidebar, the database and the matrix — not a component.

**The accountant already reads all four tables:**

- **Contacts, Companies:** `accountant` is in `contacts_select` and `companies_select`
  (`20261004120000_accountant_receivables.sql`).
- **Venues:** `venues_select` (`20261004130000_accountant_quote_card.sql`).
- **Addresses:** `rbac_select` (`20261001130000_accountant_work_trackers.sql`).
- **Sync:** the accountant bucket of `br_powersync/config/sync_rules.yaml` selects all four whole tables
  (lines 168, 180, 181, 190), so a row the accountant writes comes back through the same bucket.

**What the database lets write today (local DB, 2026-10-06):**

- **Companies, Contacts, Venues:** `*_insert` and `*_update` for `{admin, account_manager}`. No DELETE
  policy on any of them.
- **Addresses:** `rbac_insert`, `rbac_update`, `rbac_delete` for `{admin, account_manager}`; the
  maintainer's three policies (insert any, update and delete only a maintenance event's address); the
  driver's `driver_addresses_insert` and `driver_addresses_update` (see §9).

**How a write reaches the server** (`BackendConnector.ts`): a new row is an upsert, an edit is an update by
id, a soft delete is an edit. A refusal by `WITH CHECK` raises `42501`; the app discards that transaction
and shows the "A change could not be saved" toast. An `UPDATE` that a policy filters out raises nothing: it
matches no row, the app thinks it worked, and the next sync brings the old value back.

**Where venues are reached.** There is no Venues page. `VenuePicker` is used by `ContactFormFields`
(`/companies-contacts`, the accountant can reach it), the quote builder and the Dashboard event modal (it
cannot). `WorkTrackerModal` renders its contact pickers inside a `fieldset` that is disabled for a user who
cannot edit, and the quote card's Contract tab shows `VenueCard` display-only: neither gains an editor.

**Triggers that fire on an accountant's edit.** `Contacts` has `recompute_quote_hashes_contacts`;
`Addresses` has `recompute_quote_hashes_addresses`, `address_history_refresh` and
`work_tracker_event_links_address_refresh`. All four functions are `SECURITY DEFINER`, so the accountant's
lack of write access to `Events` and `WorkTrackers` does not stop them. They already run for admin and
account manager; the consequence is in §9 (R2).

## 3. Database — `supabase/migrations/20261006120000_accountant_address_book.sql`

(After `20261004180000`; renumber if `develop` has moved.)

- **`ALTER POLICY companies_insert`, `contacts_insert`, `venues_insert`** — `WITH CHECK
(public.get_user_roles() && '{admin,account_manager,accountant}'::text[])`.
- **`ALTER POLICY companies_update`, `contacts_update`, `venues_update`** — `USING` and `WITH CHECK` both
  take `'{admin,account_manager,accountant}'`.
- **`ALTER POLICY rbac_insert ON public."Addresses"`** — `WITH CHECK` takes
  `'{admin,account_manager,accountant}'` (D1 Option B).
- **`ALTER POLICY rbac_update ON public."Addresses"`** — `USING` takes
  `'{admin,account_manager,accountant}'`.

Each statement keeps the expression it had and adds one role, as `20261004120000` did.

**Deliberately not changed:** `rbac_delete` on `Addresses` and the absence of a DELETE policy on the other
three (no hard delete); every `*_select`; the maintainer's and the driver's Addresses policies; the four
triggers; every other table.

**Deploy order: this migration → the app.** The reverse order is the bad one: the page would open for the
accountant while the database still refuses, and an edit would look saved and vanish on the next sync.
No sync-rules change.

## 4. App changes

- **`src/features/userAccess/accessConfig.ts`** — add `"/companies-contacts"` to `accountant.allowedPaths`,
  after `"/messages"`, before `"/permissions"`; `/accountant` stays first, because it is the
  `defaultRedirect`. The comment above the list names this spec.
- **`src/components/sidebar/useSidebarItems.ts`** — add `"companies-contacts"` to
  `ROLE_SIDEBAR_KEYS.accountant`. The item already exists in `ALL_ITEMS`; it renders after Messages and
  before Documentation, because that list sets the order.
- **`src/features/userAccess/permissionPageData.ts`** (draft wording, for review):
  - **Companies & Contacts:** accountant `none` → `full`: "Can create, edit and delete any company,
    contact or venue — the same as an account manager, including the Quote Language. The page has no
    Venues tab: a venue is added or edited from the Default Venue field of a contact. Delete hides the
    record; nothing is removed from the database."
  - **`ROLE_DESCRIPTIONS.accountant`:** gains "Also has Companies & Contacts, where they add, edit and
    delete companies, contacts and venues."
  - **`ACCOUNTANT_NO_ACCESS_NOTE` and the comment above it:** the list of what the role covers gains
    "Companies & Contacts".
- **No component, no hook, no `AppSchema.ts` or `database.types.ts`.**

## 5. Behaviour scenarios (for Playwright — written, not run)

Each asserts on the **server row**, read through the existing service-role helper of
`companiesContacts/e2e/helpers`, not on the list alone: a refused write looks done locally.

- **S1** accountant: the sidebar offers "Companies & Contacts"; it opens `/companies-contacts` with the
  Companies and Contacts tabs; Dashboard, Team and Assets are still not offered.
- **S2** accountant creates a company (a name; no address): the row exists in Postgres.
- **S3** accountant edits a seeded company's name and phone: the row changes and both address rows are
  the ones it had.
- **S4** accountant creates a contact (first name, last name, email), then edits it: the row changes.
- **S5** accountant deletes a contact and a company: both leave the lists; both rows still exist with
  `deleted` set.
- **Amended at implementation (2026-10-06):** as first written, S2–S4 also created a billing address and
  a venue through the UI. An address is typed into a Google Places autocomplete and a venue is made
  through the Default Venue picker, and a test cannot drive either without the Places API, so those
  writes are not in Playwright. The address and venue writes of the accountant (insert, update, replayed
  upsert, soft delete) are asserted in `accountant_address_book.test.sql` instead.
- Account manager and viewer are unchanged; `contactsAccess.viewer.spec.ts` keeps covering the viewer. The
  refusals of other roles are asserted in the SQL test.

## 6. Files

**Counted — 4 files** (limit 10):

1. `supabase/migrations/20261006120000_accountant_address_book.sql` — new
2. `src/features/userAccess/accessConfig.ts` — changed
3. `src/components/sidebar/useSidebarItems.ts` — changed
4. `package.json` — changed: `test:db:accountantaddressbook`, added to `test:db:all`

**Not counted:** this spec; `src/features/userAccess/permissionPageData.ts`; tests — new
`supabase/tests/accountant_address_book.test.sql` and
`src/features/companiesContacts/e2e/companiesContactsAccess.accountant.spec.ts`; edited
`companiesContacts/e2e/helpers/addressBookTestData.ts` (four readers that return `deleted`),
`accessConfig.test.ts`, `permissionPageData.test.ts`, `useSidebarItems.test.ts`,
`supabase/tests/accountant_receivables.test.sql`, `supabase/tests/accountant_quote_card.test.sql`,
`roleAccess.accountant.spec.ts`. No `sync_rules.yaml`, `AppSchema.ts`, `database.types.ts`.

**Tests this spec turns red, edited on purpose:**

- `accessConfig.test.ts`: the exact accountant path list gains `/companies-contacts`; the "nothing else
  operational" list loses it.
- `permissionPageData.test.ts`: the list of rows the accountant is granted gains "Companies & Contacts".
- `useSidebarItems.test.ts`: the accountant's keys become `quotes-bookings`, `accountant`, `work-trackers`,
  `messages`, `companies-contacts`, `documentation`; the Documentation section moves from index 4 to 5.
- `accountant_receivables.test.sql` (about lines 222–239): "an accountant cannot create or update a contact
  / a company" flips to "can", and the "unchanged" assertions flip to "changed".
- `accountant_quote_card.test.sql` (about lines 142–152): "cannot create or update a venue" flips; "cannot
  delete a venue" stays; the heading "writes none of the three closed tables" is reworded.
- `roleAccess.accountant.spec.ts`: the sidebar test gains "Companies & Contacts" (Playwright, not run).

## 7. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run** (not run locally, by instruction;
its project exists only when `E2E_ACCOUNTANT_EMAIL` is configured). Prettier only on touched files.

**7.1 Database**

- **Work:** the migration; `accountant_address_book.test.sql`; the npm script; the flipped assertions of §6.
- **Test asserts, each its own assertion** (an accountant-only user):
  - creates a company, a contact and a venue, one of them in the upsert form the connector sends;
  - edits each, and the row changes;
  - soft-deletes each (`UPDATE … SET deleted`), and the row still exists;
  - hard `DELETE` removes nothing on all four tables;
  - inserts an address; updates an address that a company (billing and shipping) points at, one a venue
    points at, and — as an account manager can (D1 B) — one a sales office, a storage location, an event
    and a driver point at; replays the upsert of a new address that nothing points at yet and it passes
    (the window of D4);
  - an update of a contact fires `recompute_quote_hashes_contacts`: the stored hash of an event that uses
    it changes, although the accountant cannot write `Events` (the definer triggers do their work);
  - an accountant who is also an account manager writes; an admin and an account manager still write;
  - **a viewer, a maintainer and a developer still cannot insert or update** any of the three tables
    (a maintainer's own Addresses rules are unchanged); a driver's access to Addresses is asserted as it
    is today.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container, applying
  the pending migrations in the same pipe; the new test, the two edited tests, `rls_multi_role.test.sql`
  and the other `accountant_*.test.sql` files pass. One mutation run — an `ALTER POLICY … USING (true)`
  between the migration and the test — goes red.

**7.2 Access config and sidebar**

- **Test first:** `accessConfig.test.ts` and `useSidebarItems.test.ts` (§6).
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files.

**7.3 Permission matrix**

- **Test first:** `permissionPageData.test.ts` — the granted list, and the accountant's note on the row.
- **Gate:** as 7.2.

**7.4 Playwright:** the five scenarios and the edited sidebar test, written, not run. Reported as SKIPPED
with the reason.

## 8. Edge cases and error handling

- **Offline.** The accountant's writes are local and upload later; a refusal discards the transaction and
  shows the existing toast. An `UPDATE` filtered out raises nothing: with this migration applied no update
  on these four tables is filtered for an accountant.
- **Two writers.** An accountant and an account manager editing the same contact: last write wins, as
  today for two account managers.
- **A role removed while signed in.** The page redirects on the next render (`useAccessRedirect`); a queued
  write is refused and discarded.
- **A user who is account manager and accountant.** Roles are additive; nothing is taken away.
- **A soft-deleted record.** Hidden from the lists and pickers (`deleted = 0` filters); events and quotes
  that already use it keep displaying it, as for any role.
- **Clerk.** Nothing new: no route, token or webhook is touched; the page gate is the existing
  `useAccessRedirect`.

## 9. Risks, and found on the way

**Risks**

- **R1 — a wider API write than the UI offers (D1 B).** Through the API an accountant can change any
  address — a sales office's, a storage location's, an event's, a driver's, a work tracker's — although the
  UI only offers company and venue addresses. The decision of D4 is that page access is the limit.
- **R2 — a contact or address edit can move a quote.** Editing a contact, or the street, city or zip of an
  address a quote uses, recomputes the stored `content_hash` and `contract_hash` of every quote that uses it
  and, when the changed value is part of the contract, can invalidate a signature the client already gave.
  This is true today for admin and account manager; the accountant, who cannot edit a quote, can now cause
  it from the address book.
- **R3 — shared records.** A contact is shared by every quote and work tracker that uses it ("updates
  everywhere", as `ContactPicker` already says); the accountant's edits reach all of them.
- **R4 — released apart from the migration,** the page would open and an edit would look saved and vanish
  (§3, deploy order).

**Found on the way — reported, not fixed**

1. **`driver_addresses_update` lets any driver update any address:** its `USING` is only
   `get_current_driver_id() IS NOT NULL`, with no condition on the row. `driver_addresses_insert` is
   equally open. Not part of this request, and not changed.
