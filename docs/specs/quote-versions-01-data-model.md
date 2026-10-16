# Quote versions 01: the data model

Status: **DRAFT 2026-10-16, awaiting "Approved".** Plan: [quote-versions-plan.md](quote-versions-plan.md).

## 1. The request

A quote can have a main version, drafts and old versions (plan, section 0). This spec
decides only how a row of `Events` says which one it is, and the rules about that which
must always hold. It adds no screen, no action and no role. Nothing creates a draft or an
old version yet, so after this spec every row is a main version and nothing visible changes.

## 2. What is added

On `Events`, two columns:

- **`version_kind`:** text, not null, default `main`. One of `main`, `draft`, `old`.
- **`main_event_uuid`:** uuid, null, references `Events(id)`. Empty on a main version; on a
  draft or old version it holds the id of the main version of the same quote.

Every existing row becomes `main` with an empty `main_event_uuid`. Every writer that does
not know about versions (`createQuoteEvent`, the dashboard's event form, and so on) keeps
working, because the default is `main`.

## 3. Rules that always hold

- **R1:** `version_kind = 'main'` exactly when `main_event_uuid` is empty. A database check
  enforces it.
- **R2:** `main_event_uuid` points at a row whose `version_kind` is `main`. A draft or old
  version never points at another draft or old version.
- **R3:** a draft or old version has no `BleacherEvents` row. This keeps the work tracker
  links (plan, F7) ignoring it.
- **R4:** the invoice number is unique among main versions only (section 4). Drafts and old
  versions carry the number of their main version.

R2 and R3 cannot be written as a simple check on one row. They are enforced by a trigger on
`Events` and one on `BleacherEvents`, each raising an error that names the rule.

## 4. The invoice number index

Today: one unique index over every row with a number. New: the same index, only over rows
with `version_kind = 'main'`. `generate_invoice_number()` already looks for a clash across
all rows, so a new number never collides with a copy either. Rule R4 follows.

## 5. Existing triggers and version rows

- **`events_auto_subscribe_owner`** (plan, F5): it must not add an `EventSubscriptions` row
  for a draft or old version. Chat belongs to the quote (plan, D3), so the subscription
  stays on the main version only. The trigger function gets one condition.
- **The hash triggers and the signature trigger** (plan, F6): not changed here. They work
  per row. Whether an old copy gets the same `contract_hash` as its original is measured in
  spec 04, where the copy is made.
- **The work tracker link triggers** (plan, F7): not changed. They rely on R3.
- **The `booked` sync triggers** (`sync_events_booked_from_status` and its mirror): not
  changed. An old version that is `booked` therefore has the legacy `booked` flag set; that
  is why readers must not count it (spec 02).

## 6. Types

Contract of this spec: the names and types in section 2, in these files.

- **Migration:** `supabase/migrations/<timestamp>_event_versions.sql`: the two columns, the
  check (R1), the two triggers (R2, R3), the changed index (R4), the changed subscription
  function.
- **`database.types.ts`:** the two columns added to `Events` Row, Insert and Update by hand
  (`npm run gtl` is not safe while the local database lags the migrations).
- **`src/lib/powersync/AppSchema.ts`:** `version_kind: column.text` and
  `main_event_uuid: column.text` in `EventsCols`.
- **`br_powersync/config/sync_rules.yaml`:** no change. The rules select `Events.*`, so the
  columns reach every client that already gets events. That a draft row reaches the same
  clients is plan F8, handled in spec 02.

Four files, none a test, none a spec.

## 7. Scenarios

There is no screen in this spec, so no Playwright test. The behaviour is checked in the
database, in a rolled-back transaction in the local container (no pgTAP, no host `psql`):

- **S1:** an existing quote reads as `main` with no `main_event_uuid`.
- **S2:** inserting a draft that points at a main version succeeds; a draft with no
  `main_event_uuid` is refused (R1); a main with a `main_event_uuid` is refused (R1).
- **S3:** a draft that points at a draft is refused (R2).
- **S4:** a `BleacherEvents` row for a draft is refused (R3).
- **S5:** a draft with the same invoice number as its main version is accepted; a second
  main version with that number is refused (R4).
- **S6:** inserting a draft adds no `EventSubscriptions` row; inserting a main version still
  does.
- **S7:** an unrelated writer that inserts into `Events` without the new columns still
  works.

TypeScript: `npm run tc` after the two type files change; the existing Vitest suites pass
unchanged.

## 8. Edge cases

- **Offline:** a version row is an ordinary insert. A PowerSync client that creates one
  offline uploads it like any other row. The rules of section 3 are checked by the
  database on upload; a refused row is an upload error, like any refused write today.
- **The local database lags:** the migration has to be applied to the local Supabase before
  the SQL scenarios can run; it is not applied by `gtl`.
- **Deleting a main version that has versions:** not defined here (plan, section 4).
- **No role changes:** `permissionPageData.ts` is not edited by this spec.

## 9. To confirm at review

- That `version_kind` and `main_event_uuid` are the two things a row needs to say; I read
  the request as "main, draft, old" plus "which quote".
- That an approved draft is consumed: after approval the draft row is gone and the old copy
  is a new row (spec 04). The request said the old one becomes old and the draft becomes
  the main one, with the main row keeping its id; this is how both hold at once.
