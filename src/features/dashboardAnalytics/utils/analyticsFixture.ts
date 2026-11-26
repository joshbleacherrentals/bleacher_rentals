import type {
  AnalyticsBleacher,
  AnalyticsBudget,
  AnalyticsCategory,
  AnalyticsFigures,
  AnalyticsInputs,
  AnalyticsRepair,
  AnalyticsService,
  AnalyticsVendor,
  AnalyticsZone,
  Period,
} from "./analyticsTypes";
import { buildAnalytics } from "./buildAnalytics";

// Test helpers for the Dashboard & Analytics numbers, in the style of
// src/features/repairs/utils/repairRowFixture.ts. Pass only what the case is about.
// docs/specs/dashboard-analytics-04-data-numbers.md §5.

/** A live USD repair of 2026-03-10, status inbound, with no zone, vendor or cost. */
export function repair(over: Partial<AnalyticsRepair> & { id: string }): AnalyticsRepair {
  return {
    eventStart: "2026-03-10",
    status: "inbound",
    currency: "USD",
    zoneId: null,
    vendorId: null,
    costCents: 0,
    ...over,
  };
}

/** A live service on bleacher "b1" with no category and every amount 0. */
export function service(
  over: Partial<AnalyticsService> & { id: string; repairId: string },
): AnalyticsService {
  return {
    bleacherId: "b1",
    categoryId: null,
    laborCents: 0,
    partsCents: 0,
    taxCents: 0,
    freightCents: 0,
    ...over,
  };
}

/** A live bleacher with no zone and no model number. */
export function bleacher(over: Partial<AnalyticsBleacher> & { id: string }): AnalyticsBleacher {
  return { zoneId: null, modelNumber: null, ...over };
}

export const zone = (id: string, name: string = id): AnalyticsZone => ({ id, name });
export const vendor = (id: string, name: string = id): AnalyticsVendor => ({ id, name });
export const category = (
  id: string,
  name: string = id,
  isActive: boolean = true,
): AnalyticsCategory => ({ id, name, isActive });
export const budget = (
  year: number,
  amountCents: number,
  currency: string = "USD",
): AnalyticsBudget => ({ year, currency, amountCents });

/** Inputs with every list empty. */
export function inputsOf(over: Partial<AnalyticsInputs> = {}): AnalyticsInputs {
  return {
    repairs: [],
    services: [],
    repairBleachers: [],
    bleachers: [],
    zones: [],
    vendors: [],
    categories: [],
    budgets: [],
    ...over,
  };
}

export const ALL_TIME: Period = { kind: "all" };
export const yearOf = (year: number): Period => ({ kind: "year", year });

/** `buildAnalytics` with All time and no rate for any day, unless the case says otherwise. */
export function figuresOf(
  over: Partial<AnalyticsInputs> = {},
  period: Period = ALL_TIME,
  rateFor: (day: string) => number | null = () => null,
): AnalyticsFigures {
  return buildAnalytics({ inputs: inputsOf(over), period, rateFor });
}
