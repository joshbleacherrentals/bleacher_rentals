import { describe, expect, it } from "vitest";
import { AUDIT_DRIVER_PARAM, parseAuditDriver, withAuditDriver } from "./auditUrlState";

// docs/specs/accountant-audit-02-driver-select.md §3, §5.

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
