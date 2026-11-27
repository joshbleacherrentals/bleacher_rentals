# Payment schedule: the first installment is due the day the quote is first booked

Status: **Approved** 2026-11-27 and **implemented** the same day, uncommitted (§9 lists what
the build found and changed against the approved text). 0 open decisions (all answered, §1).
Branch: `q4-sprint4-maintenance-dashboard`.
Amends: [payment-does-not-invalidate-signature.md](payment-does-not-invalidate-signature.md) D1
(§3.3). Builds on: [percentage-payment-schedules.md](percentage-payment-schedules.md).

## 0. The request

The author's words (2026-11-26, translated): "We already have a payment schedule for quotes.
The first installment of the payment schedule must always fall on the date the invoice is
signed."

Everything below follows from that sentence and from the author's answers in §1. Nothing else
is added.

## 1. Decisions (all taken by the author)

**D1. What the first payment shows before the event is booked.**

- Question: a quote made on Nov 20 is signed on Nov 26. What does the client see in the first
  payment before the signature?
- Options: "On signing", no date; or a date (the creation day) that jumps at signing.
- User's answer: **"On signing", no date.** The date appears when the event is booked.

**D2. Which day the first payment gets, and that it never moves.**

- Question 1: the manager edits the quote after the signature and the client signs again days
  later. Which day does the first payment have?
- User's answer: **the day of the first signature**, it does not move on a second signature.
- Question 2 (events booked by hand): which day?
- User's answer: **the booking day, but it must always be the first booking.** The author asked
  for ideas on how to keep "the first booking".
- Question 3: how does the system remember the first booking?
- User's answer: **the day is written onto the first payment itself**, once, when it is still
  empty, the first time the event becomes booked (signature, status button or edit page). After
  that nobody moves it: not a second signature, not booked, quoted, booked again, not the
  Booked date button.

**D3. Second and later installments.**

- Question: the event is on Dec 1, the second payment "7 days before" is Nov 24, the client
  signs on Nov 26. What happens to the second payment?
- User's answer: **leave as is.** Only the first row is ever changed by this rule.

**D4. The top row of the schedule.**

- Question: may a manager delete the first row of a schedule of two or more?
- User's answer: **no.** Its delete button is off. Its date cannot be typed either: the rule
  says "always".

**D5. Old events, one time, by a migration.**

- Question A (76 events that have a signature and a schedule): fix the first payment date?
- User's answer: **fix all 76**, to the day of the first signature. Of them 18 already match, 40
  move later, 18 move earlier. In 14 the first payment stood in the future and becomes due now:
  8 are booked (2 with nothing paid yet) and enter Collections unless the money received already
  covers the first payment; 6 are `unsigned_changes` and become overdue when the client signs
  again.
- Question B (52 booked events with a schedule and no signature at all): which day?
- User's answer: **all 52 get their Booked date.** 12 already match, 17 move later, 23 earlier.
  In 9 the first payment stood in the future and becomes due now (7 with nothing paid yet): they
  enter Collections unless the money received already covers the first payment.
- Question C (489 events with a schedule that were never booked: 219 quoted, 73 draft, 197
  lost): what happens?
- User's answer: **all 489 become "On signing" now**: the date is cleared.
- Question D (16 booked events have an active signature, signed with the old date): do the
  signatures stay valid?
- User's answer: **yes, they stay valid.** No client is asked to sign again.

All counts are from read-only queries of production on 2026-11-26.

## 2. Research findings

- **Today the first row is only a date.** The default schedule is 50 / 50: the first row is
  "today" (the creation day), the second is 7 days before the event, never before today
  (`buildDefaultPaymentSchedule`). Signing does not touch installments: the sign route writes
  the signature, then sets `event_status = 'booked'` and `booked_at` (`/api/contracts/sign`).
- **A date change would cancel the signature it follows.** The due date is contract material:
  both quote hashes serialize each installment as `{due, amount}` (decision D1 of
  `payment-does-not-invalidate-signature.md`). The sign route records the signature with the
  hash it read first. A later write of the date moves `contract_hash`, and the trigger
  `invalidate_signature_on_contract_change` then invalidates the new signature at once. So the
  date of the first row must stop being a term of the contract (§3.3).
