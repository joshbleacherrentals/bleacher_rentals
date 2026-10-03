# Accountant — edits only `Events.is_qbo`

Status: **DRAFT — awaiting "Approved"** — 0 open decisions (D1–D3 answered 2026-10-03).
Original request: №4. Implementation order: **05 of 11**. Needs
[03](accountant-quotes-03-capabilities.md) (the capability table) and
[04](accountant-quotes-04-accountant-quote-access.md) (the accountant opens the card).
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [accountant-work-trackers.md](accountant-work-trackers.md).
Precedent: the `is_paid` guard in `supabase/migrations/20261003120000_work_tracker_group_is_paid.sql`.

## 0. The request, and what it is not

On the `Events` table the accountant:

- **reads every row** (specs 02 and 04 did that);
- **adds no row** and **deletes no row**;
- **changes exactly one column, `is_qbo`** — the QuickBooks Invoice checkbox on the Billing tab —
  and nothing else.

Admin and account manager keep the right to tick the flag (D2), on any event (D3).

**Not part of this spec, so not changed:**

- what an account manager or an admin can write to `Events` (`events_update` still lets them change
  any column);
- payments and the other Billing controls (specs 06–10);
- the capability names and the way components read them (spec 03);
- the way the flag is written (`setEventIsQbo` stays as it is).

## 1. Decisions (all taken by the user)

**D1 — how the database enforces "only `is_qbo`"**

- **Question:** RLS decides on rows, not columns, and every app user acts as the database role
  `authenticated`.
- **Option A — a trigger plus an UPDATE policy:** `accountant` is added to `events_update`; a
  `BEFORE UPDATE` trigger refuses (error code `42501`) any other changed column for an accountant
  who is neither admin nor account manager. The write stays local-first (PowerSync) and works
  offline. This is how `is_paid` was done.
- **Option B — an RPC function:** a `SECURITY DEFINER` function `set_event_is_qbo(event, value)`;
  the accountant has no UPDATE policy on `Events`. The accountant's write is an online call, not a
  PowerSync write; the code then has two write paths (local for admin and account manager, the
  call for the accountant).
- **User's answer: A — a trigger plus an UPDATE policy.**

**D2 — who may tick the flag**

- **Option A — admin, account manager and accountant.** **Option B — admin and accountant only:**
  the account manager loses the right (the checkbox disabled, the trigger refusing it) and the matrix
  row changes for them.
- **User's answer: A — admin, account manager and accountant.**

**D3 — on which events the accountant may tick it**

- **Option A — any event:** quote, booking, deleted — as an account manager can today. **Option B —
  booked only:** an extra rule in the trigger, the table and the matrix. **Option C — not deleted:**
  an extra rule for deleted events only.
- **User's answer: A — any event.**

## 2. Research findings

**The write path today.** `setEventIsQbo` writes `Events.is_qbo` to the local PowerSync database and
inserts an `EventChangeLog` row (`field_name: "is_qbo"`, previous and next value). The upload
connector replays them to Supabase under the user's token: the `Events` change as a `PATCH` that
carries **only the changed columns** (`table.update(op.opData).eq("id", op.id)`), the log row as an
upsert.

**RLS today.**

- `events_update` is `get_user_roles() && '{admin,account_manager}'` with no `WITH CHECK`
  (`20260617200000_amz_lead_and_relax_rls.sql`); `events_insert` and `events_delete` are the same
  role list. The accountant is in none of them.
- `event_change_log_insert` is `with check (true)` for **every authenticated user**
  (`20260604110000_send_quotes.sql`), so the accountant's log row needs **no** policy change;
  reading it back on the Log tab needs the SELECT policy spec 04 adds.

**A refused upload.** `42501` is in the connector's list of unrecoverable codes: the change is
discarded and the user sees "A change could not be saved and has been discarded." The checkbox may
keep the local value until the next sync overwrites it. (Existing behaviour, unchanged here.)

