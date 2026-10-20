-- Maintainer: Assets — saving a bleacher, and the Documents tab.
-- Spec: docs/specs/maintainer-asset-documents.md
--
-- Deploy before the app change and the sync rules: a write the database refuses is dropped by the
-- PowerSync upload queue and only shows up as an error toast.

-- Every PowerSync PUT is uploaded as INSERT ... ON CONFLICT DO UPDATE, which needs the SELECT
-- policy as well as INSERT. Without this the BleacherTypes insert that
-- 20260930120000_maintainer_edit_bleachers.sql opened is still refused (42501), the bleacher
-- pointing at the missing type then fails its foreign key, and the whole save is lost.
-- Renaming or removing a type stays admin-only: no update/delete policy changes.
ALTER POLICY bleacher_types_select ON public."BleacherTypes"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant,maintainer}'::text[]);

-- The Documents tab (driver-app documents). Read, add and edit; NOT delete — rbac_delete is left
-- exactly as it is (admin, account_manager).
ALTER POLICY rbac_select ON public."BlueBook"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."BlueBook"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."BlueBook"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
