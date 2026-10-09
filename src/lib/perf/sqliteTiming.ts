import { classifyError } from "./classifyError";
import { flushTelemetryNow, metrics } from "./metrics";
import { tablesInSql, watcherKeyFromSql } from "./perfTrace";
import { installPageLifecycle } from "./telemetryTransport";
import { MAX_ATTR_STRING, type Attrs, type MetricName } from "./telemetryEvent";

/**
 * Times the calls the app makes to the local database. Spec: docs/specs/perf-sqlite.md.
 *
 * The figure is what the **caller waited**: the message to the database worker, the wait for a
 * connection or the IndexedDB lock, the execution, the reply. It is not the SQLite engine's CPU
 * time, and it does not include the queries `useQuery` re-runs inside its own library.
 *
 * Development records every call. Production records a call individually only when it is slow
 * (more than 50 ms) or fails, and counts the rest in memory, flushed as one aggregate per
 * (name, op, tables) every 10 s. The SQL text and every parameter stay out of every event.
 */

export type SqliteMetric = Extract<MetricName, "sqlite.query" | "sqlite.write" | "sqlite.batch">;
export type SqlOp = "select" | "insert" | "update" | "delete" | "other";

/** Strictly more than this is an event of its own in production. */
export const SLOW_MS = 50;
export const AGGREGATE_WINDOW_MS = 10_000;
/** `b1` to `b6`: a call counts once, in the first bucket whose edge is not below it. */
export const BUCKET_EDGES_MS = [1, 2, 5, 10, 20, 50] as const;

const MAIN_STATEMENTS: ReadonlySet<string> = new Set(["select", "insert", "update", "delete"]);

/**
 * The statement's kind. A CTE (`WITH ...`) is the kind of the statement after its definitions,
 * found by skipping everything inside parentheses, quotes and comments.
 */
export function opOf(sql: string): SqlOp {
  let depth = 0;
  let first: string | null = null;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (c === "'" || c === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) i++;
          else break;
        }
        i++;
      }
      i++;
    } else if (c === "(") {
      depth++;
      i++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (/[A-Za-z_]/.test(c)) {
      let end = i + 1;
      while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) end++;
      const word = sql.slice(i, end).toLowerCase();
      i = end;

      if (depth !== 0) continue;
      if (first === null) {
        first = word;
        if (MAIN_STATEMENTS.has(word)) return word as SqlOp;
        if (word !== "with") return "other";
      } else if (MAIN_STATEMENTS.has(word)) {
        return word as SqlOp;
      }
    } else {
      i++;
    }
  }

  return "other";
}

const WRITE_TABLE = /\b(?:into|update)\s+"([A-Za-z_][A-Za-z0-9_]*)"/gi;

function tableNames(sql: string): string[] {
  const names = new Set(tablesInSql(sql));
  WRITE_TABLE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WRITE_TABLE.exec(sql)) !== null) names.add(match[1]);
  return [...names];
}

/** Distinct table names, sorted, cut to the attrs string cap. Names only. */
function joinNames(names: Iterable<string>): string {
  return [...new Set(names)].sort().join(",").slice(0, MAX_ATTR_STRING);
}

export function tablesOf(sql: string): string {
  return joinNames(tableNames(sql));
}

const described = new Map<string, { op: SqlOp; tables: string }>();
const MAX_DESCRIBED = 500;

/** The op and tables of a statement, or of a batch (`other` when its statements differ). */
export function describeSql(sql: string | string[]): { op: SqlOp; tables: string } {
  if (Array.isArray(sql)) {
    const ops = new Set(sql.map(opOf));
    return {
      op: ops.size === 1 ? [...ops][0] : "other",
      tables: joinNames(sql.flatMap(tableNames)),
    };
  }

  const known = described.get(sql);
  if (known) return known;

  const result = { op: opOf(sql), tables: tablesOf(sql) };
  if (described.size >= MAX_DESCRIBED) described.clear();
  described.set(sql, result);
  return result;
}

// ---------------------------------------------------------------------------
// Production aggregate
// ---------------------------------------------------------------------------

type Aggregate = {
  name: SqliteMetric;
  op: SqlOp;
  tables: string;
  count: number;
  sumMs: number;
  maxMs: number;
  buckets: number[];
};

const aggregates = new Map<string, Aggregate>();
let timer: ReturnType<typeof setInterval> | null = null;
let lifecycleInstalled = false;

