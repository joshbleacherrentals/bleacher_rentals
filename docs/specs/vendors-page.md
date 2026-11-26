# Vendors page: list, search, edit and add, with a vendor type

Status: **DRAFT 2026-11-26**, waiting for the user's "Approved". 0 open decisions: D1 to D24 are
the user's answers of 2026-11-26. Nothing is built.
Scope: one new column `Vendors.type`, one change of two existing policies, the page `/vendors`,
the vendor window (`EditVendorModal`) extended and reused on the driver page, the access rules,
the sidebar item, the permissions matrix and the tests.

## 0. The feature in brief

**The request (user, 2026-11-26, translated).**

- Add a page Vendors with a list of all vendors and a search bar, with the ability to edit
  vendors and to add them.
- Add a column `type` to the table `Vendors`. It is an enum with the values "Driver" and
  "Repairs", to tell a driver's vendor from a repair company.
- The window that creates vendors already exists, on the page `/team/{id}/edit/driver`. It is to
  be extended and reused.
- The Vendors page is open to everyone. Admin, Account Manager and Maintainer can edit and
  create.
- No additional RLS rules are created. A permission is denied on the front end only.
- The user takes every decision. No decision is left "to confirm at review": every question was
  asked first.

**Decisions taken by the user (2026-11-26).** Each is an answer to a question with neutral
options.

The database:

- **D1:** the enum is `vendor_type` with the values `driver` and `repairs`, in lowercase like
  `vendor_status`. Screens show "Driver" and "Repairs". The column is `Vendors.type`.
- **D2:** `type` is `NOT NULL DEFAULT 'driver'`. Every one of the 48 vendors that exist
  today becomes `driver` through that clause, and the user switches the three repair companies
  to Repairs by hand on the new page: Dallas Trailer Repair, Danielsville Tire and Automotive
  and Texas Truck Stop. The two vendors that hold drivers and repairs both ("test" and Brian
  Heath Burrell) stay Driver. A vendor has one type. A client that does not send `type` (an old
  open tab, an unsent PowerSync queue) inserts `driver`; the new code always sends it.
- **D3:** one change of RLS, chosen by the user as an exception to "no additional RLS rules":
  the two existing maintainer policies on `Addresses` (`maintainer_addresses_update` and
  `maintainer_addresses_delete`) also admit an address that a vendor points at
  (`Vendors.address_uuid`), not only one that a repair points at. It is `ALTER POLICY` on the
  two, with no new policy. A customer's address stays out of a maintainer's reach. Nothing else
  in RLS changes.

Who and where:

- **D4:** the page `/vendors` is opened by admin, account manager, viewer, maintainer and
  accountant (and by anyone who holds one of them and a driver login besides). A developer does
  not open it: `/vendors` is not in the developer's allowed paths, not in the developer's
  sidebar, and Vendors does not sync to a developer today (this spec leaves that as it is).
- **D5:** who creates, edits, deletes and restores a vendor: admin, account manager, maintainer
  and accountant. The user first named three roles, then added the accountant; delete and
  restore go to the same four. A viewer only reads.
- **D6:** the denial is on the front end only. For a viewer the Add button, Save, Delete and
  Restore are absent and the window is read-only. No RLS rule is added for this. The database
  rules that exist stay: on `Vendors` insert and update admit admin, account manager,
  accountant and maintainer; select does not name the viewer, but the viewer's sync stream
  already carries `Vendors`, so a viewer reads them from the local database.
- **D7:** the window on the driver page (the button "Create New Vendor Company" and the pencil
  on a vendor card) stays for everyone who has it today: admin, account manager (for the drivers
  they may edit) and accountant. Nothing is taken away there.
- **D8:** the sidebar item is "Vendors", a top-level item right after "Companies & Contacts", for
  admin, account manager, viewer, maintainer and accountant. Its address is `/vendors`.

The window (`EditVendorModal`), reused on both pages:

- **D9:** the fields added to the window are Type (required), Address, Contact (name, phone,
  email), Services (four yes/no marks), Status and Notes. The columns exist since
  [maintenance-01-database-schema.md](maintenance-01-database-schema.md); no window writes them
  yet. The form is the same for both types: every field shows whatever the Type is.
