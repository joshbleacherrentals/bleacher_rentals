"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildReportCategoriesQuery,
  buildReportsQuery,
  buildRepairBleachersQuery,
  buildRepairsQuery,
  buildServicesQuery,
  type RawRepairBleacherRow,
  type RawRepairRow,
  type RawReportCategoryRow,
  type RawReportRow,
  type RawServiceRow,
} from "../db/repairListQueries";
import { buildRepairRows, type RepairListRow } from "../utils/repairRows";

/**
 * Every repair of the view, with its services, bleachers, zones, vendor, Reported and sums, in the
 * starting order (newest created first). Filters, sorting, the strip and the pager are applied by
 * the page over this whole list. Reactive: it re-runs when any of the five tables changes.
 *
 * `showDeleted` switches between the live repairs and the deleted ones; `timezone` is the app
 * time zone that every day is taken in. `isLoading` is true until all five queries have answered.
 * docs/specs/repairs-03-list-query.md §5.
 */
export function useRepairList(params: { showDeleted: boolean; timezone: string }): {
  rows: RepairListRow[];
  isLoading: boolean;
} {
  const { showDeleted, timezone } = params;

  const repairsCompiled = useMemo(() => buildRepairsQuery({ showDeleted }), [showDeleted]);
  const servicesCompiled = useMemo(() => buildServicesQuery({ showDeleted }), [showDeleted]);
  const bleachersCompiled = useMemo(
    () => buildRepairBleachersQuery({ showDeleted }),
    [showDeleted],
  );
  const reportsCompiled = useMemo(() => buildReportsQuery(), []);
  const categoriesCompiled = useMemo(() => buildReportCategoriesQuery(), []);

  const repairs = useTypedQuery(repairsCompiled, expect<RawRepairRow>());
  const services = useTypedQuery(servicesCompiled, expect<RawServiceRow>());
  const bleachers = useTypedQuery(bleachersCompiled, expect<RawRepairBleacherRow>());
  const reports = useTypedQuery(reportsCompiled, expect<RawReportRow>());
  const reportCategories = useTypedQuery(categoriesCompiled, expect<RawReportCategoryRow>());

  const isLoading =
    repairs.isLoading ||
    services.isLoading ||
    bleachers.isLoading ||
    reports.isLoading ||
    reportCategories.isLoading;

  const rows = useMemo(
    () =>
      isLoading
        ? []
        : buildRepairRows(
            {
              repairs: repairs.data ?? [],
              services: services.data ?? [],
              bleachers: bleachers.data ?? [],
              reports: reports.data ?? [],
              reportCategories: reportCategories.data ?? [],
            },
            timezone,
          ),
    [
      isLoading,
      repairs.data,
      services.data,
      bleachers.data,
      reports.data,
      reportCategories.data,
      timezone,
    ],
  );

  return { rows, isLoading };
}
