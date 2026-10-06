-- An accountant creates, edits and soft-deletes companies, contacts and venues
-- (docs/specs/accountant-address-book.md).
--
-- The accountant already READS all four tables (20261004120000_accountant_receivables.sql for
-- Contacts and Companies, 20261004130000_accountant_quote_card.sql for Venues,
-- 20261001130000_accountant_work_trackers.sql for Addresses). This migration gives it the write side
-- an account manager has, and nothing more:
--
--   * companies_insert / companies_update, contacts_insert / contacts_update,
--     venues_insert / venues_update: the role list becomes {admin, account_manager, accountant}.
--     A soft delete is an UPDATE of "deleted", so the update policy covers it.
--   * rbac_insert / rbac_update on Addresses: the same role list (the spec's D1, option B). A company
--     and a venue each own address rows, and the policy cannot tell which screen wrote a row, so the
--     accountant may insert and update ANY address, as an account manager can, not only the ones a
--     company or a venue points at. Through the app it only reaches those: the pages it can open
--     offer nothing else. The wider rule also lets PowerSync replay the upsert of a brand-new
--     address (which becomes an UPDATE on conflict) before the company or venue that points at it
--     has reached the server.
--
-- Not changed: there is still no DELETE policy on Companies, Contacts or Venues, and rbac_delete on
-- Addresses stays {admin, account_manager}, so a hard delete stays impossible for an accountant;
-- every SELECT policy; the maintainer's and the driver's Addresses policies; the triggers on
-- Contacts and Addresses (recompute_quote_hashes_*, address_history_refresh,
-- work_tracker_event_links_address_refresh) — all SECURITY DEFINER, so they run for the accountant
-- although it cannot write Events or WorkTrackers; every other table.
--
-- Editing a contact or an address that a quote uses recomputes that quote's content and contract
-- hashes and can invalidate a signature the client already gave. That is true today for an admin
-- and an account manager; the accountant now causes it too (spec §9, R2).
--
-- Every statement keeps the expression it had and adds one role.
--
-- Deploy order: this migration → the app. The reverse order lets the page open while the database
-- still refuses: an INSERT is refused loudly (42501), but an UPDATE is filtered out silently and
-- the edit vanishes on the next sync. No sync-rules change: the accountant bucket already selects
-- all four tables.

ALTER POLICY companies_insert ON public."Companies"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY companies_update ON public."Companies"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY contacts_insert ON public."Contacts"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY contacts_update ON public."Contacts"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY venues_insert ON public."Venues"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY venues_update ON public."Venues"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_insert ON public."Addresses"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_update ON public."Addresses"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);
