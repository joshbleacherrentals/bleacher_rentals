import { DateTime } from "luxon";
import { dayInZone } from "./dayInZone";
import type { RepairListRow } from "./repairRows";

/**
 * The words and rules of the repair window: its title, the line with the day it was created, the
 * vendor's address, the files and who may read them. Pure, so it is tested without React.
 * docs/specs/repairs-07-repair-window.md §2.2, §2.3, §2.5 and §3 (the signatures are locked there).
 */

const bleacherName = (number: number | null) => `#${number ?? "?"}`;

/**
 * The title (D97): the invoice number and the vendor's name joined by " · "; one alone when the other
 * is empty; with neither, the bleachers ("Bleacher #52", "Bleachers #52, #53"); with no bleacher
 * either, "Repair".
 */
export function repairWindowTitle(row: RepairListRow): string {
  const named = [row.invoiceNumber?.trim(), row.vendorName?.trim()].filter((part): part is string =>
    Boolean(part),
  );
  if (named.length > 0) return named.join(" · ");
  if (row.bleachers.length > 0) {
    const noun = row.bleachers.length === 1 ? "Bleacher" : "Bleachers";
    return `${noun} ${row.bleachers.map((b) => bleacherName(b.number)).join(", ")}`;
  }
  return "Repair";
}

/** "Created 2026-09-17" (the day in `timezone`, D37), or null when there is no creation time. */
export function repairCreatedLine(row: RepairListRow, timezone: string): string | null {
  const day = dayInZone(row.createdAt, timezone);
  return day ? `Created ${day}` : null;
}

/** The city, the state and the country of the vendor's address in one line (D100), or null. */
export function formatVendorAddress(
  address: { city: string | null; stateProvince: string | null; country: string | null } | null,
): string | null {
  if (!address) return null;
  const parts = [address.city, address.stateProvince, address.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

export type RepairFileKind = "photo" | "pdf" | "word" | "excel" | "text" | "csv" | "file";

const KIND_BY_EXTENSION: Record<string, RepairFileKind> = {
  jpg: "photo",
  jpeg: "photo",
  png: "photo",
  heic: "photo",
  heif: "photo",
  webp: "photo",
  pdf: "pdf",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  txt: "text",
  csv: "csv",
};

const KIND_LABEL: Record<RepairFileKind, string> = {
  photo: "Photo",
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  text: "Text",
  csv: "CSV",
  file: "File",
};

/** The type of a file by the extension of the last part of its path, whatever the case (D103). */
export function repairFileKind(path: string): RepairFileKind {
  const last = path.slice(path.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot === -1) return "file";
  const extension = last.slice(dot + 1).toLowerCase();
  return Object.hasOwn(KIND_BY_EXTENSION, extension) ? KIND_BY_EXTENSION[extension] : "file";
}

/** A row of `MaintenancePhotos` as Supabase returns it. */
export type RawRepairFileRow = { id: string; photo_path: string; created_at: string };

export type RepairFileRow = {
  id: string;
  /** The type and its number among the files of that type, earliest first: "Photo 1", "PDF 1". */
  name: string;
  kind: RepairFileKind;
  /** The day it was added, in the app time zone; null when the time is not a date. */
  day: string | null;
  path: string;
};

/** A stored time as milliseconds; one written without an offset is UTC, as `dayInZone` reads it. */
function millis(value: string): number | null {
  const moment = DateTime.fromISO(value.trim().replace(" ", "T"), { zone: "utc" });
  return moment.isValid ? moment.toMillis() : null;
}

/**
 * The files of a repair as the window lists them (D103): earliest first (a tie by id, a file with
 * no readable time last), each named by its type and its number among the files of that type.
 */
export function buildRepairFileRows(
  raw: readonly RawRepairFileRow[],
  timezone: string,
): RepairFileRow[] {
  const ordered = raw
    .map((row) => ({ row, ms: millis(row.created_at) }))
    .sort((a, b) => {
      if (a.ms !== null && b.ms !== null && a.ms !== b.ms) return a.ms - b.ms;
      if (a.ms === null && b.ms !== null) return 1;
      if (a.ms !== null && b.ms === null) return -1;
      return a.row.id.localeCompare(b.row.id);
    });

  const counts = new Map<RepairFileKind, number>();
  return ordered.map(({ row }) => {
    const kind = repairFileKind(row.photo_path);
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    return {
      id: row.id,
      name: `${KIND_LABEL[kind]} ${n}`,
      kind,
      day: dayInZone(row.created_at, timezone),
      path: row.photo_path,
    };
  });
}

/**
 * Who may read the files of a repair (D102): the database gives the table to an administrator, an
 * account manager and a maintainer, and to a viewer it gives an empty list.
 */
export function canReadRepairFiles(roles: {
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
}): boolean {
  return roles.isAdmin || roles.isAccountManager || roles.isMaintainer;
}
