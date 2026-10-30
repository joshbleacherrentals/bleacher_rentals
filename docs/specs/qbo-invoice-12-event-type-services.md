# QuickBooks invoice — the Product/Service of a quote type: the mapping and the Items list

Status: **Implemented 2026-10-26 (approved in chat).** 0 open decisions; three readings to confirm
(§1, last paragraph). Implementation order: **12**, then
[12a](qbo-invoice-12a-quote-types-page.md), then [12b](qbo-invoice-12b-use-the-mapping.md).
Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md). Branch: `q4-sprint1-finance-role`.
Builds on: [03a](qbo-invoice-03a-province-tax-codes.md) and
[03b](qbo-invoice-03b-zone-class.md) (the same kind of per-connection mapping).

## 0. The request, and what it is not

Today the invoice line's Product/Service is **hardcoded**: the app builds the name
`Bleacher Rental - {event type}` and looks for an Item with that name. The user wants the Product/Service
to be **assigned**, for each quote type and each QuickBooks connection, on a new page under
Configuration (12a). This spec adds the data and the plumbing that page needs:

- a table that stores, per **event type and QuickBooks connection**, the id of a QuickBooks
  Product/Service (`qbo_service_id`);
- a route that lists a connection's Products/Services;
- a picker component that shows that list.

**Not part of this spec:** the page and who may open it (12a); using the mapping on the invoice
(12b); creating or editing Items in QuickBooks; creating, renaming or deleting event types.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- A **junction table** between `EventTypes` and `QboConnections` that holds `qbo_service_id`, one
  value per event type and connection.
- The name `Bleacher Rental - {event type}` is **no longer built** by the app; each type is
  assigned its Product/Service.

**Question — which QuickBooks Items the picker offers**

- **Option A — every active Item that can be sold** (Service, Non-inventory, Inventory, Bundle;
  no Category). **Option B — only Items of type Service.**
- **User's answer: A — every active Item that can be sold.**

**Question — who may read and write the mapping**

- **Option A — admin only. Option B — admin and accountant.**
- **User's answer: B — admin and accountant** (also for the page, 12a).

**Readings to confirm at review.**

- **A Bundle is not offered.** QuickBooks' API lists a bundle as an Item of type `Group`, and an
  invoice line for a bundle is a `GroupLineDetail`, not the `SalesItemLineDetail` this feature writes
  (spec 03). So "every Item that can be sold" is read as the Item types `Service`, `NonInventory` and
  `Inventory`. To verify in a QuickBooks sandbox.
- **The table is online-only:** not in `AppSchema.ts`, not synced, no `sync_rules.yaml` change. The
  page cannot work offline anyway (it lists Items from QuickBooks), and the invoice route reads the
  table with the service role. The page reads and writes it through the signed-in Supabase client,
  as the Work Tracker Types page does with `WorkTrackerTypeQboAccounts`.
- **Only the id is stored,** as the user named it. The Item's name and Description are read from
  QuickBooks when an invoice is made or checked (12b), so nothing here can go stale.

## 2. Research findings

- **The precedents.** `ZoneQboClasses` (zone ↔ connection ↔ class id), `WorkTrackerTypeQboAccounts`
  (type ↔ connection ↔ account id, admin-only writes) and `ProvinceQboTaxCodes` (03a) are all
  one row per pair with a QuickBooks id as `text`. The picker follows `SelectQboClassSimple`.
- **`EventTypes`.** Columns `id`, `name`, `deleted` (soft delete), `created_by_user_uuid`,
  `created_at`. Today City, Corporate and Rural; Sale is added later by the user. It is read by
  admin, account manager, viewer and accountant (`event_types_select`) and is synced to the web
  app for admin and accountant (`br_powersync` sync rules).
- **`GET /api/quickbooks/connections`** is already open to admin and accountant (`requireAdminOrAccountant`);
  the picker's connection id comes from it.
- **QuickBooks queries return at most 100 rows** unless `MAXRESULTS` is given (up to 1000) and
  `STARTPOSITION` pages through the rest. `GET /api/quickbooks/classes` does not page; a company
  can have more Items than Classes, so this route does.
- **`getQboAccessTokenAndRealmId`, `getBaseUrl`** (`quickbooks-integration/util.ts`) give the token
  and the base URL of every QuickBooks call; `findQboItem` (spec 03) and the classes route use
  `minorversion=40`.

## 3. Database — `supabase/migrations/20261026120000_event_type_qbo_services.sql`

(After `20261022170000`, the latest on the branch.)

**`public."EventTypeQboServices"`:**

- `id` — `uuid`, primary key, `gen_random_uuid()`.
- `created_at` — `timestamptz`, not null, `now()`.
- `event_type_uuid` — `uuid`, not null, references `"EventTypes"(id)` `ON DELETE CASCADE`.
- `qbo_connection_uuid` — `uuid`, not null, references `"QboConnections"(id)` `ON DELETE CASCADE`.
- `qbo_service_id` — `text`, not null. QuickBooks' own id of the Product/Service (its Item).
- Unique on `(event_type_uuid, qbo_connection_uuid)`.

