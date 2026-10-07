-- Accountant, Stage 2: Work Trackers access (docs/specs/accountant-work-trackers.md).
--
-- The accountant reads the Work Trackers pages, the payment modal, the create-bill route and the
-- driver PDF through the database, and writes the payment group of a week (WorkTrackerGroups)
-- and nothing else. It can NOT create, edit, release or delete a work tracker (spec §0): no
-- WorkTrackers / WorkTrackerLineItems write policy names it, and none is touched here.
--
-- Every statement adds 'accountant' to an existing policy and keeps the rest of its expression.
--
-- Deploy order: this migration → PowerSync sync rules (+ service restart) → the app. A refused
-- read is an empty result, not an error, so a grant missing here shows up as a bill with tax
-- code NON or no QuickBooks Class — supabase/tests/accountant_work_trackers.test.sql asserts each.

-- ── Reads ──────────────────────────────────────────────────────────────────

ALTER POLICY drivers_select ON public."Drivers"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer,accountant}'::text[]);

ALTER POLICY worktrackers_select ON public."WorkTrackers"
  USING (
    public.get_user_roles() && '{admin,account_manager,viewer,maintainer,accountant}'::text[]
    OR (
      public.get_current_driver_id() IS NOT NULL
      AND driver_uuid = public.get_current_driver_id()
    )
  );

ALTER POLICY rbac_select ON public."Addresses"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer,accountant}'::text[]);

ALTER POLICY bleachers_select ON public."Bleachers"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer,accountant}'::text[]);

ALTER POLICY rbac_select ON public."Vendors"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_select ON public."WorkTrackerTypes"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- create-bill: the connection's default tax code, and which QuickBooks account each work
-- tracker type posts to.
ALTER POLICY rbac_select ON public."QboConnections"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_select ON public."WorkTrackerTypeQboAccounts"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- create-bill: the QuickBooks Class on a bill line comes from dropoff state → zone → class
-- (spec D2). Admin-only until now, so a bill created by anyone else goes out without one.
-- Reference data, read only.
ALTER POLICY rbac_select ON public."ZoneQboClasses"
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);

ALTER POLICY rbac_select ON public."Zones"
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);

ALTER POLICY rbac_select ON public."ZoneStateProvinces"
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);

-- ── Payment group of a week: read, create, update. Delete stays admin / account manager ────

ALTER POLICY rbac_select ON public."WorkTrackerGroups"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

-- The payment modal creates the group row when a week has none yet.
ALTER POLICY rbac_insert ON public."WorkTrackerGroups"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_update ON public."WorkTrackerGroups"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- ── Users: the drivers, nobody else ────────────────────────────────────────
-- The pages join Drivers to Users for every name they print, and the PDF and the payment header
-- read the driver's Users row. An accountant has no need of admins' or managers' contact details,
-- so this is not the whole table that account managers and viewers get (spec D4). No is_active
-- filter: an old week's pay still needs the driver's name. The caller's own row is already
-- covered by users_select.
CREATE POLICY users_accountant_select ON public."Users"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    'accountant' = ANY (public.get_user_roles())
    AND EXISTS (SELECT 1 FROM public."Drivers" d WHERE d.user_uuid = "Users".id)
  );
