import { describe, expect, it } from "vitest";
import { KPI_FROM_PARAM, KPI_TO_PARAM, parseKpiRange, withKpiRange } from "./kpiRange";

// docs/specs/accountant-kpi.md §2.1 and §2.4 (D12, D13): the KPI tab's own range in its own URL
// parameters, `kfrom` and `kto`. The Audit tab's `from` and `to` are not touched.

const params = (query: string) => new URLSearchParams(query);

describe("the parameter names", () => {
  it("are kfrom and kto, not the Audit tab's from and to", () => {
    expect(KPI_FROM_PARAM).toBe("kfrom");
    expect(KPI_TO_PARAM).toBe("kto");
  });
});

describe("parseKpiRange", () => {
  it("reads both ends", () => {
    expect(parseKpiRange(params("tab=kpi&kfrom=2026-11-01&kto=2026-11-30"))).toEqual({
      range: { from: "2026-11-01", to: "2026-11-30" },
      hasRangeParams: true,
    });
  });

  it("neither parameter in the URL: no range parameters, both ends open", () => {
    expect(parseKpiRange(params("tab=kpi"))).toEqual({
      range: { from: null, to: null },
      hasRangeParams: false,
    });
  });

  it("present but empty is All time, and counts as a range parameter", () => {
    expect(parseKpiRange(params("kfrom=&kto="))).toEqual({
      range: { from: null, to: null },
      hasRangeParams: true,
    });
  });

  it("one end alone: the other has no limit, and the parameters are present", () => {
    expect(parseKpiRange(params("kfrom=2026-11-01"))).toEqual({
      range: { from: "2026-11-01", to: null },
      hasRangeParams: true,
    });
    expect(parseKpiRange(params("kto=2026-11-30"))).toEqual({
      range: { from: null, to: "2026-11-30" },
      hasRangeParams: true,
    });
  });

  it("a value that is not a real date is read as empty", () => {
    expect(parseKpiRange(params("kfrom=2026-02-30&kto=soon")).range).toEqual({
      from: null,
      to: null,
    });
    expect(parseKpiRange(params("kfrom=2026-2-3")).range.from).toBeNull();
  });

  it("does not read the Audit tab's from and to", () => {
    expect(parseKpiRange(params("tab=kpi&from=2026-11-01&to=2026-11-30"))).toEqual({
      range: { from: null, to: null },
      hasRangeParams: false,
    });
  });
});

describe("withKpiRange", () => {
  it("writes both ends", () => {
    const next = new URLSearchParams(
      withKpiRange(params("tab=kpi"), { from: "2026-10-01", to: "2026-10-31" }),
    );
    expect(next.get("kfrom")).toBe("2026-10-01");
    expect(next.get("kto")).toBe("2026-10-31");
    expect(next.get("tab")).toBe("kpi");
  });

  it("writes an empty value for a null end (no limit), keeping the parameter present", () => {
    const next = new URLSearchParams(withKpiRange(params("tab=kpi"), { from: null, to: null }));
    expect(next.has("kfrom")).toBe(true);
    expect(next.get("kfrom")).toBe("");
    expect(next.get("kto")).toBe("");
  });

  it("keeps every other parameter, the Audit tab's range and its page included", () => {
    const next = new URLSearchParams(
      withKpiRange(params("tab=kpi&from=2026-01-01&to=2026-01-31&apage=3&driver=d1"), {
        from: "2026-11-01",
        to: null,
      }),
    );
    expect(next.get("from")).toBe("2026-01-01");
    expect(next.get("to")).toBe("2026-01-31");
    expect(next.get("apage")).toBe("3");
    expect(next.get("driver")).toBe("d1");
    expect(next.get("kfrom")).toBe("2026-11-01");
  });

  it("does not change the URLSearchParams it is given", () => {
    const current = params("tab=kpi");
    withKpiRange(current, { from: "2026-11-01", to: "2026-11-30" });
    expect(current.toString()).toBe("tab=kpi");
  });

  it("round-trips through parseKpiRange", () => {
    for (const range of [
      { from: "2026-11-01", to: "2026-11-30" },
      { from: null, to: null },
      { from: "2026-11-01", to: null },
    ]) {
      const next = new URLSearchParams(withKpiRange(params(""), range));
      expect(parseKpiRange(next).range).toEqual(range);
    }
  });
});
