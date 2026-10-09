import { classifyError } from "@/lib/perf/classifyError";
import type { Database } from "../../../../database.types";

/**
 * The dashboard's pure logic: the filters and the address, grouping, thresholds, formatting and
 * the mapping of the database functions' rows. Spec: docs/specs/performance-dashboard.md.
 */

// ---------------------------------------------------------------------------
// Filters and the address
// ---------------------------------------------------------------------------

export const PERIODS = ["24h", "7d", "30d"] as const;
export type PerformancePeriod = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<PerformancePeriod, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

export const ENVIRONMENTS = ["production", "development"] as const;
export type PerformanceEnv = (typeof ENVIRONMENTS)[number];

export type PerformanceFilters = {
  period: PerformancePeriod;
  env: PerformanceEnv;
  /** Null is "all versions". */
  version: string | null;
};

/** The starting values (D5). A value equal to its starting value is left out of the address. */
export const DEFAULT_FILTERS: PerformanceFilters = {
  period: "7d",
  env: "production",
  version: null,
};

export type PerformanceView = { filters: PerformanceFilters; metric: string | null };

const PERIOD_MS: Record<PerformancePeriod, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** The start of the period, as a timestamp the database functions take. */
export function periodToSince(period: PerformancePeriod, now: Date): string {
  return new Date(now.getTime() - PERIOD_MS[period]).toISOString();
}

const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/;
const METRIC = /^[a-z]+(\.[a-z_]+)+$/;
const MAX_METRIC_LENGTH = 64;

/** Anything missing, unknown or malformed falls back to its starting value. */
export function parseView(search: string | URLSearchParams): PerformanceView {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;

  const period = params.get("period");
  const env = params.get("env");
  const version = params.get("version");
  const metric = params.get("metric");

  return {
    filters: {
      period: (PERIODS as readonly string[]).includes(period ?? "")
        ? (period as PerformancePeriod)
        : DEFAULT_FILTERS.period,
      env: (ENVIRONMENTS as readonly string[]).includes(env ?? "")
        ? (env as PerformanceEnv)
        : DEFAULT_FILTERS.env,
      version: version && VERSION.test(version) ? version : null,
    },
    metric: metric && metric.length <= MAX_METRIC_LENGTH && METRIC.test(metric) ? metric : null,
  };
}

/** `""` for the starting view, otherwise `?period=...&env=...&version=...&metric=...`. */
export function buildSearch(view: PerformanceView): string {
  const params = new URLSearchParams();
  const { filters, metric } = view;

  if (filters.period !== DEFAULT_FILTERS.period) params.set("period", filters.period);
  if (filters.env !== DEFAULT_FILTERS.env) params.set("env", filters.env);
  if (filters.version) params.set("version", filters.version);
  if (metric) params.set("metric", metric);

  const text = params.toString();
  return text ? `?${text}` : "";
}

/** A version the period no longer has falls back to all versions. */
export function resolveVersion(version: string | null, available: string[]): string | null {
  return version !== null && available.includes(version) ? version : null;
}

// ---------------------------------------------------------------------------
// Stages and thresholds
// ---------------------------------------------------------------------------

export const STAGES = ["app", "sqlite", "powersync", "sync", "ui"] as const;

export function stageOf(name: string): string {
  return name.split(".")[0];
}

/** Rows grouped by stage in the order of the request; an unknown stage goes last, not missing. */
export function groupByStage<T extends { name: string }>(
  rows: T[],
): Array<{ stage: string; rows: T[] }> {
  const byStage = new Map<string, T[]>();
  for (const row of rows) {
    const stage = stageOf(row.name);
    byStage.set(stage, [...(byStage.get(stage) ?? []), row]);
  }

  const rank = (stage: string) => {
    const index = (STAGES as readonly string[]).indexOf(stage);
    return index === -1 ? STAGES.length : index;
  };

  return [...byStage.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([stage, stageRows]) => ({ stage, rows: stageRows }));
}

/** The thresholds of docs/PERFORMANCE_QUERIES.md: P95 below 20 events, P99 below 100. */
export const FEW_FOR_P95 = 20;
export const FEW_FOR_P99 = 100;

