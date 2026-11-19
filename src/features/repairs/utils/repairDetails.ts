import type { AcknowledgementSummary } from "@/app/damage-reports/_lib/acknowledgements";
import { effectiveColumnDamage } from "@/lib/damageReportSeverity";
import type { RawReportDetailRow, RawReportPhotoRow } from "../db/serviceWindowQueries";
import { dayInZone } from "./dayInZone";
import type { RepairListRow, RepairService, ReportedReport } from "./repairRows";

/**
 * The words and rules behind the expanded row, the service window and the damage report window:
 * labels, titles, the service a window shows, and the view of a damage report. Pure, so it is
 * tested without React. docs/specs/repairs-06-expanded-row.md §2 and §3.
 */

export type ServiceRef = { repairId: string; serviceId: string };

/** The repair and the service a reference points at, or null when either is not in the list. */
export function findService(
  rows: readonly RepairListRow[],
  ref: ServiceRef | null,
): { repair: RepairListRow; service: RepairService } | null {
  if (!ref) return null;
  const repair = rows.find((row) => row.id === ref.repairId);
  const service = repair?.services.find((s) => s.id === ref.serviceId);
  return repair && service ? { repair, service } : null;
}

const bleacherName = (number: number | null) => `#${number ?? "?"}`;

/** "repair JJ-5", "repair of bleacher #52, #53" or "repair": the name used in aria labels. */
export function repairLabel(row: RepairListRow): string {
  const invoice = row.invoiceNumber?.trim();
  if (invoice) return `repair ${invoice}`;
  if (row.bleachers.length > 0) {
    return `repair of bleacher ${row.bleachers.map((b) => bleacherName(b.number)).join(", ")}`;
  }
  return "repair";
}

/** "Open service: bleacher 26, Welding"; with no category "Open service: bleacher 26". */
export function serviceRowLabel(service: RepairService): string {
  const category = service.categoryName?.trim();
  return `Open service: bleacher ${service.bleacherNumber ?? "?"}${category ? `, ${category}` : ""}`;
}

/** "Welding · Bleacher #26", "Bleacher #26" without a category, "Bleacher #?" without a number. */
export function serviceWindowTitle(service: RepairService): string {
  const category = service.categoryName?.trim();
  return [category, `Bleacher ${bleacherName(service.bleacherNumber)}`]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Null for none, "View Damage Report" for one, "View Damage Reports (N)" for several (D92). */
export function reportsButtonLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "View Damage Report" : `View Damage Reports (${count})`;
}

/** "Damage report" for one (and none), "Damage reports (N)" for several. */
export function reportsWindowTitle(count: number): string {
  return count > 1 ? `Damage reports (${count})` : "Damage report";
}

export type DamageLevel = "none" | "minor" | "major";

/** A damage report ready to draw in the report window (D91). */
export type DamageReportView = {
  id: string;
  bleacherNumber: number | null;
  day: string; // the Reported day of the report
  createdBy: string | null; // "First Last", or null when nobody is known
  seat: DamageLevel;
  haul: DamageLevel;
  note: string | null;
  photos: { id: string; path: string }[];
  resolvedDay: string | null;
  confirmations: { id: string; name: string; day: string | null; duringInspection: boolean }[];
  fixedMark: string | null; // only while not resolved
};

const fullName = (first: string | null, last: string | null) =>
  [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

/**
 * The views of the damage reports found for a repair or a service, in the order they were found
 * (earliest first, spec 03). A report whose details are not on the device is left out. Days are the
 * day in the app time zone (D37), also those of a resolve, a confirmation and the fixed mark.
 */
export function buildDamageReportViews(input: {
  reported: readonly ReportedReport[];
  details: readonly RawReportDetailRow[];
  photos: readonly RawReportPhotoRow[];
  acknowledgements: Record<string, AcknowledgementSummary>;
  timezone: string;
}): DamageReportView[] {
  const { reported, details, photos, acknowledgements, timezone } = input;

  const detailById = new Map(details.map((d) => [d.id, d]));
  const photosByReport = new Map<string, { id: string; path: string }[]>();
  for (const photo of photos) {
    if (!photo.reportId || !photo.path) continue;
    const list = photosByReport.get(photo.reportId) ?? [];
    list.push({ id: photo.id, path: photo.path });
    photosByReport.set(photo.reportId, list);
  }

  const views: DamageReportView[] = [];
  for (const found of reported) {
    const detail = detailById.get(found.id);
    if (!detail) continue;

    const resolvedDay = dayInZone(detail.resolvedAt, timezone);
    const fixer = fullName(detail.fixerFirstName, detail.fixerLastName);
    const fixedDay = dayInZone(detail.fixedAt, timezone);
    const fixedMark =
      detail.fixedByDriver && resolvedDay === null
        ? `${fixer ? `Fixed by ${fixer}` : "Fixed by a driver"}${fixedDay ? ` on ${fixedDay}` : ""}`
        : null;

    views.push({
      id: found.id,
      bleacherNumber: detail.bleacherNumber,
      day: found.day,
      createdBy: fullName(detail.creatorFirstName, detail.creatorLastName) || null,
      seat: effectiveColumnDamage(detail.seatDamage, detail.isSafeToSit),
      haul: effectiveColumnDamage(detail.haulDamage, detail.isSafeToHaul),
      note: detail.note,
      photos: photosByReport.get(found.id) ?? [],
      resolvedDay,
      confirmations: (acknowledgements[found.id]?.entries ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        day: dayInZone(entry.at, timezone),
        duringInspection: entry.source === "inspection",
      })),
      fixedMark,
    });
  }
  return views;
}
