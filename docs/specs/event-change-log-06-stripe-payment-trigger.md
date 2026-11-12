# Event change log 06: Stripe payment received

Status: **DRAFT 2026-11-05, waiting for "Approved"**. 0 open decisions; readings to confirm in §1.
Build order: **06 of 07**. Needs: nothing. Needed by: nothing.
Plan: [event-change-log-plan.md](event-change-log-plan.md). Branch: `q4-sprint3-finance`.

## 0. The change request of 2026-11-05 (the same in all seven specs)

The user asked to refactor the event change log (the `EventChangeLog` table, the Log tab of a
quote). The pages `/accountant/invoice?id={id}` and `/quotes-bookings/{id}` were audited for what
the Log does not record. The user took these decisions (plan §3):

- Must be recorded: Record payment, Upload file, Delete file, the Lost reason and note, a Stripe
  payment received, Payment Schedule changes on the Edit page.
- Not recorded, by the user's choice: Responded / Awaiting, Internal chat, New Task, QuickBooks
  Check again.
- The rows of a status change and of the Edit page move from a direct Supabase request to
  PowerSync. Delete quote stays a direct request.
- Seven small specs, one logic each. Old payments and files are not filled in.

This spec is the sixth: a payment the customer makes with Stripe appears in Payment History on
both pages (the webhook inserts the `PaymentHistory` row) and leaves nothing in the Log. The Log
only has "Initiated payment" (`client_payment_started`), written when the customer presses Pay.

## 1. What this spec decides

**D5 (plan §3): the row is on the Customer Activity tab**, next to "Initiated payment". The author
is "System".

**D13 (plan §3): a database trigger writes it.**

- **Question:** how the row is added. Stripe repeats a webhook call if the webhook answers with
  an error.
- **Options:** the webhook code inserts it after the payment (two requests; if the second fails
  the payment has no row, and the retry finds the payment and stops); a trigger on `PaymentHistory`
  inserts it in the payment's own transaction (both or neither).
- **User's answer:** a database trigger.

**Readings to confirm:**

- **R1:** the action type is `client_payment_received`. The prefix `client_` is what puts a row
  on the Customer Activity tab (`isClientEvent`), so `LogTab` needs no new tab logic.
- **R2:** the row's text. `field_name` is `payment:<payment id>`, `next_value` is the amount
  with its currency ("$1,000.00 USD", the way `formatCentsForLog` writes it), `prev_value` is
  null, `changed_by_user_uuid` is null. The payer's name is not written. Title: "Payment
  received of $1,000.00 USD".
- **R3:** the trigger fires for rows with `entry_source = 'stripe'` only, so a manual payment
  does not get this row (spec 01 writes its own).
- **R4:** the endpoint `POST /api/quotes/{id}/activity` and its two allowlists
  (`activity/route.ts`, `activity/allowedActionTypes.ts`) do **not** get this type. It is written
  by the database only, so nobody can forge "payment received" through the public endpoint.
- **R5:** `changed_at` is the time of the insert (`now()`), within a moment of the webhook's
  `paid_at`.
- **R6:** `permissionPageData.ts` is not edited. The Log is read by the same four roles that
  read Payment History.

## 2. Research findings

- `app/api/stripe/webhook/route.ts` inserts `PaymentHistory` with the service role after a
  duplicate check. A duplicate delivery is stopped by the check or by the partial unique index on
  `stripe_checkout_session_id` (error 23505); neither creates a row, so a trigger on insert fires
  once per payment.
- `PaymentHistory.entry_source` is `'stripe'` (column default) or `'manual'`; `event_uuid` is
  not null; the amount is not zero (CHECK).
- `EventChangeLog` has `id` (default), `event_uuid`, `prev_value`, `next_value`,
  `changed_by_user_uuid`, `changed_at` (default `now()`), `field_name`, `action_type`. The service
  role bypasses its RLS; its select policy covers admin, account manager, viewer and accountant.
- The PowerSync streams of the admin, the account manager, the viewer and the accountant already
  carry `EventChangeLog`, so no sync rules change is needed.
- `getClientTitle` in `LogTab.tsx` titles the `client_*` rows; an unknown one reads "Customer
  activity".
- Tests and fixtures that insert Stripe payments (the e2e fixtures, two pgTAP files that mention
  `EventChangeLog`: `accountant_quote_card.test.sql`, `accountant_events_is_qbo.test.sql`) will now
  also create a Log row. `seed.sql` runs with triggers off.

## 3. Design

**Migration** `supabase/migrations/20261105120000_log_stripe_payment.sql`:

```sql
CREATE FUNCTION public.log_stripe_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public."EventChangeLog"
    (event_uuid, changed_by_user_uuid, field_name, prev_value, next_value, action_type)
  VALUES (NEW.event_uuid, NULL, 'payment:' || NEW.id, NULL,
          -- "$1,000.00 USD", with the minus sign in front of the $ for a negative amount
          CASE WHEN NEW.amount_cents < 0 THEN '-' ELSE '' END || '$'
            || to_char(abs(NEW.amount_cents) / 100.0, 'FM999,999,999,990.00')
            || ' ' || NEW.currency,
          'client_payment_received');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_history_log_stripe
  AFTER INSERT ON public."PaymentHistory"
  FOR EACH ROW WHEN (NEW.entry_source = 'stripe')
  EXECUTE FUNCTION public.log_stripe_payment();
```

**`LogTab.tsx`.** `getClientTitle` gains `client_payment_received`:
`"Payment received" + (next_value ? " of " + next_value : "")`.

No webhook change, no `database.types.ts` change, no `AppSchema.ts` change, no sync rules change.
Deploy: the migration only.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** a Stripe payment is inserted for a quote (by the fixture, as the webhook does); the
  quote's Log, tab Customer Activity, lists "Payment received of $… USD" with the Customer label.
- **S2:** the same payment does not appear on the Internal Activity tab.
- **S3:** a manual payment recorded by a user adds "Payment recorded" (spec 01) and no Customer row.

## 5. Tests

**pgTAP** `supabase/tests/stripe_payment_log.test.sql` (new), run in a rolled-back transaction:

- a Stripe insert makes exactly one Log row with the event, `payment:<id>`, the formatted amount,
  null author and `client_payment_received`;
- a manual insert makes none;
- a second insert with the same `stripe_checkout_session_id` fails with 23505 and leaves one row;
- the amount format for 1, 100000 and 123456789 cents and for CAD;
- the row is readable by the admin, account manager, viewer and accountant roles.

**Vitest** `LogTab.test.ts`: the title with and without a value. The two existing pgTAP files that
mention `EventChangeLog` are run again after the migration.

## 6. Files

Production, 2: the migration (new), `components/quoteDetail/tabs/LogTab.tsx`.
Tests: `supabase/tests/stripe_payment_log.test.sql` (new), `LogTab.test.ts`,
`e2e/stripePaymentLog.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **A redelivered webhook.** No second payment, no second row.
- **The Log insert fails inside the trigger.** The payment insert fails with it, the webhook
  answers 500 and Stripe retries; nothing is half-written. (The insert cannot fail on a missing
  event: `PaymentHistory.event_uuid` is a foreign key to the same `Events` row.)
- **Rows made by the e2e fixtures or tests** gain a Log row; none of the existing tests count them
  (checked in §5).
- **Payments made before the release.** No row (plan D11).
- **Rollback.** Drop the trigger and the function; the rows already written stay.

## 8. Out of scope

- Stripe refunds and disputes. The payer's name or email in the row. A row on the Internal tab.
- Adding the type to the public activity endpoint (R4). Changing the webhook code.
