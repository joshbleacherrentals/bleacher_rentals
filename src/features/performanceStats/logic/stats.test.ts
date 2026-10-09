import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  buildSearch,
  describeLoadError,
  formatBytes,
  formatCount,
  formatMs,
  formatSqlitePercentile,
  groupByStage,
  isWeakPercentile,
  mapBreakdownRow,
  mapErrorRow,
  mapHealthRow,
  mapMetricRow,
  mapSqliteRows,
  parseView,
  periodToSince,
  resolveVersion,
  stageOf,
} from "./stats";

describe("periodToSince", () => {
  const now = new Date("2026-10-09T12:00:00.000Z");

  it("goes back 24 hours, 7 days or 30 days from the moment given", () => {
    expect(periodToSince("24h", now)).toBe("2026-10-08T12:00:00.000Z");
    expect(periodToSince("7d", now)).toBe("2026-10-02T12:00:00.000Z");
    expect(periodToSince("30d", now)).toBe("2026-09-09T12:00:00.000Z");
  });
});

describe("parseView", () => {
  it("falls back to the starting values for an empty address", () => {
    expect(parseView("")).toEqual({ filters: DEFAULT_FILTERS, metric: null });
    expect(DEFAULT_FILTERS).toEqual({ period: "7d", env: "production", version: null });
  });

  it("reads all four values", () => {
    expect(
      parseView("?period=24h&env=development&version=1.16.0&metric=powersync.connect"),
    ).toEqual({
      filters: { period: "24h", env: "development", version: "1.16.0" },
      metric: "powersync.connect",
    });
  });

  it("accepts a URLSearchParams as well as a string", () => {
    expect(parseView(new URLSearchParams("period=30d")).filters.period).toBe("30d");
  });

  it("falls back, value by value, for anything unknown or malformed", () => {
    const view = parseView("?period=1y&env=staging&version=&metric=DROP TABLE");
    expect(view).toEqual({ filters: DEFAULT_FILTERS, metric: null });
  });

  it("keeps a good value next to a bad one", () => {
    expect(parseView("?period=bogus&env=development").filters).toEqual({
      period: "7d",
      env: "development",
      version: null,
    });
  });

  it("refuses a version that is not a plain version string", () => {
    expect(parseView("?version=<script>").filters.version).toBeNull();
    expect(parseView(`?version=${"1".repeat(40)}`).filters.version).toBeNull();
  });

  it("refuses a metric that is not a dotted lowercase name", () => {
    expect(parseView("?metric=sqlite.query").metric).toBe("sqlite.query");
    expect(parseView("?metric=Sqlite.Query").metric).toBeNull();
    expect(parseView("?metric=query").metric).toBeNull();
    expect(parseView(`?metric=${"a.".repeat(40)}b`).metric).toBeNull();
  });
});

describe("buildSearch", () => {
  it("is empty for the starting view, so the plain page has a plain address", () => {
    expect(buildSearch({ filters: DEFAULT_FILTERS, metric: null })).toBe("");
  });

  it("writes only the values that differ from the starting ones", () => {
    expect(buildSearch({ filters: { ...DEFAULT_FILTERS, period: "24h" }, metric: null })).toBe(
      "?period=24h",
    );
    expect(
      buildSearch({ filters: { ...DEFAULT_FILTERS, env: "development" }, metric: "sync.initial" }),
    ).toBe("?env=development&metric=sync.initial");
  });

  it("writes all four when all differ, in a fixed order", () => {
    expect(
      buildSearch({
        filters: { period: "30d", env: "development", version: "1.16.0" },
        metric: "ui.first_data",
      }),
    ).toBe("?period=30d&env=development&version=1.16.0&metric=ui.first_data");
  });

  it("round-trips through parseView", () => {
    const view = {
      filters: { period: "24h" as const, env: "development" as const, version: "1.2.3" },
      metric: "sqlite.batch",
    };
    expect(parseView(buildSearch(view))).toEqual(view);
  });
});