- **D10:** the starting Type. From the Vendors page ("Add vendor") nothing is preselected, and
  Save without a Type is refused with "Type required". From the driver page Driver is
  preselected and can be changed, and "Save & Assign" works for either type.
- **D11:** the Type of a vendor can be changed at any time, also when it has drivers or repairs.
  The driver page keeps showing the card of the driver's vendor whatever its type: the card is
  found among all active vendors, and only the list to choose from on that page shows Driver
  vendors. The vendor select of the repair window and the Vendor filter of the Repairs page list
  every vendor, as today.
- **D12:** the checks. Only Display Name and Type are required. EIN and HST are checked as today.
  An email, when filled, must look like `text@text.text`. A phone, when filled, may hold only
  digits, spaces and the signs `+ - ( ) .` and must have from 7 to 15 digits. Both are stored as
  typed, without conversion.
- **D13:** the address uses the Google address field of the other forms and is stored in
  `Addresses` with the same columns the company form writes. Editing changes the vendor's own
  row in place (a maintainer may, by D3). A vendor with no address gets a new row. Clearing the
  address sets `Vendors.address_uuid` to null and leaves the row in the table.
- **D14:** the list of QuickBooks connections (`GET /api/quickbooks/connections`) is opened to
  admin, accountant, account manager and maintainer (today admin and accountant), so the
  QuickBooks block of the window works for the four who edit. Creating, renaming and deleting a
  connection stays admin-only. The read-only window of a viewer has no QuickBooks block.
- **D15:** Delete stays as it is: a confirmation window, then `is_active` becomes false, and the
  drivers keep the vendor. Restore is new: it sets `is_active` to true at once, with a toast and
  no confirmation. Both are for the four roles of D5.
- **D16:** a viewer who clicks a row gets the same window with every field locked: no Save, no
  Delete, no Restore, only Close, and no QuickBooks block (D14).
- **D17:** the window of a deleted vendor (for the four roles) has every field locked and only
  Restore and Close.

The list:

- **D18:** the columns, left to right: Vendor (logo and name), Type, Status, Services, Contact,
  Location. Contact shows the name, phone and email. Location shows the city, the state or
  province and the country, from `Addresses`. Services shows a mark for each of the four that
  is on. An empty cell shows a dash.
- **D19:** the list is ordered by Vendor, A to Z, at the start. Only the headers Vendor and Type
  sort (a click). Status, Services, Contact and Location do not sort. A click on the column
  that is sorted flips the direction; a click on the other sortable column sorts it ascending.
  There is one list with no pager.
- **D20:** the search is one field. Its text is cut into words, and every word must appear, in
  any order, in any of: the display name, the contact name, the contact email, the phone, the
  city, the state or province, the country and the notes (not case-sensitive, a part of a word
  counts). The street and the postal code are not searched.
- **D21:** above the list: the search, a Type filter (All, Driver, Repairs; one choice), a
  Status filter (several values at once: the five statuses and "No status") and the switch Show
  Deleted. Show Deleted shows only the deleted vendors (`is_active` false); off, the list shows
  the active ones. The search and the filters apply in both views, and a row shows only when it
  matches all of them.
- **D22:** the search, the filters and the sorting live in memory only, not in the address; a
  reload resets them.
- **D23:** the Add button above the list is for the four roles of D5, and opens the window empty
  (D10). A viewer does not see it.
- **D24:** a viewer sees the switch Show Deleted too. A click on a deleted vendor opens the
  locked window without Restore (D16).

## 1. What the code has today (researched 2026-11-26)

- **The table.** `Vendors` has `id`, `created_at`, `qbo_vendor_id`, `qbo_connection_uuid`,
  `display_name`, `is_active`, `logo_url`, `ein`, `hst`, and, since maintenance-01, `address_uuid`,
  `phone`, `contact_name`, `contact_email`, `does_trailer_repair`, `does_aluminum_welding`,
  `does_mobile_repair`, `is_parts_supplier`, `status` (`vendor_status`) and `notes`. No window
  writes the maintenance-01 columns.
