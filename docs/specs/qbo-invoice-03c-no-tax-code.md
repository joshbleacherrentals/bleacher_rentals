# QuickBooks invoice — the "no tax" code of a connection

Status: **Implemented 2026-10-22.** 0 open decisions; three readings to confirm
(§1, last paragraph). **Narrowed on 2026-10-23 by
[03e](qbo-invoice-03e-canadian-settings-cad-only.md):** the row is renamed "No-tax code" and
drawn only for a connection whose currency is CAD (§1, first reading; §4; §5 S1; §8).
Implementation order: **03c**, then [03d](qbo-invoice-03d-canadian-line-tax-code.md); both come
after [04](qbo-invoice-04-create.md), which is already implemented. Plan:
[qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [03a](qbo-invoice-03a-province-tax-codes.md) (the same page, the same kind of setting).

## 0. The request, and what it is not

A sandbox run on 2026-10-22 showed that a Canadian QuickBooks file does not accept `TAX` or `NON`
on an invoice line (§2). A Canadian line that carries no tax still needs a **real tax code** of the
file. The user chose that code to be the file's **Exempt** code, set once per connection on the
QuickBooks page. This spec adds only that setting:

- a column on `QboConnections` holding the code;
- a row on `/quickbooks` where an admin picks it;
- a server function that reads it.

**Not part of this spec:** putting the code on an invoice line (spec 03d); the connection's Default
Tax Code, which bills and the tax calculator keep using; creating tax codes in QuickBooks; the US
file.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Which code:** the file's **Exempt** code (user's answer; QuickBooks' own list had Exempt,
  Zero-rated and Out of Scope).