describe("resolveVersion", () => {
  it("keeps a version the period has", () => {
    expect(resolveVersion("1.1.0", ["1.1.0", "1.0.0"])).toBe("1.1.0");
  });

  it("falls back to all versions when the version is no longer there", () => {
    expect(resolveVersion("0.9.0", ["1.1.0", "1.0.0"])).toBeNull();
  });

  it("keeps all versions as all versions", () => {
    expect(resolveVersion(null, ["1.1.0"])).toBeNull();
  });
});

describe("stages", () => {
  it("names the stage by the part before the first dot", () => {
    expect(stageOf("powersync.connect")).toBe("powersync");
    expect(stageOf("ui.first_data")).toBe("ui");
  });

  it("orders the groups app, sqlite, powersync, sync, ui and keeps the rows' order inside", () => {
    const groups = groupByStage([
      { name: "ui.first_data" },
      { name: "sync.upload" },
      { name: "powersync.connect" },
      { name: "powersync.credentials" },
      { name: "sqlite.open" },
      { name: "app.start" },
    ]);
    expect(groups.map((g) => g.stage)).toEqual(["app", "sqlite", "powersync", "sync", "ui"]);
    expect(groups[2].rows.map((r) => r.name)).toEqual([
      "powersync.connect",
      "powersync.credentials",
    ]);
  });

  it("puts a stage it does not know last instead of dropping it", () => {
    const groups = groupByStage([{ name: "zzz.thing" }, { name: "app.start" }]);
    expect(groups.map((g) => g.stage)).toEqual(["app", "zzz"]);
  });

  it("returns no groups for no rows", () => {
    expect(groupByStage([])).toEqual([]);
  });
});

describe("isWeakPercentile", () => {
  it("marks P95 below 20 events and P99 below 100", () => {
    expect(isWeakPercentile(19, "p95")).toBe(true);
    expect(isWeakPercentile(20, "p95")).toBe(false);
    expect(isWeakPercentile(99, "p99")).toBe(true);
    expect(isWeakPercentile(100, "p99")).toBe(false);
  });

  it("does not mark the percentiles the queries document has no threshold for", () => {
    expect(isWeakPercentile(1, "p50")).toBe(false);
    expect(isWeakPercentile(1, "p75")).toBe(false);
    expect(isWeakPercentile(1, "p90")).toBe(false);
  });
});

describe("formatting", () => {
  it("shows one decimal under 100 ms and whole milliseconds above", () => {
    expect(formatMs(12.46)).toBe("12.5 ms");
    expect(formatMs(99.94)).toBe("99.9 ms");
    expect(formatMs(100)).toBe("100 ms");
    expect(formatMs(350.4)).toBe("350 ms");
    expect(formatMs(1234.6)).toBe("1,235 ms");
  });

  it("shows a dash for no value", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(Number.NaN)).toBe("—");
  });

  it("formats counts with thousands separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(0)).toBe("0");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("shows a bucket as an upper bound and an exact value as itself", () => {
    expect(formatSqlitePercentile({ p: 0.5, kind: "bucket", value: 5 })).toBe("≤ 5 ms");
    expect(formatSqlitePercentile({ p: 0.99, kind: "exact", value: 80 })).toBe(
      "80.0 ms".replace(".0", ""),
    );
    expect(formatSqlitePercentile({ p: 0.99, kind: "exact", value: 80.4 })).toBe("80.4 ms");
  });
});

describe("describeLoadError", () => {
  it("explains a statement timeout and suggests a shorter period", () => {
    expect(describeLoadError({ code: "57014", message: "canceling statement" })).toMatch(
      /took too long.*shorter period/i,
    );
  });

  it("explains that the page needs a connection when the fetch itself failed", () => {
    expect(describeLoadError(new TypeError("Failed to fetch"))).toMatch(/connection/i);
  });

  it("names only the kind of any other error, never its message", () => {
    const text = describeLoadError({ code: "42501", message: 'row {"email":"a@b.c"}' });
    expect(text).toContain("pg:42501");
    expect(text).not.toContain("a@b.c");
  });

  it("copes with something that is not an error object", () => {
    expect(describeLoadError(undefined)).toContain("unknown");
    expect(describeLoadError("boom")).toContain("unknown");
  });
});

