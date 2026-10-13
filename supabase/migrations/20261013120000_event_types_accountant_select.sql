-- Accountant reads EventTypes (docs/specs/accountant-quotes-04-accountant-quote-access.md).
--
-- A quote's Contract tab shows an "Event Type" line. The accountant can open that tab, but the
-- read policy named only admin, account manager and viewer, so the line would have said
-- "Unknown" on every quote. A refused read is an empty result, not an error.
--
-- Read only: event_types_insert, event_types_update and event_types_delete are not touched, so an
-- accountant still cannot add, rename or delete a type.
--
-- Deploy order: this migration → PowerSync sync rules (+ service restart) → the app. The sync
-- rule is a new accountant stream for EventTypes in br_powersync.
--
-- Test: supabase/tests/event_types_accountant_select.test.sql.

ALTER POLICY event_types_select ON public."EventTypes"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);
