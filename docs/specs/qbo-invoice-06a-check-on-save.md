# QuickBooks invoice — checking after a Save

Status: **DRAFT 2026-10-23 — awaiting "Approved".** 0 open decisions; four readings to confirm
(§1, last paragraph). Drafted the same day first as "check on every open and every Save", then with
a QuickBooks webhook instead of the check on open; the user then dropped the webhook too (§1), so
this spec is only the check after a Save.
Implementation order: **06a**, after [06](qbo-invoice-06-totals-check.md) and before
[08](qbo-invoice-08-view-and-check.md). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [06](qbo-invoice-06-totals-check.md) (the comparison and its route),
[01](qbo-invoice-01-link-and-hash.md) (the check-time columns).

## 0. The request, and what it is not

Spec 06 compares a quote with its QuickBooks invoice and runs the comparison after the app creates
or updates the invoice, and on Check again. The user asked for one more moment: **after a quote is
edited and saved** (the Save action). This spec adds that caller, and widens who may call the route
of spec 06 to match, because an account manager saves quotes too.

**Not part of this spec:** the comparison and its result (06); the Check again button and the
"last checked" line on the card (08); any banner, count or mark (09–11); a check when a quote is
opened, a QuickBooks webhook, a timer or a sweep (all left out by the user, §1).

## 1. Decisions (all taken by the user)

**From the user's own words and answers (not options):**

- **The checks are: Save, Create, Update, Check again** — nothing else (user, 2026-10-23, after the
  webhook was written up). Opening a quote checks nothing, and QuickBooks is not asked to notify the
  app of a change.
