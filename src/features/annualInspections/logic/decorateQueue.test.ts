import { describe, expect, it } from "vitest";
import { countUnseen, decorateQueue } from "./decorateQueue";

const TODAY = "2026-09-08";

const row = (bleacherNumber: number, nextDueOn: string | null) => ({
  bleacherUuid: `b${bleacherNumber}`,
  bleacherNumber,
  inspectionId: nextDueOn ? `i${bleacherNumber}` : null,
  inspectedOn: null,
  nextDueOn,
  documentPath: null,
  notes: null,
});

describe("decorateQueue", () => {
  it("stamps each row with the status the reader should see today", () => {
    const rows = decorateQueue(
      [
        row(101, null),
        row(102, "2026-09-01"),
        row(103, "2026-09-12"),
        row(104, "2026-09-30"),
        row(105, "2027-01-01"),
      ],
      TODAY,
      null,
    );

    expect(rows.map((r) => r.status)).toEqual([
      "unscheduled",
      "overdue",
      "critical",
      "warning",
      "ok",
    ]);
  });

  it("marks only the rows that crossed a threshold since the last visit", () => {
    const rows = decorateQueue(
      [
        row(101, "2026-10-07"), // yellow began 2026-09-07 — after the visit
        row(102, "2026-11-30"), // yellow begins 2026-10-31 — not yet
        row(103, "2026-08-01"), // went overdue long before the visit
      ],
      TODAY,
      "2026-09-01T12:00:00",
    );

    expect(rows.map((r) => r.isNew)).toEqual([true, false, false]);
  });

  it("counts the unseen rows so the sidebar does not have to walk the list again", () => {
    const rows = decorateQueue(
      [row(101, "2026-10-07"), row(102, "2026-10-06"), row(103, "2027-05-05")],
      TODAY,
      "2026-09-01T12:00:00",
    );

    expect(countUnseen(rows)).toBe(2);
  });

  it("keeps the queue order it was given — sorting is the query's job", () => {
    const rows = decorateQueue(
      [row(103, null), row(102, "2026-08-01"), row(101, "2027-01-01")],
      TODAY,
      null,
    );

    expect(rows.map((r) => r.bleacherNumber)).toEqual([103, 102, 101]);
  });

  it("never marks a bleacher without a due date as new, however long it has sat there", () => {
    const rows = decorateQueue([row(101, null)], TODAY, null);

    expect(rows[0].status).toBe("unscheduled");
    expect(rows[0].isNew).toBe(false);
  });
});
