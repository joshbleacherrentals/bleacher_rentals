import { describe, it, expect } from "vitest";
import type { CollectionsListState } from "./collectionsListState";
import type { CollectionsRow } from "./collectionsRows";
import { sortCollectionsRows, filterCollectionsRows } from "./collectionsSort";
import { neighboursOf, orderedEventIds } from "./taskNeighbours";

// Spec: docs/specs/accountant-collections-10-prev-next.md §3 and §4.

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

// Four rows with distinct values in every column, so each order is unambiguous.
const ROWS = [
  row("a", { amountDueCents: 40000, dueDate: "2026-11-04", daysOverdue: 30 }),
  row("b", { amountDueCents: 10000, dueDate: "2026-11-12", daysOverdue: 3 }),
  row("c", { amountDueCents: 30000, dueDate: "2026-11-08", daysOverdue: 12 }),
  row("d", { amountDueCents: 20000, dueDate: "2026-11-01", daysOverdue: 21 }),
];

describe("orderedEventIds", () => {
  it("amount, largest first: the next row is the next smaller amount", () => {
    expect(orderedEventIds(ROWS, state("amount", "desc"), TODAY)).toEqual(["a", "c", "d", "b"]);
  });

  it("amount, smallest first", () => {
    expect(orderedEventIds(ROWS, state("amount", "asc"), TODAY)).toEqual(["b", "d", "c", "a"]);
  });

  it("Next Follow Up, oldest first (the default)", () => {
    expect(orderedEventIds(ROWS, state("followUp", "asc"), TODAY)).toEqual(["d", "a", "c", "b"]);
  });

  it("Next Follow Up, newest first", () => {
    expect(orderedEventIds(ROWS, state("followUp", "desc"), TODAY)).toEqual(["b", "c", "a", "d"]);
  });

  it("Payment Overdue, most days first and fewest days first", () => {
    expect(orderedEventIds(ROWS, state("overdue", "desc"), TODAY)).toEqual(["a", "d", "c", "b"]);
    expect(orderedEventIds(ROWS, state("overdue", "asc"), TODAY)).toEqual(["b", "c", "d", "a"]);
  });

  it("Show Not Due Yet off drops the tasks dated after today; on keeps them", () => {
    const rows = [...ROWS, row("future", { dueDate: "2026-11-20", amountDueCents: 25000 })];
    expect(orderedEventIds(rows, state("amount", "desc"), TODAY)).toEqual(["a", "c", "d", "b"]);
    expect(orderedEventIds(rows, state("amount", "desc", true), TODAY)).toEqual([
      "a",
      "c",
      "future",
      "d",
      "b",
    ]);
  });

  it("follows the tie chains of spec 07, exactly as the list does", () => {
    const tied = [
      row("d", { amountDueCents: 500, daysOverdue: 99 }),
      row("c", { amountDueCents: 900, daysOverdue: 5 }),
      row("b", { amountDueCents: 900, daysOverdue: 40 }),
      row("a", { amountDueCents: 900, daysOverdue: 40 }),
    ];
    for (const s of [
      state("followUp", "asc"),
      state("amount", "desc"),
      state("overdue", "asc", true),
    ]) {
      expect(orderedEventIds(tied, s, TODAY)).toEqual(
        sortCollectionsRows(filterCollectionsRows(tied, s, TODAY), s).map((r) => r.eventId),
      );
    }
    expect(orderedEventIds(tied, state("followUp", "asc"), TODAY)).toEqual(["a", "b", "c", "d"]);
  });

  it("is empty for no rows", () => {
    expect(orderedEventIds([], state("amount", "desc"), TODAY)).toEqual([]);
  });
});

describe("neighboursOf", () => {
  const ids = ["a", "c", "d", "b"];

  it("gives both neighbours of a row in the middle", () => {
    expect(neighboursOf(ids, "c")).toEqual({ found: true, previousId: "a", nextId: "d" });
  });

  it("the first row has no previous", () => {
    expect(neighboursOf(ids, "a")).toEqual({ found: true, previousId: null, nextId: "c" });
  });

  it("the last row has no next", () => {
    expect(neighboursOf(ids, "b")).toEqual({ found: true, previousId: "d", nextId: null });
  });

  it("a single row has neither", () => {
    expect(neighboursOf(["a"], "a")).toEqual({ found: true, previousId: null, nextId: null });
  });

  it("an id that is not in the list is not found and has neither", () => {
    expect(neighboursOf(ids, "zzz")).toEqual({ found: false, previousId: null, nextId: null });
    expect(neighboursOf([], "a")).toEqual({ found: false, previousId: null, nextId: null });
  });
});
