# QuickBooks invoice — the Canadian settings are shown for CAD connections only

Status: **DRAFT 2026-10-23 — awaiting "Approved".** 0 open decisions; three readings to confirm
(§1, last paragraph).
Implementation order: **03e**, after [03a](qbo-invoice-03a-province-tax-codes.md) and
[03c](qbo-invoice-03c-no-tax-code.md), whose screens it narrows. Plan:
[qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Amends: [03a](qbo-invoice-03a-province-tax-codes.md) (§1, third reading; §5 S1; §8, §10) and
[03c](qbo-invoice-03c-no-tax-code.md) (§1, first reading; §4; §5 S1; §8, the US-connection line).

## 0. The request, and what it is not

On `/quickbooks` every connection shows **Tax code per Canadian province** and **No-tax code
(Canada)**, a US company included. The user asked (2026-10-23) that they appear **only for a
connection whose currency is CAD**. This spec changes who sees the two rows and the name of the
second; nothing is stored or computed differently.

**Not part of this spec:** the Default Tax Code row, which stays on every connection; how an
invoice picks its tax code (03d); the table, the routes and the resolvers of 03a and 03c.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **The province section appears only when `QboConnections.currency = 'CAD'`.** It is judged by
  the currency recorded in the database once the QuickBooks account has been connected; any other
  currency, or none yet, shows nothing.
- **The no-tax row is renamed "No-tax code"** (it was "No-tax code (Canada)"), and the user asked
  whether the United States needs it at all. It does not (§2), and the user's answer is: **show
  it for CAD connections only, under the name "No-tax code".**
- **A quote whose venue is in Canada on a USD connection** (or the reverse): **the rule is not
  touched** (user's answer). The server still chooses the Canadian path by the venue's state, as
  03d says (§2, last finding; §10, R1).

**Readings to confirm at review.**

- **A connection with no recorded currency** shows neither row, as for any other currency. Only
  the OAuth callback writes the currency, so a connection made before the column existed, or one
  whose company information could not be read, shows nothing until it is **re-authenticated**.
  The Check button does not record it.
- **The test is exact:** the stored value is `CAD`, which the callback writes in upper case.
- **The Default Tax Code row is unchanged** for every connection (bills and the quote form's tax
  calculator use it).

## 2. Research findings

- **Where the currency comes from.** `api/quickbooks/callback/route.ts` reads the company's
  information after the sign-in and calls `setQboConnectionCurrency` with the upper-cased
  `HomeCurrency`, `Currency`, or a value derived from `Country`. The column is
  `QboConnections.currency`, `text`, null (migration `20260618100000`).
- **Who has it on the page.** `getAllQboConnections` already returns `currency`, and `GET
/api/quickbooks/connections` passes it on; the client type `QboConnection` in `api.ts` does not
  list it.
- **Does the United States need the no-tax code? No.** A US invoice line carries `TAX` or `NON`
  (spec 03, §5): the American file refuses any other code (03c, §2), so the line never takes a
  code from settings. `resolveNoTaxCode` and `resolveProvinceTaxCode` are called only when
  `source.canadianProvince` is set — when the **venue's** state is a Canadian province — and never
  for a US state.
- **The catch.** That test looks at the venue, not at the connection. A quote with a Canadian
  venue on a USD connection takes the Canadian path, finds no province code (the section is not
  shown, so none is stored) and, as it needs the no-tax code, is refused with 03d's message "Ask
  an admin to choose one on the QuickBooks page" — which an admin can no longer do for that
  connection. The quote form already warns about the same combination (`countryMismatch`,
  "usd-office-ca-address"). The reverse (a US venue on a CAD connection) takes the US path and
  QuickBooks Canada refuses `TAX`/`NON`; that is as it was.

## 3. App changes

- **`api.ts` (changed):** the `QboConnection` type gains `currency: string | null`; a pure
  `isCanadianConnection(currency)` returns true only for `"CAD"`.
- **`quickbooks/page.tsx` (changed):** under the Default Tax Code row, the no-tax row and
  `<ProvinceTaxCodes>` are drawn only when `isCanadianConnection(conn.currency)`. The row's label
  is "No-tax code"; its `data-testid` (`no-tax-code-{id}`), its select and its saving are
  unchanged.
- **`permissionPageData.ts` (changed):** the **Quickbooks Connections** row's administrator note
  now says the tax code per province and the "no tax" code are set "for each Canadian (CAD)
  connection". No role's level changes.

## 4. Behaviour scenarios

Playwright, written, **not run** (the connections route is replaced by a fake, as in 03a and 03c):

- **S1** admin, a CAD connection: both rows are there, the label reads "No-tax code", and the
  section lists the 13 provinces.
- **S2** admin, a USD connection: neither row; the Default Tax Code row is there.
- **S3** admin, a connection whose currency is null: neither row.
- **S4** admin, a CAD and a USD connection on the page together: only the CAD one has the rows.
- **S5** the rows of a CAD connection still save and survive a reload (03a S2, 03c S2).

## 5. Files

**Counted — 3 files** (limit 10):

1. `src/features/quickbooks-integration/api.ts` — changed (§3)
2. `src/app/quickbooks/page.tsx` — changed (§3)
3. `src/features/userAccess/permissionPageData.ts` — changed (§3)

**Not counted:** `api.test.ts` and `permissionPageData.test.ts` (edited); the Playwright specs of
03a and 03c (`quickbooks-province-tax-codes.*`, `quickbooks-no-tax-code.*`), edited, and the new
scenarios of §4. No migration, no `AppSchema.ts`, no `database.types.ts`, no `sync_rules.yaml`.

## 6. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`api.test.ts`:** `isCanadianConnection` is true for `"CAD"` and false for `"USD"`, `null`,
  `undefined`, `""` and a lower-case `"cad"`.
- **`permissionPageData.test.ts`:** the administrator note of the row names the Canadian (CAD)
  connections.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 7. Edge cases and error handling

- **A connection whose currency changes** (re-authenticated against another company): the rows
  appear or disappear on the next load; values already stored for it stay in the database.
- **A CAD connection that is not healthy.** As in 03a and 03c: the stored ids are shown and
  cannot be changed.
- **A province mapping stored before the connection stopped being CAD** stays in
  `ProvinceQboTaxCodes` and is still read by an invoice of a Canadian venue (§2, "The catch").
- **Offline / PowerSync.** Not applicable: online-only.
- **Clerk.** Unchanged: the page is admin-only.

## 8. Risks

- **R1 — a Canadian venue on a USD connection** is refused with a message that sends the admin to
  a screen that has nothing to set for that connection (§2). The user chose not to change the
  rule; the way out is to change the quote's sales office or venue.
- **R2 — a CAD connection that has no recorded currency** cannot have its Canadian settings
  edited until it is re-authenticated (§1, reading), and an invoice that needs them is refused
  meanwhile (03d).

## 9. Out of scope

- Choosing the Canadian path by the connection's currency instead of the venue's state.
- Recording a connection's currency from the Check button or any other place.
- Any change to the Default Tax Code, bills or `tax-percent`.