- **`booked_at` is not "the first booking".** `changeQuoteStatus` sets it to now on every
  change to booked (except from `unsigned_changes`) and clears it when the quote leaves booked;
  the sign route overwrites it at every signature; the Booked date button edits it. The database
  also stamps it: the trigger `trg_events_set_booked_at_once` sets `booked_at = now()` whenever
  the status becomes booked, from any other status (found while testing, §9). This is why
  D2 stores the day on the first payment, and why `booked_at` is left as it is (the weekly
  leaderboard, the filters and the Booked column read it).
- **The status history cannot supply it.** Only 110 of 767 booked events have a status row in
  `EventChangeLog`.
- **694 of 767 booked events have no signature** (booked by hand); only 109 booked events have
  a schedule. 658 booked events have none and are not touched.
- **Collections never reads an event with an empty date.** AR and the task sync read booked
  events only (`isOnReceivablesTab`, `ar_sync_event_tasks`). After this spec every booked event
  has a date on its first row. In SQL an empty date is never "due" and in TypeScript it is; the
  two never meet on a booked event.
- **Collections tasks follow the change.** The deferred triggers `ar_sync_tasks_on_*` run at
  commit and open a task for a booked event with an amount due. The migration therefore
  creates tasks for the booked events of D5 that become due now and are not covered by the
  money received. The trigger catches its own errors and never blocks the migration.
- **PowerSync needs no sync-rule edit.** The rules in `../br_powersync/config/sync_rules.yaml`
  select `PaymentInstallments.*`. Booleans are `0/1` locally.
- **The public page and the Pay tab already call the first row "Due Now"** and ignore its
  date; only the PDF prints a date for every row.
- **Precedent for the hash migration:** `20260903120000_payment_state_out_of_quote_hashes.sql`
  (formula change, trigger off, re-anchor active signatures, trigger on).

## 3. Design

### 3.1 The column

`PaymentInstallments.due_on_signing boolean NOT NULL DEFAULT false`. It marks the one row that
is due when the event is first booked: always the first row of a schedule. It is the
installment's identity for the hash, the trigger, the lock in the editor and the display order.
The date it carries is a consequence, not a term.

- `due_date` was `NOT NULL`; the migration drops that, because the marked row of an event that
  was never booked has no date. `database.types.ts` gets `due_date: string | null`.
- `AppSchema.ts`: `due_on_signing: column.integer` in `PaymentInstallmentsCols`.
- `database.types.ts`: hand-edited in `PaymentInstallments` Row, Insert and Update
  (`npm run gtl` is unsafe while the local database lags, see memory).
- No unique index: a rejected upload stalls the PowerSync queue, and two marked rows would only
  both be filled. "One marked row, and it is first" is kept by the editor, the validation and
  the migration.

### 3.2 The day rule (SQL, one function)

`public.first_booked_day(p_event uuid) RETURNS date`, in the Toronto time zone as the
Collections functions are:

- if the event has any signature, of any status: the day of the earliest `signed_at`;
- else the day of `Events.booked_at`;
- else the day of `now()` (so a booked event can never be left without a date).

`public.fill_on_signing_installment(p_event uuid)` sets `due_date = first_booked_day(p_event)`
on the event's marked rows whose `due_date IS NULL`, only when the event has been booked: its
status is `booked` or `unsigned_changes`, or it has a signature. A row that already has a date
is never touched: this is the "written once" of D2.

Both are `SECURITY DEFINER`, `SET search_path = public`, EXECUTE revoked from the app roles, like
the `ar_*` functions.

### 3.3 The hash stops carrying the date of the marked row

`recompute_quote_hashes(uuid)` is replaced (a copy of the version in
`20260922120000_percentage_payment_schedules.sql`, two changes) so the canonical installment is:

- `'due'`: the text `on signing` for the marked row, `to_jsonb(due_date)` for every other row;
- the order inside the aggregate: `ORDER BY pi.due_on_signing DESC, pi.due_date, pi.id`.

