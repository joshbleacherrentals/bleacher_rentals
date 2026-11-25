import { describe, expect, it } from "vitest";
import {
  formatRepairDay,
  formatRepairMoney,
  reportedCell,
  severityPill,
  statusPill,
} from "./repairFormat";

// docs/specs/repairs-04-table.md §2.3, §2.5, §3 and §7.

const report = (id: string, day: string) => ({ id, day, createdAt: `${day}T12:00:00Z` });

describe("formatRepairMoney", () => {
  it("writes USD with $ and CAD with C$, two decimals and thousands separators", () => {
    expect(formatRepairMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatRepairMoney(123456, "CAD")).toBe("C$1,234.56");
  });

  it("writes no amount as a dash and zero as $0.00", () => {
    expect(formatRepairMoney(null, "USD")).toBe("—");
    expect(formatRepairMoney(null, "CAD")).toBe("—");
    expect(formatRepairMoney(0, "USD")).toBe("$0.00");
    expect(formatRepairMoney(0, "CAD")).toBe("C$0.00");
  });

  it("puts the minus sign before the symbol on a negative amount", () => {
    expect(formatRepairMoney(-500, "USD")).toBe("-$5.00");
  });
});

describe("formatRepairDay", () => {
  it("shows a stored day as it is (D44)", () => {
    expect(formatRepairDay("2026-11-17")).toBe("2026-11-17");
  });

  it("writes an empty day as a dash", () => {
    expect(formatRepairDay(null)).toBe("—");
    expect(formatRepairDay("")).toBe("—");
  });
});

describe("reportedCell", () => {
  it("is null (a dash) when no report fits", () => {
    expect(reportedCell([])).toBeNull();
  });

  it("gives the day of the first report and no +N for one report", () => {
    expect(reportedCell([report("a", "2026-03-04")])).toEqual({ day: "2026-03-04", more: null });
  });

  it("gives +N with N = reports minus one, and the day of the first", () => {
    expect(
      reportedCell([
        report("a", "2026-03-04"),
        report("b", "2026-03-09"),
        report("c", "2026-04-01"),
      ]),
    ).toEqual({ day: "2026-03-04", more: "+2" });
  });

  it("counts reports and not days: two reports of one day give +1 (D38)", () => {
    expect(reportedCell([report("a", "2026-03-04"), report("b", "2026-03-04")])).toEqual({
      day: "2026-03-04",
      more: "+1",
    });
  });
});

describe("statusPill", () => {
  it("gives the label and the colours of the canvas for the six statuses (§2.5)", () => {
    expect(statusPill("inbound")).toEqual({
      label: "Inbound",
      className: "bg-[#dce9f7] text-[#1a5892]",
    });
    expect(statusPill("triaged")).toEqual({
      label: "Triaged",
      className: "bg-[#ece8fa] text-[#563b9c]",
    });
    expect(statusPill("waiting_repair")).toEqual({
      label: "Waiting repair",
      className: "bg-[#fbf0da] text-[#7d5a1c]",
    });
    expect(statusPill("in_repair")).toEqual({
      label: "In repair",
      className: "bg-[#fde6d2] text-[#93440d]",
    });
    expect(statusPill("confirm_repair")).toEqual({
      label: "Confirm repair",
      className: "bg-[#d6eeee] text-[#1b6464]",
    });
    expect(statusPill("completed")).toEqual({
      label: "Completed",
      className: "bg-[#dcede2] text-[#2f6b4c]",
    });
  });

  it("shows a status the code does not know as its own word on grey", () => {
    expect(statusPill("on_hold")).toEqual({
      label: "on_hold",
      className: "bg-[#f3f4f6] text-[#4b5563]",
    });
  });
});

describe("severityPill", () => {
  it("gives the label and the colours of the canvas for the three severities", () => {
    expect(severityPill("major")).toEqual({
      label: "Major",
      className: "bg-[#fbe7e5] text-[#a8403a]",
    });
    expect(severityPill("minor")).toEqual({
      label: "Minor",
      className: "bg-[#fbf0da] text-[#7d5a1c]",
    });
    expect(severityPill("routine")).toEqual({
      label: "Routine",
      className: "bg-[#eef1f6] text-[#4f6178]",
    });
  });
});
