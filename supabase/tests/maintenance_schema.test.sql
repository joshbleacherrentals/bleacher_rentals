-- ============================================================================
-- Tests for the Maintenance schema: invoices, line items, damage categories,
-- budgets, the new Vendors / Bleachers columns and the rights on them.
-- Migration: 20261117120000_maintenance_schema.sql
-- Spec:      docs/specs/maintenance-01-database-schema.md (section 6)
-- ============================================================================
-- Run against a local Supabase DB after migrations are applied:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/maintenance_schema.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the three enums and the nine start categories;
--   * the invoice total: cost_cents follows the lines (insert, soft delete, delete, a line
--     moved to another invoice) and an invoice that never had lines keeps its own number;
--   * the invoice number is unique within a vendor (not across vendors, not for deleted
--     events, not for events without a number or a vendor);
--   * a new event is inbound and USD;
--   * a repeated (report, category) pair is a silent no-op, and report_resolved_at follows
--     the report when it is resolved and reopened;
--   * one budget per (year, currency); amounts and the asset value cannot be negative;
--   * the rights of admin, account_manager, viewer, maintainer, developer, accountant and a
--     driver on every new table and on Vendors (spec section 3).
-- The one-time step of the migration (past events become completed, every event USD) is
-- checked by a dry run in a rolled-back transaction, not here: after the migration there is
-- no row left for it to change.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(1);

DO $$
DECLARE
  r_names  TEXT[] := ARRAY['admin','account_manager','viewer','maintainer','developer','accountant','driver'];
  r_user   UUID[] := ARRAY[]::UUID[];
  r_report UUID[] := ARRAY[]::UUID[];
  r_vendor UUID[] := ARRAY[]::UUID[];
  r_line   UUID[] := ARRAY[]::UUID[];
  r_drc    UUID[] := ARRAY[]::UUID[];

  -- Expected outcomes per role, in the order of r_names (1 = allowed / sees rows).
  x_cat_read     INT[] := ARRAY[1,1,1,1,0,0,1];
  x_cat_insert   INT[] := ARRAY[1,0,0,1,0,0,0];
  x_cat_update   INT[] := ARRAY[1,0,0,1,0,0,0];
  x_drc_read     INT[] := ARRAY[1,1,0,1,0,0,1];
  x_drc_insert   INT[] := ARRAY[1,1,0,1,0,0,1];
  x_drc_delete   INT[] := ARRAY[1,1,0,1,0,0,0];
  x_line_read    INT[] := ARRAY[1,1,1,1,0,0,0];
  x_line_insert  INT[] := ARRAY[1,1,0,1,0,0,0];
  x_line_delete  INT[] := ARRAY[1,1,0,1,0,0,0];
  x_budget_read  INT[] := ARRAY[1,1,1,1,0,0,0];
  x_budget_insert INT[] := ARRAY[1,0,0,1,0,0,0];
  x_vendor_read  INT[] := ARRAY[1,1,0,1,0,1,0];
  x_vendor_insert INT[] := ARRAY[1,1,0,1,0,1,0];
  x_vendor_delete INT[] := ARRAY[1,1,0,0,0,0,0];

  v_uid      UUID;
  v_name     TEXT;
  v_bleacher UUID;
  v_cat      UUID;
  v_cat2     UUID;
  v_cat3     UUID;
  v_vendor1  UUID;
  v_vendor2  UUID;
  v_ev       UUID;
  v_ev2      UUID;
  v_ev3      UUID;
  v_rep      UUID;
  v_li       UUID;
  v_cost     INTEGER;
  v_n        INTEGER;
  v_ok       BOOLEAN;
  v_resolved TIMESTAMPTZ;
  i          INTEGER;