`'amount'` is unchanged, in both documents (`content` and `contract`). The amounts themselves
must not depend on the date either: `resolve_payment_schedule` breaks a spare-cent tie by due
date, and before booking the marked row has none. A 50 / 50 split of 10001 cents would give the
spare cent to the other row before booking and to the marked row after, and the hash would move.
So the function ranks `due_on_signing DESC` before `due_date` (§9). Result: the day written
by the trigger moves no hash, so signing cancels no signature and a manual booking raises no
"quote updated" modal. Amends D1 of `payment-does-not-invalidate-signature.md`: for the marked
row the **percentage** stays contract material, its **date** no longer is.

### 3.4 The triggers

- **On `Events`**, `AFTER INSERT OR UPDATE OF event_status`, when the new status is `booked` or
  `unsigned_changes`: `fill_on_signing_installment(NEW.id)`. Every route reaches it: the status
  button, the edit page, the client's signature (a server write), an import.
- **On `PaymentInstallments`**, `AFTER INSERT OR UPDATE OF due_on_signing, due_date`, when
  `NEW.due_on_signing AND NEW.due_date IS NULL`: `fill_on_signing_installment(NEW.event_uuid)`.
  It covers a schedule given to an event that is already booked, and a stale editor that
  writes an empty date over a filled one. The fill makes the date non-empty, so it does not
  fire again.

The sign route needs no change: the status update fires the trigger inside the same statement,
so the signed PDF and the two emails built afterwards already show the day.

### 3.5 The migration (one file, `20261128120000_payment_first_installment_on_signing.sql`)

In this order, in one run (the file itself is the reference; §9 lists how it differs from this
first plan):

1. `ALTER COLUMN due_date DROP NOT NULL`, then `ADD COLUMN due_on_signing`.
2. Mark the first row of every event that has a schedule: the row with
   `row_number() = 1` over `due_date NULLS LAST, created_at, id` (the order the schedule
   allocates payments in). Done once; afterwards the mark is the identity.
3. `ALTER TABLE "Events" DISABLE TRIGGER invalidate_signature_on_contract_change`.
4. Set the date of every marked row (D5):
   - the event has any signature: the day of the earliest signature;
   - else its status is `booked` or `unsigned_changes`: the day of `booked_at` (or of
     `now()` if empty);
   - else: `NULL`.
5. Create the two functions and the two triggers; replace the hash function.
6. Recompute the hashes of every event that has a schedule.
7. Re-anchor: `UPDATE "ContractSignatures" SET signed_contract_hash = e.contract_hash` for
   active signatures of those events (D5 question D: the 16 stay valid).
8. `ALTER TABLE "Events" ENABLE TRIGGER invalidate_signature_on_contract_change`.

The migration can run twice: the column is added `IF NOT EXISTS`, the functions are replaced,
the second marking changes nothing, and the second date pass touches only what step 4 sets.
The hashes of the touched events move once, so a public page open at deploy time shows "quote
updated" once (as in `20260903120000`). The deferred Collections triggers fire at commit.

`supabase/seed.sql` gets one block at the end with steps 2 and 4 (the seed runs with triggers
off). Dry-run it in a rolled-back transaction before it is saved.

### 3.6 The application

- **Type.** `PaymentInstallment` gets `dueOnSigning?: boolean` (absent means false, so the many
  places that only resolve amounts need no change). A row's `dueDate` is `""` when it has none.
- **Default schedule.** `buildDefaultPaymentSchedule`: row 1 has an empty `dueDate`, is marked
  with `dueOnSigning` and carries 50%; row 2 is as today. The store keeps recomputing only the
  second date when the event start changes.
- **Validation** (`validatePaymentSchedule`): the first row must be marked and no other row may
  be; the marked row needs no date (if it has one it must be a valid date); every other row
  needs one. Error text for a missing mark: "The first installment is always due on signing."
- **Save** (`syncPaymentInstallments`, `scheduleDiff`): the mark is read, compared and written
  with the other fields. A row whose mark changed counts as changed. The date of the marked row
  is never a change and is never written by an update; only the database writes it.
- **Load** (`loadQuoteIntoStore`, `usePaymentInstallments`, `fetchPaymentInstallments`): read
  the mark; order by `due_on_signing DESC, due_date`.
- **Editor** (`EditPaymentScheduleModal`): row 1 shows the text "On signing", or the date when
  it has one (read-only, with the note "Set when the quote was first booked"), instead of a date
  input; its delete button is off. Added rows are never marked and need a date. Split Evenly is
  unchanged. A card in `PaymentScheduleSection` shows the same text instead of "No date".