export function isWeakPercentile(n: number, percentile: string): boolean {
  if (percentile === "p95") return n < FEW_FOR_P95;
  if (percentile === "p99") return n < FEW_FOR_P99;
  return false;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCount(n: number): string {
  return integer.format(n);
}

/** One decimal under 100 ms, whole milliseconds above. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 100) return `${(Math.round(ms * 10) / 10).toString()} ms`;
  return `${integer.format(Math.round(ms))} ms`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type SqlitePercentile = { p: number; kind: "bucket" | "exact"; value: number };

/** A bucket is only known to its upper edge, so it is shown as one. */
export function formatSqlitePercentile(entry: SqlitePercentile): string {
  return entry.kind === "bucket" ? `≤ ${formatMs(entry.value)}` : formatMs(entry.value);
}

/** What to tell the developer when a block could not load. Never the error's own message. */
export function describeLoadError(error: unknown): string {
  const kind = classifyError(error);
  if (kind === "pg:57014") {
    return "The query took too long. Try a shorter period.";
  }
  if (kind === "network") return "The page needs a connection to read the statistics.";
  if (kind === "auth") return "You are not signed in as a developer.";
  return `Could not load this block (${kind}).`;
}

// ---------------------------------------------------------------------------
// The database functions' rows, as the page uses them
// ---------------------------------------------------------------------------

type Functions = Database["public"]["Functions"];
type RawMetric = Functions["perf_percentiles"]["Returns"][number];
type RawSqlite = Functions["perf_sqlite"]["Returns"][number];
type RawError = Functions["perf_errors"]["Returns"][number];
type RawHealth = Functions["perf_health"]["Returns"][number];
type RawBreakdown = Functions["perf_breakdown"]["Returns"][number];
type RawVersion = Functions["perf_versions"]["Returns"][number];

// PostgREST can hand a bigint back as a string; every count goes through this.
const num = (value: number | string): number => Number(value);
const maybe = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export type MetricRow = {
  name: string;
  n: number;
  errors: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  maxMs: number;
};

export function mapMetricRow(raw: RawMetric): MetricRow {
  return {
    name: raw.name,
    n: num(raw.n),
    errors: num(raw.errors),
    p50: num(raw.p50),
    p75: num(raw.p75),
    p90: num(raw.p90),
    p95: num(raw.p95),
    p99: num(raw.p99),
    maxMs: num(raw.max_ms),
  };
}

export type SqliteRow = {
  name: string;
  calls: number;
  slowCalls: number;
  percentiles: SqlitePercentile[];
};

/** The function returns one row per metric and percentile; the page wants one row per metric. */
export function mapSqliteRows(raw: RawSqlite[]): SqliteRow[] {
  const byName = new Map<string, SqliteRow>();

  for (const row of raw) {
    const entry = byName.get(row.name) ?? {
      name: row.name,
      calls: num(row.calls),
      slowCalls: num(row.slow_calls),
      percentiles: [],
    };
    entry.percentiles.push({
      p: num(row.p),
      kind: row.kind === "exact" ? "exact" : "bucket",
      value: num(row.value),
    });
    byName.set(row.name, entry);
  }

  return [...byName.values()].map((entry) => ({
    ...entry,
    percentiles: entry.percentiles.sort((a, b) => a.p - b.p),
  }));
}

export type ErrorRow = {
  name: string;
  kind: string;
  count: number;
  medianMs: number | null;
  maxMs: number | null;
  firstSeen: string;
  lastSeen: string;
};

export function mapErrorRow(raw: RawError): ErrorRow {
  return {
    name: raw.name,
    kind: raw.kind,
    count: num(raw.count),
    medianMs: maybe(raw.median_ms),
    maxMs: maybe(raw.max_ms),
    firstSeen: raw.first_seen,
    lastSeen: raw.last_seen,
  };
}

export type HealthRow = {
  events: number;
  dropped: number;
  loads: number;
  rows: number;
  oldest: string | null;
  newest: string | null;
  sizeBytes: number;
};

export function mapHealthRow(raw: RawHealth): HealthRow {
  return {
    events: num(raw.events),
    dropped: num(raw.dropped),
    loads: num(raw.loads),
    rows: num(raw.table_rows),
    oldest: raw.oldest ?? null,
    newest: raw.newest ?? null,
    sizeBytes: num(raw.size_bytes),
  };
}

export type BreakdownRow = {
  dimension: string;
  value: string;
  n: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  /** The next three are set for a sqlite.* metric only. */
  calls: number | null;
  slowCalls: number | null;
  maxMs: number | null;
};

export function mapBreakdownRow(raw: RawBreakdown): BreakdownRow {
  return {
    dimension: raw.dimension,
    value: raw.value,
    n: num(raw.n),
    errors: num(raw.errors),
    p50: maybe(raw.p50),
    p95: maybe(raw.p95),
    p99: maybe(raw.p99),
    calls: maybe(raw.calls),
    slowCalls: maybe(raw.slow_calls),
    maxMs: maybe(raw.max_ms),
  };
}

export type VersionRow = { version: string; events: number };

export function mapVersionRow(raw: RawVersion): VersionRow {
  return { version: raw.app_version, events: num(raw.events) };
}
