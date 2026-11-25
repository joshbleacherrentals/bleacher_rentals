import { DateTime } from "luxon";
import type { Database } from "../../../../database.types";
import type {
  RawRepairBleacherRow,
  RawRepairRow,
  RawReportCategoryRow,
  RawReportRow,
  RawServiceRow,
} from "../db/repairListQueries";
import { dayInZone } from "./dayInZone";

/**
 * The rules that turn the results of the five Repairs queries into list rows: chips, money, zone,
 * Completed, Reported and the starting order. A pure function, with no database behind it.
 * docs/specs/repairs-03-list-query.md §2 and §4 (the types here are locked by that spec).
 */

export type RepairStatus = Database["public"]["Enums"]["repair_status"];
export type RepairCurrency = Database["public"]["Enums"]["currency"];
export type RepairSeverity = Database["public"]["Enums"]["maintenance_severity"];

/** A damage report found for a repair or a service. */
export type ReportedReport = {
  id: string; // DamageReports.id, the link target
  day: string; // YYYY-MM-DD, created_at in the app time zone
  createdAt: string; // the stored timestamp, for the order
};

export type RepairService = {
  id: string;
  bleacherUuid: string;
  bleacherNumber: number | null;
  damageCategoryUuid: string | null;
  categoryName: string | null;
  severity: RepairSeverity;
  description: string | null;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
  totalCents: number; // the sum of the four, not stored
  deleted: boolean;
  createdAt: string | null;
  reported: ReportedReport[]; // earliest first; empty = dash
};

export type RepairListRow = {
  id: string;
  eventName: string | null;
  eventStart: string | null; // YYYY-MM-DD
  eventEnd: string | null; // YYYY-MM-DD
  notes: string | null;
  createdAt: string | null;
  deleted: boolean;
  status: RepairStatus;
  currency: RepairCurrency;
  invoiceNumber: string | null;
  vendorUuid: string | null;
  vendorName: string | null;
  completedOn: string | null; // YYYY-MM-DD; null while the repair is open
  zones: { uuid: string; name: string | null }[];
  bleachers: { uuid: string; number: number | null }[]; // by number
  severities: RepairSeverity[]; // distinct: major, minor, routine
  categories: { uuid: string; name: string | null }[]; // distinct
  services: RepairService[];
  laborCents: number | null; // null when the repair has no visible service
  partsCents: number | null;
  taxCents: number | null;
  freightCents: number | null;
  totalCents: number | null; // MaintenanceEvents.cost_cents
  reported: ReportedReport[]; // earliest first; empty = dash
};

export type RepairTab = "open" | "completed";
export type CurrencyTotals = { USD: number; CAD: number }; // cents

/** What the five queries returned (the input of `buildRepairRows`). */
export type RawRepairData = {
  repairs: readonly RawRepairRow[];
  services: readonly RawServiceRow[];
  bleachers: readonly RawRepairBleacherRow[];
  reports: readonly RawReportRow[];
  reportCategories: readonly RawReportCategoryRow[];
};

/** The order of the Severity chips (D8, drawn so on the canvas). */
const SEVERITY_ORDER: readonly RepairSeverity[] = ["major", "minor", "routine"];

/** A damage report that can be dated, ready for the matching. */
type DatedReport = {
  id: string;
  bleacherUuid: string;
  repairId: string | null;
  createdAt: string;
  ms: number;
  day: string;
  resolvedAt: string | null;
  resolvedDay: string | null;
};

function millis(value: string | null | undefined): number | null {
  if (!value) return null;
  const moment = DateTime.fromISO(value.trim().replace(" ", "T"), { zone: "utc" });
  return moment.isValid ? moment.toMillis() : null;
}

