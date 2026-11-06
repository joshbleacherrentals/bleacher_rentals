import { describe, it, expect } from "vitest";
import type { CollectionsListState } from "./collectionsListState";
import type { CollectionsRow } from "./collectionsRows";
import { filterCollectionsRows, sortCollectionsRows } from "./collectionsSort";

const TODAY = "2026-11-15";

function row(id: string, overrides: Partial<CollectionsRow> = {}): CollectionsRow {
  return {
    eventId: id,
    eventName: `Event ${id}`,
    taskId: `task-${id}`,
    dueDate: "2026-11-10",
    note: "Remind the customer about payment",
    amountDueCents: 10000,
    currency: "USD",
    daysOverdue: 10,
    ...overrides,
  };
}

const state = (
  sort: CollectionsListState["sort"],
  dir: CollectionsListState["dir"],
  showNotDue = false,
): CollectionsListState => ({ sort, dir, showNotDue });

const ids = (rows: CollectionsRow[]) => rows.map((r) => r.eventId);
const DEFAULT = state("followUp", "asc");

describe("sortCollectionsRows: the default order (Next Follow Up, oldest first)", () => {
  it("puts the oldest task first", () => {
    const rows = [
      row("a", { dueDate: "2026-11-12" }),
      row("b", { dueDate: "2026-11-01" }),
      row("c", { dueDate: "2026-11-05" }),
    ];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie on the date by the larger amount, then more days, then the id", () => {
    const rows = [
      row("d", { amountDueCents: 500, daysOverdue: 99 }),
      row("c", { amountDueCents: 900, daysOverdue: 5 }),
      row("b", { amountDueCents: 900, daysOverdue: 40 }),
      row("a", { amountDueCents: 900, daysOverdue: 40 }),
    ];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["a", "b", "c", "d"]);
  });

  it("does not touch the array it is given", () => {
    const rows = [row("b", { dueDate: "2026-11-12" }), row("a", { dueDate: "2026-11-01" })];
    const before = [...rows];
    sortCollectionsRows(rows, DEFAULT);
    expect(rows).toEqual(before);
  });
});

describe("sortCollectionsRows: Next Follow Up, latest first", () => {
  it("reverses the date and keeps the tie chain (amount largest, days most, id)", () => {
    const rows = [
      row("a", { dueDate: "2026-11-01", amountDueCents: 100 }),
      row("b", { dueDate: "2026-11-12", amountDueCents: 100 }),
      row("c", { dueDate: "2026-11-12", amountDueCents: 900 }),
    ];
    expect(ids(sortCollectionsRows(rows, state("followUp", "desc")))).toEqual(["c", "b", "a"]);
  });
});