Row level security is **enabled**, with four policies (select, insert, update, delete), each
`public.get_user_roles() && '{admin,accountant}'::text[]` (update with the same `WITH CHECK`).
No other role has a policy. Not added to `AppSchema.ts` and not synced.

## 4. App changes

- **`database.types.ts`** (changed): the new table, by hand (`gtl` is not used: the local database
  lags the migrations).
- **`quickbooks-integration/api.ts`** (changed): the type `QboItem` — `{ id, name,
fullyQualifiedName, type }` — and `fetchQboItems(connectionId)`, which calls
  `GET /api/quickbooks/items?connectionId=` and throws the route's message on a failure.
- **`app/api/quickbooks/items/route.ts`** (new): `GET ?connectionId=`, guarded by
  `requireAdminOrAccountant`. It runs `select * from Item where Active = true` with
  `STARTPOSITION` / `MAXRESULTS 1000`, repeating until a page returns fewer than 1000 rows, keeps the
  Items whose `Type` is `Service`, `NonInventory` or `Inventory`, and answers
  `{ items: [{ id, name, fullyQualifiedName, type }] }` sorted by `fullyQualifiedName` (else `name`).
  400 for a missing `connectionId`; a QuickBooks refusal passes on its status and message, as the
  classes route does.
- **`components/SelectQboItemSimple.tsx`** (new): a searchable select like `SelectQboClassSimple`.
  Props `connectionId`, `value` (the stored id or null), `onChange(itemId | null)`, `placeholder`
  (default "Select QuickBooks Product/Service..."), `disabled`. It loads `fetchQboItems` under the
  react-query key `["qbo-items", connectionId]`. Picking the selected Item again clears it. While the
  list loads it shows "Loading products/services..."; a failure shows `QboConnectionError`. When the
  stored id is not in the list (the Item was made inactive or deleted) it shows the stored id, as the
  tax-code selects do.
- **`package.json`** (changed): `test:db:eventtypeservices`, added to `test:db:all`.

## 5. Behaviour scenarios

No screen of its own: the picker is used by 12a, whose Playwright scenarios exercise it. The
route and the table are asserted by the tests of §7.

## 6. Files

**Counted — 6 files** (limit 10):

1. `supabase/migrations/20261026120000_event_type_qbo_services.sql` — new
2. `database.types.ts` — changed: the new table, by hand
3. `src/features/quickbooks-integration/api.ts` — changed: `QboItem`, `fetchQboItems`
4. `src/app/api/quickbooks/items/route.ts` — new
5. `src/features/quickbooks-integration/components/SelectQboItemSimple.tsx` — new
6. `package.json` — changed

**Not counted:** `supabase/tests/event_type_qbo_services.test.sql` (new); `items/route.test.ts`,
`SelectQboItemSimple.test.tsx` (new); `api.test.ts` (edited). No `AppSchema.ts`, no
`sync_rules.yaml`, no `permissionPageData.ts` (the page is 12a's).

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

**7.1 Database**

- **Asserts:** an admin and an accountant select, insert, update and delete; an account manager,
  a viewer, a driver, a maintainer and a developer can do none of these (each tried; the rows are read
  back unchanged); one row per event type and connection; deleting the connection deletes its rows;
  deleting the event type deletes its rows; the service role can read.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container; a
  mutation run (a `using (true)` policy) goes red.

**7.2 App**

- **`items/route.test.ts`:** `requireAdminOrAccountant` guards the route (a refusal calls
  nothing); a missing `connectionId` is 400; Items of type Service, NonInventory and Inventory are
  returned and Category, Group and any other type are not; the list is sorted; a first page of 1000
  is followed by a second request with `STARTPOSITION 1001`, and a page of fewer stops the loop; a
  QuickBooks refusal passes on its status.
- **`api.test.ts`:** `fetchQboItems` calls the route with the connection id and returns the list; a
  failure throws the route's message.
- **`SelectQboItemSimple.test.tsx`:** the list is shown and filtered by the search text; picking calls
  `onChange` with the id; picking the selected Item calls it with null; a stored id missing from the
  list is shown as it is; a failed load shows the connection error; `disabled` blocks opening.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **An Item made inactive or deleted in QuickBooks later.** The stored id stays; the picker shows
  it; 12b refuses to use it with a message.
- **A connection that is not healthy** (a placeholder with no realm, an expired token). The list does
  not load and the picker shows the connection error.
- **A sub-Item** is listed under its fully qualified name (`Parent:Child`).
- **More than 1000 Items.** Paged until the last page.
- **Two people assign at once.** The last write wins (unique key + upsert, 12a).
- **Offline / PowerSync.** Not applicable: online-only.
- **Clerk.** The route is `requireAdminOrAccountant`; the table's policies are the lock.

## 9. Risks

- **R1 — a company with thousands of Items** makes the list slow to load; it is loaded once per
  connection and cached by react-query.
- **R2 — an Inventory Item** may be refused by QuickBooks when the company tracks stock; the
  refusal passes on when the invoice is made (spec 04).

## 10. Out of scope

- The page, its access and its sidebar entry (12a); using the mapping on the invoice (12b).
- Creating, editing or deactivating Items in QuickBooks.
- Offering Bundles (§1) or Category Items.
- Syncing the table to the device.