**Triggers on `Events` that matter:**

- `trg_events_set_booked_at_once` — `BEFORE INSERT OR UPDATE OF event_status`; an `is_qbo`-only
  update never fires it;
- `recompute_quote_hashes_events` — `AFTER INSERT OR UPDATE`, **`SECURITY DEFINER`**; it recomputes
  `content_hash` and `contract_hash` with a nested update that runs as the function's owner;
  `invalidate_signature_on_contract_change` — `AFTER UPDATE OF contract_hash`.
- `Events` has no `updated_at` column.

The `is_paid` guard avoids the nested update by checking `current_user = 'authenticated'` (PostgREST
runs signed-in users as that role); the service role, migrations and `SECURITY DEFINER` functions
are not checked. The same check is used here, so the hash recomputation after an accountant's tick
is not refused.

**The UI today.** `BillingTab`'s checkbox is disabled when the user is neither admin nor account
manager; after spec 03 it reads `can.setQuickBooksFlag`. The matrix row _QuickBooks Invoice Flag_
says admin and account manager `full`, viewer `read`; spec 04 gave the accountant `read`.

## 3. Database — `supabase/migrations/20261004140000_accountant_events_is_qbo.sql`

(After spec 04's `20261004130000`; renumber if `develop` has moved.)

1. **`ALTER POLICY events_update ON public."Events"`** — `USING (public.get_user_roles() &&
'{admin,account_manager,accountant}'::text[])`. Nothing else about the policy changes.
2. **A guard function and trigger.** `public.guard_events_accountant_columns()` as a
   `BEFORE UPDATE ON public."Events" FOR EACH ROW` trigger (every column, not `OF …`):
   - if `current_user <> 'authenticated'`, return `NEW` (the service role, migrations and
     `SECURITY DEFINER` functions);
   - if the caller's roles include `admin` or `account_manager`, return `NEW` (they may change what
     they could before; roles are additive, so an accountant who is also an account manager is not
     fenced);
   - if the caller's roles include `accountant`: compare `to_jsonb(NEW) - 'is_qbo'` with
     `to_jsonb(OLD) - 'is_qbo'`; when they differ, raise `42501` with the message "An accountant can
     only change whether a quote or booking is in QuickBooks"; otherwise return `NEW`;
   - any other role: return `NEW` (RLS already refuses them).
     Comparing the whole row without `is_qbo` means a column added later is covered without touching
     the trigger.
3. **Deliberately not changed:** `events_insert` and `events_delete` get no `accountant` entry —
   the accountant cannot add or delete an event, by any route; `events_select` (spec 02);
   `EventChangeLog` policies; every other table.

## 4. App changes

- `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts`: **`setQuickBooksFlag` is "yes"
  for the accountant**, on any quote. Admin and account manager are unchanged (D2). Nothing else in
  the accountant's column changes. No component changes: `BillingTab` already reads
  `can.setQuickBooksFlag`, and `setEventIsQbo` is not touched.
- `src/features/userAccess/permissionPageData.ts` (draft wording, for review):
  - **QuickBooks Invoice Flag:** accountant `read` → `full`: "Can tick or untick the flag on any
    quote or booking, deleted ones included. It is the only thing an accountant can change on a
    quote or booking — the database refuses every other change."
  - **Events:** the accountant's note gains "The one thing they can change is the QuickBooks Invoice
    Flag."
  - **Accountant texts:** the role description gains the same sentence.
  - `permissionPageData.test.ts`: the accountant's guard is updated (the row is now `full`).

## 5. Behaviour scenarios (for Playwright — written, not run)

- **S1** accountant on a booking, Billing tab: the QuickBooks Invoice checkbox is enabled; ticking
  it survives a reload; the Log tab shows an `is_qbo` entry by the accountant.
- **S2** accountant on a quote and on a deleted quote: the checkbox is enabled and works.
- **S3** admin and account manager: the checkbox works as before.
- **S4** viewer: the checkbox is disabled, as before.
- **S5** accountant, still nothing else: no Edit, Delete, Send To Client, Record Payment (spec 04's
  scenarios still hold).
