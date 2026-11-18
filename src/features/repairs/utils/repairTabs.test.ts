import { describe, expect, it } from "vitest";
import type { RepairListRow } from "./repairRows";
import { splitByTab, totalsByCurrency } from "./repairTabs";

// docs/specs/repairs-03-list-query.md §2.9 and §7.

function row(o: Partial<RepairListRow> & { id: string }): RepairListRow {
  return {
    eventName: null,
    eventStart: null,
    eventEnd: null,
    notes: null,
    createdAt: null,
    deleted: false,
    status: "inbound",
    currency: "USD",
    invoiceNumber: null,
    vendorUuid: null,
    vendorName: null,
    completedOn: null,
    zones: [],
    bleachers: [],
    severities: [],
    categories: [],
    services: [],
    laborCents: null,
    partsCents: null,
    taxCents: null,
    freightCents: null,
    totalCents: null,
    reported: [],
    ...o,
  };
}

describe("splitByTab", () => {
  it("puts completed repairs on Completed and every other status on Open, keeping the order", () => {
    const rows = [
      row({ id: "a", status: "completed" }),
      row({ id: "b", status: "inbound" }),
      row({ id: "c", status: "confirm_repair" }),
      row({ id: "d", status: "completed" }),
      row({ id: "e", status: "waiting_repair" }),
    ];
    const { open, completed } = splitByTab(rows);
    expect(open.map((r) => r.id)).toEqual(["b", "c", "e"]);
    expect(completed.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("counts a status the code does not know as open", () => {
    const { open, completed } = splitByTab([row({ id: "x", status: "weird" as never })]);
    expect(open.map((r) => r.id)).toEqual(["x"]);
    expect(completed).toEqual([]);
  });

  it("gives two empty lists for an empty list", () => {
    expect(splitByTab([])).toEqual({ open: [], completed: [] });
  });
});

describe("totalsByCurrency", () => {
  it("has both currencies when the list has only one", () => {
    expect(totalsByCurrency([row({ id: "a", currency: "CAD", totalCents: 1500 })])).toEqual({
      USD: 0,
      CAD: 1500,
    });
  });

  it("gives zero for both for an empty list", () => {
    expect(totalsByCurrency([])).toEqual({ USD: 0, CAD: 0 });
  });

  it("counts an empty Total as 0", () => {
    expect(
      totalsByCurrency([row({ id: "a", totalCents: null }), row({ id: "b", totalCents: 250 })]),
    ).toEqual({ USD: 250, CAD: 0 });
  });

  it("does not add two currencies together", () => {
    expect(
      totalsByCurrency([
        row({ id: "a", currency: "USD", totalCents: 1000 }),
        row({ id: "b", currency: "CAD", totalCents: 700 }),
        row({ id: "c", currency: "USD", totalCents: 500 }),
      ]),
    ).toEqual({ USD: 1500, CAD: 700 });
  });
});