- **Browser draft.** `create-quote-draft` goes from version 1 to 2: in `migrate`, the first row
  becomes marked and its date is cleared. The version-1 converter keeps its own output and
  gets the same final step.
- **Display of an empty date.** Wherever an installment date is printed and it is empty, the
  text is "On signing" (French: "À la signature"): the quote PDF (`QuotePdfDocument`, new
  string in `quoteStrings`), the Billing tab, the payment dialogs (a new helper
  `formatInstallmentDue`). The public page and the Pay tab already print "Due Now" for the
  first row and need nothing.

### 3.7 Documents

- `permissionPageData.ts`: the Events sentence for Admin and Account manager says the first
  installment is always due on the day the quote is first booked and cannot be set by hand.
- `dataDictionary.ts`: `PaymentInstallments.due_on_signing`, and the rule for the first
  installment's `due_date` (empty until the event is booked; then the day of the first
  signature, or of the booking if never signed). The column snapshot is accepted with
  `npx vitest run src/features/analyticsMcp/dataDictionary.columns.test.ts -u`.
- A one-line amendment note in `payment-does-not-invalidate-signature.md` under D1.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1.** New quote on `/quotes-bookings/new`: row 1 of the schedule reads "On signing" and has
  no delete button; row 2 has a date. Save, open `/edit`: the same.
- **S2.** The public page of an unsigned quote shows "Due Now" on the first row; the PDF shows
  "On signing". After the client signs, the Billing tab shows the signing day on row 1 and the
  signature is still active.
- **S3.** A manager sets the status to Booked by hand: the first row of the Billing tab takes
  that day.
- **S4.** Booked, then Quote Sent, then Booked again on a later day: the first row keeps the
  first day.
- **S5.** The manager changes the price of a signed quote, the client signs again: the first
  row's day is unchanged.
- **S6.** The Booked date button moves `booked_at`: the first row's day is unchanged.
- **S7.** A schedule is given to an old booked event with none: row 1 gets the booking day at
  the moment of Save.
- **S8.** In a schedule of three rows, the delete button of row 1 is off; the ones of rows 2 and
  3 work.

## 5. Tests

Tests come first (red, then green). Unit tests, Vitest:

- `buildDefaultPaymentSchedule`: row 1 empty and marked, row 2 as before.
- `validatePaymentSchedule`: first row unmarked, a second marked row, the marked row with and
  without a date, another row without a date, an empty schedule.
- `scheduleDiff`: a changed mark is an update; an unchanged marked row is not written.
- The persist `migrate` of the store: a version-1 draft and a version-2 draft.
- `formatInstallmentDue` and the PDF: empty date reads "On signing" (English and French).
- Editor and section: row 1 text, the date when present, no delete button on row 1, added rows.

SQL test, `supabase/tests/payment_first_installment_on_signing.test.sql`, run through
`docker psql` in a rolled-back transaction (no pgTAP locally):

- a manual booking fills the empty marked row with the Toronto day of `booked_at`;
- a booking at 23:30 Toronto on Nov 26 gives Nov 26, not Nov 27;
- a signature, then the status update, gives the day of the first signature;
- a second booking, a second signature, and the Booked date button leave the date alone;
- a schedule inserted for an already booked event is filled at once;
- the fill moves neither hash and invalidates no active signature;
- the hash is the same for the same terms whatever the marked row's date;
- the migration on a copy: counts of D5 (marked rows, dates set, dates cleared, 16 signatures
  still active).

## 6. Files

Counted (17, over the cap of 10 because the rule is one logic, as agreed for earlier specs):

- `supabase/migrations/20261128120000_payment_first_installment_on_signing.sql`
- `types/quoteTypes.ts`, `utils/buildDefaultPaymentSchedule.ts`,
  `utils/resolvePaymentSchedule.ts`, `utils/scheduleDiff.ts`, `utils/formatInstallmentDue.ts`
  (new)
- `db/paymentInstallments.ts`, `db/loadQuoteIntoStore.ts`, `state/useCreateQuoteStore.ts`,
  `hooks/usePaymentInstallments.ts`
- `components/createQuote/modals/EditPaymentScheduleModal.tsx`,
  `components/createQuote/sections/PaymentScheduleSection.tsx`