- **The window.** `src/features/manageTeam/components/EditVendorModal.tsx` (446 lines) holds
  Display Name, QuickBooks connection, QuickBooks vendor, EIN, HST and a logo (upload to the
  `vendor-logos` bucket, or a URL). It creates a vendor with an insert, edits with an update,
  deletes by setting `is_active` to 0, and shows "Save & Assign" when the page passes `onSave`.
  It is used only by `VendorSelection.tsx`, on the driver page.
- **The reads.** `useVendors(includeInactive)` returns the active vendors, A to Z, with the
  number of drivers of each. The repair window's select reads `Vendors` on its own, and the
  Repairs Vendor filter lists every vendor (`repairFilterQueries.ts`).
- **Rights today, in the database.** On `Vendors`: select for admin, account manager,
  accountant and maintainer; insert and update for the same four; no viewer, no developer. On
  `Addresses`: admin, account manager and accountant read, insert and update; a maintainer reads
  and inserts, and changes or deletes only an address a `MaintenanceEvents` row points at; a
  viewer reads. `Vendors.address_uuid` is a foreign key to `Addresses` with no delete rule, so a
  row a vendor points at cannot be deleted at all.
- **Rights today, in the sync rules** (`../br_powersync/config/sync_rules.yaml`). Web streams
  carry `Vendors` and `Addresses` to admin, account manager, viewer, maintainer and accountant,
  not to a developer. No mobile stream carries `Vendors`.
- **The QuickBooks list.** `GET /api/quickbooks/connections` is guarded by
  `requireAdminOrAccountant`, so an account manager and a maintainer get a 403 and see an empty
  connection select in the window. `GET /api/quickbooks/vendors` is guarded by `requireAuth`
  only. `requireAdminOrAccountant` also guards the QuickBooks `items` and `invoice` routes, so it
  must not be widened.
- **The roles.** `WebRole` has seven values: admin, account_manager, developer, viewer, driver,
  maintainer, accountant (the five named in `CLAUDE.md` are out of date). The matrix is in
  `src/features/userAccess/permissionPageData.ts`.
- **Vendors in the production database (read-only query, 2026-11-26).** 48 vendors, all active.
  3 have a status and no drivers and no repairs (Dallas Trailer Repair and Texas Truck Stop,
  Verified; Danielsville Tire and Automotive, Under Review). 2 have both drivers and repairs
  ("test": 2 drivers and 3 repairs; Brian Heath Burrell: 1 driver and 1 repair). 3 have a
  contact, 0 have an address, 2 have notes, 3 have a service mark, 4 have a logo. 5 names occur
  twice: CURA, Dirty Boots, Goldilocks Party Box, Mark Smith, Timberfell.
- **Earlier specs that name this page.** The Repairs specs say "a new vendor is added on the
  Vendors page" (for example `repairs-05-toolbar.md`), and maintenance-01 D19 gave the maintainer
  the rights on `Vendors` for "the vendors tab". This spec is that page; it reads no repair.

## 2. Database

One migration, `supabase/migrations/20261127120000_vendors_type_and_vendor_addresses.sql`. Its
version is later than every migration on `main` (the latest there is `20261125200000`).

```sql
create type public.vendor_type as enum ('driver', 'repairs');

alter table public."Vendors"
  add column type public.vendor_type not null default 'driver';

comment on column public."Vendors".type is
  'driver: a company that employs our drivers and is paid through QuickBooks bills. '
  'repairs: a repair or parts company.';

-- D3: a maintainer also changes and deletes an address a vendor points at.
alter policy maintainer_addresses_update on public."Addresses"
  using (
    public.get_user_roles() && '{maintainer}'::text[]
    and (
      exists (select 1 from public."MaintenanceEvents" me where me.address_uuid = "Addresses".id)
      or exists (select 1 from public."Vendors" v where v.address_uuid = "Addresses".id)
    )
  );

alter policy maintainer_addresses_delete on public."Addresses"
  using (
    public.get_user_roles() && '{maintainer}'::text[]
    and (
      exists (select 1 from public."MaintenanceEvents" me where me.address_uuid = "Addresses".id)
      or exists (select 1 from public."Vendors" v where v.address_uuid = "Addresses".id)
    )
  );
```

- **Existing rows.** The clause `DEFAULT 'driver'` fills the 48 rows (D2). Nothing is updated
  by hand in the migration.
