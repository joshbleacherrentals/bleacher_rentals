-- Maintainer: full CRUD on Damage Reports and Maintenance Events (docs/specs/maintainer-damage-and-maintenance.md).
--
-- Deploy together with the PowerSync sync rules, before the app change: a write the database
-- refuses is dropped by the PowerSync upload queue and only shows as an error toast.

-- ── Damage reports ──────────────────────────────────────────────────────────
ALTER POLICY rbac_select ON public."DamageReports"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."DamageReports"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."DamageReports"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_delete ON public."DamageReports"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

ALTER POLICY rbac_select ON public."DamageReportPhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."DamageReportPhotos"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."DamageReportPhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_delete ON public."DamageReportPhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

-- Acknowledging stays a driver/admin action; a maintainer only reads them.
ALTER POLICY damage_report_acks_select ON public."DamageReportAcknowledgements"
  USING (
    public.get_current_driver_id() IS NOT NULL
    OR public.get_user_roles() && '{admin,account_manager,developer,viewer,maintainer}'::text[]
  );

-- The driver fence lets these roles change any column. Without `maintainer` here, someone who is
-- both a maintainer and a driver would be limited to the "fixed" columns.
CREATE OR REPLACE FUNCTION public.damage_reports_driver_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- The database writing its own derived columns — see above. Checked first,
  -- because it is true regardless of who is signed in.
  if coalesce(current_setting('app.server_write', true), 'off') = 'on' then
    return new;
  end if;

  if public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[] then
    return new;
  end if;

  if public.get_current_driver_id() is null then
    return new;
  end if;

  if (to_jsonb(new) - 'fixed_by_driver' - 'fixed_at' - 'fixed_by_user_uuid')
     is distinct from
     (to_jsonb(old) - 'fixed_by_driver' - 'fixed_at' - 'fixed_by_user_uuid')
  then
    raise exception
      'A driver may only change fixed_by_driver / fixed_at / fixed_by_user_uuid on a damage report';
  end if;

  return new;
end;
$function$;

-- ── Maintenance events ──────────────────────────────────────────────────────
ALTER POLICY maint_events_select ON public."MaintenanceEvents"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);
ALTER POLICY maint_events_insert ON public."MaintenanceEvents"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY maint_events_update ON public."MaintenanceEvents"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY maint_events_delete ON public."MaintenanceEvents"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

ALTER POLICY bleacher_maint_events_select ON public."BleacherMaintEvents"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);
ALTER POLICY bleacher_maint_events_insert ON public."BleacherMaintEvents"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY bleacher_maint_events_update ON public."BleacherMaintEvents"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY bleacher_maint_events_delete ON public."BleacherMaintEvents"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

ALTER POLICY rbac_select ON public."MaintenancePhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."MaintenancePhotos"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."MaintenancePhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_delete ON public."MaintenancePhotos"
  USING (public.get_user_roles() && '{admin,account_manager,maintainer}'::text[]);

-- ── Reads the two pages depend on ───────────────────────────────────────────
-- Bleachers: read only. The forms list bleachers; editing them stays admin/AM.
ALTER POLICY bleachers_select ON public."Bleachers"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

-- Addresses: a repair has its own address. A maintainer can read addresses and add new ones, but
-- can only change or remove an address that a maintenance event points at — never a customer's.
ALTER POLICY rbac_select ON public."Addresses"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,maintainer}'::text[]);

CREATE POLICY maintainer_addresses_insert ON public."Addresses"
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_roles() && '{maintainer}'::text[]);

CREATE POLICY maintainer_addresses_update ON public."Addresses"
  FOR UPDATE TO authenticated
  USING (
    public.get_user_roles() && '{maintainer}'::text[]
    AND EXISTS (SELECT 1 FROM public."MaintenanceEvents" me WHERE me.address_uuid = "Addresses".id)
  );

CREATE POLICY maintainer_addresses_delete ON public."Addresses"
  FOR DELETE TO authenticated
  USING (
    public.get_user_roles() && '{maintainer}'::text[]
    AND EXISTS (SELECT 1 FROM public."MaintenanceEvents" me WHERE me.address_uuid = "Addresses".id)
  );