- `components/quoteDetail/tabs/BillingTab.tsx`, `PaymentDetailDialog.tsx`,
  `RecordPaymentDialog.tsx`
- `pdf/QuotePdfDocument.tsx`, `pdf/quoteStrings.ts`

(all under `src/features/quotesAndBookings/`).

Not counted: this spec, the tests, `AppSchema.ts`, `database.types.ts`, `permissionPageData.ts`,
`dataDictionary.ts` and its column snapshot, the amendment note, the seed block, and the e2e
helper `e2e/helpers/quoteTestData.ts` (its installments get the mark on the first row).
`sync_rules.yaml` is not edited.

## 7. Edge cases and error handling

- **A stale editor** opened before the booking and saved after it writes an empty date on a
  marked row; the trigger on `PaymentInstallments` fills it again from the same rule.
- **Offline.** A status change made offline is uploaded later, and the database stamps
  `booked_at = now()` when it lands (`trg_events_set_booked_at_once`), so the day is the day of
  the upload, not of the click. This is how `booked_at` behaves today for every booking.
- **Time zone.** The day is Toronto's: a booking at 23:30 on Nov 26 in Toronto is Nov 26.
- **A date that is wrong.** A wrong click on Booked fixes the date for good; the app has no way
  to change it (the author accepted this in D2). Support can correct it in the database.
- **Second date earlier than the first** (D3). Lists ordered by date (the public page, the
  Billing tab, Collections) then show the second row on top, and the public page calls the top
  row "Due Now". The editor still shows the marked row first. Payments are allocated by date as
  today, so the second row fills first. The amount due does not change.
- **WPForms lead quotes** have no schedule until a manager opens `/edit`; saving there creates
  the marked first row. Unchanged otherwise.
- **An event without a schedule** is not touched, booked or not (658 booked events).
- **The email token `{{dueDate}}`** stays empty for an unbooked quote paid before signing; it
  was a date before. Out of scope.
- **Migration on production.** Tasks open in Collections for the events of D5 that become due
  now; the numbers are in D5.

## 8. Out of scope

- Any change to `booked_at`, to the Booked date button, to the weekly leaderboard or the filters.
- Any change to the sign route, to Stripe, to QuickBooks or to the second and later
  installments.
- A way for a manager to move the first payment's date.
- Collections: no rule, query or screen changes; only the data moves.
- Events that have no schedule.

## 9. What the build found, and how it differs from §3 above

Found while building and testing, and handled inside the approved decisions (none of them moves
a choice the author made):

- **`due_date` was `NOT NULL`.** The migration drops the constraint (§3.1).
- **The spare-cent tie.** Described in §3.3: `resolve_payment_schedule` is replaced with the marked
  row ranked first, otherwise the hash moves at booking for a 50 / 50 split of an odd number of
  cents. The SQL test fails without this change.
- **`trg_events_set_booked_at_once`** overwrites `booked_at` with `now()` whenever the status
  becomes booked, so a client-stamped time never reaches the database (§2, §7). The SQL test
  switches that trigger off to pin `booked_at` at the edges, and has one case with it on.
- **Deferred Collections triggers** block `ALTER TABLE ... ENABLE TRIGGER` while their events are
  pending, so the migration runs `SET CONSTRAINTS ALL IMMEDIATE` before it re-enables the
  signature-invalidation trigger.
- **Helper functions.** `event_has_been_booked(uuid)` is one more function (the rule "booked or
  signed" lives in one place for the migration and the fill); the migration replaces the hash and
  resolver functions before the one-time marking, so the hashes already follow the new formula
  when the rows move.
- **Type.** `dueOnSigning` is optional (§3.6).
- **Where the spare cent goes after booking.** For the odd order of D3 (the second row dated
  before the first) and an exact tie of shares on an odd number of cents, the date-ordered
  TypeScript and Collections code gives the spare cent to the earlier-dated row, while the hash
  keeps it on the marked row. Amounts shown move by one cent at booking in that case only; the
  total, the amount due and the signature do not.
- **The seed** (`supabase/seed.sql`) was already modified in the working tree before this work
  (an uncommitted re-dump); the block was appended at its end, between a header comment and
  `RESET ALL`.