- **Sync.** No change in `../br_powersync`: the Vendors streams are `SELECT "Vendors".*`, so the
  new column reaches every web client that already has the table. No mobile stream has `Vendors`,
  and an old phone build does not touch it.
- **The driver app and old web builds.** The column carries `DEFAULT 'driver'`, so an old
  client that inserts a vendor without `type` still works (D2).
- **The delete half of D3.** A vendor's address row cannot be deleted while the vendor points at
  it (the foreign key). The delete policy is widened as the user chose; the app itself never
  deletes an address (D13). Customers' addresses stay protected on both policies.
- **Local files.** `src/lib/powersync/AppSchema.ts`: `type: column.text` in `VendorsCols`.
  `database.types.ts`: the enum `vendor_type` (in `Enums` and `Constants`) and `type` in the
  `Vendors` Row, Insert and Update. Apply the migration to the local database, check that the
  local database is in step with the migrations, then run `npm run gtl`; if it lags, edit the
  file by hand for this table only (`gtl` would overwrite it from a stale database).

## 3. Server: the QuickBooks connections list (D14)

- `src/features/userAccess/logic/hasQboConnectionsReaderRole.ts`: the function
  `hasQboConnectionsReaderRole(roles)` is true for admin, accountant, account_manager and
  maintainer.
- `src/features/userAccess/logic/requireQboConnectionsReader.ts`: the same shape as
  `requireAdminOrAccountant` (401 with no session, 403 when the roles do not match), using the
  function above.
- `src/app/api/quickbooks/connections/route.ts`: `GET` calls `requireQboConnectionsReader`.
  `POST`, `PATCH` and `DELETE` keep `requireAdmin`. `requireAdminOrAccountant` and
  `hasAdminOrAccountantRole` are not touched (other routes use them).

## 4. Frontend

### 4.1 Types (new, in `src/features/manageTeam/utils/vendorForm.ts`)

```ts
export type VendorType = "driver" | "repairs";
export type VendorStatus = "verified" | "caution" | "under_review" | "prospect" | "do_not_use";

export type VendorAddress = {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

/** One vendor as the window and the list read it. */
export type VendorRecord = {
  id: string;
  displayName: string;
  type: VendorType;
  isActive: boolean;
  logoUrl: string | null;
  qboVendorId: string | null;
  qboConnectionUuid: string | null;
  ein: string | null;
  hst: string | null;
  status: VendorStatus | null;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  doesTrailerRepair: boolean;
  doesAluminumWelding: boolean;
  doesMobileRepair: boolean;
  isPartsSupplier: boolean;
  notes: string | null;
  addressUuid: string | null;
  address: VendorAddress | null;
};

export type EditVendorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The driver page passes it: "Save & Assign" shows, and gets the vendor's id. */
  onSave?: (vendorId: string) => void;
  /** The Type a new vendor starts with. The driver page passes "driver"; /vendors passes none. */
  defaultType?: VendorType;
  /** null or absent: a new vendor. */
  existingVendor?: VendorRecord | null;
  /** A viewer: every field locked, only Close, no QuickBooks block (D16). */
  readOnly?: boolean;
};
```

The window has four modes, all derived from the props: **create** (no `existingVendor`), **edit**
(an active vendor), **deleted** (`existingVendor.isActive` is false: locked, Restore and Close,
D17) and **read-only** (`readOnly`: locked, Close, D16; a deleted vendor opened read-only has no
Restore either).

### 4.2 The window (`EditVendorModal.tsx`, `VendorFormFields.tsx`, `vendorForm.ts`, `saveVendor.ts`)

- **Layout, top to bottom.** Display Name; Type and Status side by side; QuickBooks Connection;
  QuickBooks Vendor; Address; Contact name, Phone and Email; Services (four switches, labelled
  Trailer repair, Aluminum welding, Mobile repair, Parts supplier); EIN and HST; Notes; Logo.
  The buttons are Delete (left, edit mode only), Cancel, Save, and Save & Assign (only with
  `onSave`); in deleted mode Restore and Close.
- **Type** is a select with the two labels "Driver" and "Repairs". It has no empty option once
  chosen; in create mode with no `defaultType` it starts empty (D10).