BEGIN
  RAISE NOTICE '--- Maintenance schema tests ---';

  -- ==========================================================================
  -- SETUP (as postgres, bypassing RLS)
  -- ==========================================================================
  FOR i IN 1..array_length(r_names, 1) LOOP
    v_name := r_names[i];
    INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
    VALUES ('MNT', v_name, 'mnt_' || v_name || '@test.com', 'clerk_mnt_' || v_name,
            v_name = 'admin', v_name = 'viewer')
    RETURNING id INTO v_uid;
    r_user := r_user || v_uid;

    IF v_name = 'account_manager' THEN
      INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (v_uid, true);
    ELSIF v_name = 'maintainer' THEN
      INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (v_uid, true);
    ELSIF v_name = 'developer' THEN
      INSERT INTO public."Developers" (user_uuid, is_active) VALUES (v_uid, true);
    ELSIF v_name = 'accountant' THEN
      INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (v_uid, true);
    ELSIF v_name = 'driver' THEN
      INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (v_uid, true);
    END IF;
  END LOOP;

  INSERT INTO public."Bleachers" (bleacher_number, bleacher_rows, bleacher_seats)
  VALUES (32001, 5, 50) RETURNING id INTO v_bleacher;

  SELECT id INTO v_cat  FROM public."DamageCategories" WHERE name = 'Welding';
  SELECT id INTO v_cat2 FROM public."DamageCategories" WHERE name = 'Tires';
  SELECT id INTO v_cat3 FROM public."DamageCategories" WHERE name = 'Jacks';

  INSERT INTO public."Vendors" (display_name) VALUES ('MNT Vendor 1') RETURNING id INTO v_vendor1;
  INSERT INTO public."Vendors" (display_name) VALUES ('MNT Vendor 2') RETURNING id INTO v_vendor2;

  -- ==========================================================================
  -- DATA TESTS (as postgres)
  -- ==========================================================================

  -- T1: the three enums have the agreed values, in order
  ASSERT (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
            WHERE enumtypid = 'public.maintenance_severity'::regtype)
         = ARRAY['minor','major','routine'], 'T1 maintenance_severity values';
  ASSERT (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
            WHERE enumtypid = 'public.repair_status'::regtype)
         = ARRAY['inbound','triaged','waiting_repair','in_repair','confirm_repair','completed'],
         'T1 repair_status values';
  ASSERT (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
            WHERE enumtypid = 'public.vendor_status'::regtype)
         = ARRAY['verified','caution','under_review','prospect','do_not_use'],
         'T1 vendor_status values';
  RAISE NOTICE 'TEST 1 (enums have the agreed values) ✓';

  -- T2: the nine start categories exist, a repeated name is refused
  ASSERT (SELECT count(*) FROM public."DamageCategories"
            WHERE name IN ('Tires','Wiring','Jacks','Hydraulics','Welding','Batteries',
                           'Seating','Hauling','Unassigned') AND is_active) = 9,
         'T2 nine start categories';
  BEGIN
    INSERT INTO public."DamageCategories" (name) VALUES ('Welding');
    ASSERT false, 'T2 a repeated category name should have been refused';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RAISE NOTICE 'TEST 2 (start categories, name is unique) ✓';

  -- T3: a negative amount on a line is refused
  INSERT INTO public."MaintenanceEvents" (event_start, event_end, cost_cents, vendor_uuid, invoice_number, currency)
  VALUES (current_date, current_date, 500, v_vendor1, 'INV-1', 'CAD') RETURNING id INTO v_ev;
  BEGIN
    INSERT INTO public."MaintenanceLineItems" (maintenance_event_uuid, bleacher_uuid, severity, labor_cents)
    VALUES (v_ev, v_bleacher, 'minor', -1);
    ASSERT false, 'T3 a negative amount should have been refused';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE 'TEST 3 (a negative line amount is refused) ✓';

  -- T4: the invoice total follows the lines
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev;
  ASSERT v_cost = 500, format('T4a an invoice with no lines keeps its own cost_cents: got %s', v_cost);

  INSERT INTO public."MaintenanceLineItems"
    (maintenance_event_uuid, bleacher_uuid, damage_category_uuid, severity,
     labor_cents, parts_cents, tax_cents, freight_cents)
  VALUES (v_ev, v_bleacher, v_cat, 'major', 1000, 2000, 300, 100) RETURNING id INTO v_li;
  INSERT INTO public."MaintenanceLineItems" (maintenance_event_uuid, bleacher_uuid, severity, labor_cents)
  VALUES (v_ev, v_bleacher, 'minor', 50);
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev;
  ASSERT v_cost = 3450, format('T4b two lines: expected 3450, got %s', v_cost);

  UPDATE public."MaintenanceLineItems" SET deleted = true
   WHERE maintenance_event_uuid = v_ev AND severity = 'minor';
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev;
  ASSERT v_cost = 3400, format('T4c a soft-deleted line leaves the sum: expected 3400, got %s', v_cost);

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, cost_cents)
  VALUES (current_date, current_date, 0) RETURNING id INTO v_ev2;
  INSERT INTO public."MaintenanceLineItems" (maintenance_event_uuid, bleacher_uuid, severity, labor_cents)
  VALUES (v_ev2, v_bleacher, 'minor', 100);
  UPDATE public."MaintenanceLineItems" SET maintenance_event_uuid = v_ev2 WHERE id = v_li;
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev;
  ASSERT v_cost = 0, format('T4d a line moved away: old invoice expected 0, got %s', v_cost);
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev2;
  ASSERT v_cost = 3500, format('T4d a line moved in: new invoice expected 3500, got %s', v_cost);

  DELETE FROM public."MaintenanceLineItems" WHERE maintenance_event_uuid = v_ev2;
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev2;
  ASSERT v_cost = 0, format('T4e all lines deleted: expected 0, got %s', v_cost);

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, cost_cents)
  VALUES (current_date, current_date, 777) RETURNING id INTO v_ev3;
  SELECT cost_cents INTO v_cost FROM public."MaintenanceEvents" WHERE id = v_ev3;
  ASSERT v_cost = 777, format('T4f an invoice that never had lines is untouched: got %s', v_cost);
  RAISE NOTICE 'TEST 4 (cost_cents follows the lines) ✓';

  -- T5: invoice number is unique within a vendor
  BEGIN
    INSERT INTO public."MaintenanceEvents" (event_start, event_end, vendor_uuid, invoice_number)
    VALUES (current_date, current_date, v_vendor1, 'INV-1');
    ASSERT false, 'T5a the same vendor and number should have been refused';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, vendor_uuid, invoice_number)
  VALUES (current_date, current_date, v_vendor2, 'INV-1');   -- other vendor: allowed

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, invoice_number)
  VALUES (current_date, current_date, 'NO-VENDOR');
  INSERT INTO public."MaintenanceEvents" (event_start, event_end, invoice_number)
  VALUES (current_date, current_date, 'NO-VENDOR');          -- no vendor: not constrained

  INSERT INTO public."MaintenanceEvents" (event_start, event_end, vendor_uuid)
  VALUES (current_date, current_date, v_vendor1);
  INSERT INTO public."MaintenanceEvents" (event_start, event_end, vendor_uuid)
  VALUES (current_date, current_date, v_vendor1);            -- no number: not constrained

  UPDATE public."MaintenanceEvents" SET deleted = true WHERE id = v_ev;
  INSERT INTO public."MaintenanceEvents" (event_start, event_end, vendor_uuid, invoice_number)
  VALUES (current_date, current_date, v_vendor1, 'INV-1');   -- first one deleted: reusable
  RAISE NOTICE 'TEST 5 (invoice number is unique within a vendor) ✓';

  -- T6: a new event is inbound and USD
  INSERT INTO public."MaintenanceEvents" (event_start, event_end) VALUES (current_date, current_date)
  RETURNING id INTO v_ev3;
  ASSERT (SELECT status FROM public."MaintenanceEvents" WHERE id = v_ev3) = 'inbound',
         'T6 default status is inbound';
  ASSERT (SELECT currency FROM public."MaintenanceEvents" WHERE id = v_ev3) = 'USD',
         'T6 default currency is USD';
  RAISE NOTICE 'TEST 6 (a new event is inbound and USD) ✓';

  -- T7: a repeated category on a report is a no-op, the mirror follows the report
  INSERT INTO public."DamageReports" (bleacher_uuid, created_by_user_uuid)
  VALUES (v_bleacher, r_user[7]) RETURNING id INTO v_rep;
  INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid) VALUES (v_rep, v_cat);
  INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid) VALUES (v_rep, v_cat);
  SELECT count(*) INTO v_n FROM public."DamageReportCategories" WHERE damage_report_uuid = v_rep;
  ASSERT v_n = 1, format('T7a a repeated pair leaves one row, got %s', v_n);
  INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid) VALUES (v_rep, v_cat2);
  SELECT count(*) INTO v_n FROM public."DamageReportCategories" WHERE damage_report_uuid = v_rep;
  ASSERT v_n = 2, format('T7b a second category is kept, got %s', v_n);

  ASSERT (SELECT bool_and(report_resolved_at IS NULL) FROM public."DamageReportCategories"
            WHERE damage_report_uuid = v_rep), 'T7c an open report has a null mirror';
  UPDATE public."DamageReports" SET resolved_at = now() WHERE id = v_rep;
  SELECT resolved_at INTO v_resolved FROM public."DamageReports" WHERE id = v_rep;
  ASSERT (SELECT bool_and(report_resolved_at = v_resolved) FROM public."DamageReportCategories"
            WHERE damage_report_uuid = v_rep), 'T7d the mirror follows a resolved report';
  UPDATE public."DamageReports" SET resolved_at = NULL WHERE id = v_rep;
  ASSERT (SELECT bool_and(report_resolved_at IS NULL) FROM public."DamageReportCategories"
            WHERE damage_report_uuid = v_rep), 'T7e the mirror follows a reopened report';
  RAISE NOTICE 'TEST 7 (category pairs and the report_resolved_at mirror) ✓';

  -- T8: one budget per (year, currency); no negative amount
  INSERT INTO public."MaintenanceBudgets" (year, currency, amount_cents) VALUES (2999, 'USD', 100);
  INSERT INTO public."MaintenanceBudgets" (year, currency, amount_cents) VALUES (2999, 'CAD', 100);
  BEGIN
    INSERT INTO public."MaintenanceBudgets" (year, currency, amount_cents) VALUES (2999, 'USD', 200);
    ASSERT false, 'T8a the same year and currency should have been refused';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public."MaintenanceBudgets" (year, currency, amount_cents) VALUES (2998, 'USD', -1);
    ASSERT false, 'T8b a negative amount should have been refused';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE 'TEST 8 (budgets: unique per year and currency, no negative) ✓';

  -- T9: a negative asset value is refused
  UPDATE public."Bleachers" SET asset_value_cents = 2000000, model_number = 'TSP15-450' WHERE id = v_bleacher;
  BEGIN
    UPDATE public."Bleachers" SET asset_value_cents = -1 WHERE id = v_bleacher;
    ASSERT false, 'T9 a negative asset value should have been refused';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE 'TEST 9 (asset value cannot be negative) ✓';

  -- ==========================================================================
  -- RIGHTS (as authenticated, one role at a time)
  -- ==========================================================================
  -- Rows each role will try to change or delete: one per role, made as postgres.
  FOR i IN 1..array_length(r_names, 1) LOOP
    INSERT INTO public."DamageReports" (bleacher_uuid, created_by_user_uuid)
    VALUES (v_bleacher, r_user[i]) RETURNING id INTO v_rep;
    r_report := r_report || v_rep;

    INSERT INTO public."Vendors" (display_name) VALUES ('MNT del ' || r_names[i]) RETURNING id INTO v_uid;
    r_vendor := r_vendor || v_uid;

    INSERT INTO public."MaintenanceLineItems" (maintenance_event_uuid, bleacher_uuid, severity)
    VALUES (v_ev3, v_bleacher, 'minor') RETURNING id INTO v_uid;
    r_line := r_line || v_uid;

    INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid)
    VALUES (r_report[i], v_cat) RETURNING id INTO v_uid;
    r_drc := r_drc || v_uid;
  END LOOP;

  FOR i IN 1..array_length(r_names, 1) LOOP
    v_name := r_names[i];
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', 'clerk_mnt_' || v_name)::text, true);

    -- DamageCategories
    SELECT count(*) INTO v_n FROM public."DamageCategories";
    ASSERT (v_n > 0) = (x_cat_read[i] = 1), format('R %s read DamageCategories: got %s rows', v_name, v_n);

    BEGIN
      INSERT INTO public."DamageCategories" (name) VALUES ('MNT cat ' || v_name);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    ASSERT v_ok = (x_cat_insert[i] = 1), format('R %s insert DamageCategories: got %s', v_name, v_ok);

    UPDATE public."DamageCategories" SET is_active = true WHERE name = 'Tires';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = x_cat_update[i], format('R %s update DamageCategories: got %s rows', v_name, v_n);

    DELETE FROM public."DamageCategories" WHERE name = 'Tires';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = 0, format('R %s delete DamageCategories: nobody may, got %s rows', v_name, v_n);

    -- DamageReportCategories
    SELECT count(*) INTO v_n FROM public."DamageReportCategories";
    ASSERT (v_n > 0) = (x_drc_read[i] = 1), format('R %s read DamageReportCategories: got %s rows', v_name, v_n);

    BEGIN
      INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid)
      VALUES (r_report[i], v_cat2);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    ASSERT v_ok = (x_drc_insert[i] = 1), format('R %s insert DamageReportCategories on own report: got %s', v_name, v_ok);

    -- The next role's report, with a pair nobody else uses: a repeated pair is dropped by a
    -- trigger before the policy is checked, so a clashing pair would hide a refusal.
    BEGIN
      INSERT INTO public."DamageReportCategories" (damage_report_uuid, damage_category_uuid)
      VALUES (r_report[(i % array_length(r_names, 1)) + 1], v_cat3);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    -- A driver may not file on someone else's report; staff may.
    ASSERT v_ok = (x_drc_insert[i] = 1 AND v_name <> 'driver'),
           format('R %s insert DamageReportCategories on another report: got %s', v_name, v_ok);

    DELETE FROM public."DamageReportCategories" WHERE id = r_drc[i];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = x_drc_delete[i], format('R %s delete DamageReportCategories: got %s rows', v_name, v_n);

    -- MaintenanceLineItems
    SELECT count(*) INTO v_n FROM public."MaintenanceLineItems";
    ASSERT (v_n > 0) = (x_line_read[i] = 1), format('R %s read MaintenanceLineItems: got %s rows', v_name, v_n);

    BEGIN
      INSERT INTO public."MaintenanceLineItems" (maintenance_event_uuid, bleacher_uuid, severity)
      VALUES (v_ev3, v_bleacher, 'minor');
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    ASSERT v_ok = (x_line_insert[i] = 1), format('R %s insert MaintenanceLineItems: got %s', v_name, v_ok);

    DELETE FROM public."MaintenanceLineItems" WHERE id = r_line[i];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = x_line_delete[i], format('R %s delete MaintenanceLineItems: got %s rows', v_name, v_n);

    -- MaintenanceBudgets
    SELECT count(*) INTO v_n FROM public."MaintenanceBudgets";
    ASSERT (v_n > 0) = (x_budget_read[i] = 1), format('R %s read MaintenanceBudgets: got %s rows', v_name, v_n);

    BEGIN
      INSERT INTO public."MaintenanceBudgets" (year, currency, amount_cents) VALUES (3000 + i, 'USD', 1);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    ASSERT v_ok = (x_budget_insert[i] = 1), format('R %s insert MaintenanceBudgets: got %s', v_name, v_ok);

    DELETE FROM public."MaintenanceBudgets" WHERE year = 2999;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = 0, format('R %s delete MaintenanceBudgets: nobody may, got %s rows', v_name, v_n);

    -- Vendors
    SELECT count(*) INTO v_n FROM public."Vendors";
    ASSERT (v_n > 0) = (x_vendor_read[i] = 1), format('R %s read Vendors: got %s rows', v_name, v_n);

    BEGIN
      INSERT INTO public."Vendors" (display_name) VALUES ('MNT new ' || v_name);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
    END;
    ASSERT v_ok = (x_vendor_insert[i] = 1), format('R %s insert Vendors: got %s', v_name, v_ok);

    DELETE FROM public."Vendors" WHERE id = r_vendor[i];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = x_vendor_delete[i], format('R %s delete Vendors: got %s rows', v_name, v_n);

    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'TEST 10 (rights of the seven roles on every new table and on Vendors) ✓';

  RAISE NOTICE '--- all Maintenance schema tests passed ---';
END;
$$;

SELECT ok(true, 'all assertions passed');
SELECT * FROM finish();

ROLLBACK;