const round1 = (value: number) => Math.round(value * 10) / 10;

function addToAggregate(name: SqliteMetric, op: SqlOp, tables: string, durationMs: number): void {
  const key = `${name}|${op}|${tables}`;
  let aggregate = aggregates.get(key);
  if (!aggregate) {
    aggregate = {
      name,
      op,
      tables,
      count: 0,
      sumMs: 0,
      maxMs: 0,
      buckets: BUCKET_EDGES_MS.map(() => 0),
    };
    aggregates.set(key, aggregate);
  }

  aggregate.count += 1;
  aggregate.sumMs += durationMs;
  aggregate.maxMs = Math.max(aggregate.maxMs, durationMs);
  const bucket = BUCKET_EDGES_MS.findIndex((edge) => durationMs <= edge);
  aggregate.buckets[bucket === -1 ? BUCKET_EDGES_MS.length - 1 : bucket] += 1;

  startAggregation();
}

function startAggregation(): void {
  if (timer === null) timer = setInterval(flushAggregates, AGGREGATE_WINDOW_MS);

  // The final aggregate must reach the transport before the page goes: flush ours, then ask the
  // transport to send what it holds, so the order of the two listeners does not matter.
  if (!lifecycleInstalled && typeof document !== "undefined" && typeof window !== "undefined") {
    lifecycleInstalled = true;
    installPageLifecycle(
      () => {
        flushAggregates();
        flushTelemetryNow();
      },
      document,
      window,
    );
  }
}

/** One event per key with at least one call; an empty window emits nothing. */
export function flushAggregates(): void {
  if (aggregates.size === 0) return;

  const flushed = [...aggregates.values()];
  aggregates.clear();

  for (const aggregate of flushed) {
    const attrs: Attrs = { op: aggregate.op };
    if (aggregate.tables) attrs.tables = aggregate.tables;
    attrs.count = aggregate.count;
    attrs.sumMs = round1(aggregate.sumMs);
    attrs.maxMs = round1(aggregate.maxMs);
    aggregate.buckets.forEach((n, index) => {
      attrs[`b${index + 1}`] = n;
    });
    metrics.record({ name: aggregate.name, durationMs: null, attrs });
  }
}

/** Test seam. */
export function resetSqliteTimingForTests(): void {
  aggregates.clear();
  described.clear();
  if (timer !== null) clearInterval(timer);
  timer = null;
  lifecycleInstalled = false;
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

const isProduction = () => process.env.NODE_ENV === "production";

function settle(
  name: SqliteMetric,
  sql: string | string[],
  startedAt: number,
  outcome: "ok" | "error",
  error: unknown,
  value: unknown,
): void {
  try {
    const durationMs = performance.now() - startedAt;
    const { op, tables } = describeSql(sql);

    if (isProduction()) {
      if (outcome === "ok" && durationMs <= SLOW_MS) {
        addToAggregate(name, op, tables, durationMs);
        return;
      }
    } else {
      const text = Array.isArray(sql)
        ? sql.map(watcherKeyFromSql).join("; ")
        : watcherKeyFromSql(sql);
      console.debug(`[sqlite] ${name} ${Math.round(durationMs * 10) / 10}ms`, text);
    }

    const attrs: Attrs = { op };
    if (tables) attrs.tables = tables;
    if (name === "sqlite.query" && Array.isArray(value)) attrs.rows = value.length;
    if (name === "sqlite.batch" && Array.isArray(sql)) attrs.statements = sql.length;

    metrics.record({
      name,
      durationMs,
      outcome,
      errorKind: outcome === "error" ? classifyError(error) : null,
      attrs,
    });
  } catch {
    // Telemetry never breaks a query.
  }
}

/**
 * Runs `run`, times it, and hands back exactly what it returned: the same value, or the very
 * same error, so a caller cannot tell it is being measured.
 */
export function timed<T>(
  name: SqliteMetric,
  sql: string | string[],
  run: () => Promise<T> | T,
): Promise<T> {
  const startedAt = performance.now();

  let pending: Promise<T> | T;
  try {
    pending = run();
  } catch (error) {
    settle(name, sql, startedAt, "error", error, undefined);
    throw error;
  }

  return Promise.resolve(pending).then(
    (value) => {
      settle(name, sql, startedAt, "ok", undefined, value);
      return value;
    },
    (error: unknown) => {
      settle(name, sql, startedAt, "error", error, undefined);
      throw error;
    },
  );
}
