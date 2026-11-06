import { toEpochMs } from "@/features/quotesAndBookings/utils/allocatePayments";
import { zonedDate } from "./invoiceView";

/**
 * Pure builders for the Files table of the invoice page: the rows of `EventFiles` turned into
 * display rows. docs/specs/accountant-collections-13-task-history-and-files.md §1 and §3.
 */

/** A row of the Files query of `InvoiceFiles`. */
export type InvoiceFileRow = {
  id: string;
  file_name: string | null;
  storage_path: string | null;
  source: string | null;
  created_at: string | null;
};

export type FileRow = {
  number: number;
  id: string;
  name: string;
  /** The extension in capitals, or a dash. */
  typeLabel: string;
  dateLabel: string;
  storagePath: string | null;
  canDelete: boolean;
};

/** `a.PDF` is `PDF`, `a.tar.gz` is `GZ`; no extension is a dash. */
export function fileTypeLabel(name: string | null): string {
  const dot = (name ?? "").lastIndexOf(".");
  const extension = dot > 0 ? (name ?? "").slice(dot + 1) : "";
  return extension ? extension.toUpperCase() : "—";
}

/** Only a file attached by hand can be deleted; the system's files (contract, quote) cannot. */
export function canDeleteFile(source: string | null): boolean {
  return source === "upload";
}

function byCreated(a: InvoiceFileRow, b: InvoiceFileRow): number {
  const infinity = Number.POSITIVE_INFINITY;
  const left = toEpochMs(a.created_at) ?? infinity;
  const right = toEpochMs(b.created_at) ?? infinity;
  if (left !== right) return left < right ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Oldest first, numbered from 1; the date is written in the office's time zone. */
export function buildFileRows(files: readonly InvoiceFileRow[], timezone: string): FileRow[] {
  return [...files].sort(byCreated).map((f, i) => ({
    number: i + 1,
    id: f.id,
    name: f.file_name ?? "",
    typeLabel: fileTypeLabel(f.file_name),
    dateLabel: zonedDate(f.created_at, timezone),
    storagePath: f.storage_path,
    canDelete: canDeleteFile(f.source),
  }));
}