/** Groups by a key; an item with an empty key is left out. */
function groupBy<T>(items: readonly T[], key: (item: T) => string | null | undefined) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/** Ascending, rows with no value last, then the tie-break. */
function compareNullable(a: number | string | null, b: number | string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function byCreatedAt(a: { ms: number; id: string }, b: { ms: number; id: string }) {
  return a.ms - b.ms || a.id.localeCompare(b.id);
}

function toReported(report: DatedReport): ReportedReport {
  return { id: report.id, day: report.day, createdAt: report.createdAt };
}

/**
 * Did the report wait for this repair (D27, D28)? A report closed by this repair always did. A
 * report closed by another repair never did. An unlinked report did when it was created no later
 * than the repair's start and was not closed before it; a close time that is not a date cannot be
 * placed, so such a report is not counted.
 */
function waitedFor(report: DatedReport, repairId: string, eventStart: string | null): boolean {
  if (report.repairId === repairId) return true;
  if (report.repairId) return false;
  if (!eventStart) return false;
  if (report.day > eventStart) return false;
  if (!report.resolvedAt) return true;
  return report.resolvedDay !== null && report.resolvedDay >= eventStart;
}

export function buildRepairRows(raw: RawRepairData, timezone: string): RepairListRow[] {
  const servicesByRepair = groupBy(raw.services, (s) => s.repairId);
  const junctionByRepair = groupBy(raw.bleachers, (b) => b.repairId);

  const categoriesByReport = new Map<string, Set<string>>();
  for (const row of raw.reportCategories) {
    if (!row.reportId || !row.categoryUuid) continue;
    const set = categoriesByReport.get(row.reportId) ?? new Set<string>();
    set.add(row.categoryUuid);
    categoriesByReport.set(row.reportId, set);
  }

  // A report with no readable created_at cannot be dated, so it is never counted (§2.6).
  const reports: DatedReport[] = [];
  for (const r of raw.reports) {
    const ms = millis(r.createdAt);
    const day = dayInZone(r.createdAt, timezone);
    if (ms === null || day === null || !r.createdAt || !r.bleacherUuid) continue;
    reports.push({
      id: r.id,
      bleacherUuid: r.bleacherUuid,
      repairId: r.repairId || null,
      createdAt: r.createdAt,
      ms,
      day,
      resolvedAt: r.resolvedAt || null,
      resolvedDay: dayInZone(r.resolvedAt, timezone),
    });
  }
  const reportsByBleacher = groupBy(reports, (r) => r.bleacherUuid);
  const reportsByRepair = groupBy(reports, (r) => r.repairId);

  const rows = raw.repairs.map((repair): RepairListRow => {
    const status = (repair.status ?? "inbound") as RepairStatus;
    const isCompleted = status === "completed";

    const services = [...(servicesByRepair.get(repair.id) ?? [])].sort(
      (a, b) =>
        compareNullable(millis(a.createdAt), millis(b.createdAt)) || a.id.localeCompare(b.id),
    );

    // Bleachers and zones come from the junction (D29, D33).
    const junction = junctionByRepair.get(repair.id) ?? [];
    const bleacherByUuid = new Map<string, { uuid: string; number: number | null }>();
    const zoneByUuid = new Map<string, { uuid: string; name: string | null }>();
    for (const j of junction) {
      if (!j.bleacherUuid) continue;
      if (!bleacherByUuid.has(j.bleacherUuid)) {
        bleacherByUuid.set(j.bleacherUuid, { uuid: j.bleacherUuid, number: j.bleacherNumber });
      }
      if (j.zoneUuid && !zoneByUuid.has(j.zoneUuid)) {
        zoneByUuid.set(j.zoneUuid, { uuid: j.zoneUuid, name: j.zoneName });
      }
    }
    const bleachers = [...bleacherByUuid.values()].sort(
      (a, b) => compareNullable(a.number, b.number) || a.uuid.localeCompare(b.uuid),
    );
    const zones = repair.zoneUuid
      ? [{ uuid: repair.zoneUuid, name: repair.zoneName }]
      : [...zoneByUuid.values()].sort(
          (a, b) => compareNullable(a.name, b.name) || a.uuid.localeCompare(b.uuid),
        );

    // Reported (§2.6): the reports linked to this repair on one of its bleachers, and the reports
    // that match the category of a service on the same bleacher and waited for this repair.
    const eventStart = repair.eventStart || null;
    const linked = (reportsByRepair.get(repair.id) ?? []).filter((r) =>
      bleacherByUuid.has(r.bleacherUuid),
    );
    const foundForRepair = new Map<string, DatedReport>(linked.map((r) => [r.id, r]));

    const outServices = services.map((s): RepairService => {
      const bleacherUuid = s.bleacherUuid ?? "";
      const found = new Map<string, DatedReport>();
      for (const r of linked) if (r.bleacherUuid === bleacherUuid) found.set(r.id, r);
      if (s.categoryUuid) {
        for (const r of reportsByBleacher.get(bleacherUuid) ?? []) {
          if (!categoriesByReport.get(r.id)?.has(s.categoryUuid)) continue;
          if (waitedFor(r, repair.id, eventStart)) found.set(r.id, r);
        }
      }
      for (const r of found.values()) foundForRepair.set(r.id, r);

      const labor = s.laborCents ?? 0;
      const parts = s.partsCents ?? 0;
      const tax = s.taxCents ?? 0;
      const freight = s.freightCents ?? 0;
      return {
        id: s.id,
        bleacherUuid,
        bleacherNumber: s.bleacherNumber,
        damageCategoryUuid: s.categoryUuid,
        categoryName: s.categoryName,
        // Not null in the database.
        severity: s.severity as RepairSeverity,
        description: s.description,
        laborCents: labor,
        partsCents: parts,
        taxCents: tax,
        freightCents: freight,
        totalCents: labor + parts + tax + freight,
        deleted: !!s.deleted,
        createdAt: s.createdAt,
        reported: [...found.values()].sort(byCreatedAt).map(toReported),
      };
    });

    const sum = (pick: (s: RepairService) => number) =>
      outServices.length ? outServices.reduce((total, s) => total + pick(s), 0) : null;

    const categoryByUuid = new Map<string, { uuid: string; name: string | null }>();
    for (const s of outServices) {
      if (s.damageCategoryUuid && !categoryByUuid.has(s.damageCategoryUuid)) {
        categoryByUuid.set(s.damageCategoryUuid, {
          uuid: s.damageCategoryUuid,
          name: s.categoryName,
        });
      }
    }

    // Completed (§2.5): a dash while open; the day of completed_at, else event_end (D31).
    const completedOn = isCompleted
      ? (dayInZone(repair.completedAt, timezone) ?? (repair.eventEnd || null))
      : null;

    return {
      id: repair.id,
      eventName: repair.eventName,
      eventStart: repair.eventStart,
      eventEnd: repair.eventEnd,
      notes: repair.notes,
      createdAt: repair.createdAt,
      deleted: !!repair.deleted,
      status,
      currency: repair.currency === "CAD" ? "CAD" : "USD",
      invoiceNumber: repair.invoiceNumber,
      vendorUuid: repair.vendorUuid,
      vendorName: repair.vendorName,
      completedOn,
      zones,
      bleachers,
      severities: SEVERITY_ORDER.filter((v) => outServices.some((s) => s.severity === v)),
      categories: [...categoryByUuid.values()],
      services: outServices,
      laborCents: sum((s) => s.laborCents),
      partsCents: sum((s) => s.partsCents),
      taxCents: sum((s) => s.taxCents),
      freightCents: sum((s) => s.freightCents),
      totalCents: repair.costCents,
      reported: [...foundForRepair.values()].sort(byCreatedAt).map(toReported),
    };
  });

  // The starting order (D36): created_at descending, rows without it last, ties by id.
  return rows.sort((a, b) => {
    const am = millis(a.createdAt);
    const bm = millis(b.createdAt);
    if (am !== null && bm !== null && am !== bm) return bm - am;
    if (am === null && bm !== null) return 1;
    if (am !== null && bm === null) return -1;
    return a.id.localeCompare(b.id);
  });
}
