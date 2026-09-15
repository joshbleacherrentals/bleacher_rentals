import { beforeEach, describe, expect, it } from "vitest";
import {
  buildReport,
  buildTraceSummary,
  clearPerfLog,
  countCascadeRequest,
  countCascadeRun,
  countDbBatch,
  countDbRead,
  formatDuration,
  getPerfLog,
  nearestRank,
  PERF_LOG_CAP,
  recordPerfEntry,
  resetPerfCounters,
  serializePerfLog,
  startTrace,
  summarizeByName,
  toPhases,
} from "./perfTrace";

describe("formatDuration", () => {
  it("keeps sub-second values in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(12.4)).toBe("12ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("switches to seconds at one second", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(4231.7)).toBe("4.23s");
  });
});

describe("toPhases", () => {
  it("turns cumulative marks into per-phase deltas", () => {
    expect(
      toPhases(
        [
          { label: "addresses", at: 10 },
          { label: "upsert", at: 25 },
          { label: "triage", at: 4000 },
        ],
        4100,
      ),
    ).toEqual([
      { label: "addresses", ms: 10 },
      { label: "upsert", ms: 15 },
      { label: "triage", ms: 3975 },
      { label: "rest", ms: 100 },
    ]);
  });

  it("omits a trailing phase that took no measurable time", () => {
    expect(toPhases([{ label: "only", at: 50 }], 50)).toEqual([{ label: "only", ms: 50 }]);
  });

  it("handles a trace with no marks", () => {
    expect(toPhases([], 120)).toEqual([{ label: "total", ms: 120 }]);
  });
});

describe("buildTraceSummary", () => {
  it("reports the slowest phase and separates transactions from statements", () => {
    const summary = buildTraceSummary({
      name: "triageWorkTrackerSaved",
      marks: [
        { label: "plan", at: 400 },
        { label: "commit", at: 500 },
      ],
      totalMs: 500,
      counts: { reads: 61, writeTransactions: 1, writeStatements: 88 },
      overlapPeak: 1,
    });

    expect(summary.headline).toBe(
      "triageWorkTrackerSaved took 500ms — slowest phase: plan (400ms)",
    );
    expect(summary.detail).toContain("local DB: 61 reads, 1 write tx (88 statements)");
    expect(summary.detail).not.toContain("shared");
  });

  it("flags counts as shared when other traces overlapped", () => {
    const summary = buildTraceSummary({
      name: "moveWorkTracker",
      marks: [],
      totalMs: 90,
      counts: { reads: 40, writeTransactions: 2, writeStatements: 2 },
      overlapPeak: 3,
    });

    expect(summary.detail).toContain(
      "shared window — 3 traces overlapped, counts not attributable",
    );
  });
});

describe("nearestRank", () => {
  it("picks the nearest-rank percentile without interpolating", () => {
    expect(nearestRank([10, 20, 30], 0.5)).toBe(20);
    expect(nearestRank([10, 20, 30, 40], 0.5)).toBe(20);
    expect(nearestRank([5], 0.5)).toBe(5);
    expect(nearestRank([10, 20, 30, 40], 1)).toBe(40);
  });

  it("returns 0 for an empty sample", () => {
    expect(nearestRank([], 0.5)).toBe(0);
  });
});

describe("summarizeByName", () => {
  beforeEach(() => clearPerfLog());

  it("aggregates traces per name, slowest total first", () => {
    recordPerfEntry({ kind: "note", message: "ignored" });
    recordPerfEntry({ kind: "trace", name: "moveWorkTracker", totalMs: 80 });
    recordPerfEntry({ kind: "trace", name: "moveWorkTracker", totalMs: 120 });
    recordPerfEntry({ kind: "trace", name: "cascade", totalMs: 900 });

    expect(summarizeByName(getPerfLog())).toEqual([
      { name: "cascade", count: 1, totalMs: 900, medianMs: 900, maxMs: 900 },
      { name: "moveWorkTracker", count: 2, totalMs: 200, medianMs: 80, maxMs: 120 },
    ]);
  });

  it("ignores notes entirely", () => {
    recordPerfEntry({ kind: "note", message: "only a note" });
    expect(summarizeByName(getPerfLog())).toEqual([]);
  });
});

