// docs/specs/dashboard-analytics-04-data-numbers.md §3. The locked contracts: the inputs of the page
// (what the eight local queries give) and the figures that `buildAnalytics` returns. A change to a
// type here needs a new "Approved" on the spec.

export type RepairStatus =
  | "inbound"
  | "triaged"
  | "waiting_repair"
  | "in_repair"
  | "confirm_repair"
  | "completed";
export type OpenStatus = Exclude<RepairStatus, "completed">;

export type Period = { kind: "year"; year: number } | { kind: "all" };

export type AnalyticsRepair = {
  id: string;
  eventStart: string; // YYYY-MM-DD
  status: RepairStatus;
  currency: "USD" | "CAD";
  zoneId: string | null;
  vendorId: string | null;
  costCents: number; // null in the database is 0 here
};
export type AnalyticsService = {
  id: string;
  repairId: string;
  bleacherId: string;
  categoryId: string | null;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
};
export type AnalyticsRepairBleacher = { repairId: string; bleacherId: string };
export type AnalyticsBleacher = { id: string; zoneId: string | null; modelNumber: string | null };
export type AnalyticsZone = { id: string; name: string };
export type AnalyticsVendor = { id: string; name: string };
export type AnalyticsCategory = { id: string; name: string; isActive: boolean };
export type AnalyticsBudget = { year: number; currency: string; amountCents: number };

export type AnalyticsInputs = {
  repairs: AnalyticsRepair[];
  services: AnalyticsService[];
  repairBleachers: AnalyticsRepairBleacher[];
  bleachers: AnalyticsBleacher[];
  zones: AnalyticsZone[];
  vendors: AnalyticsVendor[];
  categories: AnalyticsCategory[];
  budgets: AnalyticsBudget[];
};

export type ZoneRow = {
  zoneId: string | null; // null: Unassigned
  name: string;
  units: number;
  workOrders: number;
  costCents: number;
  avgCostCents: number;
  share: number;
};
export type ZoneTotal = Omit<ZoneRow, "zoneId" | "name">;
export type ModelRow = {
  rank: number;
  model: string;
  units: number;
  avgCostCents: number;
  repairs: number;
  costCents: number;
};
export type ModelTotal = {
  units: number;
  avgCostCents: number;
  repairs: number;
  costCents: number;
};
export type CategoryRow = {
  categoryId: string | null; // null: Unassigned
  name: string;
  repairs: number;
  expenseCents: number;
  avgCostCents: number;
  share: number;
  topVendor: string | null;
};
export type CategoryTotal = {
  repairs: number;
  expenseCents: number;
  avgCostCents: number;
  share: number;
};
export type VendorRow = {
  vendorId: string;
  name: string;
  workOrders: number;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  share: number;
};
export type VendorTotal = {
  vendorsWithSpend: number;
  workOrders: number;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  share: number;
};

export type AnalyticsFigures = {
  period: Period;
  cad: { converted: number; withoutRate: number };
  cards: {
    totalSpendCents: number;
    bleachersTotal: number;
    ready: { ready: number; total: number; ratio: number };
    avgPerBleacherCents: number;
    rangeCents: { min: number; max: number };
    openWorkOrders: { total: number; byStatus: Record<OpenStatus, number> };
    budget: {
      setCents: number | null;
      spentCents: number;
      remainingCents: number | null;
      usedRatio: number | null;
      isOver: boolean;
    };
  };
  zones: { rows: ZoneRow[]; total: ZoneTotal };
  models: { hasModelNumbers: boolean; rows: ModelRow[]; total: ModelTotal | null };
  categories: { rows: CategoryRow[]; total: CategoryTotal };
  vendors: { rows: VendorRow[]; total: VendorTotal };
};
