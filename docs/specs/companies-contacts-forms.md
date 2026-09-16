# Spec: One Company form, one Contact form, full address-book search

Status: **APPROVED** (2026-09-17)
Owner: companiesContacts
Surface affected: `/companies-contacts` (both tabs, both detail modals, both create modals),
`ContactPicker` (quote builder Client Info, work tracker pickup/dropoff POC)

---

## 0. Why

Each form exists in more than one hand-maintained copy:

| Form    | Copies                                                                            |
| ------- | --------------------------------------------------------------------------------- |
| Company | `CreateCompanyModal`, `CompanyDetailModal` edit mode                              |
| Contact | `CreateContactModal`, `ContactDetailModal` edit mode, `ContactPicker` edit dialog |

Billing/shipping addresses and the default Venue were later added to the create copies only, so
every edit copy silently lacks them. `updateCompany` cannot write addresses at all (the address
insert is private to `createCompany`), and `updateContact` cannot write `default_venue_uuid`.

The fix is one form module per entity: it owns fields, validation, duplicate checks and saving.
Every entry point becomes a thin caller. A field added once shows up everywhere.

Search has the same root cause. The filter functions are tested, but the hooks never select the
columns the search should cover.

## 1. Decisions (settled with the user, 2026-09-17)

1. **Edit opens inside the same Dialog.** The detail modal's Edit button swaps its body from view
   to the shared form. It does not open a second Radix root (the stuck scroll-lock that
   `VenuePicker` / `ContactPicker` already worked around).
2. **Duplicate checks in edit follow create**, excluding the record itself. A matching email or
   phone on another record blocks Save; a company name-only match only warns.
3. **Billing and shipping are always separate `Addresses` rows.** "Shipping same as billing"
   writes a second row with the same fields. This changes create too. Existing companies whose
   two uuids point at one row are split the first time they are saved from the edit form.
4. **`ContactPicker`'s edit dialog uses the shared Contact form**, including Venue. It keeps its
   "updates everywhere" note, its in-dialog delete-confirm step and `contentClassName`.
5. **Search covers every field listed in §5.**

## 2. DB schema / PowerSync

**No migration, no `AppSchema.ts` change.** Everything used already exists:
`Companies.billing_address_uuid`, `Companies.shipping_address_uuid`, `Contacts.default_venue_uuid`,
`Venues(name, address_uuid)`, `Addresses(street, city, state_province, zip_postal, latitude,
longitude, country, place_id)`.

Nothing references a company's `Addresses` rows except that company. The quote PDF reads billing
through a live join, so updating a row in place is safe.

**Permissions:** unchanged. Admin and account manager can already create and edit companies,
contacts and venues; viewer cannot (RLS). `permissionPageData.ts` already describes this, so no
edit is needed.

## 3. Types

### 3.1 Company

```ts
// hooks/useCompaniesAll.ts
export type CompanyFull = {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  billingAddress: StoredAddress | null;
  shippingAddress: StoredAddress | null;
};

// AddressFields (quoteTypes) plus the row it came from.
export type StoredAddress = AddressFields & { id: string };
```

`CompanyFull.address` (the flattened billing string) is removed. Its one other reader,
`CreateContactModal`'s company `searchValue`, switches to `companySearchText` (§5).

```ts
// logic/companyForm.ts (pure)
export type CompanyFormState = {
  values: CompanyFormValues; // unchanged: companyName, email, phone
  notes: string;
  billing: AddressFields;
  shipping: AddressFields;
  sameAsBilling: boolean;
};
export function emptyCompanyFormState(): CompanyFormState;
export function companyFormStateFrom(company: CompanyFull): CompanyFormState;
export function isSameAddress(a: AddressFields, b: AddressFields): boolean;
```

`companyFormStateFrom` sets `sameAsBilling = true` when shipping is missing or `isSameAddress`
holds. `isSameAddress` compares street, city, stateProvince, zipPostal and country, trimmed and
case-insensitive.

```ts
// db/saveCompany.ts: replaces createCompany.ts and updateCompany.ts
export type SaveCompanyInput = {
  companyName: string;
  email: string;
  phone: string;
  notes: string;
  billingAddress: AddressFields;
  shippingAddress: AddressFields; // caller passes billing again when sameAsBilling
};
export type ExistingAddressIds = { billing: string | null; shipping: string | null };

/** Create when `existing` is null, otherwise update. Returns the company id. */
export function saveCompany(
  input: SaveCompanyInput,
  existing: { id: string; addressIds: ExistingAddressIds } | null,
): Promise<string>;
```

```ts
// hooks/useCompanyForm.ts
export function useCompanyForm(company: CompanyFull | null): {
  state: CompanyFormState;
  // setters, errorFor, markTouched …
  blockingDuplicates: string[];
  nameOnlyDuplicates: string[];
  canSave: boolean;
  saving: boolean;
  submit: () => Promise<SavedCompany | null>; // null = invalid or failed
  reset: () => void;
};
export type SavedCompany = { id: string; companyName: string; email: string; phone: string };
// CreatedCompany stays as a type alias of SavedCompany for existing callers.

// components/CompanyFormFields.tsx
export function CompanyFormFields(props: { form: ReturnType<typeof useCompanyForm> }): JSX.Element;
```

