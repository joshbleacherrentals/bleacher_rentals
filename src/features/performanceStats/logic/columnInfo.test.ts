import { describe, expect, it } from "vitest";
import { columnInfo, type ColumnTable } from "./columnInfo";

const HEADERS: Record<ColumnTable, string[]> = {
  metrics: ["Metric", "Events", "P50", "P75", "P90", "P95", "P99", "Max", "Errors"],
  sqlite: ["Metric", "Calls", "Slow calls", "P50", "P75", "P90", "P95", "P99"],
  errors: ["Metric", "Kind", "Count", "Median", "Max", "First seen (UTC)", "Last seen (UTC)"],
  breakdown: ["Value", "Events", "P50", "P95", "P99", "Errors"],
  sqliteBreakdown: ["Value", "Calls", "Slow calls", "Slowest", "Errors"],
};

describe("columnInfo", () => {
  for (const [table, headers] of Object.entries(HEADERS) as Array<[ColumnTable, string[]]>) {
    it.each(headers)(`${table}: "%s" is explained`, (header) => {
      const text = columnInfo(table, header);
      expect(text).not.toBeNull();
      expect(text!.length).toBeGreaterThan(20);
      expect(text!.length).toBeLessThanOrEqual(420);
      // The text is also an aria-label, so it must survive being put in an attribute.
      expect(text).not.toMatch(/['"&<>]/);
    });
  }

  it("says what a percentile means, in plain words", () => {
    expect(columnInfo("metrics", "P50")).toMatch(/half/i);
    expect(columnInfo("metrics", "P99")).toMatch(/slowest/i);
  });

  it("explains that a weak percentile is muted, with the thresholds", () => {
    expect(columnInfo("metrics", "P95")).toMatch(/20/);
    expect(columnInfo("metrics", "P99")).toMatch(/100/);
  });

  it("says that the number of events is what the percentiles rest on", () => {
    expect(columnInfo("metrics", "Events")).toMatch(/rest/i);
  });

  it("explains a sqlite percentile as a bucket or an exact figure", () => {
    expect(columnInfo("sqlite", "P50")).toMatch(/bucket/i);
    expect(columnInfo("sqlite", "P99")).toMatch(/exact/i);
  });

  it("says what counts as a slow call", () => {
    expect(columnInfo("sqlite", "Slow calls")).toMatch(/50 ms/);
  });

  it("says that errors stay in the percentiles", () => {
    expect(columnInfo("metrics", "Errors")).toMatch(/percentiles/i);
  });

  it("says that an error kind is never the message", () => {
    expect(columnInfo("errors", "Kind")).toMatch(/never.*message/i);
  });

  it("means different things by the same header in different tables", () => {
    expect(columnInfo("metrics", "Max")).not.toBe(columnInfo("errors", "Max"));
    expect(columnInfo("metrics", "P95")).not.toBe(columnInfo("sqlite", "P95"));
  });

  it("returns nothing for a header it does not know", () => {
    expect(columnInfo("metrics", "Nonsense")).toBeNull();
  });
});
