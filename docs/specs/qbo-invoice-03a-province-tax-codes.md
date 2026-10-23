# QuickBooks invoice — the tax code per Canadian province

Status: **Implemented 2026-10-22.** 0 open decisions; three readings to confirm (§1, last
paragraph). Two changes were approved while implementing: the migration is numbered
`20261022150000` (§3), and the page reaches `db.ts` through a route plus two `api.ts` functions
(§4, §6). **Narrowed on 2026-10-23 by [03e](qbo-invoice-03e-canadian-settings-cad-only.md):**
the section is drawn only for a connection whose currency is CAD (§1, third reading; §5 S1).
Implementation order: **03a**, after [03](qbo-invoice-03-payload.md) and before
[04](qbo-invoice-04-create.md). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: the QuickBooks page (`/quickbooks`) and its Default Tax Code.

## 0. The request, and what it is not

The Canadian QuickBooks file does not calculate tax: it applies whichever tax code the
document carries. The quote form already knows the combined rate of each province from a
static table; the invoice needs the **QuickBooks tax code** that stands for that province. This
spec adds:

- a table that stores, per **QuickBooks connection and province**, a QuickBooks tax code;
- a section on the QuickBooks page where an admin sets them;
- a server function that finds the code for an invoice.

**Not part of this spec:** the invoice body (spec 03 places the code); any change to the
connection's Default Tax Code, which bills and the tax calculator keep using; creating tax
codes in QuickBooks; the US file (it calculates tax itself).

## 1. Decisions (all taken by the user)

**Question — which QuickBooks tax code goes on a Canadian invoice**

- **Option A — one code per connection** (`QboConnections.qbo_tax_code_id`, as bills do). A
  province whose rate differs from that code shows as a mismatch.
- **Option B — a code per province,** with a screen to maintain it.
- **User's answer: B — a code per province.**

**Question — a taxed Canadian quote whose province has no code mapped**

- **Option A — refuse the invoice** with a message. **Option B — create it without tax and
  warn;** the invoice check then reports a mismatch until the code is mapped and the invoice
  updated.
- **User's answer: B — create untaxed, with a warning.**

**From the user's own words (not options):**

- Canada is supported (the user reversed the earlier "not yet").
- The quote form's tax calculator for Canada is the one in use; its rates are not changed.

**Readings to confirm at review.**

- The section sits on the existing `/quickbooks` page, under a connection's Default Tax Code
  row. ~~It is shown for **every** connection.~~ **Amended by 03e:** it is shown only for a
  connection whose `QboConnections.currency` is `CAD`; a US connection never reads it.
- Only an **admin** maintains it, because the page is admin-only and the Default Tax Code is
  already set there; no role gains anything new.
- The choices of a province's code are the connection's own QuickBooks tax codes, loaded the
  way the Default Tax Code select loads them.

## 2. Research findings

- **The provinces.** `CANADIAN_PROVINCES` in `canadianTaxRates.ts` has the 13 codes — AB, BC,
  MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT — with a name, the combined percent and a label
  such as "GST 5% + QST 9.975%"; `normalizeCanadianProvince` turns "ON", "Ontario" or
  "Québec" into the code.
- **The page.** `/quickbooks` lists the connections. Each card has a Default Tax Code `select`
  fed by `taxCodesMap[connection id]`, which the page fills from `GET /api/quickbooks/tax-codes`
  (admin only) once the connection is healthy; until then it shows the stored id or "Check
  connection to load tax codes".
- **The data helpers** for the page are in `quickbooks-integration/db.ts`
  (`getAllQboConnections`, `updateQboConnectionTaxCode`), using the signed-in user's token.
- **Who may open the page.** `/quickbooks` is in the admin-only paths of `accessConfig.ts`.
- **Nobody else reads it.** The invoice route reads the table with the service role, as it does
  every table it needs (spec 04).
- **The matrix.** The row **Quickbooks Connections** says an admin can create, update, delete
  and edit all connections on that page.

## 3. Database — `supabase/migrations/20261022150000_province_qbo_tax_codes.sql`

(After `20261022140000`, the latest on the branch; renumbered from `20261022140000`, which
`contact_qbo_customers` already uses.)

**`public."ProvinceQboTaxCodes"`:**

- `id` — `uuid`, primary key, `gen_random_uuid()`.
- `created_at` — `timestamptz`, not null, `now()`.
- `qbo_connection_uuid` — `uuid`, not null, references `"QboConnections"(id)`
  `ON DELETE CASCADE`.
- `province` — `text`, not null, one of the 13 codes above (a `CHECK`).
- `qbo_tax_code_id` — `text`, not null. QuickBooks' own id of the tax code.
- Unique on `(qbo_connection_uuid, province)`.

Row level security is **enabled**, with four policies (select, insert, update, delete), each
`'admin' = any(public.get_user_roles())`. No other role has a policy. Not added to
`AppSchema.ts` and not synced: the page and the invoice route are online-only.

## 4. App changes

- **`db.ts`** (changed): `getProvinceTaxCodes(connectionId)` returns the connection's rows;
  `setProvinceTaxCode(connectionId, province, taxCodeId | null)` upserts the row, or deletes it
  when the id is null. Both use the signed-in user's token, so the policies of §3 decide.
- **`api.ts`** (changed): `fetchProvinceTaxCodes(connectionId)` and
  `setProvinceTaxCodeApi(connectionId, province, taxCodeId | null)` — the page is a client
  component, so it reaches `db.ts` through a route, as every other call on that page does.