- **Status** is a select with "No status" (stores null) and the five labels Verified, Caution,
  Under review, Prospect, Do not use.
- **Address** uses `AddressAutoComplete` (`src/components/AddressAutoComplete.tsx`) with
  `formatAddressLine` for the start value, and keeps the parsed pieces (street, city, state or
  province, postal code, country, latitude, longitude, place id).
- **Validation** (`vendorForm.ts`, one pure function): Display Name not empty, Type chosen, EIN
  as today (9 digits after removing signs), HST as today, email and phone by D12. Each refusal
  is one error toast with a title and a line, like the existing ones ("Type required", "Invalid
  email", "Invalid phone number").
- **Save** (`saveVendor.ts`) writes locally, in this order: the address row first (insert, or an
  update of `existingVendor.addressUuid` in place, or nothing; an emptied address sets the
  vendor's `address_uuid` to null and leaves the row), then the vendor row (insert with a new
  `crypto.randomUUID()`, `is_active` 1 and `created_at`, or update), with `type`, the maintenance
  columns, EIN as digits only and every empty text stored as null. Booleans are 0/1 in the local
  table. It returns the vendor id; the window then calls `onSave(id)` for "Save & Assign".
- **Delete and Restore** are two small updates of `is_active` (0 and 1). Delete keeps its
  confirmation window and text ("Drivers assigned to this vendor will keep their assignment").
  Restore has none (D15).
- **The QuickBooks block** works as today and shows the connection list that D14 now serves to
  the four roles; it is not rendered in `readOnly` mode.
- **Logo**: unchanged (upload to the `vendor-logos` bucket needs the network; a URL does not).
- **Where it lives.** The window stays in `src/features/manageTeam/components/`; the Vendors
  page imports it from there. The fields move to `VendorFormFields.tsx` so the window file does
  not grow past reading.

### 4.3 Reads (`useVendors.ts`)

`useVendors(includeInactive = false)` keeps its name and its order (`display_name` ascending,
as today; the page sorts again in `sortVendors`). It returns `VendorOption`, which is
`VendorRecord & { driverCount: number }`. The query
adds `type` and the maintenance columns, and a `LEFT JOIN "Addresses"` on `address_uuid`
for the address pieces. Booleans are read as `0/1` and mapped to `boolean`; `status` and `type`
are read as text. The driver page uses `useVendors()` (active only, as today). The Vendors page
uses `useVendors(true)` and splits active from deleted itself.

### 4.4 The driver page picker (`VendorSelection.tsx`) (D10, D11)

- The list to choose from shows only vendors whose `type` is `driver`; its search is unchanged.
- The selected card is looked up among all active vendors, so a driver whose vendor is a Repairs
  vendor still sees the card, with its pencil.
- "Create New Vendor Company" opens the window with `defaultType="driver"`; the pencil opens it
  in edit mode with the full record. `onSave` stays as it is: it assigns the vendor to the driver
  whatever the type.

### 4.5 Access and sidebar (D4, D5, D8)

- `src/features/userAccess/accessConfig.ts`: `/vendors` is added to `allowedPaths` of admin,
  account_manager, viewer, maintainer and accountant, and not to developer or driver. The path
  rule compares a whole segment, so `/vendors` does not open a longer path such as `/vendors-x`.
  The accountant's list keeps `/accountant` first (it decides the redirect; add `/vendors` after
  `/contacts`). The maintainer's comment in the file gets one line naming this page.
- `src/components/sidebar/useSidebarItems.ts`: a top-level button `vendors`, label "Vendors",
  href `/vendors`, placed right after `companies-contacts` in `ALL_ITEMS`; the key `vendors` is
  added to `ROLE_SIDEBAR_KEYS` of admin, account_manager, viewer, maintainer and accountant.
- `src/features/userAccess/logic/canManageVendors.ts`: `canManageVendors(roles: WebRole[])` is
  true when the roles include admin, account_manager, maintainer or accountant. The page uses it
  for the Add button, for `readOnly` and for Restore. It is a front-end decision only (D6).

### 4.6 The page (`src/features/vendors/`)

- `src/app/vendors/layout.tsx` (`<div className="p-4">`, as the Repairs layout) and
  `src/app/vendors/page.tsx` (renders `VendorsPage`).
