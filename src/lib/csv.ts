import { DateTime } from "luxon";

/**
 * What every "Export to CSV" shares: how a cell is escaped, how the file is put together and how the
 * browser is handed it. A table's own columns and wording live next to that table, not here.
 */

/** Written first so Excel opens the file as UTF-8 and keeps accents (Québec, Montréal) intact. */
const BOM = "﻿";

/** Records end in CRLF, as the CSV standard (RFC 4180) has it. */
const NEWLINE = "\r\n";

/** A field is quoted when it holds a comma, a quote or a line break; quotes inside are doubled. */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A cell of free text — an event name, a note, an address — typed by people (and, for a website
 * quote, by strangers). A spreadsheet runs a cell that starts with = + - @ as a formula, so such
 * text gets a leading apostrophe, which makes the spreadsheet read it as plain text. Only for text
 * columns: a negative amount starts with "-" and is a number.
 */
export function csvTextField(value: string): string {
  return escapeCsvField(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
}

/** The file's text: the headers, then one record per row. Cells arrive already escaped. */
export function buildCsv(
  headers: readonly string[],
  records: readonly (readonly string[])[],
): string {
  return (
    BOM + [headers.map(escapeCsvField).join(","), ...records.map((r) => r.join(","))].join(NEWLINE)
  );
}

/** Dated, so a second export the same week does not land on the first as "file (1).csv". */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${DateTime.fromJSDate(now).toFormat("yyyy-MM-dd")}.csv`;
}

/** Hands the browser the file through a temporary link, which does not stay on the page. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Not at once: Safari can lose the download if the URL is revoked before it has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