### 3.2 Contact

```ts
// hooks/useContactsAll.ts
export type ContactFull = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  companyUuid: string | null;
  company: ContactCompany | null;
  preferredLanguage: PreferredLanguage;
  defaultVenue: VenueFull | null;
};
export type ContactCompany = {
  companyName: string;
  email: string | null;
  phone: string | null;
  billingAddress: AddressFields | null;
  shippingAddress: AddressFields | null;
};
```

`ContactFull.companyName` becomes `company?.companyName`. This is one SQL query with left joins
on `Companies`, two `Addresses` (billing, shipping), `Venues` (with `deleted = 0`) and the
venue's `Addresses`.

```ts
// logic/contactForm.ts (pure)
export type ContactFormState = {
  values: ContactFormValues; // unchanged
  notes: string;
  companyUuid: string | null;
  preferredLanguage: PreferredLanguage;
  venue: VenuePickerValue;
};
export type ContactFormSource = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  companyUuid: string | null;
  preferredLanguage: PreferredLanguage;
  defaultVenueId: string | null;
};
export function emptyContactFormState(initialQuery?: string): ContactFormState;
export function contactFormStateFrom(src: ContactFormSource, venues: VenueFull[]): ContactFormState;
/** The venue uuid to persist. An unresolved original venue is kept unless the user changed it. */
export function venueIdToSave(
  state: ContactFormState,
  originalVenueId: string | null,
  venueTouched: boolean,
): string | null;
```

`ContactFormSource` is satisfied by `ContactFull` (through a small mapper) and by
`ContactPicker`'s `ContactOption`. That keeps the picker off the heavy join.

```ts
// db/updateContact.ts: params gain
defaultVenueUuid: string | null;

// hooks/useContactForm.ts
export function useContactForm(opts: {
  contact: (ContactFormSource & { id: string }) | null; // null = create
  initialQuery?: string;
}): {
  state: ContactFormState;
  // setters, errorFor, markTouched …
  duplicates: string[];
  canSave: boolean;
  saving: boolean;
  submit: () => Promise<SavedContact | null>;
  reset: () => void;
};
export type SavedContact = CreatedContact; // same shape; CreatedContact kept as alias

// components/ContactFormFields.tsx
export function ContactFormFields(props: {
  form: ReturnType<typeof useContactForm>;
  /** Raised z-index for the nested "+ New" company dialog; see CreateContactModal today. */
  contentClassName?: string;
}): JSX.Element;
```

### 3.3 Modal props (unchanged externally)

`CreateCompanyModal`, `CreateContactModal`, `CompanyDetailModal`, `ContactDetailModal` and
`ContactPicker` keep their current props. Each becomes a Dialog shell plus header and footer
around `*FormFields`.

## 4. View modes

**Company detail:** Email, Phone, **Billing Address**, **Shipping Address**, Notes, Contacts.
An address renders as `street, city, state zip, country`, or "—" when missing. Shipping reads
"Same as billing" when `isSameAddress` holds.

**Contact detail:** Email, Phone, Company, Language, **Venue** (bold name, address line beneath
it, or "—"), Notes.

## 5. Search

```ts
// utils/searchFilter.ts
export function companySearchText(c: CompanySearchable): string;
export function contactSearchText(c: ContactSearchable): string;
export function filterCompanies<T extends CompanySearchable>(rows: T[], query: string): T[];
export function filterContacts<T extends ContactSearchable>(rows: T[], query: string): T[];
```

Matching is a case-insensitive substring test of the trimmed query against the joined text. An
empty query returns every row.

| Entity  | Fields in the search text                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company | company_name, phone, email, billing and shipping address                                                                                                                                    |
| Contact | first_name, last_name, "first last", phone, email, preferred_language (value and label), default venue name and address, company (company_name, phone, email, billing and shipping address) |

"Address" means street, city, state_province, zip_postal, latitude, longitude and country.
Coordinates are stringified as stored.

`ContactPicker`'s dropdown search (`getSearchText`) is **out of scope**.

## 6. Behaviour scenarios (Playwright, `*.admin.spec.ts`)

1. **Company edit shows addresses.** Seed a company with distinct billing and shipping. Open its
   detail: both addresses show. Click Edit: the form shows both addresses, "same as billing" is
   unticked, and the dialog title reads "Edit Company".
2. **Company edit saves addresses.** Change the phone and save. The view shows the new phone, and
   the DB still has both address rows unchanged.
3. **Company create with same-as-billing writes two rows.** The DB has two distinct uuids with
   equal fields.
4. **Contact edit shows and keeps the venue.** Seed a contact with a default venue. Detail shows
   the venue name. Edit, change the last name and save: `default_venue_uuid` is unchanged.
