import { describe, expect, it } from "vitest";
import {
  AUDIT_DIR_PARAM,
  AUDIT_DRIVER_PARAM,
  AUDIT_PAGE_PARAM,
  AUDIT_PAGE_SIZE_PARAM,
  AUDIT_SEARCH_PARAM,
  AUDIT_SORT_PARAM,
  parseAuditDriver,
  parseAuditPaging,
  parseAuditSearch,
  parseAuditSort,
  withAuditDriver,
  withAuditPaging,
  withAuditSearch,
  withAuditSort,
} from "./auditUrlState";

// docs/specs/accountant-audit-02-driver-select.md §3, §5 and
// accountant-audit-04-table.md §3, §5 (D6, R2).

describe("parseAuditDriver", () => {
  const p = (q: string) => parseAuditDriver(new URLSearchParams(q));
  it("is null when missing, empty or spaces", () => {
    expect(p("")).toBeNull();
    expect(p("driver=")).toBeNull();
    expect(p("driver=%20%20")).toBeNull();
  });
  it("returns the trimmed value", () => {
    expect(p("driver=%20abc%20")).toBe("abc");
  });
  it("uses the parameter name driver", () => {
    expect(AUDIT_DRIVER_PARAM).toBe("driver");
  });
});

describe("withAuditDriver", () => {
  it("sets and replaces, keeping every other parameter", () => {
    const cur = new URLSearchParams("tab=audit&page=3&csort=x");
    const set = new URLSearchParams(withAuditDriver(cur, "d1"));
    expect(set.get("driver")).toBe("d1");
    expect(set.get("tab")).toBe("audit");
    expect(set.get("page")).toBe("3");
    expect(set.get("csort")).toBe("x");
    const replaced = new URLSearchParams(withAuditDriver(new URLSearchParams(set), "d2"));
    expect(replaced.get("driver")).toBe("d2");
  });
  it("deletes on null and keeps the rest", () => {
    const out = new URLSearchParams(
      withAuditDriver(new URLSearchParams("tab=audit&driver=d1"), null),
    );
    expect(out.has("driver")).toBe(false);
    expect(out.get("tab")).toBe("audit");
  });
  it("does not change its input", () => {
    const cur = new URLSearchParams("tab=audit");
    withAuditDriver(cur, "d1");
    expect(cur.has("driver")).toBe(false);
  });
});

describe("withAuditDriver and the page (spec 04)", () => {
  it("drops apage in the same write, so a new driver starts at page 1", () => {
    const out = new URLSearchParams(
      withAuditDriver(new URLSearchParams("tab=audit&driver=d1&apage=4"), "d2"),
    );
    expect(out.get("driver")).toBe("d2");
    expect(out.has("apage")).toBe(false);
    expect(out.get("tab")).toBe("audit");
  });
  it("drops apage when the driver is cleared too", () => {
    const out = new URLSearchParams(
      withAuditDriver(new URLSearchParams("tab=audit&driver=d1&apage=4"), null),
    );
    expect(out.has("driver")).toBe(false);
    expect(out.has("apage")).toBe(false);
  });
  it("keeps the page size", () => {
    const out = new URLSearchParams(
      withAuditDriver(new URLSearchParams("tab=audit&driver=d1&apagesize=50"), "d2"),
    );
    expect(out.get("apagesize")).toBe("50");
  });
});

