-- An account manager no longer records a payment (docs/specs/accountant-quotes-06-am-read-only-payments.md).
--
-- The only INSERT policy on PaymentHistory is payment_history_insert
-- (20260904120000_manual_payment_entry.sql). Its role list loses account_manager, lead and junior
-- alike; the entry_source = 'manual' condition stays, so a client still cannot write a row that
-- claims to be a Stripe payment.
--
-- Not changed: payment_history_select (an account manager still reads every payment); there is
-- still no UPDATE or DELETE policy for anyone; the Stripe webhook writes with the service role
-- and bypasses RLS.
--
-- Until spec 10 gives the accountant the right, only an admin can record a payment.
--
-- An offline payment an account manager recorded before the release meets this policy when the
-- upload queue drains: it is refused with 42501, and the connector discards it with the toast
-- "A change could not be saved and has been discarded." (spec D2, accepted).
--
-- Deploy order: this migration → the app. No sync rules change.

ALTER POLICY payment_history_insert ON public."PaymentHistory"
  WITH CHECK (
    public.get_user_roles() && '{admin}'::text[]
    AND entry_source = 'manual'
  );