describe("row mappers", () => {
  it("maps a metrics row", () => {
    expect(
      mapMetricRow({
        name: "powersync.connect",
        n: 7,
        errors: 1,
        p50: 400,
        p75: 500,
        p90: 600,
        p95: 880,
        p99: 960,
        max_ms: 1000,
      }),
    ).toEqual({
      name: "powersync.connect",
      n: 7,
      errors: 1,
      p50: 400,
      p75: 500,
      p90: 600,
      p95: 880,
      p99: 960,
      maxMs: 1000,
    });
  });

  it("turns bigint strings into numbers", () => {
    expect(
      mapMetricRow({
        name: "x.y",
        n: "12" as never,
        errors: "0" as never,
        p50: 1,
        p75: 1,
        p90: 1,
        p95: 1,
        p99: 1,
        max_ms: 1,
      }).n,
    ).toBe(12);
  });

  it("groups the sqlite percentile rows by metric, in percentile order", () => {
    const rows = mapSqliteRows([
      { name: "sqlite.query", calls: 103, slow_calls: 2, p: 0.99, kind: "exact", value: 80 },
      { name: "sqlite.query", calls: 103, slow_calls: 2, p: 0.5, kind: "bucket", value: 5 },
      { name: "sqlite.write", calls: 10, slow_calls: 0, p: 0.5, kind: "bucket", value: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "sqlite.query", calls: 103, slowCalls: 2 });
    expect(rows[0].percentiles.map((x) => x.p)).toEqual([0.5, 0.99]);
    expect(rows[0].percentiles[1]).toEqual({ p: 0.99, kind: "exact", value: 80 });
  });

  it("maps an error row", () => {
    expect(
      mapErrorRow({
        name: "sync.upload",
        kind: "pg:23505",
        count: 2,
        median_ms: 60,
        max_ms: 70,
        first_seen: "2026-10-09T10:00:00Z",
        last_seen: "2026-10-09T11:00:00Z",
      }),
    ).toEqual({
      name: "sync.upload",
      kind: "pg:23505",
      count: 2,
      medianMs: 60,
      maxMs: 70,
      firstSeen: "2026-10-09T10:00:00Z",
      lastSeen: "2026-10-09T11:00:00Z",
    });
  });

  it("maps the health row", () => {
    expect(
      mapHealthRow({
        events: 19,
        dropped: 10,
        loads: 2,
        table_rows: 21,
        oldest: "2026-08-30T00:00:00Z",
        newest: "2026-10-09T11:00:00Z",
        size_bytes: 8192,
      }),
    ).toEqual({
      events: 19,
      dropped: 10,
      loads: 2,
      rows: 21,
      oldest: "2026-08-30T00:00:00Z",
      newest: "2026-10-09T11:00:00Z",
      sizeBytes: 8192,
    });
  });

  it("maps a breakdown row of an ordinary metric and of a sqlite one", () => {
    expect(
      mapBreakdownRow({
        dimension: "role",
        value: "admin",
        n: 3,
        errors: 0,
        p50: 200,
        p95: 290,
        p99: 298,
        calls: null,
        slow_calls: null,
        max_ms: null,
      }),
    ).toMatchObject({ dimension: "role", value: "admin", n: 3, p50: 200 });

    const sqlite = mapBreakdownRow({
      dimension: "op",
      value: "select",
      n: 103,
      errors: 1,
      p50: null,
      p95: null,
      p99: null,
      calls: 103,
      slow_calls: 2,
      max_ms: 200,
    });
    expect(sqlite).toMatchObject({ calls: 103, slowCalls: 2, maxMs: 200, p95: null });
  });
});
