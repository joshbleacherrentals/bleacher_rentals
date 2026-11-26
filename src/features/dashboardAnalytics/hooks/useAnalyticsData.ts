"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildAnalyticsBleachersQuery,
  buildAnalyticsBudgetsQuery,
  buildAnalyticsCategoriesQuery,
  buildAnalyticsRepairBleachersQuery,
  buildAnalyticsRepairsQuery,
  buildAnalyticsServicesQuery,
  buildAnalyticsVendorsQuery,
  buildAnalyticsZonesQuery,
  type RawAnalyticsBleacher,
  type RawAnalyticsBudget,
  type RawAnalyticsCategory,
  type RawAnalyticsRepair,
  type RawAnalyticsRepairBleacher,
  type RawAnalyticsService,
  type RawAnalyticsVendor,
  type RawAnalyticsZone,
} from "../db/analyticsQueries";
import type {
  AnalyticsInputs,
  AnalyticsRepair,
  AnalyticsService,
  RepairStatus,
} from "../utils/analyticsTypes";

/**
 * What the page reads: the eight local tables turned into the inputs of `buildAnalytics`. A null
 * amount is 0, a null flag is false and a null text is empty. Reactive: a change of any of the
 * eight tables re-runs it. `isLoading` is true until all eight queries have answered; until then
 * the lists that have not answered are empty.
 * docs/specs/dashboard-analytics-04-data-numbers.md §2.1.
 */
export function useAnalyticsData(): { inputs: AnalyticsInputs; isLoading: boolean } {
  const repairsQuery = useMemo(() => buildAnalyticsRepairsQuery(), []);
  const servicesQuery = useMemo(() => buildAnalyticsServicesQuery(), []);
  const repairBleachersQuery = useMemo(() => buildAnalyticsRepairBleachersQuery(), []);
  const bleachersQuery = useMemo(() => buildAnalyticsBleachersQuery(), []);
  const zonesQuery = useMemo(() => buildAnalyticsZonesQuery(), []);
  const vendorsQuery = useMemo(() => buildAnalyticsVendorsQuery(), []);
  const categoriesQuery = useMemo(() => buildAnalyticsCategoriesQuery(), []);
  const budgetsQuery = useMemo(() => buildAnalyticsBudgetsQuery(), []);

  const repairs = useTypedQuery(repairsQuery, expect<RawAnalyticsRepair>());
  const services = useTypedQuery(servicesQuery, expect<RawAnalyticsService>());
  const repairBleachers = useTypedQuery(repairBleachersQuery, expect<RawAnalyticsRepairBleacher>());
  const bleachers = useTypedQuery(bleachersQuery, expect<RawAnalyticsBleacher>());
  const zones = useTypedQuery(zonesQuery, expect<RawAnalyticsZone>());
  const vendors = useTypedQuery(vendorsQuery, expect<RawAnalyticsVendor>());
  const categories = useTypedQuery(categoriesQuery, expect<RawAnalyticsCategory>());
  const budgets = useTypedQuery(budgetsQuery, expect<RawAnalyticsBudget>());

  const isLoading =
    repairs.isLoading ||
    services.isLoading ||
    repairBleachers.isLoading ||
    bleachers.isLoading ||
    zones.isLoading ||
    vendors.isLoading ||
    categories.isLoading ||
    budgets.isLoading;

  const inputs = useMemo(
    () =>
      buildAnalyticsInputs({
        repairs: repairs.data ?? [],
        services: services.data ?? [],
        repairBleachers: repairBleachers.data ?? [],
        bleachers: bleachers.data ?? [],
        zones: zones.data ?? [],
        vendors: vendors.data ?? [],
        categories: categories.data ?? [],
        budgets: budgets.data ?? [],
      }),
    [
      repairs.data,
      services.data,
      repairBleachers.data,
      bleachers.data,
      zones.data,
      vendors.data,
      categories.data,
      budgets.data,
    ],
  );

  return { inputs, isLoading };
}

const STATUSES: RepairStatus[] = [
  "inbound",
  "triaged",
  "waiting_repair",
  "in_repair",
  "confirm_repair",
  "completed",
];

/** The rows of the eight queries as the inputs of §3, with the safe values for every null. */
export function buildAnalyticsInputs(raw: {
  repairs: RawAnalyticsRepair[];
  services: RawAnalyticsService[];
  repairBleachers: RawAnalyticsRepairBleacher[];
  bleachers: RawAnalyticsBleacher[];
  zones: RawAnalyticsZone[];
  vendors: RawAnalyticsVendor[];
  categories: RawAnalyticsCategory[];
  budgets: RawAnalyticsBudget[];
}): AnalyticsInputs {
  const repairs = raw.repairs.map(
    (r): AnalyticsRepair => ({
      id: r.id,
      eventStart: r.eventStart ?? "",
      status: STATUSES.find((s) => s === r.status) ?? "inbound",
      currency: r.currency === "CAD" ? "CAD" : "USD",
      zoneId: r.zoneUuid,
      vendorId: r.vendorUuid,
      costCents: r.costCents ?? 0,
    }),
  );

  const services: AnalyticsService[] = [];
  for (const s of raw.services) {
    if (s.repairId === null) continue;
    services.push({
      id: s.id,
      repairId: s.repairId,
      bleacherId: s.bleacherUuid ?? "",
      categoryId: s.categoryUuid,
      laborCents: s.laborCents ?? 0,
      partsCents: s.partsCents ?? 0,
      taxCents: s.taxCents ?? 0,
      freightCents: s.freightCents ?? 0,
    });
  }

  const repairBleachers: AnalyticsInputs["repairBleachers"] = [];
  for (const link of raw.repairBleachers) {
    if (link.repairId === null || link.bleacherUuid === null) continue;
    repairBleachers.push({ repairId: link.repairId, bleacherId: link.bleacherUuid });
  }

  const budgets: AnalyticsInputs["budgets"] = [];
  for (const b of raw.budgets) {
    if (b.year === null) continue;
    budgets.push({ year: b.year, currency: b.currency ?? "", amountCents: b.amountCents ?? 0 });
  }

  return {
    repairs,
    services,
    repairBleachers,
    bleachers: raw.bleachers.map((b) => ({
      id: b.id,
      zoneId: b.zoneUuid,
      modelNumber: b.modelNumber,
    })),
    zones: raw.zones.map((z) => ({ id: z.id, name: z.name ?? "" })),
    vendors: raw.vendors.map((v) => ({ id: v.id, name: v.name ?? "" })),
    categories: raw.categories.map((c) => ({
      id: c.id,
      name: c.name ?? "",
      isActive: c.isActive === 1,
    })),
    budgets,
  };
}