describe("perf log buffer", () => {
  beforeEach(() => clearPerfLog());

  it("records traces and notes in order", () => {
    recordPerfEntry({ kind: "note", message: "ripple: 42 calls" });
    recordPerfEntry({ kind: "trace", name: "saveWorkTracker", totalMs: 4230 });

    const entries = getPerfLog();
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("note");
    expect(entries[1].name).toBe("saveWorkTracker");
    expect(entries[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("drops the oldest entries once the cap is reached", () => {
    for (let i = 0; i < PERF_LOG_CAP + 10; i++) {
      recordPerfEntry({ kind: "note", message: `n${i}` });
    }

    const entries = getPerfLog();
    expect(entries).toHaveLength(PERF_LOG_CAP);
    expect(entries[0].message).toBe("n10");
  });

  it("serializes to greppable lines", () => {
    recordPerfEntry({ kind: "note", message: "ripple: 42 calls" });
    recordPerfEntry({
      kind: "trace",
      name: "triageWorkTrackerSaved",
      totalMs: 500,
      counts: { reads: 61, writeTransactions: 1, writeStatements: 88 },
      overlapPeak: 1,
      phases: [
        { label: "plan", ms: 400 },
        { label: "commit", ms: 100 },
      ],
      extra: { statements: 88 },
    });

    const lines = serializePerfLog(getPerfLog()).trim().split("\n");

    expect(lines[0]).toContain("# perf log");
    expect(lines[1]).toContain("NOTE\tripple: 42 calls");
    expect(lines[2]).toContain("triageWorkTrackerSaved\t500ms\treads=61 tx=1 stmts=88");
    expect(lines[2]).toContain("plan 400ms → commit 100ms");
    expect(lines[2]).toContain('{"statements":88}');
  });

  it("marks a shared window in the serialized line", () => {
    recordPerfEntry({
      kind: "trace",
      name: "moveWorkTracker",
      totalMs: 90,
      counts: { reads: 40, writeTransactions: 1, writeStatements: 1 },
      overlapPeak: 2,
    });

    expect(serializePerfLog(getPerfLog())).toContain("shared(peak=2)");
  });

  it("serializes an empty log without crashing", () => {
    expect(serializePerfLog([])).toContain("# perf log");
  });
});

describe("trace counters", () => {
  beforeEach(() => {
    clearPerfLog();
    resetPerfCounters();
  });

  it("attributes DB operations to the traces that were open", () => {
    const outer = startTrace("outer");
    countDbRead();

    const inner = startTrace("inner");
    countDbBatch(7);
    inner.end();

    countDbRead();
    const summary = outer.end();

    // outer saw both reads and the batch; inner saw only the batch.
    expect(summary.counts).toEqual({ reads: 2, writeTransactions: 1, writeStatements: 7 });
    expect(summary.overlapPeak).toBe(2);

    const innerEntry = getPerfLog().find((e) => e.name === "inner");
    expect(innerEntry?.counts).toEqual({ reads: 0, writeTransactions: 1, writeStatements: 7 });
  });

  it("reports a solo trace as unshared", () => {
    const trace = startTrace("solo");
    countDbRead();
    expect(trace.end().overlapPeak).toBe(1);
  });
});

describe("cascade counters", () => {
  beforeEach(() => resetPerfCounters());

  it("reports how many requests collapsed into how many runs", () => {
    for (let i = 0; i < 8; i++) countCascadeRequest();
    countCascadeRun();
    countCascadeRun();

    expect(buildReport([])).toContain("cascades: 8 requests → 2 runs (collapsed 6)");
  });

  it("says nothing about cascades when none ran", () => {
    expect(buildReport([])).not.toContain("cascades:");
  });
});

describe("buildReport", () => {
  beforeEach(() => {
    clearPerfLog();
    resetPerfCounters();
  });

  it("lists each traced operation with its count and worst case", () => {
    recordPerfEntry({ kind: "trace", name: "moveWorkTracker", totalMs: 80 });
    recordPerfEntry({ kind: "trace", name: "moveWorkTracker", totalMs: 140 });

    const report = buildReport(getPerfLog());

    expect(report).toContain("moveWorkTracker");
    expect(report).toContain("×2");
    expect(report).toContain("max 140ms");
  });
});
