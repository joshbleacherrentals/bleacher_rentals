/**
 * What each column heading means, for the info icon beside it. The same heading can mean a
 * different thing in a different table (a SQLite "P95" is a bucket or an exact figure, a metric's
 * is an interpolated one), so the text is chosen by table and heading.
 *
 * No apostrophes, quotes, ampersands or angle brackets: the text also becomes an `aria-label`.
 */
export type ColumnTable = "metrics" | "sqlite" | "errors" | "breakdown" | "sqliteBreakdown";

const WEAK =
  "It is shown muted when it rests on too few events to trust: P95 under 20 events, P99 under 100.";

const METRIC_COLUMN =
  "The measured stage, named stage.thing. Click a row to break it down by role, device class, OS and browser.";

const TABLES: Record<ColumnTable, Record<string, string>> = {
  metrics: {
    Metric: METRIC_COLUMN,
    Events:
      "How many events with a duration the percentiles on this row rest on. With few events the figures are not reliable.",
    P50: "The median: half of the events were faster than this and half slower. The typical experience.",
    P75: "Three quarters of the events were faster than this; one in four was slower.",
    P90: "Nine in ten events were faster than this; one in ten was slower.",
    P95: `Nineteen in twenty events were faster than this. ${WEAK}`,
    P99: `Ninety nine in a hundred events were faster than this: the slowest one in a hundred. ${WEAK}`,
    Max: "The slowest single event in the view.",
    Errors:
      "How many of these events failed. Failed events are kept in the percentiles, because a slow failure is part of what a user waited.",
  },
  sqlite: {
    Metric: METRIC_COLUMN,
    Calls:
      "Every call in the view: the fast ones, which are only counted, plus the slow ones, which are recorded on their own.",
    "Slow calls":
      "Calls that took more than 50 ms, and calls that failed. Each of these is recorded as an event of its own.",
    P50: "Half of the calls were faster than this. Shown as a bucket (up to 1, 2, 5, 10, 20 or 50 ms) when it falls among the fast calls, which are only counted; as an exact figure when it falls among the slow ones.",
    P75: "Three quarters of the calls were faster than this. A bucket when it falls among the fast calls, an exact figure among the slow ones.",
    P90: "Nine in ten calls were faster than this. A bucket when it falls among the fast calls, an exact figure among the slow ones.",
    P95: "Nineteen in twenty calls were faster than this. A bucket when it falls among the fast calls, an exact figure among the slow ones.",
    P99: "Ninety nine in a hundred calls were faster than this. A figure above 50 ms is exact, taken from the slow calls; otherwise it is a bucket.",
  },
  errors: {
    Metric: "The measured stage that failed, named stage.thing.",
    Kind: "The classified kind of error, never its message: timeout, network, auth, http_4xx, http_5xx, aborted, unknown, or pg: followed by the five character SQLSTATE code.",
    Count: "How many errors of this kind there were in the view.",
    Median: "The typical duration of the failed events: how long it took to fail.",
    Max: "The longest a failed event took.",
    "First seen (UTC)":
      "When the first error of this kind in the view was received, by the server clock.",
    "Last seen (UTC)":
      "When the latest error of this kind in the view was received, by the server clock.",
  },
  breakdown: {
    Value:
      "The slice of the metric: one role, device class, OS or browser, depending on the table.",
    Events:
      "How many events with a duration this slice has. With few events the figures are not reliable.",
    P50: "The median of this slice: half of its events were faster, half slower.",
    P95: "Nineteen in twenty events of this slice were faster than this.",
    P99: "Ninety nine in a hundred events of this slice were faster than this: its slowest one in a hundred.",
    Errors: "How many events of this slice failed. They are kept in the percentiles.",
  },
  sqliteBreakdown: {
    Value:
      "The slice of the metric: a kind of statement (select, insert, update, delete) or the tables it touches.",
    Calls: "Every call in this slice, the fast ones that are only counted plus the slow ones.",
    "Slow calls": "Calls in this slice that took more than 50 ms, and calls that failed.",
    Slowest:
      "The slowest single call seen in this slice. There is no percentile here: the fast calls are only known to a bucket, so a percentile per slice would be invented precision.",
    Errors: "How many calls in this slice failed.",
  },
};

export function columnInfo(table: ColumnTable, column: string): string | null {
  return TABLES[table][column] ?? null;
}