- **Two QuickBooks calls per check stay** (the Item and the invoice): no Item cache.
- **The token-refresh race is left as it is** (spec 06 §11, R5).
- **The card shows when the quote was last checked** (spec 08; the columns are spec 01's), so that
  an invoice nobody has checked for a long time is not mistaken for a clean one.

**Readings to confirm at review.**

- **Only a quote that has an invoice is checked** after a Save; a quote without one causes no
  request.
- **The route's callers.** The check route (spec 06 §6) accepts every role that may open
  `/quotes-bookings`, and the caller's own token must be able to read the quote. An admin and an
  accountant get spec 06's whole answer; anyone else gets `{ status }` only.
- **A Save is silent:** no toast, spinner or error. A check that fails leaves the flag as it was
  and records the failure time (spec 06 §3).
- **A change made by hand in QuickBooks is not seen by itself.** Until someone presses Check again,
  saves the quote or updates the invoice, the flag keeps its last value, and the card's check time
  is the only hint of how old that is.

## 2. Research findings

- **Where a quote is saved.** Every Save button of the quote form (`CreateQuoteForm.tsx`, four
  call sites) ends in `updateQuoteEvent`; the payment-schedule dialog edits the form's state and is
  saved by the same call. It already ends by calling `postFinanceBookedNotice`, a fire-and-forget
  request made after everything is saved. That is the pattern used here.
- **The write is local first.** `updateQuoteEvent` writes to the local PowerSync database and the
  upload to Supabase comes later. The check route reads Supabase, so a check sent at once would
  compare the quote as it was **before** the Save. The server cannot know what the user changed,
  so the client waits: `db.getUploadQueueStats()` (PowerSync 1.38) returns the queue's size, and
  it is empty when everything has reached Supabase.
- **The route's guard today** is `requireAdminOrAccountant`. The pieces for a wider one exist:
  `auth()`, `resolveUserAccessForRequest` (roles, and whether the account is active),
  `canAccessPath(roles, "/quotes-bookings")` and `createServerSupabaseClient()` (the caller's
  token, so row-level security applies).

## 3. The check route's guard — `src/app/api/quickbooks/invoice/check/route.ts` (changed)

`requireAdminOrAccountant()` is replaced by, in this order:

1. No session → **401**.
2. `resolveUserAccessForRequest`: an account that is not active, or whose roles do not include a
   path `/quotes-bookings` (`canAccessPath`) → **403**.
3. The event is read with the caller's own token (`createServerSupabaseClient`); no row → **404**
   "Quote not found." (a quote the caller may not read looks like one that does not exist).
4. From here the route works as spec 06 §6 says, with the service role.

The answer is trimmed for a caller who is neither admin nor accountant: `checked` carries only
`status`; `invoice_missing`, `skipped` and the errors are as in spec 06.

## 4. After a Save

**`…/quotesAndBookings/utils/requestInvoiceCheck.ts` (new).** `requestInvoiceCheck(eventId)`:

1. Reads the event's `qbo_invoice_id` from the local database. None → returns; no request.
2. A check for this `eventId` already running in this tab → returns that one's promise.
3. Waits for the upload queue to empty: polls `getUploadQueueStats()` every 500 ms for at most
   10 s. Still not empty → gives up without a request (the quote reaches the server later; the
   next Save or Check again checks it).
4. `POST /api/quickbooks/invoice/check` with `{ eventId }`.
5. Never throws and never shows anything: a failed request is `console.error`.

The waiting is a small pure function with the queue and the clock passed in, so it is tested
without PowerSync.

**`updateQuoteEvent.ts` (changed).** After the last write and beside the booked notice, it calls
`void requestInvoiceCheck(eventId)`. A save that throws never reaches it.

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

**No row's level changes**: a Save's check is not something a role is allowed or refused. Because
an account manager's Save does refresh a flag that only accountants see, the **QuickBooks Invoice
Alerts** row (added by spec 09) says so in its description. This spec edits no file of the matrix.

## 6. Behaviour scenarios

Playwright, written, **not run** (the check route is replaced by a fake that records its calls):

- **S1** an admin saves an edit on a quote that has an invoice: the fake receives one check, sent
  after the upload has finished (the fake sees the saved value in the database when called).
- **S2** an account manager saves such a quote: one check; they see nothing new.
- **S3** a quote with no invoice: no request.
- **S4** a save that fails: no check.
- **S5** the fake answers 502: nothing is shown.
- **S6** opening a quote that has an invoice sends **no** check.
- **S7** a driver posts the check route directly: 403; a user who cannot read the quote: 404.

## 7. Files

**Counted — 3 files** (limit 10):

1. `src/app/api/quickbooks/invoice/check/route.ts` — changed: the guard and the trimmed answer
   (the same file as spec 06's route)
2. `src/features/quotesAndBookings/utils/requestInvoiceCheck.ts` — new
3. `src/features/quotesAndBookings/db/updateQuoteEvent.ts` — changed

**Not counted:** the tests of §8; the Playwright spec of §6. No migration, no `AppSchema.ts`, no
`database.types.ts` (spec 01 adds the columns), no `permissionPageData.ts` (§5).

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`route.test.ts` (check), the guard:** 401; 403 for an inactive account and for a role that
  cannot open `/quotes-bookings`; 404 for a row the caller cannot read; an admin and an accountant
  get the whole answer; an account manager and a viewer get `status` only; a developer, a driver and
  a maintainer are refused (their roles cannot open `/quotes-bookings`); the event is read with the
  caller's token and everything after with the service role.
- **`requestInvoiceCheck.test.ts`:** no local invoice id → no request; a second call while one runs
  shares it; the wait polls until the queue is empty and then sends; a queue that never empties
  sends nothing; a rejected request is swallowed and logged; the request body.
- **`updateQuoteEvent` test:** the check is requested once, after every write, for an edit; not
  when a write throws; not for a quote with no invoice.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **Save, then the card opens.** Opening checks nothing; the Save's own check is the only one.
- **Two Saves in quick succession.** The second joins the first if it is still running (same tab);
  otherwise both run.
- **A hand edit in QuickBooks.** Nothing notices until Check again, a Save or an Update (§1,
  reading). An accountant who corrects an invoice in QuickBooks presses Check again to clear the
  flag.
- **A deleted invoice.** The check answers `missing`; the flag is not changed (spec 06), so a
  deletion in QuickBooks leaves no signal beyond the failure time of the attempt.
- **Offline.** A Save's check does not wait for the connection: the queue does not empty, or the
  request fails, and nothing is shown.
- **Clerk.** The check route's 401 above.

## 10. Risks

- **R1 — QuickBooks-side changes go unseen.** With no webhook and no check on open, a correction
  or a break made by hand in QuickBooks reaches the quote's flag only through Check again, a Save or
  an Update. The card's check time (spec 08) is the only sign of how stale the flag may be.
- **R2 — changes the Save does not see:** a contact or address edited in the address book, a
  renamed event type, a changed tax-code or Class mapping. They reach the flag at the next Save of
  that quote or at Check again.
- **R3 — the upload wait gives up after 10 s.** On a slow connection the Save's own check is
  skipped; the next Save or Check again makes up for it.
- **R4 — QuickBooks' request limits** are lightly exposed: a check is two QuickBooks calls and
  happens only on a Save, a create, an update or a button press.

## 11. Out of scope

- A check when a quote is opened; a QuickBooks webhook; a throttle; an Item cache; a pause after a
  429; a sweep or a timer.
- Serialising the token refresh (spec 06, R5).
- Any notification outside the app.