- `components/VendorsPage.tsx`: the header "Vendors" with the Add button (D23); the toolbar; the
  table; the window. It holds the state of D22 (search text, Type, Statuses, Show Deleted, sort)
  in React, picks `readOnly` and the Restore rights from `canManageVendors`, and opens the window
  on a row click: create (Add), edit (active vendor), deleted (deleted vendor), read-only
  (viewer, either).
- `components/VendorsToolbar.tsx`: the search field, the Type filter (All, Driver, Repairs), the
  Status filter (a menu with check marks: the five statuses and "No status"), and the switch Show
  Deleted. The look of the filter menu follows `RepairFilterMenu` where that fits.
- `components/VendorsTable.tsx`: the six columns of D18. The headers Vendor and Type are buttons
  with an arrow for the direction (D19); the other four are plain text. A row is a button that
  opens the window. Status shows a small label (colours as the chips of the Repairs page),
  Services shows the marks of the four, an empty cell shows a dash. With no match the table
  shows "No vendors found".
- `utils/vendorListRows.ts`: pure functions, no React: `matchesSearch(vendor, text)` (D20),
  `matchesFilters(vendor, filters)` (D21), `sortVendors(vendors, sort)` (D19, ties by name
  A to Z) and `buildVendorRows(vendors, state)` that applies the view (active or deleted), the
  search, the filters and the sort in that order.
- `utils/vendorLabels.ts`: the labels of the two types, the five statuses and the four services,
  used by the table, the filters and the window.

## 5. The permissions matrix

`src/features/userAccess/permissionPageData.ts`, in the same commit (the rule of `CLAUDE.md`):

- **A new row "Vendors"** (category "Day to Day Operations", after "Companies & Contacts").
  Admin: full. Account manager: full. Maintainer: full. Accountant: full. Viewer: read, with a
  note that the window opens read-only and a deleted vendor can be seen but not restored.
  Developer: none ("the page is hidden from this role"). Driver: none (mobile app only). The
  note of each role says what the role does on the page, in plain words an account manager can
  read: the list, the search, the filters, the vendor type (Driver for the companies that employ
  our drivers, Repairs for repair and parts companies), the contact, address, services, status
  and notes, the deletion that only hides a vendor and the restore.
- **Role descriptions.** The maintainer's description and `MAINTAINER_NO_ACCESS_NOTE`, and the
  accountant's description and `ACCOUNTANT_NO_ACCESS_NOTE`, each get one clause that names the
  Vendors page, so "everything else is hidden" stays true. The account manager and viewer
  descriptions need none.
- **The Team Management row, accountant note.** It says the accountant creates, edits and deletes
  vendor companies on the driver page; it gets one clause: the window now also has the type,
  address, contact, services, status and notes, and the same vendors are managed on the Vendors
  page.
- `permissionPageData.test.ts` is extended: the new row has an entry for every one of the seven
  roles.

## 6. Tests

Tests come first for each unit (TDD). End to end scenarios are written, not run (project rule).

### 6.1 Unit and component (Vitest)

- `vendorForm.test.ts`: Display Name and Type required; EIN and HST as today; email: accepts
  `a@b.co`, refuses `a@b`, `a b@c.d` and an empty string is accepted (optional); phone: accepts
  `+1 (214) 555-0182` (11 digits), `214-555-0182` (10) and `+380 44 123 4567` (12); refuses
  `123456` (6 digits), a 16-digit number, `214-555-CALL` (letters) and accepts an empty string;
  the mapping to columns (empty text becomes null, EIN keeps digits only, `type` is passed).
- `saveVendor.test.ts` (the `db` helpers mocked as the other save tests do): a new vendor with an
  address inserts the address first, then the vendor, with `type`; a new vendor with no address
  inserts one row; an edit with an address and an existing `addressUuid` updates that row in
  place and updates the vendor; an edit that adds an address to a vendor with none inserts a row
  and sets `address_uuid`; clearing sets `address_uuid` to null and runs no delete; a failing
  write raises, and the window shows the error toast.
