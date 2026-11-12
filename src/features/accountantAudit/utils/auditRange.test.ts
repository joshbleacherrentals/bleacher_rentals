import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  AUDIT_FROM_PARAM,
  AUDIT_PRESETS,
  AUDIT_TO_PARAM,
  isRangeInverted,
  isRealIsoDate,
  openingRange,
  parseAuditRange,
  presetOf,
  resolvePreset,
  withAuditRange,
  type AuditPresetId,
} from "./auditRange";

// docs/specs/accountant-audit-05-drivers-table.md §2.1, §4 (D3, D4, D12, D14, R7-R10).

const day = (iso: string) => DateTime.fromISO(`${iso}T12:00:00`);
const range = (id: AuditPresetId, today: string) => resolvePreset(id, day(today));

describe("the presets (R7), today Monday 2026-11-09", () => {
  it("This week and Last week are Monday to Sunday", () => {
    expect(range("this_week", "2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(range("last_week", "2026-11-09")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
  it("This month and Last month are whole calendar months", () => {
    expect(range("this_month", "2026-11-09")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(range("last_month", "2026-11-09")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("This quarter and Last quarter are whole calendar quarters", () => {
    expect(range("this_quarter", "2026-11-09")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(range("last_quarter", "2026-11-09")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
  it("This year and Last year are whole calendar years", () => {
    expect(range("this_year", "2026-11-09")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(range("last_year", "2026-11-09")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("All time has no limit at either end", () => {
    expect(range("all_time", "2026-11-09")).toEqual({ from: null, to: null });
  });
});

describe("the presets at the edges of a week, month and year", () => {
  it("a Sunday is still in the week that began on the Monday before", () => {
    expect(range("this_week", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });
  it("Last week crosses a year boundary", () => {
    expect(range("this_week", "2026-01-01")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
    expect(range("last_week", "2026-01-01")).toEqual({ from: "2025-12-22", to: "2025-12-28" });
  });
  it("31 December", () => {
    expect(range("this_quarter", "2026-12-31")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(range("this_year", "2026-12-31")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(range("last_month", "2026-12-31")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
  it("1 January: Last month and Last quarter are in the year before", () => {
    expect(range("last_month", "2026-01-01")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(range("last_quarter", "2026-01-01")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });
  it("Last quarter from the first quarter is the last quarter of the year before", () => {
    expect(range("last_quarter", "2026-02-10")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });
  it("a leap day", () => {
    expect(range("this_month", "2028-02-29")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(range("last_month", "2028-03-15")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(range("last_month", "2029-03-15")).toEqual({ from: "2029-02-01", to: "2029-02-28" });
  });
});

describe("openingRange (D4, D14)", () => {
  it("is This month, to the last day of the month", () => {
    expect(openingRange(day("2026-11-09"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("the list of presets (D3)", () => {
  it("has the nine presets in the order of the spec", () => {
    expect(AUDIT_PRESETS.map((p) => p.label)).toEqual([
      "This week",
      "Last week",
      "This month",
      "Last month",
      "This quarter",
      "Last quarter",
      "This year",
      "Last year",
      "All time",
    ]);
  });
});

describe("presetOf (R10)", () => {
  const today = day("2026-11-09");
  it("finds the preset whose range equals the given one", () => {
    expect(presetOf({ from: "2026-11-01", to: "2026-11-30" }, today)).toBe("this_month");
    expect(presetOf({ from: "2026-10-01", to: "2026-10-31" }, today)).toBe("last_month");
    expect(presetOf({ from: null, to: null }, today)).toBe("all_time");
  });
  it("is null for a custom range", () => {
    expect(presetOf({ from: "2026-11-02", to: "2026-11-30" }, today)).toBeNull();
    expect(presetOf({ from: "2026-11-01", to: null }, today)).toBeNull();
    expect(presetOf({ from: null, to: "2026-11-30" }, today)).toBeNull();
  });
  it("recognises this week", () => {
    expect(presetOf({ from: "2026-11-09", to: "2026-11-15" }, today)).toBe("this_week");
  });
  it("recomputes from the day it is given: a preset of last month is custom next month", () => {
    expect(presetOf({ from: "2026-10-01", to: "2026-10-31" }, day("2026-12-02"))).toBeNull();
  });
});

describe("isRealIsoDate", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isRealIsoDate("2026-11-09")).toBe(true);
    expect(isRealIsoDate("2028-02-29")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isRealIsoDate("")).toBe(false);
    expect(isRealIsoDate("abc")).toBe(false);
    expect(isRealIsoDate("2026-13-01")).toBe(false);
    expect(isRealIsoDate("2026-02-30")).toBe(false);
    expect(isRealIsoDate("2027-02-29")).toBe(false);
    expect(isRealIsoDate("26-11-09")).toBe(false);
    expect(isRealIsoDate("2026-11-09T10:00")).toBe(false);
  });
});

describe("isRangeInverted (R9)", () => {
  it("is true only when From is after To", () => {
    expect(isRangeInverted({ from: "2026-11-10", to: "2026-11-09" })).toBe(true);
    expect(isRangeInverted({ from: "2026-11-09", to: "2026-11-09" })).toBe(false);
    expect(isRangeInverted({ from: "2026-11-01", to: "2026-11-30" })).toBe(false);
    expect(isRangeInverted({ from: null, to: "2026-11-30" })).toBe(false);
    expect(isRangeInverted({ from: "2026-11-01", to: null })).toBe(false);
    expect(isRangeInverted({ from: null, to: null })).toBe(false);
  });
});

describe("parseAuditRange (R8, D12)", () => {
  const p = (q: string) => parseAuditRange(new URLSearchParams(q));
  it("uses the parameter names from and to", () => {
    expect(AUDIT_FROM_PARAM).toBe("from");
    expect(AUDIT_TO_PARAM).toBe("to");
  });
  it("has no range parameters when neither is in the URL", () => {
    expect(p("tab=audit")).toEqual({ range: { from: null, to: null }, hasRangeParams: false });
  });
  it("reads both ends", () => {
    expect(p("from=2026-11-01&to=2026-11-30")).toEqual({
      range: { from: "2026-11-01", to: "2026-11-30" },
      hasRangeParams: true,
    });
  });
  it("reads from= and to= (present but empty) as All time, with the parameters present", () => {
    expect(p("from=&to=")).toEqual({ range: { from: null, to: null }, hasRangeParams: true });
  });
  it("reads one end only: the missing end is no limit", () => {
    expect(p("from=2026-11-01")).toEqual({
      range: { from: "2026-11-01", to: null },
      hasRangeParams: true,
    });
    expect(p("to=2026-11-30&from=")).toEqual({
      range: { from: null, to: "2026-11-30" },
      hasRangeParams: true,
    });
  });
  it("reads a value that is not a real date as empty", () => {
    expect(p("from=abc&to=2026-02-30")).toEqual({
      range: { from: null, to: null },
      hasRangeParams: true,
    });
  });
});

describe("withAuditRange (R11)", () => {
  it("writes both parameters, an empty string for a null end", () => {
    const out = new URLSearchParams(
      withAuditRange(new URLSearchParams("tab=audit"), { from: "2026-11-01", to: null }),
    );
    expect(out.get("from")).toBe("2026-11-01");
    expect(out.has("to")).toBe(true);
    expect(out.get("to")).toBe("");
  });
  it("writes All time as from=&to=", () => {
    expect(withAuditRange(new URLSearchParams("tab=audit"), { from: null, to: null })).toBe(
      "tab=audit&from=&to=",
    );
  });
  it("drops apage and keeps every other parameter", () => {
    const out = new URLSearchParams(
      withAuditRange(new URLSearchParams("tab=audit&driver=d1&apage=4&apagesize=50&asearch=x"), {
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    );
    expect(out.has("apage")).toBe(false);
    expect(out.get("apagesize")).toBe("50");
    expect(out.get("driver")).toBe("d1");
    expect(out.get("asearch")).toBe("x");
    expect(out.get("tab")).toBe("audit");
  });
  it("does not change its input", () => {
    const cur = new URLSearchParams("tab=audit");
    withAuditRange(cur, { from: "2026-11-01", to: "2026-11-30" });
    expect(cur.toString()).toBe("tab=audit");
  });
});
