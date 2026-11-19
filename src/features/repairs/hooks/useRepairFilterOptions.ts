"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildBleacherOptionsQuery,
  buildCategoryOptionsQuery,
  buildVendorOptionsQuery,
  buildZoneOptionsQuery,
  type RawBleacherOption,
  type RawCategoryOption,
  type RawVendorOption,
  type RawZoneOption,
} from "../db/repairFilterQueries";
import { buildRepairFilterOptions, type RepairFilterOptions } from "../utils/repairFilters";

/**
 * What the four filters of the Repairs page list: the bleachers, zones, vendors and categories,
 * from the local database, in the order of D77. Reactive. `isLoading` is true until all four
 * queries have answered; until then the lists are empty.
 * docs/specs/repairs-05-toolbar.md §3.
 */
export function useRepairFilterOptions(): { options: RepairFilterOptions; isLoading: boolean } {
  const bleacherQuery = useMemo(() => buildBleacherOptionsQuery(), []);
  const zoneQuery = useMemo(() => buildZoneOptionsQuery(), []);
  const vendorQuery = useMemo(() => buildVendorOptionsQuery(), []);
  const categoryQuery = useMemo(() => buildCategoryOptionsQuery(), []);

  const bleachers = useTypedQuery(bleacherQuery, expect<RawBleacherOption>());
  const zones = useTypedQuery(zoneQuery, expect<RawZoneOption>());
  const vendors = useTypedQuery(vendorQuery, expect<RawVendorOption>());
  const categories = useTypedQuery(categoryQuery, expect<RawCategoryOption>());

  const isLoading =
    bleachers.isLoading || zones.isLoading || vendors.isLoading || categories.isLoading;

  const options = useMemo(
    () =>
      buildRepairFilterOptions({
        bleachers: bleachers.data ?? [],
        zones: zones.data ?? [],
        vendors: vendors.data ?? [],
        categories: categories.data ?? [],
      }),
    [bleachers.data, zones.data, vendors.data, categories.data],
  );

  return { options, isLoading };
}