- `EditVendorModal.test.tsx`: create with no `defaultType` shows an empty Type and refuses Save
  ("Type required"); create from the driver page (`defaultType="driver"`) starts on Driver and
  "Save & Assign" calls `onSave` with the new id for `repairs` too; edit shows Delete, and the
  confirmation runs the update; `readOnly` locks every field, shows only Close and no
  QuickBooks block; a deleted vendor shows locked fields with Restore and Close, and Restore runs
  the update at once with a toast.
- `useVendors` (the pure mapping function, since the repo has no `renderHook`): maps a row to
  `VendorOption`, `0/1` to booleans, the joined address, a vendor with no address.
- `VendorSelection.test.tsx`: the list shows `driver` vendors only; a selected vendor of type
  `repairs` still renders its card; "Create New Vendor Company" opens the window with Driver.
- `vendorListRows.test.ts`: the search by words (the example: "dallas repair" and "repair
  dallas" both find "Dallas Trailer Repair"; a word in the notes, a word in the city, a word in
  the contact email; the street is not searched; spaces only is no search); each filter and all
  together (AND); the Type filter; the Status filter with "No status"; Show Deleted keeps the
  search and the filters; the sort by Vendor and Type, both directions, ties by name; the
  initial order.
- `VendorsTable.test.tsx` and `VendorsPage.test.tsx`: the six columns, dashes for empty cells,
  Vendor and Type headers are buttons and flip the direction, the other four are not; the Add
  button is absent for a viewer; a row click opens the window (read-only for a viewer); Show
  Deleted shows the deleted vendors and the viewer sees the switch.
- `canManageVendors.test.ts`, `hasQboConnectionsReaderRole.test.ts`, the route test of
  `connections` (GET answers 200 for admin, accountant, account manager and maintainer and 403
  for a viewer and a developer; POST, PATCH, DELETE still refuse everyone but admin).
- `accessConfig.test.ts`: `/vendors` is allowed for the five roles and refused for developer and
  driver; `/vendors-x` is not opened by `/vendors`. `useSidebarItems.test.ts`: Vendors comes
  right after Companies & Contacts for the five roles and is absent for a developer.

### 6.2 SQL (`supabase/tests/vendors_type.test.sql`, the harness of `maintenance_schema.test.sql`)

Run in a transaction that is rolled back.

- **T1:** `vendor_type` has the values `driver` and `repairs`, in that order.
- **T2:** `Vendors.type` is `NOT NULL DEFAULT 'driver'`; no existing row is null.
- **T3:** an insert with no `type` stores `driver`; an insert of `repairs` works; an insert of any
  other text fails.
- **T4:** a maintainer updates an address that a vendor points at; the row changes.
- **T5:** a maintainer cannot update an address that no repair and no vendor points at (a
  customer's): zero rows change.
- **T6:** a maintainer's delete of an address a vendor points at reaches the foreign key (error
  23503), not the policy; a maintainer's delete of a customer's address removes zero rows; a
  maintainer's update and delete of an address a repair points at still work (D3 keeps it).
- **T7:** no other right changed: an account manager, an admin and an accountant still insert and
  update `Vendors` and `Addresses`; a viewer still cannot insert or update a vendor.

### 6.3 End to end (Playwright, by the role of the file name; written, not run)

- **S1 (admin):** `/vendors` lists the vendors A to Z; the search "dallas repair" finds Dallas
  Trailer Repair; the Type filter and the Status filter (with "No status") narrow the list; a
  click on the Vendor header flips the order.
- **S2 (admin):** Add vendor with no Type is refused; with Type Repairs, address, contact,
  services, status and notes it appears in the list with those values.
- **S3 (admin):** edit a vendor's Type from Driver to Repairs; the list and the Type filter
  follow.
- **S4 (admin):** Delete a vendor (confirmation); it leaves the list; Show Deleted shows it; its
  window is locked with Restore; Restore brings it back.
- **S5 (account manager):** the Add button works and the QuickBooks connection select is filled
  (the connections list answers 200).
- **S6 (maintainer):** adds a vendor with an address, then changes the address; the change is
  still there after the sync (polled in the database), which proves D3.
- **S7 (accountant):** adds, edits, deletes and restores a vendor; on the driver page the window
  still creates a vendor, with Driver preselected.
- **S8 (viewer):** no Add button; a click on a row opens the locked window with no QuickBooks
  block; the Show Deleted switch is there.