5. **Contact edit changes the venue.** Pick another venue and save: the DB holds the new uuid.
6. **Edit duplicate block.** Edit contact A's email to contact B's: Save is disabled and the
   warning shows. Re-saving A with its own unchanged email is allowed.
7. **Search.** In the Companies tab, a shipping city finds the company. In the Contacts tab, a
   venue name, the company's billing zip and "french" each find the contact.

Pickup and dropoff through `ContactPicker` are covered by unit tests and a manual preflight
check, not a new e2e spec.

## 7. Edge cases

- **Legacy shared address row** (`billing_uuid === shipping_uuid`): the update writes billing in
  place and inserts a fresh shipping row, then points `shipping_address_uuid` at it.
- **Empty address** (no street, city or state): its uuid is set to `null`, and on update the
  old row is left orphaned. There is no delete, which matches how venues are handled.
- **sameAsBilling with an empty billing address:** both uuids are `null`.
- **Clearing an address in the UI is not possible.** `AddressAutocomplete` only emits on select.
  This is unchanged and out of scope.
- **Default venue not resolvable** (soft-deleted, or venues not yet synced): the picker shows
  empty, and saving keeps the original `default_venue_uuid` unless the user touched the picker
  (`venueIdToSave`).
- **Record deleted or changed by another user while the form is open:** the form keeps local
  values and does not re-seed while in edit mode. Seeding happens only on open and on
  Edit → Cancel.
- **Offline (PowerSync):** saves are local writes and sync later. Nothing new here.
- **Viewer:** the write succeeds locally and is then rejected by RLS, as today and as covered by
  `contactsAccess.viewer.spec.ts`.
- **Clerk session expired mid-edit:** the local write lands and upload fails until the user signs
  in again. Unchanged.
- **`saveCompany` failure** shows an error toast ("Failed to save company.") and rethrows. The
  form stays open with the values intact.

## 8. Tests (TDD, written before implementation)

- `db/saveCompany.test.ts` (DummyDriver pattern from `updateContact.test.ts`): create
  same-as-billing produces 2 address inserts, 1 company insert, distinct uuids; create with empty
  addresses gives null uuids; update of separate rows updates both in place; update of a legacy
  shared row updates billing, inserts shipping and repoints `shipping_address_uuid`; update from
  no address inserts a row.
- `db/updateContact.test.ts`: persists `defaultVenueUuid`, and persists `null`.
- `logic/companyForm.test.ts`: `isSameAddress`; `companyFormStateFrom` sets `sameAsBilling`
  correctly for equal, different and missing shipping.
- `logic/contactForm.test.ts`: `contactFormStateFrom` resolves the venue or falls back to empty;
  `venueIdToSave` covers the untouched and unresolved cases; `emptyContactFormState` splits the
  initial query.
- `__tests__/searchFilter.test.ts`: one table-driven case per field in §5, plus the existing
  cases.
- `e2e/companiesContactsForms.admin.spec.ts`: scenarios §6.

---

## 9. Follow-up, same day: pickers instead of a select

Three things came out of trying the form against real data.

1. **Venue was unusable in New/Edit Contact.** `EntitySearchSelect` portals its floating panel to
   `document.body`. Radix puts `pointer-events: none` on the body while a dialog is open and
   closes the dialog on a pointer-down outside its content, so inside a dialog the panel rendered
   unclickable — and any click that did land would have shut the contact form. The panel now
   portals into the dialog's own content element when there is one (`panelPosition` does the
   coordinate math, and is unit-tested), and to the body otherwise. Since a dialog clips what it
   contains, the panel is measured after it renders and flips above the card when it does not fit
   below — room is counted against the dialog and the viewport, whichever ends sooner. It is also
   capped to the room on whichever side it lands on, with the list scrolling inside that, since a
   panel that overflows its dialog gets its search box clipped off the top. When it fits on
   neither side it stays below, because flipping would only move the problem.
2. **Company is now a picker, not a select.** `CompanyPicker` uses the same `EntitySearchSelect`
   shell as `VenuePicker` and `ContactPicker`: search, "+ Create New Company" inside the panel
   (the separate "+ New" button is gone) and a pencil on every row that opens Edit Company. Both
   dialogs render the shared `CompanyFormFields`. Deleting a company is not offered from the
   picker — that stays on the Companies & Contacts page, since it affects every linked contact.
3. **The panel shows a page, not everything.** With hundreds of companies or venues a full list
   buries the create row and nobody scrolls it. `searchEntities` returns the first
   `ENTITY_SEARCH_LIMIT` (50) matches plus a count, the panel pins "+ Create New ..." above the
   list, and a footer reads "Showing 50 of N. Keep typing to narrow it down."

`supabase/seed.sql` gained 100 companies, 100 venues and 100 contacts, all named `Load Test ...`,
so this is testable. The block deletes its own rows before inserting, so it can be re-run without
piling up duplicates.
