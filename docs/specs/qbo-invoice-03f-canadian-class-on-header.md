# QuickBooks invoice — the Class goes where the company's own Class setting says

Status: **Implemented 2026-11-06 (approved in chat; rewritten the same day after the user's
answers).** 0 open decisions; four readings to confirm (§1, last list). The file name still says
"canadian" because the first draft split by country; the rule is now the company's own setting (§1).
Implementation order: **03f**, after [03b](qbo-invoice-03b-zone-class.md) and
[03d](qbo-invoice-03d-canadian-line-tax-code.md). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint3-quick-fix`.
Amends: [03](qbo-invoice-03-payload.md) (the builder), [04](qbo-invoice-04-create.md) (step 8),
[05](qbo-invoice-05-update.md) (step 7), [06](qbo-invoice-06-totals-check.md) (§3 snapshot, §4 reason
`class`, the check's entry). The texts of 03, 03b, 04, 05 and 06 are **not** edited by this spec.

## 0. The request, and what it is not

**What happens now.** For a US QuickBooks company, creating the invoice works. For the Canadian
company the invoice is created, and the invoice check then reports **"Class does not match —
Class: QuickBooks none, quote 1000000001"**. The user checked `/zones`: the zones are linked to
their classes correctly, so the Class the app finds is right.

**Why.** The app writes the Class on the invoice's **line** (`SalesItemLineDetail.ClassRef`). In the
Canadian company's own screen (the user's screenshot) the Class is a **separate input above the
lines** ("Class (hidden)"), and the line table has no Class column. QuickBooks keeps no Class
from the line there, so the invoice has none.

**The request.** Split the logic. A company whose Class goes on the line: the invoice is made as it
is now. A company whose Class is the separate input of the invoice: the invoice is made with the
Class in that input (the invoice's own, or header, Class field). Which of the two a company is, is
asked of QuickBooks itself — its own Class-tracking setting — on every create, update and check,
with nothing remembered between requests. The invoice check reads the Class from where it was
written.

**Not part of this spec:** how a zone's Class is found (03b) and the `/zones` page; the tax code
(03d); invoices already created; the Class on bills (`create-bill`); any screen except the text of
one new warning (§4).

## 1. Decisions (all taken by the user)

**Question — how the app tells where a company wants the Class**

- **Option A — the connection's currency is `CAD`** (stored when the connection was made): no call
  to QuickBooks; a connection with no stored currency counts as not Canadian.
- **Option B — the company's country, stored when the connection was made:** more exact than the
  currency, the same weakness (written only when connecting).
- **Option C — the company's country, read live** (`CompanyInfo`): one call per operation.
- **Option D — the company's Class-tracking setting, read live** (`Preferences`): the only option
  that answers where the Class goes rather than which country the company is in; one call per
  operation.
- **Option E — a setting an admin chooses per connection on `/quickbooks`:** no call, but a person
  types it and it does not follow a change made in QuickBooks.
- **Option F — the province of the sales office's address:** the weakest; the office's address says
  nothing about how the company is set up.
- **User's answer: D — the Class-tracking setting, read live from QuickBooks.** (The user first
  answered A; after the six options and QuickBooks' call limits were shown, the answer became D.)

**Question — remembering the setting between requests**

- **Option A — no memory:** every create, update and check reads it again. The same as the Item
  lookup, which has no cache either (06).
- **Option B — a column in the database** with the time it was read, refreshed when empty or old.
- **Option C — the server's memory** for some minutes; on Vercel every instance has its own.
- **User's answer: A — no memory.**

**Question — the company says Classes are not tracked (neither setting is on)**

- **Option A — create the invoice without a Class, with a warning.** The check does not compare the
  Class.
- **Option B — as now:** the Class goes on the line and QuickBooks' own answer is shown (03b §7:
  QuickBooks refuses it, so no invoice is made).
- **User's answer: A — create without a Class, with a warning.**

**Question — create or update cannot read the setting** (QuickBooks fails, a lost token); this
includes the US path

- **Option A — stop with a message;** nothing is written to QuickBooks.
- **Option B — go on with the Class on the line, with a warning.**
- **Option C — fall back to the connection's currency** (`CAD` → header, else line).
- **User's answer: A — stop with a message.** A check that cannot read it follows spec 06's rule
  (the check did not finish; the flag stays as it was).

**Question — the check that create and update run right after writing also needs the setting**

- **Option A — the check reads it itself:** two reads per create or update.
- **Option B — create or update hand over the value they just read:** one read; it lives only
  inside that one request and is kept nowhere.
- **User's answer: B — hand it over.** A check started by Save or Check again reads it itself.

**Question — Canadian invoices that already exist (made without a Class on the header)**

- **Option A — leave them.** Nothing changes by itself; the Class appears when an accountant presses
  Update invoice on each of them. Until then a check of such an invoice reports `class`.
- **Option B — add a one-time bulk fix to this spec.**
- **User's answer: A — leave them.**

**From the user's own words (not options):**

- The US invoice is made as now; its body does not change when the company puts the Class on the
  line. (It does gain the read of the setting, see R3.)
- A company that has the Class as a separate input gets it there, and its line carries none.
- The zone → Class lookup is right and is not touched.

**Readings to confirm at review.**

- **Update and overwrite follow the same rule.** They build their body with the same builder; without
  it they would write the Class back onto the line of such an invoice. The request names only the
  creation.
- **The names are from third-party references, not from Intuit's own page.** The setting is
  `Preferences.AccountingInfoPrefs.ClassTrackingPerTxn` (the Class on the invoice, so the header)
  and `ClassTrackingPerTxnLine` (on each line); only one of them can be true; both depend on
  "Track classes" being on. The read is `GET /v3/company/{realmId}/preferences` with the token the
  invoice calls already use. To verify on a real company (R1).
- **An odd answer is an unreadable one.** Both settings `true`, or no `AccountingInfoPrefs` at all,
  is a failed read (the user's answer on failed reads applies). A setting that is simply absent in an
  otherwise normal answer counts as `false`.
- **A new warning, `class_not_tracked`, is added** (text in §4, written by me) instead of reusing
  `class_missing`, whose text tells the user to set the Class in QuickBooks, which a company that does
  not track Classes cannot do. For such a company the zone lookup is skipped, and `class_missing` is
  not given.

## 2. Research findings

- **Where the Class is written.** `buildInvoicePayload` puts `ClassRef` only in
  `Line[0].SalesItemLineDetail`; the type `QboInvoiceBody` has no Class of its own.
- **Where the builder is called.** `createInvoiceFromSource` (step 8; create, and case 3 of update),
  `replaceInvoiceContent` (step 7 of `updateInvoice.ts`; update and overwrite) and `runInvoiceCheck`
  (it builds the invoice the quote would make today and compares). Each looks the zone's Class up
  with `resolveZoneClass` just before. The check reads the Item and the invoice in one `try`; a
  failure there is recorded as a failed try and thrown as `QboReadError`.
- **After a write.** `checkInvoiceAfterWrite(source, { invoiceId })` in `createInvoice.ts` calls
  `runInvoiceCheck`; the Check route (`api/quickbooks/invoice/check/route.ts`) calls
  `runInvoiceCheck(eventId, source)` directly.
- **How QuickBooks is read.** `getQboAccessTokenAndRealmId(connectionId)` and `getBaseUrl()` give the
  token and the address; `qboInvoiceApi.ts` fetches with `minorversion=40`, reads the answer with
  `parseQboApiResponseText` and throws "QuickBooks invoice read failed: …" on a refusal. A create or
  update that cannot read ends with `fail(502, message)`.
- **Where the Class is read back.** `snapshotOf` in `qboInvoiceApi.ts` reads only the line's
  `ClassRef`; `RawQboInvoice` has no header Class. `compareInvoice` compares the line's Class with
  the builder's, reason `class`, field "Class".
- **The coverage test.** `compareCoverage.test.ts` maps every path of the built body to the reason
  that covers it and changes each in the snapshot; a body member not mapped there fails the test.
  The header Class has to be added to both lists.
- **The warnings.** `InvoiceWarning` (in `createInvoice.ts`) is a union; the screen's text comes from
  `warningMessage` in `invoiceActions.ts`, a `switch` with no default, so a new code must get a
  case.
- **Intuit's guidance.** Intuit's developer blog advises reading these settings before posting a
  transaction that carries a Class, to avoid validation errors (third-party summary).
- **Limits.** Intuit lists 500 requests per minute per company and 500 000 metered calls a month for
  the free Builder tier (the user was shown them). This spec adds one read to each create, update and
  Check; a check after create or update adds none (the value is handed over). For example, 20 000
  checks a month make about 60 000 calls with this read, about 12% of the monthly allowance.
- **An observation from 2026-11-03 (sandbox).** Sandbox invoice 184 in the Canadian sandbox file
  carried the Class on its line and passed the check. Under this spec that file's own setting decides,
  so it works whichever way it is set.

## 3. Database

None. No migration, no `database.types.ts`, no `AppSchema.ts`, no `sync_rules.yaml`.
`QboConnections.currency` is not used by this spec.

## 4. App changes

- **`invoiceTypes.ts`** (changed):
  - `ClassPlacement = "line" | "header" | "none"` (new, exported): `line` when the company tracks
    Classes per transaction line, `header` per whole transaction, `none` when it tracks neither.
  - `InvoiceRefs` gains `classPlacement: ClassPlacement`.
  - `QboInvoiceBody` gains `ClassRef?: { value: string }` — the invoice's own Class, set only for
    `header`.
  - `QboInvoiceSnapshot` gains `headerClassId: string | null` — the invoice's own Class as
    QuickBooks holds it; null when it has none. The line's `classId` stays.
  - `InvoiceSource` does not change.
- **`readClassPlacement.ts`** (new, server-only): `readClassPlacement(connectionId)` returns a
  `ClassPlacement`. It makes one request, `GET {base}/{realmId}/preferences?minorversion=40`, with
  the connection's token, and maps the answer: `ClassTrackingPerTxn` true → `header`;
  `ClassTrackingPerTxnLine` true → `line`; neither → `none`. Both true, or no `AccountingInfoPrefs`,
  throws "QuickBooks preferences read failed: …" as a refusal or a failed request does (the message is
  QuickBooks' `Detail` or `Message`, else the status). It stores nothing and keeps nothing.
- **`buildInvoicePayload.ts`** (changed): writes `refs.classId` by `refs.classPlacement`: `line` on
  the line, as now (the US body is unchanged, member for member); `header` as the body's `ClassRef`
  with no `ClassRef` on the line; `none` nowhere. No `classId` → nowhere.
- **`createInvoice.ts`** (changed): step 8 begins with `readClassPlacement(connectionId)`; a failure
  ends the request with `fail(502, message)` before anything is written. For `none` the zone lookup is
  skipped and the warning `{ code: "class_not_tracked" }` (new type `ClassNotTrackedWarning`, a member
  of `InvoiceWarning`) is given instead of `class_missing`; otherwise the lookup runs as now.
  `classPlacement` goes to the builder, and `checkInvoiceAfterWrite(source, link, classPlacement)`
  (a third parameter) passes it to `runInvoiceCheck`.
- **`updateInvoice.ts`** (changed): `replaceInvoiceContent`, step 7, does the same (it serves update
  and overwrite): the read, `fail(502, …)` before `updateQboInvoice`, the skip for `none`, the hand-over
  to `checkInvoiceAfterWrite`. Case 3 of update goes through `createInvoiceFromSource`.
- **`qboInvoiceApi.ts`** (changed): `RawQboInvoice` gains `ClassRef?: { value?: string }`;
  `snapshotOf` sets `headerClassId` from it (absent → null).
- **`compareInvoice.ts`** (changed): the input gains `classPlacement: ClassPlacement`. `line`: the
  Class is compared as now, inside the single-line branch. `header`: the body's `ClassRef.value`
  against `actual.headerClassId`, once, whatever the number of lines; the line's own Class is not
  compared. `none`: no Class is compared. The reason is `class`, the field "Class", the values as
  text with "none" for an empty one, as now.
- **`checkInvoice.ts`** (changed): `runInvoiceCheck(eventId, source, options?)` takes
  `options.classPlacement`. When it is given, it is used; when not (Save, Check again), the check
  reads it in the same `try` as the Item and the invoice, so a failure is recorded as a failed try and
  thrown as `QboReadError`. For `none` the zone lookup is skipped. The placement goes to the builder
  and to `compareInvoice`.
- **`invoiceActions.ts`** (changed, `quotesAndBookings/components/quoteDetail/invoice/`):
  `warningMessage` gains the case `class_not_tracked`: "This QuickBooks company does not track
  Classes. The invoice was made without one." (the text is mine.)
- **`loadInvoiceSource.ts`, `permissionPageData.ts`:** no change. No role gains or loses anything.

## 5. Behaviour scenarios

**No Playwright scenario.** The invoice routes reach QuickBooks, which a browser test cannot
replace, and the only screen change is the text of one warning, asserted in `invoiceActions.test.ts`.
The visible effect — an invoice whose Class is on the header no longer shows "Class does not match" —
is asserted in the unit tests of §7. E2E: SKIPPED (not run locally, by instruction).

## 6. Files

**Counted — 9 files** (limit 10):

1. `src/features/quickbooks-integration/invoice/invoiceTypes.ts` — changed
2. `src/features/quickbooks-integration/invoice/readClassPlacement.ts` — new
3. `src/features/quickbooks-integration/invoice/buildInvoicePayload.ts` — changed
4. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed
5. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — changed
6. `src/features/quickbooks-integration/invoice/qboInvoiceApi.ts` — changed
7. `src/features/quickbooks-integration/invoice/compareInvoice.ts` — changed
8. `src/features/quickbooks-integration/invoice/checkInvoice.ts` — changed
9. `src/features/quotesAndBookings/components/quoteDetail/invoice/invoiceActions.ts` — changed

**Not counted:** `readClassPlacement.test.ts` (new); `buildInvoicePayload.test.ts`,
`qboInvoiceApi.test.ts`, `compareInvoice.test.ts`, `compareCoverage.test.ts`, `checkInvoice.test.ts`,
`createInvoice.test.ts`, `updateInvoice.test.ts`, `invoiceActions.test.ts` (edited), and every other
test whose `InvoiceRefs` or snapshot fixture gains the new field. No migration, no
`database.types.ts`, no `AppSchema.ts`, no `permissionPageData.ts`, no `sync_rules.yaml`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`readClassPlacement.test.ts`** (QuickBooks replaced by a fake that records its requests):
  - the request goes to `/preferences` of the connection's company;
  - `ClassTrackingPerTxn: true` → `header`; `ClassTrackingPerTxnLine: true` → `line`; both `false` →
    `none`; a setting absent in an otherwise normal answer → counts as `false`;
  - both `true`, or an answer with no `AccountingInfoPrefs` → throws "QuickBooks preferences read
    failed";
  - a refusal passes QuickBooks' message on; a lost token passes its error on;
  - two calls make two requests (nothing is kept).
- **`buildInvoicePayload.test.ts`:** `line` with a Class → on the line only, no body `ClassRef`, and
  the whole body equals the body built before this change; `header` → `body.ClassRef` is `{ value }`
  and the line has none; `none` with a Class given → nowhere; no `classId` → nowhere, for every
  placement.
- **`qboInvoiceApi.test.ts`:** an invoice with a top-level `ClassRef` gives `headerClassId`; without
  one → null; the line's `classId` is still read.
- **`compareInvoice.test.ts`:**
  - `header`: the same Class on the header → no difference; QuickBooks none against a quote Class →
    one difference, reason `class`, field "Class", quote the id, QuickBooks "none"; a Class on the
    line only → still differs; no quote Class and one on the header → differs ("none" against the
    id); a wrong line count does not hide the header difference;
  - `line`: the header Class is ignored and the line's Class is compared as before;
  - `none`: no `class` difference whatever either side holds.
- **`compareCoverage.test.ts`:** `"ClassRef.value"` is mapped to `class` and changing the snapshot's
  `headerClassId` shows `class`; bodies are built for `line` and for `header`, and every path of each
  is covered.
- **`checkInvoice.test.ts`:** a given placement is used and `Preferences` is not read; none given →
  it is read once; a failed read records `qbo_invoice_check_failed_at`, leaves the flag and the
  reasons, and throws `QboReadError`; `header` with the Class on the header → `matches`, no `class`
  reason; the same invoice with the Class only on the line → `class`; `line` as before; `none` → no
  zone lookup and no `class` reason.
- **`createInvoice.test.ts`:** `Preferences` is read once per create, after the customer is resolved
  and before the zone lookup, and the check that follows does not read it again; a failed read ends
  in 502 with the message, with no `createQboInvoice` call and nothing linked; `header` → the posted
  body has the root `ClassRef` and no line `ClassRef`; `line` → the reverse; `none` → neither, no zone
  lookup, the warning `class_not_tracked` and no `class_missing`; case 3 behaves as create.
- **`updateInvoice.test.ts`** (update and overwrite): the same as create; a failed read ends in 502
  before `updateQboInvoice` is called.
- **`invoiceActions.test.ts`:** `warningMessage` for `class_not_tracked` gives the text of §4.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **The company changes its Class setting.** The next create, update or check reads it fresh. An
  invoice made earlier keeps what it has; its next check compares by the new setting and may report
  `class` until Update invoice rewrites it.
- **A Canadian invoice made before this change** is not touched. Its next check (Save, create, update,
  Check again; nothing checks by itself) reports `class` when QuickBooks holds none, and the quote
  lands on Need attention until Update invoice writes the Class on the header.
- **A company that does not track Classes** (`none`): the invoice is made without a Class and the
  user is told; the check ignores the Class.
- **A quote with no zone or no Class for the connection** (03b): as now for `line` and `header`
  (invoice without a Class, warning `class_missing`).
- **`Preferences` cannot be read in create or update:** the request ends with the message and
  nothing is written to QuickBooks, Events or the Log; the user can press the button again.
- **`Preferences` cannot be read in a check:** the check did not finish (06): only the time of the
  try is recorded; the flag and the reasons stay.
- **The token cannot read `Preferences`:** the same as any failed read.
- **A quote whose Class disappears later:** the sparse update sends no Class and QuickBooks keeps the
  old one; unchanged from now.
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The invoice routes already check the role (specs 04, 05, 06).

## 9. Risks

- **R1 — the setting names and their behaviour are not verified against Intuit's own reference or a
  real company.** To verify before release: read `Preferences` of the US company and of the Canadian
  one; from what the user said, the US one should report the setting per line and the Canadian one per
  transaction.
- **R2 — one more QuickBooks read on every create, update and Check again,** the US path included: a
  little more latency and a little more of the 500-a-minute and monthly allowances (§2).
- **R3 — the US path now depends on the `Preferences` read.** A failure of that call stops US create
  and update too (the user's answer, §1).
- **R4 — an unexpected answer shape** (no `AccountingInfoPrefs`, both settings on) stops create and
  update until it is understood (reading 3 of §1).

## 10. Out of scope

- Remembering the setting in any form (decided: none).
- Detecting the country, or a setting on `/quickbooks` for where the Class goes.
- Fixing existing Canadian invoices, in bulk or otherwise.
- Changing how a zone's Class is found, the `/zones` page or the zone → Class links.
- The Class on bills (`create-bill`, `get-bill`).
- Any screen, count or notice about Classes, except the text of the new warning.
- Editing the texts of specs 03, 03b, 04, 05 and 06.
