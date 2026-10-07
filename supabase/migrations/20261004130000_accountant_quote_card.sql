-- Accountant on the quote card (docs/specs/accountant-quotes-04-accountant-quote-access.md).
--
-- The accountant opens /quotes-bookings/{id}, read-only. The card reads Venues, BleacherTypes,
-- EventChangeLog and EventEmailLog on the device through the PowerSync sync, where RLS is not
-- consulted; this migration adds the accountant to their SELECT policies too, so the same reads
-- also work through the API.
--
-- Every statement adds 'accountant' to an existing SELECT policy and keeps the rest of its
-- expression. Every INSERT, UPDATE and DELETE policy is left alone — in particular
-- event_change_log_insert stays open to every authenticated user, because every change any role
-- makes must be written to the log (spec D10). EventFiles and the event-files storage policies are
-- already open to every authenticated user, so the Files tab needs nothing here.
--
-- After this migration the accountant can read ALL rows of these four tables through the API, not
-- only through the sync.
--
-- Deploy order: this migration → PowerSync sync rules (+ service restart) → the app. A refused
-- read is an empty result, not an error, so a grant missing here shows up as a card with no venue
-- or an empty Log tab — supabase/tests/accountant_quote_card.test.sql asserts each.

ALTER POLICY venues_select ON public."Venues"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY bleacher_types_select ON public."BleacherTypes"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_change_log_select ON public."EventChangeLog"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY rbac_select ON public."EventEmailLog"
  USING (public.get_user_roles() && ARRAY['admin'::text, 'account_manager'::text, 'viewer'::text, 'accountant'::text]);