describe("parseAuditPaging", () => {
  const p = (q: string) => parseAuditPaging(new URLSearchParams(q));
  it("uses the parameter names apage and apagesize", () => {
    expect(AUDIT_PAGE_PARAM).toBe("apage");
    expect(AUDIT_PAGE_SIZE_PARAM).toBe("apagesize");
  });
  it("is page 1 and size 25 when the parameters are missing", () => {
    expect(p("tab=audit")).toEqual({ page: 1, pageSize: 25 });
  });
  it("is page 1 and size 25 for invalid values", () => {
    expect(p("apage=abc&apagesize=abc")).toEqual({ page: 1, pageSize: 25 });
    expect(p("apage=-2&apagesize=30")).toEqual({ page: 1, pageSize: 25 });
    expect(p("apage=1.5")).toEqual({ page: 1, pageSize: 25 });
  });
  it("treats page 0 as page 1", () => {
    expect(p("apage=0").page).toBe(1);
  });
  it("reads page 3", () => {
    expect(p("apage=3").page).toBe(3);
  });
  it("reads the sizes 50 and 100", () => {
    expect(p("apagesize=50").pageSize).toBe(50);
    expect(p("apagesize=100").pageSize).toBe(100);
  });
  it("does not read the page-level page and pageSize of the other tabs", () => {
    expect(p("page=7&pageSize=100")).toEqual({ page: 1, pageSize: 25 });
  });
});

describe("withAuditPaging", () => {
  it("leaves page 1 and size 25 out of the URL", () => {
    const out = new URLSearchParams(
      withAuditPaging(new URLSearchParams("tab=audit&driver=d1"), { page: 1, pageSize: 25 }),
    );
    expect(out.has("apage")).toBe(false);
    expect(out.has("apagesize")).toBe(false);
  });
  it("writes apage above 1 and apagesize other than 25", () => {
    const out = new URLSearchParams(
      withAuditPaging(new URLSearchParams("tab=audit&driver=d1"), { page: 3, pageSize: 50 }),
    );
    expect(out.get("apage")).toBe("3");
    expect(out.get("apagesize")).toBe("50");
  });
  it("keeps tab, driver and every other parameter", () => {
    const out = new URLSearchParams(
      withAuditPaging(new URLSearchParams("tab=audit&driver=d1&csort=x&page=9"), {
        page: 2,
        pageSize: 100,
      }),
    );
    expect(out.get("tab")).toBe("audit");
    expect(out.get("driver")).toBe("d1");
    expect(out.get("csort")).toBe("x");
    expect(out.get("page")).toBe("9");
  });
  it("removes an earlier apage and apagesize when they go back to the defaults", () => {
    const out = new URLSearchParams(
      withAuditPaging(new URLSearchParams("tab=audit&apage=4&apagesize=50"), {
        page: 1,
        pageSize: 25,
      }),
    );
    expect(out.has("apage")).toBe(false);
    expect(out.has("apagesize")).toBe(false);
  });
  it("does not change its input", () => {
    const cur = new URLSearchParams("tab=audit");
    withAuditPaging(cur, { page: 2, pageSize: 50 });
    expect(cur.toString()).toBe("tab=audit");
  });
});

// docs/specs/accountant-audit-05-drivers-table.md §2.1, §4 (D7, D21, R21).

describe("parseAuditSearch and withAuditSearch (D7)", () => {
  it("uses the parameter name asearch", () => {
    expect(AUDIT_SEARCH_PARAM).toBe("asearch");
  });
  it("reads the text, empty when absent", () => {
    expect(parseAuditSearch(new URLSearchParams("asearch=ann%20lee"))).toBe("ann lee");
    expect(parseAuditSearch(new URLSearchParams("tab=audit"))).toBe("");
  });
  it("writes the text and keeps every other parameter", () => {
    const out = new URLSearchParams(
      withAuditSearch(new URLSearchParams("tab=audit&from=2026-11-01&to=2026-11-30"), "ann"),
    );
    expect(out.get("asearch")).toBe("ann");
    expect(out.get("tab")).toBe("audit");
    expect(out.get("from")).toBe("2026-11-01");
  });
  it("deletes the parameter for empty text or spaces", () => {
    expect(
      new URLSearchParams(withAuditSearch(new URLSearchParams("asearch=ann"), "")).has("asearch"),
    ).toBe(false);
    expect(
      new URLSearchParams(withAuditSearch(new URLSearchParams("asearch=ann"), "  ")).has("asearch"),
    ).toBe(false);
  });
  it("does not change its input", () => {
    const cur = new URLSearchParams("tab=audit");
    withAuditSearch(cur, "ann");
    expect(cur.toString()).toBe("tab=audit");
  });
});

