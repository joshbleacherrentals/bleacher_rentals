-- Accountant page: AR and AR Deposits (docs/specs/accountant-quotes-02-accountant-page.md).
--
-- The AR tabs are built on the device from Events, PaymentHistory, PaymentInstallments,
-- EventLineItems, Contacts, Companies and SalesOffices. The accountant reads them through the
-- PowerSync sync, where RLS is not consulted; this migration adds the accountant to the SELECT
-- policies too (spec D10), so the same reads also work through the API.
--
-- Every statement adds 'accountant' to an existing SELECT policy and keeps the rest of its
-- expression. Every INSERT, UPDATE and DELETE policy on these tables is left alone: the
-- accountant reads and writes nothing here. Users (the accountant still reads only driver rows
-- directly) and BleacherEvents are not touched either.
--
-- After this migration the accountant can read ALL rows of these tables through the API, not only
-- through the sync.
--
-- Deploy order: this migration → PowerSync sync rules (+ service restart) → the app. A refused
-- read is an empty result, not an error, so a grant missing here shows up as an AR tab with fewer
-- rows or empty contact columns — supabase/tests/accountant_receivables.test.sql asserts each.

ALTER POLICY events_select ON public."Events"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer,accountant}'::text[]);

ALTER POLICY payment_history_select ON public."PaymentHistory"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY payment_installments_select ON public."PaymentInstallments"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_line_items_select ON public."EventLineItems"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY contacts_select ON public."Contacts"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY companies_select ON public."Companies"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY sales_offices_select ON public."SalesOffices"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);