describe("sortCollectionsRows: Amount Overdue", () => {
  const rows = [
    row("small", { amountDueCents: 1000 }),
    row("big", { amountDueCents: 90000 }),
    row("mid", { amountDueCents: 20000 }),
  ];

  it("from the largest, each next row is smaller", () => {
    const sorted = sortCollectionsRows(rows, state("amount", "desc"));
    expect(ids(sorted)).toEqual(["big", "mid", "small"]);
  });

  it("from the smallest, each next row is larger", () => {
    const sorted = sortCollectionsRows(rows, state("amount", "asc"));
    expect(ids(sorted)).toEqual(["small", "mid", "big"]);
  });

  it("breaks a tie by Payment Overdue (most days), then Next Follow Up (oldest), then the id", () => {
    const tied = [
      row("e", { daysOverdue: 5, dueDate: "2026-11-01" }),
      row("d", { daysOverdue: 30, dueDate: "2026-11-09" }),
      row("c", { daysOverdue: 30, dueDate: "2026-11-02" }),
      row("b", { daysOverdue: 30, dueDate: "2026-11-02" }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      expect(ids(sortCollectionsRows(tied, state("amount", dir)))).toEqual(["b", "c", "d", "e"]);
    }
  });
});

describe("sortCollectionsRows: Payment Overdue", () => {
  const rows = [
    row("few", { daysOverdue: 3 }),
    row("many", { daysOverdue: 80 }),
    row("some", { daysOverdue: 20 }),
  ];

  it("most days first, and fewest days first", () => {
    expect(ids(sortCollectionsRows(rows, state("overdue", "desc")))).toEqual([
      "many",
      "some",
      "few",
    ]);
    expect(ids(sortCollectionsRows(rows, state("overdue", "asc")))).toEqual([
      "few",
      "some",
      "many",
    ]);
  });

  it("breaks a tie by Amount Overdue (largest), then Next Follow Up (oldest), then the id", () => {
    const tied = [
      row("e", { amountDueCents: 100, dueDate: "2026-11-01" }),
      row("d", { amountDueCents: 700, dueDate: "2026-11-09" }),
      row("c", { amountDueCents: 700, dueDate: "2026-11-02" }),
      row("b", { amountDueCents: 700, dueDate: "2026-11-02" }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      expect(ids(sortCollectionsRows(tied, state("overdue", dir)))).toEqual(["b", "c", "d", "e"]);
    }
  });
});

describe("sortCollectionsRows: a row with no days figure", () => {
  it("counts as 0 days", () => {
    const rows = [
      row("none", { daysOverdue: null }),
      row("zero", { daysOverdue: 0 }),
      row("one", { daysOverdue: 1 }),
    ];
    // "none" and "zero" tie on days, then on everything else: the id decides.
    expect(ids(sortCollectionsRows(rows, state("overdue", "desc")))).toEqual([
      "one",
      "none",
      "zero",
    ]);
    expect(ids(sortCollectionsRows(rows, state("overdue", "asc")))).toEqual([
      "none",
      "zero",
      "one",
    ]);
  });

  it("does not break the default order's tie chain", () => {
    const rows = [row("b", { daysOverdue: null }), row("a", { daysOverdue: 0 })];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["a", "b"]);
  });
});

describe("sortCollectionsRows: the order is total", () => {
  const rows = [
    row("a", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: 4 }),
    row("b", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: 4 }),
    row("c", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: null }),
    row("d", { dueDate: "2026-11-02", amountDueCents: 500, daysOverdue: 4 }),
    row("e", { dueDate: "2026-11-02", amountDueCents: 0, daysOverdue: null }),
    row("f", { dueDate: "2026-12-30", amountDueCents: 9000, daysOverdue: 400 }),
  ];

  function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      const j = s % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it.each([
    ["Next Follow Up, oldest", state("followUp", "asc")],
    ["Next Follow Up, latest", state("followUp", "desc")],
    ["Payment Overdue, most", state("overdue", "desc")],
    ["Payment Overdue, fewest", state("overdue", "asc")],
    ["Amount Overdue, largest", state("amount", "desc")],
    ["Amount Overdue, smallest", state("amount", "asc")],
  ])("gives the same output for any input order: %s", (_name, listState) => {
    const expected = ids(sortCollectionsRows(rows, listState));
    for (let seed = 1; seed <= 25; seed++) {
      expect(ids(sortCollectionsRows(shuffled(rows, seed), listState))).toEqual(expected);
    }
  });
});

describe("filterCollectionsRows", () => {
  const rows = [
    row("past", { dueDate: "2026-11-01" }),
    row("today", { dueDate: TODAY }),
    row("tomorrow", { dueDate: "2026-11-16" }),
    row("later", { dueDate: "2027-02-01" }),
  ];

  it("drops the tasks dated after today while Show Not Due Yet is off", () => {
    expect(ids(filterCollectionsRows(rows, state("followUp", "asc", false), TODAY))).toEqual([
      "past",
      "today",
    ]);
  });

  it("keeps every task when Show Not Due Yet is on", () => {
    expect(ids(filterCollectionsRows(rows, state("followUp", "asc", true), TODAY))).toEqual([
      "past",
      "today",
      "tomorrow",
      "later",
    ]);
  });

  it("keeps a task due today and drops one due tomorrow", () => {
    const kept = ids(filterCollectionsRows(rows, DEFAULT, TODAY));
    expect(kept).toContain("today");
    expect(kept).not.toContain("tomorrow");
  });
});