- **How the app finds it:** a **setting on `/quickbooks`**, chosen by an admin per connection
  (user's answer; the alternative was a lookup by name).

**Readings to confirm at review.**

- The row sits on the existing `/quickbooks` page, under the Default Tax Code row.
  ~~It is shown for **every** connection (as in 03a).~~ **Amended by 03e:** it is shown only for a
  CAD connection, as the province section is, and a US connection never reads it.
- It is stored as a nullable column on `QboConnections`, saved through the connections route like
  the Default Tax Code, and only an **admin** maintains it, so no role gains anything new.
- The app does not check that the chosen code is "Exempt": the admin picks from the connection's own
  tax codes.

## 2. Research findings

- **The sandbox, 2026-10-22.** The American company refused a line code other than `TAX` or `NON`
  ("Valid line TaxCodes for US should be TAX or NON"). The Canadian company refused an invoice whose
  line had no valid code (error `6000`, "Make sure all your transactions have a GST/HST rate before
  you save") and created one whose line carried `5` (HST ON): QuickBooks added the tax itself.
  Its tax codes: Exempt `2`, Zero-rated `3`, GST/HST Adjustment `4`, HST ON `5`, Out of Scope `6`.
- **The Default Tax Code row.** `page.tsx` renders a `select` fed by `taxCodesMap[connection id]`
  and saves through `setQboConnectionTaxCodeApi` → `PATCH /api/quickbooks/connections` with
  `taxCodeId` → `updateQboConnectionTaxCode`. The list of codes comes from
  `GET /api/quickbooks/tax-codes`.
- **The connections route** dispatches a `PATCH` by the key present in the body (`taxCodeId`, else
  `displayName`); it is admin-only (`requireAdmin`).
- **Who reads connections.** `getAllQboConnections` lists id, name, realm, Default Tax Code and
  currency for admin and accountant (no tokens); the new column is one more field in that list.
- **Not synced.** `QboConnections` is online-only; no `AppSchema.ts` change.

## 3. Database — `supabase/migrations/20261022160000_qbo_connection_no_tax_code.sql`

(After `20261022150000`, the latest on the branch.)

- `public."QboConnections"` gains `qbo_no_tax_code_id` — `text`, null, with a `COMMENT`: QuickBooks'
  own id of the tax code a Canadian invoice line carries when it has no tax.

No policy, trigger or index changes: the column follows the table's existing rules.

## 4. App changes

- **`database.types.ts`:** the column on `QboConnections` `Row`, `Insert` and `Update`, by hand
  (`gtl` is not used: the local database lags the migrations).
- **`db.ts`:** `getAllQboConnections` also returns `qbo_no_tax_code_id`;
  `updateQboConnectionNoTaxCode(connectionId, taxCodeId | null)` sets or clears it, with the
  signed-in user's token.
- **`api.ts`:** the connection type gains `qbo_no_tax_code_id`; `setQboConnectionNoTaxCodeApi
(connectionId, taxCodeId | null)` calls `PATCH /api/quickbooks/connections` with
  `{ connectionId, noTaxCodeId }`.
- **`connections/route.ts`:** `PATCH` handles a body that has the key `noTaxCodeId`: `null` clears
  the code, a non-empty string sets it, anything else answers 400 (a body that forgot the value must
  not clear it); answers `{ success: true }`. Admin-only, as the rest of the route.
- **`quickbooks/page.tsx`:** a row "No-tax code" (03e: it was "No-tax code (Canada)", and is drawn
  for CAD connections only) under the Default Tax Code row: a `select`
  of the connection's tax codes with "— none —", saved at once, in the same way and with the same
  failure behaviour as the Default Tax Code row. Until the codes are loaded it shows the stored id.
- **`resolveProvinceTaxCode.ts`:** a second export, `resolveNoTaxCode(connectionId)`, reads the
  column with the service role (as the province function does) and returns the id, or null.
- **`permissionPageData.ts`:** the **Quickbooks Connections** row's administrator note gains: "and
  the QuickBooks tax code that means 'no tax' on a Canadian invoice". No role's level changes.

## 5. Behaviour scenarios

Playwright, written, **not run**; the QuickBooks tax-code list is replaced by a fake.

- **S1** admin on `/quickbooks`: each CAD connection shows "No-tax code"; a USD connection and
  one with no currency do not (03e).
- **S2** admin picks a code: it survives a reload; "— none —" clears it.
- **S3** a failed save: the error toast and the old value back.
- **S4** an account manager, accountant and viewer cannot open the page (unchanged).
- **S5** the Default Tax Code select and the province section still work.

## 6. Files

**Counted — 8 files** (limit 10):

1. `supabase/migrations/20261022160000_qbo_connection_no_tax_code.sql` — new
2. `database.types.ts` — changed: the column, by hand
3. `src/features/quickbooks-integration/db.ts` — changed
4. `src/features/quickbooks-integration/api.ts` — changed
5. `src/app/api/quickbooks/connections/route.ts` — changed
6. `src/app/quickbooks/page.tsx` — changed
7. `src/features/quickbooks-integration/invoice/resolveProvinceTaxCode.ts` — changed
8. `src/features/userAccess/permissionPageData.ts` — changed (§4)

**Not counted:** the tests of §7; the Playwright spec of §5. No `AppSchema.ts`, no `sync_rules.yaml`,
no SQL test (no policy changes), no `package.json`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`db.test.ts`:** `updateQboConnectionNoTaxCode` writes `qbo_no_tax_code_id` for the connection
  and clears it on null; `getAllQboConnections` returns the field.
- **`api.test.ts`:** the client function calls `PATCH` with `{ connectionId, noTaxCodeId }`; a
  failure throws the route's message.
- **`connections/route.test.ts`:** `PATCH` with `noTaxCodeId` is admin-only (a refusal writes
  nothing); a string is saved, `null` clears; a non-string, an empty string and a body without the
  value are not saved (400 for the first two); the other `PATCH` keys behave as before.
- **`resolveProvinceTaxCode.test.ts`:** `resolveNoTaxCode` returns the id, or null when unset; it
  uses the service role; a read error throws.
- **`permissionPageData.test.ts`:** the administrator note of the row names the no-tax code.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. The migration
  is run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **A code deleted in QuickBooks later.** The stored id stays; QuickBooks refuses the invoice and
  the message passes on (spec 04). The select shows the stored id.
- **A connection that is not healthy.** The tax-code list does not load; the row shows the stored
  id and cannot change it, as the Default Tax Code row does.
- **A US connection.** The row is not drawn (03e) and its column is never read.
- **Two admins edit at once.** The last write wins.
- **Offline / PowerSync.** Not applicable: online-only.
- **Clerk.** The route is guarded by `requireAdmin`.

## 9. Risks

- **R1 — a wrong code chosen** (one that carries a rate) puts that rate on every untaxed Canadian
  invoice; the invoice check (spec 06) reports it as a mismatch.
- **R2 — no code chosen** makes a Canadian invoice that needs it impossible to build (spec 03d
  refuses it with a message).

## 10. Out of scope

- Using the code on an invoice (03d).
- Any screen that warns about a connection with no code set.
- A setting for a US connection.
- Changing the Default Tax Code, bills, `tax-percent` or the province section of 03a.
