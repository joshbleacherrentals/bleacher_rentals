-- Maintainer: write notes in dashboard cells, and change only their own
-- (docs/specs/maintainer-dashboard-cells.md).
--
-- Deploy together with the PowerSync sync rules, before the app change: the app reads
-- Blocks.created_by_user_uuid, and a write the database refuses only shows up as an error toast.

-- ── Blocks: who wrote the note ─────────────────────────────────────────────
-- The default fills the author in from the caller's JWT, so no client has to send it. Existing
-- blocks are NOT backfilled: nobody knows who wrote them, they stay NULL, and a NULL author never
-- equals the caller — so a maintainer cannot change them (an admin or account manager still can).
ALTER TABLE public."Blocks"
  ADD COLUMN IF NOT EXISTS created_by_user_uuid uuid
    REFERENCES public."Users"(id)
    DEFAULT public.get_current_user_uuid();

COMMENT ON COLUMN public."Blocks".created_by_user_uuid IS
  'Who wrote this dashboard note. NULL for notes that predate the column. A maintainer may update or delete only the notes where this is their own user id.';

-- ── Blocks: policies ───────────────────────────────────────────────────────
-- The four rbac_* policies keep governing admin / account manager / viewer. Permissive policies
-- are OR-ed, so the maintainer rules sit beside them instead of loosening the rbac_* write ones.

-- Reading: every block, whoever wrote it.
ALTER POLICY rbac_select ON public."Blocks"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

CREATE POLICY blocks_maintainer_insert ON public."Blocks"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_roles() && '{maintainer}'::text[]
    AND created_by_user_uuid = public.get_current_user_uuid()
  );

-- WITH CHECK as well as USING: a maintainer cannot hand their note to someone else.
CREATE POLICY blocks_maintainer_update ON public."Blocks"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.get_user_roles() && '{maintainer}'::text[]
    AND created_by_user_uuid = public.get_current_user_uuid()
  )
  WITH CHECK (
    public.get_user_roles() && '{maintainer}'::text[]
    AND created_by_user_uuid = public.get_current_user_uuid()
  );

CREATE POLICY blocks_maintainer_delete ON public."Blocks"
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    public.get_user_roles() && '{maintainer}'::text[]
    AND created_by_user_uuid = public.get_current_user_uuid()
  );

-- ── DashboardFilterSettings: the dashboard's first-visit insert ────────────
-- Without these, the maintainer's PowerSync insert is refused on upload, the row is dropped on the
-- next pull, and the client re-inserts in a loop (see 20260602200000 for the viewer). The upload
-- is an upsert, which also needs to see the row — hence the own-row select, because rbac_select
-- does not list the maintainer.
CREATE POLICY maintainer_dashboard_filter_settings_select ON public."DashboardFilterSettings"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    'maintainer' = any(public.get_user_roles())
    AND user_uuid = public.get_current_user_uuid()
  );

CREATE POLICY maintainer_dashboard_filter_settings_insert ON public."DashboardFilterSettings"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    'maintainer' = any(public.get_user_roles())
    AND user_uuid = public.get_current_user_uuid()
  );

CREATE POLICY maintainer_dashboard_filter_settings_update ON public."DashboardFilterSettings"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    'maintainer' = any(public.get_user_roles())
    AND user_uuid = public.get_current_user_uuid()
  )
  WITH CHECK (
    'maintainer' = any(public.get_user_roles())
    AND user_uuid = public.get_current_user_uuid()
  );

-- ── Reads the dashboard grid depends on (read only — no write is added) ────
-- PowerSync reads do not go through RLS, but the dashboard also reads some of these with the
-- Supabase client, where a refusal is an empty result rather than an error.
ALTER POLICY events_select ON public."Events"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

ALTER POLICY bleacher_events_select ON public."BleacherEvents"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

ALTER POLICY worktrackers_select ON public."WorkTrackers"
  USING (
    public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]
    OR (
      public.get_current_driver_id() IS NOT NULL
      AND driver_uuid = public.get_current_driver_id()
    )
  );

ALTER POLICY drivers_select ON public."Drivers"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

ALTER POLICY rbac_select ON public."HomeBases"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

ALTER POLICY storage_locations_select ON public."StorageLocations"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

ALTER POLICY subrental_events_select ON public."SubrentalEvents"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

-- A viewer cannot read this through the database today, so the maintainer is not given more.
ALTER POLICY rbac_select ON public."DriverUnavailability"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
