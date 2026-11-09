import { describe, expect, it } from "vitest";
import {
  AUDIT_DRIVER_PARAM,
  AUDIT_PAGE_PARAM,
  AUDIT_PAGE_SIZE_PARAM,
  parseAuditDriver,
  parseAuditPaging,
  withAuditDriver,
  withAuditPaging,
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
