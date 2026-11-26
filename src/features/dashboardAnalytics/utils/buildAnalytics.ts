import { yearOfDay } from "./analyticsPeriod";
import type {
  AnalyticsFigures,
  AnalyticsInputs,
  AnalyticsRepair,
  AnalyticsService,
  CategoryRow,
  ModelRow,
  OpenStatus,
  Period,
  VendorRow,
  ZoneRow,
} from "./analyticsTypes";
import { convertCents } from "./exchangeRates";

// docs/specs/dashboard-analytics-04-data-numbers.md §2. Every figure of the page, from the rows of
// the local database. Pure: no React, no database, no network. A CAD repair is converted with one
// rate and whole (D37); a service alone is converted at the rate of its repair (R2).

const OPEN_STATUSES: OpenStatus[] = [
  "inbound",
  "triaged",
  "waiting_repair",
  "in_repair",
  "confirm_repair",
];
const TOP_MODELS = 5;
const TOP_VENDORS = 6;

/**
 * "By name" everywhere (D38, D39, R1, §2.5): A to Z in English, numbers in their natural order and
 * case ignored, so "Zone 2" comes before "Zone 10"; exact text decides when that says equal.
 */
export function compareNames(a: string, b: string): number {
  const byLetters = a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  if (byLetters !== 0) return byLetters;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A ratio, unrounded; over a zero total it is 0 (R5). */
const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
/** An average in cents, rounded to the cent; 0 for no count (§2.2). */
const average = (cents: number, count: number) => (count === 0 ? 0 : Math.round(cents / count));
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function inPeriod(repair: AnalyticsRepair, period: Period): boolean {
  return period.kind === "all" || yearOfDay(repair.eventStart) === period.year;
}

/** A live repair of the period that has a rate, with its money in USD (§2.2). */
type CountedRepair = {
  repair: AnalyticsRepair;
  rate: number;
  services: AnalyticsService[];
  totalUsd: number;
  laborUsd: number;
  partsUsd: number;
};

const serviceCents = (s: AnalyticsService) =>
  s.laborCents + s.partsCents + s.taxCents + s.freightCents;
/** The sum of the four amounts of a service, in USD at the rate of its repair (R2). */
const serviceUsd = (s: AnalyticsService, rate: number) => convertCents(serviceCents(s), rate);

function countRepair(
  repair: AnalyticsRepair,
  rate: number,
  services: AnalyticsService[],
): CountedRepair {
  // With no service (R3) the total is the stored cost, and there is no Labor or Parts.
  const total = services.length > 0 ? sum(services.map(serviceCents)) : repair.costCents;
  return {
    repair,
    rate,
    services,
    totalUsd: convertCents(total, rate),
    laborUsd: convertCents(sum(services.map((s) => s.laborCents)), rate),
    partsUsd: convertCents(sum(services.map((s) => s.partsCents)), rate),
  };
}

function addTo<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildAnalytics(params: {
  inputs: AnalyticsInputs;
  period: Period;
  rateFor: (day: string) => number | null;
}): AnalyticsFigures {
  const { inputs, period, rateFor } = params;
  const { repairs, services, repairBleachers, bleachers, zones, vendors, categories, budgets } =
    inputs;

  // ---- The repairs of the period that have a rate (D6, D9, R4) --------------------------------
  const servicesByRepair = new Map<string, AnalyticsService[]>();
  for (const service of services) {
    const list = servicesByRepair.get(service.repairId) ?? [];
    list.push(service);
    servicesByRepair.set(service.repairId, list);
  }

  const counted: CountedRepair[] = [];
  let convertedCount = 0;
  let withoutRateCount = 0;
  for (const repair of repairs) {
    if (!inPeriod(repair, period)) continue;
    let rate = 1;
    if (repair.currency === "CAD") {
      const found = rateFor(repair.eventStart);
      if (found === null) {
        withoutRateCount += 1;
        continue;
      }
      rate = found;
      convertedCount += 1;
    }
    counted.push(countRepair(repair, rate, servicesByRepair.get(repair.id) ?? []));
  }

  const totalSpendCents = sum(counted.map((c) => c.totalUsd));
  const bleachersTotal = bleachers.length;
  const liveBleacherIds = new Set(bleachers.map((b) => b.id));

  // ---- Bleachers Ready: about today, never the period (D16, D36) ------------------------------
  const statusOf = new Map(repairs.map((r) => [r.id, r.status]));
  const busy = new Set<string>();
  for (const link of repairBleachers) {
    const status = statusOf.get(link.repairId);
    if (status === undefined || status === "completed") continue;
    if (liveBleacherIds.has(link.bleacherId)) busy.add(link.bleacherId);
  }
  const readyCount = bleachersTotal - busy.size;

  // ---- The spend of one bleacher, for the range under the average (§2.4) ----------------------
  const spendByBleacher = new Map<string, number>();
  for (const c of counted) {
    for (const s of c.services) {
      if (liveBleacherIds.has(s.bleacherId))
        addTo(spendByBleacher, s.bleacherId, serviceUsd(s, c.rate));
    }
  }
  const bleacherSpends = bleachers.map((b) => spendByBleacher.get(b.id) ?? 0);

  // ---- Active Open Work Orders (D15, D17) -----------------------------------------------------
  const byStatus = Object.fromEntries(OPEN_STATUSES.map((s) => [s, 0])) as Record<
    OpenStatus,
    number
  >;
  for (const c of counted) {
    if (c.repair.status !== "completed") byStatus[c.repair.status] += 1;
  }

  // ---- Annual Budget Utilization (D18, D40) ---------------------------------------------------
  const usdBudgets = budgets.filter((b) => b.currency === "USD" && b.amountCents > 0);
  const budgetCents =
    period.kind === "all"
      ? sum(usdBudgets.map((b) => b.amountCents))
      : (usdBudgets.find((b) => b.year === period.year)?.amountCents ?? 0);
  const budgetIsSet = budgetCents > 0;

  const avgPerBleacherCents = average(totalSpendCents, bleachersTotal);

  return {
    period,
    cad: { converted: convertedCount, withoutRate: withoutRateCount },
    cards: {
      totalSpendCents,
      bleachersTotal,
      ready: { ready: readyCount, total: bleachersTotal, ratio: ratio(readyCount, bleachersTotal) },
      avgPerBleacherCents,
      rangeCents:
        bleacherSpends.length === 0
          ? { min: 0, max: 0 }
          : { min: Math.min(...bleacherSpends), max: Math.max(...bleacherSpends) },
      openWorkOrders: { total: sum(Object.values(byStatus)), byStatus },
      budget: budgetIsSet
        ? {
            setCents: budgetCents,
            spentCents: totalSpendCents,
            remainingCents: budgetCents - totalSpendCents,
            usedRatio: totalSpendCents / budgetCents,
            isOver: totalSpendCents > budgetCents,
          }
        : {
            setCents: null,
            spentCents: totalSpendCents,
            remainingCents: null,
            usedRatio: null,
            isOver: false,
          },
    },
    zones: buildZones({ zones, bleachers, counted, totalSpendCents, avgPerBleacherCents }),
    models: buildModels({ bleachers, repairBleachers, counted }),
    categories: buildCategories({ categories, vendors, counted }),
    vendors: buildVendors({ vendors, counted }),
  };
}

// ---- The zone table (§2.5, D19) -----------------------------------------------------------------

function buildZones(params: {
  zones: AnalyticsInputs["zones"];
  bleachers: AnalyticsInputs["bleachers"];
  counted: CountedRepair[];
  totalSpendCents: number;
  avgPerBleacherCents: number;
}): AnalyticsFigures["zones"] {
  const { zones, bleachers, counted, totalSpendCents, avgPerBleacherCents } = params;
  const listed = new Set(zones.map((z) => z.id));
  // The zone a row stands for: the stored one when it is listed, otherwise Unassigned (null).
  const keyOf = (zoneId: string | null) => (zoneId !== null && listed.has(zoneId) ? zoneId : null);

  const units = new Map<string | null, number>();
  for (const b of bleachers) addTo(units, keyOf(b.zoneId), 1);
  const workOrders = new Map<string | null, number>();
  const cost = new Map<string | null, number>();
  for (const c of counted) {
    const key = keyOf(c.repair.zoneId);
    addTo(workOrders, key, 1);
    addTo(cost, key, c.totalUsd);
  }

  const row = (zoneId: string | null, name: string): ZoneRow => {
    const rowUnits = units.get(zoneId) ?? 0;
    const rowCost = cost.get(zoneId) ?? 0;
    return {
      zoneId,
      name,
      units: rowUnits,
      workOrders: workOrders.get(zoneId) ?? 0,
      costCents: rowCost,
      avgCostCents: average(rowCost, rowUnits),
      share: ratio(rowCost, totalSpendCents),
    };
  };

  const rows = [...zones]
    .sort((a, b) => compareNames(a.name, b.name))
    .map((z) => row(z.id, z.name));
  rows.push(row(null, "Unassigned"));

  return {
    rows,
    total: {
      units: bleachers.length,
      workOrders: sum(rows.map((r) => r.workOrders)),
      costCents: sum(rows.map((r) => r.costCents)),
      avgCostCents: avgPerBleacherCents,
      share: totalSpendCents > 0 ? 1 : 0,
    },
  };
}

// ---- Top High-Cost Models (§2.6, D20, D36, D39) -------------------------------------------------

function buildModels(params: {
  bleachers: AnalyticsInputs["bleachers"];
  repairBleachers: AnalyticsInputs["repairBleachers"];
  counted: CountedRepair[];
}): AnalyticsFigures["models"] {
  const { bleachers, repairBleachers, counted } = params;

  const modelOfBleacher = new Map<string, string>();
  const unitsByModel = new Map<string, number>();
  for (const b of bleachers) {
    const model = (b.modelNumber ?? "").trim();
    if (model === "") continue;
    modelOfBleacher.set(b.id, model);
    addTo(unitsByModel, model, 1);
  }

  // The repairs of a model come through the list of bleachers of a repair (D36).
  const listByRepair = new Map<string, string[]>();
  for (const link of repairBleachers) {
    const list = listByRepair.get(link.repairId) ?? [];
    list.push(link.bleacherId);
    listByRepair.set(link.repairId, list);
  }
  const repairsByModel = new Map<string, Set<string>>();
  const costByModel = new Map<string, number>();
  for (const c of counted) {
    for (const bleacherId of listByRepair.get(c.repair.id) ?? []) {
      const model = modelOfBleacher.get(bleacherId);
      if (model === undefined) continue;
      const set = repairsByModel.get(model) ?? new Set<string>();
      set.add(c.repair.id);
      repairsByModel.set(model, set);
    }
    // The cost of a model comes through the services (R2).
    for (const s of c.services) {
      const model = modelOfBleacher.get(s.bleacherId);
      if (model !== undefined) addTo(costByModel, model, serviceUsd(s, c.rate));
    }
  }

  const candidates = [...repairsByModel.keys()]
    .map((model) => ({ model, cost: costByModel.get(model) ?? 0 }))
    .sort((a, b) => b.cost - a.cost || compareNames(a.model, b.model))
    .slice(0, TOP_MODELS);

  const rows: ModelRow[] = candidates.map(({ model, cost }, index) => {
    const units = unitsByModel.get(model) ?? 0;
    return {
      rank: index + 1,
      model,
      units,
      avgCostCents: average(cost, units),
      repairs: repairsByModel.get(model)?.size ?? 0,
      costCents: cost,
    };
  });

  if (rows.length === 0) return { hasModelNumbers: modelOfBleacher.size > 0, rows, total: null };
  const units = sum(rows.map((r) => r.units));
  const costCents = sum(rows.map((r) => r.costCents));
  return {
    hasModelNumbers: true,
    rows,
    total: {
      units,
      avgCostCents: average(costCents, units),
      repairs: sum(rows.map((r) => r.repairs)),
      costCents,
    },
  };
}

// ---- The category table (§2.7, D21, D38, R1) ----------------------------------------------------

function buildCategories(params: {
  categories: AnalyticsInputs["categories"];
  vendors: AnalyticsInputs["vendors"];
  counted: CountedRepair[];
}): AnalyticsFigures["categories"] {
  const { categories, vendors, counted } = params;
  const categoryIds = new Set(categories.map((c) => c.id));
  const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
  // The stored category named "Unassigned" is the Unassigned row, not a second one.
  const isStoredUnassigned = (name: string) => name.trim().toLowerCase() === "unassigned";
  const storedUnassigned = new Set(
    categories.filter((c) => isStoredUnassigned(c.name)).map((c) => c.id),
  );
  // The row a service stands for: its category when listed, otherwise Unassigned (null).
  const keyOf = (categoryId: string | null) =>
    categoryId !== null && categoryIds.has(categoryId) && !storedUnassigned.has(categoryId)
      ? categoryId
      : null;

  type Accumulator = { repairs: Set<string>; expense: number; byVendor: Map<string, number> };
  const accumulators = new Map<string | null, Accumulator>();
  const accumulator = (key: string | null) => {
    let found = accumulators.get(key);
    if (!found) {
      found = { repairs: new Set(), expense: 0, byVendor: new Map() };
      accumulators.set(key, found);
    }
    return found;
  };

  for (const c of counted) {
    const vendorId =
      c.repair.vendorId !== null && vendorNames.has(c.repair.vendorId) ? c.repair.vendorId : null;
    const add = (key: string | null, usd: number) => {
      const target = accumulator(key);
      target.repairs.add(c.repair.id);
      target.expense += usd;
      if (vendorId !== null) addTo(target.byVendor, vendorId, usd);
    };
    if (c.services.length === 0) add(null, c.totalUsd);
    else for (const s of c.services) add(keyOf(s.categoryId), serviceUsd(s, c.rate));
  }

  const topVendorOf = (target: Accumulator | undefined): string | null => {
    if (!target) return null;
    const best = [...target.byVendor.entries()]
      .filter(([, spend]) => spend > 0)
      .map(([vendorId, spend]) => ({ name: vendorNames.get(vendorId) ?? "", spend }))
      .sort((a, b) => b.spend - a.spend || compareNames(a.name, b.name))[0];
    return best ? best.name : null;
  };

  const rowOf = (key: string | null, name: string, total: number): CategoryRow => {
    const target = accumulators.get(key);
    const repairs = target?.repairs.size ?? 0;
    const expense = target?.expense ?? 0;
    return {
      categoryId: key,
      name,
      repairs,
      expenseCents: expense,
      avgCostCents: average(expense, repairs),
      share: ratio(expense, total),
      topVendor: topVendorOf(target),
    };
  };

  const listed = categories.filter(
    (c) =>
      !storedUnassigned.has(c.id) && (c.isActive || (accumulators.get(c.id)?.expense ?? 0) > 0),
  );
  const allExpense = sum([...accumulators.values()].map((a) => a.expense));

  const rows = listed.map((c) => rowOf(c.id, c.name, allExpense));
  const withSpend = rows
    .filter((r) => r.expenseCents > 0)
    .sort((a, b) => b.expenseCents - a.expenseCents || compareNames(a.name, b.name));
  const withoutSpend = rows
    .filter((r) => r.expenseCents <= 0)
    .sort((a, b) => compareNames(a.name, b.name));
  const ordered = [...withSpend, ...withoutSpend, rowOf(null, "Unassigned", allExpense)];

  const totalRepairs = sum(ordered.map((r) => r.repairs));
  const totalExpense = sum(ordered.map((r) => r.expenseCents));
  return {
    rows: ordered,
    total: {
      repairs: totalRepairs,
      expenseCents: totalExpense,
      avgCostCents: average(totalExpense, totalRepairs),
      share: totalExpense > 0 ? 1 : 0,
    },
  };
}

// ---- The vendor table (§2.8, D23, D37, D39) -----------------------------------------------------

function buildVendors(params: {
  vendors: AnalyticsInputs["vendors"];
  counted: CountedRepair[];
}): AnalyticsFigures["vendors"] {
  const { vendors, counted } = params;
  const known = new Map(vendors.map((v) => [v.id, v.name]));

  const perVendor = new Map<string, { workOrders: number; labor: number; parts: number }>();
  for (const c of counted) {
    const vendorId = c.repair.vendorId;
    if (vendorId === null || !known.has(vendorId)) continue;
    const entry = perVendor.get(vendorId) ?? { workOrders: 0, labor: 0, parts: 0 };
    entry.workOrders += 1;
    entry.labor += c.laborUsd;
    entry.parts += c.partsUsd;
    perVendor.set(vendorId, entry);
  }

  // Only a vendor with Labor + Parts above 0 is a candidate and is in the total.
  const withSpend = [...perVendor.entries()]
    .map(([vendorId, e]) => ({
      vendorId,
      name: known.get(vendorId) ?? "",
      workOrders: e.workOrders,
      laborCents: e.labor,
      partsCents: e.parts,
      totalCents: e.labor + e.parts,
    }))
    .filter((v) => v.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || compareNames(a.name, b.name));

  const allTotal = sum(withSpend.map((v) => v.totalCents));
  const rows: VendorRow[] = withSpend
    .slice(0, TOP_VENDORS)
    .map((v) => ({ ...v, share: ratio(v.totalCents, allTotal) }));

  return {
    rows,
    total: {
      vendorsWithSpend: withSpend.length,
      workOrders: sum(withSpend.map((v) => v.workOrders)),
      laborCents: sum(withSpend.map((v) => v.laborCents)),
      partsCents: sum(withSpend.map((v) => v.partsCents)),
      totalCents: allTotal,
      share: allTotal > 0 ? 1 : 0,
    },
  };
}