- **S9 (admin, driver page):** the list of vendors to choose from shows Driver vendors only; a
  driver whose vendor is switched to Repairs still shows the vendor card.

The developer has no end to end scenario: the path rule and the sidebar are covered in 6.1.

## 7. Edge cases and errors

- **Offline.** A save is a local write that PowerSync uploads later, so it works offline. The
  logo upload and the QuickBooks lists need the network, and keep their present error messages.
- **Clerk session lost.** The logo upload fails with its present error toast; the local write of
  the vendor does not need the session.
- **An upload the database refuses** (for example `42501` after a role lost its rights): it is
  dropped with a toast and the local row disappears after the sync, as for every other table.
- **Two people edit one vendor.** The last upload wins, as everywhere in the app.
- **Duplicate names** are allowed and stay allowed; 5 names occur twice today. No rule and no
  warning is added (not asked).
- **A vendor switched to Repairs while a driver has it.** The driver page keeps the card (D11);
  nothing else changes for the driver, and the work tracker bills read the vendor's QuickBooks
  fields as before.
- **An address with no country.** The Location column shows what it has; the currency
  pre-filled in a repair is unchanged (it reads `Addresses.country` as before).
- **An address row not yet synced** (a fresh client): the Location cell shows a dash until it
  arrives.
- **A maintainer clears an address.** It only sets `address_uuid` to null on the vendor, which
  RLS already allows (D13).
- **A developer opens `/vendors` by its address.** The access hook sends them away like any
  forbidden path.
- **The Type filter and a vendor of another type opened for edit.** The window opens from the
  list, so the vendor is always one the filters show.

## 8. Files

The build is one logic, vendors, and counts **20 files** (the cap of 10 is waived because cutting
it would split the window from the page that reuses it; the work can still be committed in three
steps: the database and the window, then the access and the server, then the page). Not counted:
this spec, the tests, `AppSchema.ts`, `database.types.ts` and `permissionPageData.ts`.

- Database (1): the migration.
- Window and reads (6): `EditVendorModal.tsx`, `VendorFormFields.tsx` (new), `vendorForm.ts` (new),
  `saveVendor.ts` (new), `useVendors.ts`, `VendorSelection.tsx`.
- Server (3): `hasQboConnectionsReaderRole.ts` (new), `requireQboConnectionsReader.ts` (new),
  `connections/route.ts`.
- Access (3): `accessConfig.ts`, `useSidebarItems.ts`, `canManageVendors.ts` (new).
- Page (7): `app/vendors/layout.tsx`, `app/vendors/page.tsx`, `VendorsPage.tsx`,
  `VendorsToolbar.tsx`, `VendorsTable.tsx`, `vendorListRows.ts`, `vendorLabels.ts`.

## 9. Not in this spec

- A page for one vendor, a count of drivers or repairs on the list, a link from a vendor to its
  repairs, merging or blocking duplicate vendors.
- Filtering the repair window's vendor select or the Repairs Vendor filter by type (D11 keeps
  them as they are).
- Sorting by Status, Services, Contact or Location, a pager, and the address bar keeping the
  search, the filters or the sort (D19, D22).
- Any other RLS change than the two policies of D3, a sync-rule change, a change to the driver
  app, and a Vendors stream for the developer.
- Changing how bills or repairs read a vendor.

## 10. Build order and Definition of Done

1. The migration, the SQL test (T1 to T7), `AppSchema.ts`, `database.types.ts`.
2. The server guard and the route (3), with their tests.
3. `vendorForm.ts`, `saveVendor.ts`, `useVendors.ts`, the window and the fields, the picker.
4. `canManageVendors.ts`, `accessConfig.ts`, `useSidebarItems.ts`.
5. The page, the toolbar, the table, the pure functions.
6. `permissionPageData.ts` and its test; the end to end files (S1 to S9).

Done means, with the real command output shown: `npm run tc` green; `npm run test` green; the
SQL test green in a rolled-back transaction through the Docker `psql`; prettier clean on the
touched files only (`npm run format` rewrites unrelated files); `npm run test:e2e` marked SKIPPED
with the reason (the user does not run Playwright locally). The migration is applied to the local
database and is not deployed.