- The refusals of §3 (any other column, insert, delete) are asserted at the database level in the
  SQL test; the Playwright spec asserts only what the UI shows.

## 6. Files

**Counted — 3 files** (limit 10):

1. `supabase/migrations/20261004140000_accountant_events_is_qbo.sql` — new
2. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed: the accountant's
   `setQuickBooksFlag`
3. `package.json` — changed: `test:db:accountantisqbo`, added to `test:db:all`

**Not counted:** `src/features/userAccess/permissionPageData.ts`; tests —
`supabase/tests/accountant_events_is_qbo.test.sql` (new), `getQuotesBookingsCapabilities.test.ts`
and `permissionPageData.test.ts` (edited), the Playwright spec of §5; no `sync_rules.yaml` (the
whole `Events` row is already synced), no `AppSchema.ts`, no `database.types.ts`.

## 7. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run**; Prettier only on touched
files.

**7.1 Database**

- **Work:** the migration; `supabase/tests/accountant_events_is_qbo.test.sql`;
  `npm run test:db:accountantisqbo` (and `test:db:all`).
- **Test asserts, each its own assertion:**
  - an accountant-only user updates `is_qbo` to true and back to false, and the row **changes**;
  - an accountant-only user cannot change any other column — `event_name`, `event_status`,
    `deleted`, `contract_revenue_cents`, `venue_uuid`, `notes`; each is refused with `42501` **and the
    row is unchanged afterwards** (an update that RLS filters out does not raise, so the row is
    always read back);
  - one update that changes `is_qbo` **and** another column is refused as a whole, and `is_qbo` stays
    as it was;
  - an accountant cannot insert an `Events` row and cannot delete one;
  - an accountant who is also an account manager can change other columns;
  - admin and account manager change `is_qbo` and other columns exactly as before; a viewer still
    cannot update;
  - after an accountant's tick the AFTER triggers ran without error (`content_hash` /
    `contract_hash` present and consistent);
  - an update run as the table owner (a `SECURITY DEFINER` path or the service role) that changes
    another column is not refused;
  - the `EventChangeLog` row an accountant inserts for the flip is accepted.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container; the
  new test passes and `rls_multi_role.test.sql`, `accountant_role.test.sql`,
  `accountant_work_trackers.test.sql` stay green.

**7.2 Capability table**

- **Test first:** in `getQuotesBookingsCapabilities.test.ts` the accountant's `setQuickBooksFlag`
  is true on any quote, and every other capability stays false; admin and account manager are
  unchanged.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **Offline.** The tick is a local write and shows at once; it uploads when the connection returns.
  If the server refuses it, the connector discards it and shows the existing toast; the checkbox can
  keep the local value until the next sync.
- **Two users flip the flag.** The last write wins, as today.
- **A role removed while signed in.** `get_user_roles()` changes; the next upload is refused and
  discarded with the toast.
- **A deactivated accountant.** `get_user_roles()` returns nothing: RLS refuses.
- **A quote that is also changed by a trigger.** The `recompute_quote_hashes` trigger updates the
  hashes as the function owner, so it is not refused by the guard.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks

- **R1 — the guard runs on every `Events` update by a signed-in user.** It reads the caller's roles
  once per row; the cost is small, but it is a new step on a busy table.
- **R2 — the guard's `current_user` check.** It is what keeps `SECURITY DEFINER` hash recomputation
  working. A future trigger written as a plain (non-definer) function that updates other `Events`
  columns would be refused for an accountant-only user. The SQL test of §7.1 pins the present
  triggers.
- **R3 — any event (D3).** The accountant can change the flag on deleted events and on quotes that
  were never booked.
- **R4 — a refused change is discarded.** A user whose role was removed sees a toast, and a checkbox
  that may show a value the server never accepted until the next sync.