- **`app/api/quickbooks/province-tax-codes/route.ts`** (new): `GET ?connectionId=` answers
  `{ provinceTaxCodes: [{ province, qbo_tax_code_id }] }`; `PUT` takes the body
  `{ connectionId, province, taxCodeId }` and answers `{ success: true }`. Both are guarded by
  `requireAdmin`; `PUT` answers 400 for a missing `connectionId`, a `province` outside the 13
  codes, or a `taxCodeId` that is neither a non-empty string nor null (a body that forgot it
  must not delete the row).
- **`ProvinceTaxCodes.tsx`** (new, `quickbooks-integration/components/`): a collapsible section
  headed "Tax code per Canadian province". One row per province in the table's order: the
  name, the label and rate (read from `CANADIAN_PROVINCES`), and a `select` of the connection's
  tax codes with "— none —". Changing a select saves at once; a failure shows an error toast
  and puts the old value back. Until the tax codes are loaded it shows the stored ids, as the
  Default Tax Code row does.
- **`quickbooks/page.tsx`** (changed): mounts the section under each connection's Default Tax
  Code row and passes it the connection's `taxCodesMap` entry.
- **`resolveProvinceTaxCode.ts`** (new, `quickbooks-integration/invoice/`):
  `resolveProvinceTaxCode(connectionId, province)` reads the row with the service role and
  returns the tax code id, or null when there is none.
- **`permissionPageData.ts`** (changed): the **Quickbooks Connections** row's administrator
  note gains: "also sets, for each connection, the QuickBooks tax code to use for every Canadian
  province". No role's level changes.

## 5. Behaviour scenarios

Playwright, written, **not run**; the QuickBooks tax-code list is replaced by a fake.

- **S1** admin on `/quickbooks`: each CAD connection has the section and it lists the 13
  provinces; a USD connection and one with no currency do not have it (03e).
- **S2** admin picks a code for Ontario: it survives a reload; picking "— none —" removes it.
- **S3** a failed save: the error toast and the old value back.
- **S4** an account manager, accountant and viewer cannot open the page (unchanged).
- **S5** the connection's Default Tax Code select still works as before.

## 6. Files

**Counted — 10 files** (limit 10):

1. `supabase/migrations/20261022150000_province_qbo_tax_codes.sql` — new
2. `database.types.ts` — changed: the new table, by hand
3. `src/features/quickbooks-integration/db.ts` — changed: two functions
4. `src/features/quickbooks-integration/components/ProvinceTaxCodes.tsx` — new
5. `src/app/quickbooks/page.tsx` — changed
6. `src/features/quickbooks-integration/invoice/resolveProvinceTaxCode.ts` — new
7. `src/features/userAccess/permissionPageData.ts` — changed (§4)
8. `package.json` — changed: `test:db:provincetaxcodes`, added to `test:db:all`
9. `src/features/quickbooks-integration/api.ts` — changed: two client functions (§4)
10. `src/app/api/quickbooks/province-tax-codes/route.ts` — new (§4)

**Not counted:** `supabase/tests/province_qbo_tax_codes.test.sql` (new);
`ProvinceTaxCodes.test.tsx`, `resolveProvinceTaxCode.test.ts`, `db` tests, `api` tests and
`province-tax-codes/route.test.ts` (new or edited);
`permissionPageData.test.ts` (edited); the Playwright spec of §5. No `AppSchema.ts`, no
`sync_rules.yaml`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

**7.1 Database**

- **Asserts:** an admin selects, inserts, updates and deletes; an account manager, an
  accountant, a viewer, a driver and a maintainer can do none of these (each tried; the rows are
  read back unchanged); one row per connection and province; a province outside the 13 is
  refused; deleting the connection deletes its rows; the service role can read.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals`
  container; a mutation run (a `using (true)` policy) goes red.

**7.2 App**

- **`ProvinceTaxCodes.test.tsx`:** 13 rows with the right names, labels and rates; choosing a
  code calls the save with the province and id; "— none —" calls it with null; a failure
  restores the value and shows the toast; the stored id is shown before the list loads.
- **`resolveProvinceTaxCode.test.ts`:** a mapped province returns its id; an unmapped one,
  null; the service role is used.
- **`province-tax-codes/route.test.ts`:** both verbs are `requireAdmin`-guarded (a refusal
  reads or writes nothing); `PUT` refuses a missing connection or an unknown province; a null
  id is passed through.
- **`db` and `api` tests:** `setProvinceTaxCode` upserts on `(connection, province)` and
  deletes on null; the client functions call the route with the agreed method and body.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 8. Edge cases and error handling

- **A tax code deleted in QuickBooks later.** The stored id stays; QuickBooks refuses the
  invoice and the message passes on (spec 04). The select shows the stored id.
- **A connection that is not healthy.** The tax-code list does not load; the section shows
  the stored ids and cannot change them, as the Default Tax Code row does.
- **Quebec.** One code for the combined 14.975%; the calculator does not itemise GST and QST
  (`canadianTaxRates.ts`).
- **Two admins edit at once.** The last write wins.
- **Offline / PowerSync.** Not applicable: online-only.
- **Clerk.** Page access is the existing admin rule.

## 9. Risks

- **R1 — a code whose rate differs from the calculator's** (the table changed, or a wrong
  code chosen) makes every invoice of that province show a mismatch; that is the invoice check
  doing its job.
- **R2 — an unmapped province** gives untaxed invoices with a warning (§1) until mapped and
  updated; the quotes land on Need attention.

## 10. Out of scope

- Mapping a QuickBooks tax code for any US state.
- Reading QuickBooks' rates to compare them with the calculator's.
- A warning on the page for a province without a code.
- Changing the Default Tax Code, bills, or `tax-percent`.
- Any role but admin changing the mapping.
