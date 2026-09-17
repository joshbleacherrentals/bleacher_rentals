-- ============================================================================
-- Tests for Pricing Matrix: roof_type enum + column on BleacherTypes
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(1);

DO $$
DECLARE
  v_count   INTEGER;
  bt_id     UUID;
  v_roof    TEXT;
BEGIN
  RAISE NOTICE '--- pricing matrix tests ---';

  -- T1: roof_type enum exists
  SELECT count(*) INTO v_count FROM pg_type WHERE typname = 'roof_type';
  ASSERT v_count = 1, 'T1 FAIL: roof_type enum should exist';
  RAISE NOTICE 'T1 roof_type enum exists ✓';

  -- T2: BleacherTypes.roof_type column exists
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'BleacherTypes' AND column_name = 'roof_type';
  ASSERT v_count = 1, 'T2 FAIL: roof_type column should exist on BleacherTypes';
  RAISE NOTICE 'T2 BleacherTypes.roof_type column exists ✓';

  -- T3: Default is 'none'
  INSERT INTO "BleacherTypes" (name, row_count)
  VALUES ('Test Type', 5)
  RETURNING id, roof_type::text INTO bt_id, v_roof;
  ASSERT v_roof = 'none', format('T3 FAIL: default roof_type should be none, got %s', v_roof);
  RAISE NOTICE 'T3 roof_type default = none ✓';

  -- T4: Can set to canopy
  UPDATE "BleacherTypes" SET roof_type = 'canopy' WHERE id = bt_id;
  SELECT roof_type::text INTO v_roof FROM "BleacherTypes" WHERE id = bt_id;
  ASSERT v_roof = 'canopy', format('T4 FAIL: should be canopy, got %s', v_roof);
  RAISE NOTICE 'T4 roof_type = canopy ✓';

  -- T5: Invalid roof_type fails
  BEGIN
    EXECUTE format('UPDATE "BleacherTypes" SET roof_type = %L WHERE id = %L', 'flat', bt_id);
    RAISE EXCEPTION 'T5 FAIL: invalid roof_type should be rejected';
  EXCEPTION WHEN invalid_text_representation OR check_violation THEN
    RAISE NOTICE 'T5 invalid roof_type rejected ✓';
  END;

  -- T6: Soft delete works
  UPDATE "BleacherTypes" SET deleted = true WHERE id = bt_id;
  SELECT count(*) INTO v_count FROM "BleacherTypes" WHERE id = bt_id AND deleted = true;
  ASSERT v_count = 1, 'T6 FAIL: soft delete should work';
  RAISE NOTICE 'T6 soft delete works ✓';

  -- T7: Prices table has expected structure
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'Prices' AND column_name IN (
    'id', 'price_duration_uuid', 'bleacher_type_uuid', 'event_type_uuid', 'price_cents', 'currency', 'deleted'
  );
  ASSERT v_count = 7, format('T7 FAIL: expected 7 Prices columns, got %s', v_count);
  RAISE NOTICE 'T7 Prices table structure correct ✓';

  -- T8: BleacherTypes.description is a nullable text column
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'BleacherTypes' AND column_name = 'description'
    AND data_type = 'text' AND is_nullable = 'YES';
  ASSERT v_count = 1, 'T8 FAIL: BleacherTypes.description should be a nullable text column';
  RAISE NOTICE 'T8 BleacherTypes.description is nullable text ✓';

  -- Cleanup
  DELETE FROM "BleacherTypes" WHERE id = bt_id;

  RAISE NOTICE '--- all pricing matrix tests passed ---';
END;
$$;

SELECT pass('Pricing matrix tests completed');
SELECT * FROM finish();
ROLLBACK;
