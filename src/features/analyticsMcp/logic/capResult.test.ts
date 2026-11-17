import { describe, it, expect } from "vitest";
import { capResult } from "./capResult";

// docs/specs/analytics-mcp.md §3 and §9: a result is cut by size, from the end, and says so.
describe("capResult", () => {
  const columns = ["id", "name"];

  it("returns a small result untouched, with its row count", () => {
    const rows = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    expect(capResult({ columns, rows, truncated: false }, 10_000)).toEqual({
      columns,
      rows,
      rowCount: 2,
      truncated: false,
    });
  });

  it("keeps truncated = true when the caller already cut the rows", () => {
    const r = capResult({ columns, rows: [{ id: 1, name: "a" }], truncated: true }, 10_000);
    expect(r.truncated).toBe(true);
    expect(r.rowCount).toBe(1);
  });

  it("drops rows from the end until the serialized size fits", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, name: "x".repeat(50) }));
    const r = capResult({ columns, rows, truncated: false }, 1_000);
    expect(r.truncated).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.length).toBeLessThan(100);
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(1_000);
    expect(r.rows[0]).toEqual(rows[0]);
    expect(r.rowCount).toBe(r.rows.length);
  });

  it("returns no rows, truncated, when even the first row is over the limit", () => {
    const r = capResult(
      { columns, rows: [{ id: 1, name: "x".repeat(5_000) }], truncated: false },
      1_000,
    );
    expect(r.rows).toEqual([]);
    expect(r.truncated).toBe(true);
    expect(r.rowCount).toBe(0);
  });

  it("handles an empty result", () => {
    expect(capResult({ columns, rows: [], truncated: false }, 1_000)).toEqual({
      columns,
      rows: [],
      rowCount: 0,
      truncated: false,
    });
  });
});
