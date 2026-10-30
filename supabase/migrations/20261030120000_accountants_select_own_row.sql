-- A user reads their own row of "Accountants".
--
-- The API routes decide a user's roles on the server (resolveUserAccessForRequest) by reading
-- "Users" together with "Accountants" under RLS. rbac_select on "Accountants" names only the
-- admin, so for a user who is an accountant and not an admin the row came back empty, the user had
-- no roles, and every route guarded by requireAdminOrAccountant answered 403 Forbidden (for
-- example "Create invoice"). The screen looked fine because it reads roles from PowerSync, not
-- from this query.
--
-- Added next to rbac_select, which is not touched: the admin still reads every row. A refused read
-- is an empty result, so nothing else changes for anyone. Insert, update and delete stay admin only.
--
-- No sync rule change: PowerSync does not go through RLS.

drop policy if exists "accountants_select_own" on public."Accountants";
create policy "accountants_select_own" on public."Accountants"
  as permissive for select to authenticated
  using (
    user_uuid in (
      select u.id from public."Users" u
      where u.clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );
