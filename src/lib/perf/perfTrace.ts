"use client";

/**
 * Timing instrumentation for the work tracker save / move / modal paths.
 *
 * It exists because the cost in these paths is dominated by the *number* of
 * sequential round-trips to the wa-sqlite worker, not by any single slow query —
 * a flame chart just shows a wall of identical frames. Three things make the
 * numbers trustworthy enough to base a fix on:
 *
 *  - PowerSync logs at DEBUG level (see `SystemProvider`), so every line here
 *    carries a coloured `PERF` badge and is greppable as `PERF`.
 *  - Write *transactions* and write *statements* are counted separately. Since
 *    the alert cascade began committing as one batch, counting only transactions
 *    would make ~100 writes look like they vanished rather than got batched.
 *  - The alert cascade now runs in the background, so several traces can be open
 *    at once and a counter cannot tell whose operation it saw. Rather than
 *    inventing attribution, each trace records how many traces overlapped it;
 *    at `overlapPeak === 1` its counts are exclusively its own, and above that
 *    they are reported as a shared window.
 *
 * Counting is a few integer increments per query, so it stays on. Console output
 * happens only at phase boundaries — a handful of lines per save.
 */

export type TraceMark = { label: string; at: number };
export type TracePhase = { label: string; ms: number };

export type DbCounts = {
  reads: number;
  /** Round-trips to the worker. A batch is one, however many statements it carries. */
  writeTransactions: number;
  /** Individual INSERT/UPDATE/DELETE statements, batched or not. */
  writeStatements: number;
};

export type TraceSummary = {
  headline: string;
  detail: string;
  phases: TracePhase[];
  counts: DbCounts;
  /** Highest number of traces open simultaneously during this one's lifetime. */
  overlapPeak: number;
};

/** Rounded milliseconds under a second, two-decimal seconds above it. */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Marks are recorded as cumulative offsets from the trace start (that is what
 * `performance.now()` differences give us); phases are what a reader wants. The
 * tail between the last mark and the end becomes `rest`, unless it rounds to nothing.
 */
export function toPhases(marks: TraceMark[], totalMs: number): TracePhase[] {
  if (marks.length === 0) return [{ label: "total", ms: totalMs }];

  const phases: TracePhase[] = [];
  let previous = 0;
  for (const mark of marks) {
    phases.push({ label: mark.label, ms: mark.at - previous });
    previous = mark.at;
  }

  const rest = totalMs - previous;
  if (Math.round(rest) > 0) phases.push({ label: "rest", ms: rest });

  return phases;
}

function formatCounts(counts: DbCounts): string {
  return `${counts.reads} reads, ${counts.writeTransactions} write tx (${counts.writeStatements} statements)`;
}

