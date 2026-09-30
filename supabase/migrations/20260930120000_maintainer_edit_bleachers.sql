-- Maintainer: may add and edit bleachers on the Assets > Bleachers page.
--
-- Deploy before the app change: a write the database refuses is dropped by the PowerSync upload
-- queue and only shows up as an error toast.

-- Adding a bleacher.
ALTER POLICY bleachers_insert ON public."Bleachers"
  WITH CHECK (public.get_user_roles() && '{admin,maintainer}'::text[]);

-- Editing one — which is also how the page deletes and restores (a soft `deleted` flag, never a
-- row delete, so bleachers_delete stays admin-only).
ALTER POLICY bleachers_update ON public."Bleachers"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

-- Saving a bleacher with a row count nobody has used yet creates that BleacherTypes row first
-- (findOrCreateBleacherType). Without this the type insert is refused and the bleacher, which
-- points at it, goes with it. Insert only: renaming or removing a type stays admin-only.
ALTER POLICY bleacher_types_insert ON public."BleacherTypes"
  WITH CHECK (public.get_user_roles() && '{admin,maintainer}'::text[]);
