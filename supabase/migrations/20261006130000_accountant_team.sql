-- An accountant edits a driver's payment info and vendor, and manages vendor companies
-- (docs/specs/accountant-team.md).
--
-- The accountant already READS Drivers, Vendors, Users (drivers only), Addresses, Zones and
-- QboConnections. This migration gives it the writes the Team page needs and nothing more:
--
--   * Drivers: drivers_update gains 'accountant', and a BEFORE UPDATE trigger fences the accountant
--     to the pay and vendor columns. RLS decides on rows, not columns, and Drivers also holds the
--     phone, the address, the vehicle, the documents, the owner, the role flag and the app's
--     telemetry — none of which an accountant may change (spec D1, D2, D3, D6).
--   * DriverPayRanges: read and write (the pay tiers are part of the payment info).
--   * Vendors: create and edit. A delete in the app is an UPDATE of is_active, so no DELETE policy
--     is touched.
--   * Vehicles and DriverZones: read only. The driver page shows the vehicle and the zones of a
--     driver without letting the accountant change them (spec D3, D6).
--
-- Not changed: Users (users_accountant_select stays "drivers only", users_update stays "the user
-- or an admin": the accountant cannot change a name or open a non-driver, spec D2 and D5);
-- drivers_insert and drivers_delete; every write policy of Vehicles, DriverZones and Zones;
-- Addresses; the role tables; the driver's own policies; the other triggers on Drivers.
--
-- Every ALTER POLICY keeps the expression it had and adds one role.
--
-- Deploy order: this migration → PowerSync sync rules (+ service restart) → the app. The reverse
-- order is the bad one: the page would open while the database still refuses, and a vendor UPDATE
-- is filtered out silently, so the edit would look saved and vanish on the next sync.

-- ── Drivers: update, behind a column guard ─────────────────────────────────

ALTER POLICY drivers_update ON public."Drivers"
  USING (
    'admin' = ANY (public.get_user_roles())
    OR (
      'account_manager' = ANY (public.get_user_roles())
      AND (
        account_manager_uuid IS NULL
        OR account_manager_uuid = public.get_current_account_manager_id()
        OR public.user_shares_zone_with_driver(id)
      )
    )
    OR 'accountant' = ANY (public.get_user_roles())
  )
  WITH CHECK (
    'admin' = ANY (public.get_user_roles())
    OR (
      'account_manager' = ANY (public.get_user_roles())
      AND (
        account_manager_uuid IS NULL
        OR account_manager_uuid = public.get_current_account_manager_id()
        OR public.user_shares_zone_with_driver(id)
      )
    )
    OR 'accountant' = ANY (public.get_user_roles())
  );

CREATE OR REPLACE FUNCTION public.guard_drivers_accountant_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  caller_roles text[];
  allowed text[] := ARRAY[
    'tax_dec',
    'tax',
    'pay_rate_cents',
    'pay_currency',
    'pay_per_unit',
    'deadhead_cents',
    'setup_cents',
    'teardown_cents',
    'vendor_uuid'
  ];
BEGIN
  -- Only a request made as a signed-in app user (PostgREST runs those as `authenticated`) is
  -- checked. The service role, migrations, a direct database session and SECURITY DEFINER
  -- functions (which run as their owner) are not users with a role in the permission matrix.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  caller_roles := public.get_user_roles();

  -- An admin or an account manager may change what they could before. Roles are additive, so an
  -- accountant who is also one of them is not fenced (spec D9).
  IF caller_roles && '{admin,account_manager}'::text[] THEN
    RETURN NEW;
  END IF;

  -- Any other role is decided by RLS already: drivers_update names only the three above.
  IF NOT ('accountant' = ANY (caller_roles)) THEN
    RETURN NEW;
  END IF;

  -- The caller's own driver row is governed by the driver's own policy, which this change does not
  -- touch (spec C5). It also keeps the mobile app's updates of a driver who is an accountant too
  -- (app version, phone, documents) working.
  IF OLD.user_uuid = public.get_current_user_uuid() THEN
    RETURN NEW;
  END IF;

  -- The whole row but the allowed columns: a column added to Drivers later is refused until someone
  -- lists it here.
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    -- 42501 is what an RLS refusal raises: the Supabase client reports it as an error, and the
    -- PowerSync upload connector treats it as unrecoverable.
    RAISE EXCEPTION 'An accountant can only change a driver''s payment info, vendor and driver type'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Every column, not `UPDATE OF …`: the point is to see what else changed.
CREATE TRIGGER guard_drivers_accountant_columns
  BEFORE UPDATE
  ON public."Drivers"
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_drivers_accountant_columns();

-- ── DriverPayRanges: the pay tiers, read and write ─────────────────────────

ALTER POLICY driver_pay_ranges_select ON public."DriverPayRanges"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY driver_pay_ranges_insert ON public."DriverPayRanges"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY driver_pay_ranges_update ON public."DriverPayRanges"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY driver_pay_ranges_delete ON public."DriverPayRanges"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- ── Vendors: create and edit ───────────────────────────────────────────────

ALTER POLICY rbac_insert ON public."Vendors"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY rbac_update ON public."Vendors"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- ── Reads only, for the driver page ────────────────────────────────────────

ALTER POLICY rbac_select ON public."Vehicles"
  USING (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY driverzones_select ON public."DriverZones"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);