export function buildTraceSummary(params: {
  name: string;
  marks: TraceMark[];
  totalMs: number;
  counts: DbCounts;
  overlapPeak: number;
}): TraceSummary {
  const { name, marks, totalMs, counts, overlapPeak } = params;
  const phases = toPhases(marks, totalMs);

  const slowest =
    marks.length > 0 ? phases.reduce((worst, p) => (p.ms > worst.ms ? p : worst)) : null;

  const headline = slowest
    ? `${name} took ${formatDuration(totalMs)} — slowest phase: ${slowest.label} (${formatDuration(slowest.ms)})`
    : `${name} took ${formatDuration(totalMs)}`;

  const lines = [`local DB: ${formatCounts(counts)}`];
  if (overlapPeak > 1) {
    lines.push(
      `shared window — ${overlapPeak} traces overlapped, counts not attributable to this trace alone`,
    );
  }
  lines.push(phases.map((p) => `${p.label} ${formatDuration(p.ms)}`).join("  →  "));

  return { headline, detail: lines.join("\n"), phases, counts, overlapPeak };
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

type TraceState = { counts: DbCounts; overlapPeak: number };

const openTraces = new Set<TraceState>();

let totals: DbCounts = { reads: 0, writeTransactions: 0, writeStatements: 0 };
let cascadeRequests = 0;
let cascadeRuns = 0;

function bump(apply: (counts: DbCounts) => void): void {
  apply(totals);
  for (const trace of openTraces) apply(trace.counts);
}

export function countDbRead(): void {
  bump((c) => c.reads++);
}

export function countDbWrite(): void {
  bump((c) => {
    c.writeTransactions++;
    c.writeStatements++;
  });
}

/** One transaction carrying `statementCount` statements. */
export function countDbBatch(statementCount: number): void {
  bump((c) => {
    c.writeTransactions++;
    c.writeStatements += statementCount;
  });
}

/** A cascade was asked for — it may be collapsed into a run already in flight. */
export function countCascadeRequest(): void {
  cascadeRequests++;
}

/** A cascade actually executed. */
export function countCascadeRun(): void {
  cascadeRuns++;
}

export function dbOpCounts(): DbCounts {
  return { ...totals };
}

export function cascadeCounts(): { requests: number; runs: number } {
  return { requests: cascadeRequests, runs: cascadeRuns };
}

/** Test seam, and what `perfLog.clear()` uses to start a clean measurement. */
export function resetPerfCounters(): void {
  totals = { reads: 0, writeTransactions: 0, writeStatements: 0 };
  cascadeRequests = 0;
  cascadeRuns = 0;
  openTraces.clear();
}

// ---------------------------------------------------------------------------
// Log buffer
// ---------------------------------------------------------------------------

export type PerfLogEntry = {
  at: string;
  kind: "trace" | "note";
  name?: string;
  message?: string;
  totalMs?: number;
  counts?: DbCounts;
  overlapPeak?: number;
  phases?: TracePhase[];
  extra?: Record<string, unknown>;
};

/** Enough for a long debugging session; old entries fall off the front. */
export const PERF_LOG_CAP = 2000;

let perfLog: PerfLogEntry[] = [];

export function recordPerfEntry(entry: Omit<PerfLogEntry, "at">): void {
  perfLog.push({ at: new Date().toISOString(), ...entry });
  if (perfLog.length > PERF_LOG_CAP) perfLog = perfLog.slice(perfLog.length - PERF_LOG_CAP);
}

export function getPerfLog(): PerfLogEntry[] {
  return perfLog;
}

export function clearPerfLog(): void {
  perfLog = [];
}

/** Tab-separated so the result stays greppable and pastes into a sheet. */
export function serializePerfLog(entries: PerfLogEntry[]): string {
  const header = `# perf log — ${entries.length} entries, written ${new Date().toISOString()}`;

  const lines = entries.map((entry) => {
    if (entry.kind === "note") return `${entry.at}\tNOTE\t${entry.message ?? ""}`;

    const counts = entry.counts ?? { reads: 0, writeTransactions: 0, writeStatements: 0 };
    const shared = (entry.overlapPeak ?? 1) > 1 ? ` shared(peak=${entry.overlapPeak})` : "";

    const columns = [
      entry.at,
      entry.name ?? "",
      formatDuration(entry.totalMs ?? 0),
      `reads=${counts.reads} tx=${counts.writeTransactions} stmts=${counts.writeStatements}${shared}`,
      (entry.phases ?? []).map((p) => `${p.label} ${formatDuration(p.ms)}`).join(" → "),
    ];
    if (entry.extra && Object.keys(entry.extra).length > 0) {
      columns.push(JSON.stringify(entry.extra));
    }
    return columns.join("\t");
  });

  return [header, ...lines].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Aggregation — the before/after view
// ---------------------------------------------------------------------------

/** Percentile by nearest rank: no interpolation, so small samples stay honest. */
export function nearestRank(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1];
}

export type NameSummary = {
  name: string;
  count: number;
  totalMs: number;
  medianMs: number;
  maxMs: number;
};

export function summarizeByName(entries: PerfLogEntry[]): NameSummary[] {
  const byName = new Map<string, number[]>();

  for (const entry of entries) {
    if (entry.kind !== "trace" || !entry.name) continue;
    const durations = byName.get(entry.name) ?? [];
    durations.push(entry.totalMs ?? 0);
    byName.set(entry.name, durations);
  }

  return [...byName.entries()]
    .map(([name, durations]) => ({
      name,
      count: durations.length,
      totalMs: durations.reduce((sum, ms) => sum + ms, 0),
      medianMs: nearestRank(durations, 0.5),
      maxMs: Math.max(...durations),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

/** The summary to paste into a PR: one line per traced operation. */
export function buildReport(entries: PerfLogEntry[]): string {
  const lines = ["# perf report"];

  const { requests, runs } = cascadeCounts();
  if (requests > 0 || runs > 0) {
    lines.push(`cascades: ${requests} requests → ${runs} runs (collapsed ${requests - runs})`);
  }

  const summaries = summarizeByName(entries);
  if (summaries.length === 0) {
    lines.push("no traces recorded");
    return lines.join("\n");
  }

  for (const s of summaries) {
    lines.push(
      `${s.name}  ×${s.count}  median ${formatDuration(s.medianMs)}  max ${formatDuration(s.maxMs)}  total ${formatDuration(s.totalMs)}`,
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

const BADGE_STYLE =
  "background:#7c3aed;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px";
const HEADLINE_STYLE = "color:#7c3aed;font-weight:700";

/** `localStorage.perfTrace = "1"` adds a line per nested step (e.g. each alert). */
export function isVerbosePerf(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("perfTrace") === "1";
  } catch {
    return false;
  }
}

/** One highlighted line, for steps that don't warrant a whole trace. */
export function perfNote(message: string, ...args: unknown[]): void {
  recordPerfEntry({ kind: "note", message });
  console.log(`%cPERF%c ${message}`, BADGE_STYLE, HEADLINE_STYLE, ...args);
}

/** Same, but only when verbose tracing is switched on. */
export function perfVerbose(message: string, ...args: unknown[]): void {
  if (isVerbosePerf()) perfNote(message, ...args);
}

export type PerfTrace = {
  /** Record that everything since the previous mark belongs to `label`. */
  mark(label: string): void;
  /** Close the trace and print it. Returns the summary for tests/callers. */
  end(extra?: Record<string, unknown>): TraceSummary;
};

export function startTrace(name: string): PerfTrace {
  const startedAt = performance.now();
  const marks: TraceMark[] = [];

  const state: TraceState = {
    counts: { reads: 0, writeTransactions: 0, writeStatements: 0 },
    overlapPeak: 0,
  };
  openTraces.add(state);
  // Opening a trace raises the overlap of every trace already running, and
  // inherits theirs — a background cascade and a foreground save each need to
  // know the other was there.
  for (const open of openTraces) open.overlapPeak = Math.max(open.overlapPeak, openTraces.size);

  let ended = false;

  return {
    mark(label) {
      marks.push({ label, at: performance.now() - startedAt });
    },
    end(extra) {
      const totalMs = performance.now() - startedAt;
      if (!ended) {
        ended = true;
        openTraces.delete(state);
      }

      const summary = buildTraceSummary({
        name,
        marks,
        totalMs,
        counts: state.counts,
        overlapPeak: state.overlapPeak,
      });

      recordPerfEntry({
        kind: "trace",
        name,
        totalMs,
        counts: summary.counts,
        overlapPeak: summary.overlapPeak,
        phases: summary.phases,
        extra,
      });

      console.groupCollapsed(`%cPERF%c ${summary.headline}`, BADGE_STYLE, HEADLINE_STYLE);
      console.log(summary.detail);
      if (extra && Object.keys(extra).length > 0) console.log(extra);
      console.groupEnd();

      return summary;
    },
  };
}

// ---------------------------------------------------------------------------
// Writing the log out
// ---------------------------------------------------------------------------

function saveTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next tick so the download has already been handed the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Saves the full log plus the aggregated report as one text file. */
export function downloadPerfLog(filename?: string): number {
  const entries = getPerfLog();
  const text = [buildReport(entries), "", serializePerfLog(entries)].join("\n");
  saveTextFile(text, filename ?? `perf-log-${stamp()}.txt`);
  return entries.length;
}

/**
 * Exposed on `window` so a session can be measured without a build or a
 * debugger attached: `perfLog.report()` in the console.
 */
declare global {
  interface Window {
    perfLog?: {
      entries: typeof getPerfLog;
      report: () => string;
      text: () => string;
      download: typeof downloadPerfLog;
      clear: () => string;
      verbose: (on?: boolean) => string;
    };
  }
}

if (typeof window !== "undefined") {
  window.perfLog = {
    entries: getPerfLog,
    report: () => buildReport(getPerfLog()),
    text: () => serializePerfLog(getPerfLog()),
    download: downloadPerfLog,
    clear: () => {
      clearPerfLog();
      resetPerfCounters();
      return "perf log and counters cleared";
    },
    verbose: (on = true) => {
      try {
        if (on) window.localStorage.setItem("perfTrace", "1");
        else window.localStorage.removeItem("perfTrace");
      } catch {
        return "localStorage unavailable — verbose mode unchanged";
      }
      return `verbose per-alert timing ${on ? "on" : "off"}`;
    },
  };
}
