import { describe, it, expect } from "vitest";
import type { CollectionsRow } from "./collectionsRows";
import {
  COLLECTIONS_CSV_HEADERS,
  buildCollectionsCsv,
  isCollectionsExportDisabled,
} from "./collectionsCsv";

const BOM = "﻿";
const TODAY = "2026-11-13";

function row(overrides: Partial<CollectionsRow> = {}): CollectionsRow {
  return {
    eventId: "e1",
    eventName: "Homecoming",
    taskId: "t1",
    dueDate: "2026-11-13",
    note: "Call Sam",
    amountDueCents: 250000,
    remainingCents: 300000,
    currency: "USD",
    daysOverdue: 12,
    ...overrides,
  };
}

const lines = (csv: string) => csv.replace(BOM, "").split("\r\n");

describe("buildCollectionsCsv", () => {
  it("uses the table's columns, without the arrow column that opens the invoice", () => {
    expect(COLLECTIONS_CSV_HEADERS).toEqual([
      "Name",
      "Next Follow Up",
      "Payment Overdue",
      "Task Notes",
      "Amount Overdue",
    ]);
    expect(lines(buildCollectionsCsv([], TODAY))).toEqual([COLLECTIONS_CSV_HEADERS.join(",")]);
  });

  it("writes each cell as the table shows it", () => {
    const [, line] = lines(buildCollectionsCsv([row()], TODAY));
    expect(line).toBe('Homecoming,Due Today,12 days,Call Sam,"$2,500.00"');
  });

  it("words the follow-up against today, as the table does", () => {
    const csv = buildCollectionsCsv(
      [row({ dueDate: "2026-11-14" }), row({ dueDate: "2026-11-10" })],
      TODAY,
    );
    const [, tomorrow, past] = lines(csv);
    expect(tomorrow).toContain(",Due tomorrow,");
    expect(past).toContain(",3 days ago,");
  });

  it("leaves Payment Overdue empty when nothing is overdue", () => {
    const [, line] = lines(buildCollectionsCsv([row({ daysOverdue: null })], TODAY));
    expect(line).toBe('Homecoming,Due Today,,Call Sam,"$2,500.00"');
  });

  it("marks a Canadian quote's amount with C$", () => {
    const [, line] = lines(buildCollectionsCsv([row({ currency: "CAD" })], TODAY));
    expect(line.endsWith(',"C$2,500.00"')).toBe(true);
  });

  it("keeps a note with a comma, a quote and a line break in one cell", () => {
    const csv = buildCollectionsCsv([row({ note: 'Said "later", call\nback' })], TODAY);
    expect(csv).toContain(',"Said ""later"", call\nback",');
  });

  it("defuses a name or note that a spreadsheet would run as a formula", () => {
    const [, line] = lines(
      buildCollectionsCsv([row({ eventName: "=1+1", note: "@SUM(A1)" })], TODAY),
    );
    expect(line.startsWith("'=1+1,")).toBe(true);
    expect(line).toContain(",'@SUM(A1),");
  });

  it("keeps the order it is given", () => {
    const [, first, second] = lines(
      buildCollectionsCsv([row({ eventName: "B" }), row({ eventName: "A" })], TODAY),
    );
    expect(first.startsWith("B,")).toBe(true);
    expect(second.startsWith("A,")).toBe(true);
  });
});

describe("isCollectionsExportDisabled", () => {
  it("is enabled once the rows have loaded, whether the error is undefined or null", () => {
    // PowerSync reports no error as `null` after the first load, and as `undefined` before it.
    expect(isCollectionsExportDisabled(false, undefined, 3)).toBe(false);
    expect(isCollectionsExportDisabled(false, null, 3)).toBe(false);
  });

  it("is disabled while the list loads", () => {
    expect(isCollectionsExportDisabled(true, null, 3)).toBe(true);
  });

  it("is disabled when there are no rows to export", () => {
    expect(isCollectionsExportDisabled(false, null, 0)).toBe(true);
  });

  it("is disabled when the list could not be read", () => {
    expect(isCollectionsExportDisabled(false, new Error("db down"), 3)).toBe(true);
  });
});
