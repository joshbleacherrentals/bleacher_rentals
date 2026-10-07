-- An accountant records, edits and soft-deletes manual payments
-- (docs/specs/accountant-quotes-10-accountant-writes-payments.md).
--
-- Only an admin and an accountant write PaymentHistory; nobody else. Until now only an admin did
-- (20261004150000_am_read_only_payment_history.sql took the insert from the account manager,
-- 20261004160000_payment_history_edit_and_soft_delete.sql gave the admin the update). This migration
-- gives the accountant both, and nothing more:
--
--   * payment_history_insert: the role list becomes {admin, accountant}; the conditions that a row is
--     manual and not already deleted stay.
--   * payment_history_update: USING and WITH CHECK both take the role list {admin, accountant}; a
--     Stripe row is still invisible to it.
--
-- On any event (the spec's D1): a quote that was never booked and a deleted event included — neither
-- policy looks at the event.
--
-- Not changed: the guard trigger and the CHECKs of 20261004160000 (they do not look at the role: an
-- accountant meets the same immutable columns, the same frozen deleted row and the same rules for a
-- deletion as an admin); there is still no DELETE policy, so a hard delete stays impossible for every
-- signed-in user; payment_history_select; the Stripe webhook's service-role path; every other table.
--
-- recorded_by_user_uuid is still not pinned to the caller on insert (the spec's "found on the way").
--
-- An accountant's offline write meets these policies when the upload queue drains; a refusal (42501)
-- discards the whole transaction, the payment change and its EventChangeLog row together.
--
-- Deploy order: this migration → the app. No sync-rules query changes: the accountant bucket already
-- selects "PaymentHistory".*.

ALTER POLICY payment_history_insert ON public."PaymentHistory"
  WITH CHECK (
    public.get_user_roles() && '{admin,accountant}'::text[]
    AND entry_source = 'manual'
    AND deleted_at IS NULL
  );

ALTER POLICY payment_history_update ON public."PaymentHistory"
  USING (
    public.get_user_roles() && '{admin,accountant}'::text[]
    AND entry_source = 'manual'
  )
  WITH CHECK (
    public.get_user_roles() && '{admin,accountant}'::text[]
    AND entry_source = 'manual'
  );