describe("parseAuditSort (R21)", () => {
  const p = (q: string) => parseAuditSort(new URLSearchParams(q));
  it("uses the parameter names asort and adir", () => {
    expect(AUDIT_SORT_PARAM).toBe("asort");
    expect(AUDIT_DIR_PARAM).toBe("adir");
  });
  it("is Pay, largest first when both are missing", () => {
    expect(p("tab=audit")).toEqual({ key: "pay", direction: "desc" });
  });
  it("reads both", () => {
    expect(p("asort=driver&adir=asc")).toEqual({ key: "driver", direction: "asc" });
    expect(p("asort=trips&adir=desc")).toEqual({ key: "trips", direction: "desc" });
  });
  it("reads each parameter on its own, the missing one as the opening value", () => {
    expect(p("asort=distance")).toEqual({ key: "distance", direction: "desc" });
    expect(p("adir=asc")).toEqual({ key: "pay", direction: "asc" });
  });
  it("reads an unknown value as the opening value of that parameter", () => {
    expect(p("asort=bogus&adir=asc")).toEqual({ key: "pay", direction: "asc" });
    expect(p("asort=driver&adir=sideways")).toEqual({ key: "driver", direction: "desc" });
    expect(p("asort=&adir=")).toEqual({ key: "pay", direction: "desc" });
  });
});

describe("withAuditSort (D21, R21)", () => {
  const w = (q: string, sort: Parameters<typeof withAuditSort>[1]) =>
    new URLSearchParams(withAuditSort(new URLSearchParams(q), sort));
  it("leaves both out for the opening sort and removes earlier ones", () => {
    const out = w("tab=audit&asort=driver&adir=asc", { key: "pay", direction: "desc" });
    expect(out.has("asort")).toBe(false);
    expect(out.has("adir")).toBe(false);
    expect(out.get("tab")).toBe("audit");
  });
  it("writes the key and the direction when they differ from the opening ones", () => {
    const out = w("tab=audit", { key: "driver", direction: "asc" });
    expect(out.get("asort")).toBe("driver");
    expect(out.get("adir")).toBe("asc");
  });
  it("writes only the part that differs", () => {
    const flipped = w("tab=audit", { key: "pay", direction: "asc" });
    expect(flipped.has("asort")).toBe(false);
    expect(flipped.get("adir")).toBe("asc");
    const other = w("tab=audit", { key: "trips", direction: "desc" });
    expect(other.get("asort")).toBe("trips");
    expect(other.has("adir")).toBe(false);
  });
  it("keeps every other parameter, apage included", () => {
    const out = w("tab=audit&driver=d1&apage=3&from=2026-11-01", {
      key: "time",
      direction: "asc",
    });
    expect(out.get("apage")).toBe("3");
    expect(out.get("driver")).toBe("d1");
    expect(out.get("from")).toBe("2026-11-01");
  });
  it("does not change its input", () => {
    const cur = new URLSearchParams("tab=audit");
    withAuditSort(cur, { key: "driver", direction: "asc" });
    expect(cur.toString()).toBe("tab=audit");
  });
});

describe("withAuditDriver keeps the drivers table's own parameters (D9, R12, R21)", () => {
  it("keeps from, to, asearch, asort and adir when the driver is set or cleared", () => {
    const cur = new URLSearchParams(
      "tab=audit&from=2026-11-01&to=2026-11-30&asearch=ann&asort=driver&adir=asc",
    );
    for (const id of ["d1", null]) {
      const out = new URLSearchParams(withAuditDriver(cur, id));
      expect(out.get("from")).toBe("2026-11-01");
      expect(out.get("to")).toBe("2026-11-30");
      expect(out.get("asearch")).toBe("ann");
      expect(out.get("asort")).toBe("driver");
      expect(out.get("adir")).toBe("asc");
    }
  });
});
