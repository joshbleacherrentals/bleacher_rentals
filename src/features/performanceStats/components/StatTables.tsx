import type { KeyboardEvent, ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { columnInfo, type ColumnTable } from "../logic/columnInfo";
import { metricInfo } from "../logic/metricInfo";
import {
  describeLoadError,
  formatBytes,
  formatCount,
  formatMs,
  formatSqlitePercentile,
  groupByStage,
  isWeakPercentile,
  type ErrorRow,
  type HealthRow,
  type MetricRow,
  type SqliteRow,
} from "../logic/stats";

/**
 * The dashboard's tables. Every one is a plain function of its rows, so the page decides what to
 * load and these decide only how it reads. Spec: docs/specs/performance-dashboard.md §3.
 */

const DASH = "—";
const HEAD = "text-left font-semibold px-4 py-3";
const CELL = "px-4 py-2 tabular-nums";

/**
 * An info icon with a tooltip. It sits inside rows and headings that can be clicked, so it stops
 * its own click and key from reaching them; its text is also its accessible name, so a screen
 * reader says what a mouse user sees on hover.
 */
export function InfoButton({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className="text-gray-400 hover:text-darkBlue normal-case"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-normal font-normal normal-case">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** A metric name with an info icon that says what it measures. */
export function MetricName({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{name}</span>
      <InfoButton text={metricInfo(name)} />
    </span>
  );
}

/** A column heading, with an info icon when there is something to say about it. */
export function Heading({
  table,
  label,
  className,
}: {
  table: ColumnTable;
  label: string;
  className: string;
}) {
  const info = columnInfo(table, label);
  return (
    <th className={className}>
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        {info && <InfoButton text={info} />}
      </span>
    </th>
  );
}

export type BlockState = { isLoading: boolean; error: unknown; isEmpty: boolean };

/** One block of the page: a title, and what its content is doing right now. */
export function Block({
  title,
  note,
  state,
  children,
}: {
  title: string;
  note?: string;
  state: BlockState;
  children: ReactNode;
}) {
  // An error comes before an empty state: "empty" may only mean that nothing was read.
  let body: ReactNode;
  if (state.error) {
    body = <div className="p-6 text-sm text-red-700">{describeLoadError(state.error)}</div>;
  } else if (state.isLoading) {
    body = <div className="p-6 text-gray-500">Loading…</div>;
  } else if (state.isEmpty) {
    body = <div className="p-6 text-gray-500">No events for this period and environment</div>;
  } else {
    body = children;
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-darkBlue">{title}</h2>
        {note && <div className="text-xs text-gray-500">{note}</div>}
      </div>
      {body}
    </section>
  );
}

function selectableRow(name: string, selected: string | null, onSelect: (name: string) => void) {
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(name);
    }
  };

  return {
    "data-metric": name,
    "aria-selected": selected === name,
    tabIndex: 0,
    onClick: () => onSelect(name),
    onKeyDown: handleKey,
    className: `border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${
      selected === name ? "bg-blue-50" : ""
    }`,
  };
}

function Percentile({
  value,
  n,
  percentile,
}: {
  value: number;
  n: number;
  percentile: "p50" | "p75" | "p90" | "p95" | "p99";
}) {
  const weak = isWeakPercentile(n, percentile);
  return (
    <td
      className={`${CELL} ${weak ? "text-gray-400" : ""}`}
      data-weak={weak ? "true" : undefined}
      title={weak ? `few events (${n}): this figure is not reliable yet` : undefined}
    >
      {formatMs(value)}
    </td>
  );
}

const METRIC_HEADERS = ["Events", "P50", "P75", "P90", "P95", "P99", "Max", "Errors"];

export function MetricsTable({
  rows,
  selected,
  onSelect,
}: {
  rows: MetricRow[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
          <tr>
            <Heading table="metrics" label="Metric" className={HEAD} />
            {METRIC_HEADERS.map((header) => (
              <Heading key={header} table="metrics" label={header} className={HEAD} />
            ))}
          </tr>
        </thead>
        <tbody>
          {groupByStage(rows).flatMap((group) => [
            <tr key={`stage-${group.stage}`} data-stage={group.stage} className="bg-gray-50">
              <th
                colSpan={METRIC_HEADERS.length + 1}
                className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 px-4 py-1"
              >
                {group.stage}
              </th>
            </tr>,
            ...group.rows.map((row) => (
              <tr key={row.name} {...selectableRow(row.name, selected, onSelect)}>
                <td className="px-4 py-2 font-medium text-darkBlue">
                  <MetricName name={row.name} />
                </td>
                <td className={CELL}>{formatCount(row.n)}</td>
                <Percentile value={row.p50} n={row.n} percentile="p50" />
                <Percentile value={row.p75} n={row.n} percentile="p75" />
                <Percentile value={row.p90} n={row.n} percentile="p90" />
                <Percentile value={row.p95} n={row.n} percentile="p95" />
                <Percentile value={row.p99} n={row.n} percentile="p99" />
                <td className={CELL}>{formatMs(row.maxMs)}</td>
                <td className={`${CELL} ${row.errors > 0 ? "text-red-700 font-semibold" : ""}`}>
                  {formatCount(row.errors)}
                </td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

const SQLITE_HEADERS = ["Calls", "Slow calls", "P50", "P75", "P90", "P95", "P99"];

export function SqliteTable({
  rows,
  selected,
  onSelect,
}: {
  rows: SqliteRow[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
          <tr>
            <Heading table="sqlite" label="Metric" className={HEAD} />
            {SQLITE_HEADERS.map((header) => (
              <Heading key={header} table="sqlite" label={header} className={HEAD} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} {...selectableRow(row.name, selected, onSelect)}>
              <td className="px-4 py-2 font-medium text-darkBlue">
                <MetricName name={row.name} />
              </td>
              <td className={CELL}>{formatCount(row.calls)}</td>
              <td className={CELL}>{formatCount(row.slowCalls)}</td>
              {[0.5, 0.75, 0.9, 0.95, 0.99].map((p) => {
                const entry = row.percentiles.find((x) => x.p === p);
                return (
                  <td key={p} className={CELL}>
                    {entry ? formatSqlitePercentile(entry) : DASH}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 px-4 py-3 border-t border-gray-100">
        Calls of 50 ms or less are only counted, in buckets (up to 1, 2, 5, 10, 20 and 50 ms), so a
        figure shown as “≤ 5 ms” is a bucket and its true value is somewhere under it. A slow call
        is recorded on its own, so a figure above 50 ms is exact.
      </p>
    </div>
  );
}

const ERROR_HEADERS = [
  "Metric",
  "Kind",
  "Count",
  "Median",
  "Max",
  "First seen (UTC)",
  "Last seen (UTC)",
];

const utc = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function ErrorsTable({ rows }: { rows: ErrorRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
          <tr>
            {ERROR_HEADERS.map((header) => (
              <Heading key={header} table="errors" label={header} className={HEAD} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.name}|${row.kind}`} className="border-t border-gray-100">
              <td className="px-4 py-2 font-medium text-darkBlue">
                <MetricName name={row.name} />
              </td>
              <td className="px-4 py-2 font-mono text-xs">{row.kind}</td>
              <td className={CELL}>{formatCount(row.count)}</td>
              <td className={CELL}>{formatMs(row.medianMs)}</td>
              <td className={CELL}>{formatMs(row.maxMs)}</td>
              <td className="px-4 py-2 text-gray-500">{utc(row.firstSeen)}</td>
              <td className="px-4 py-2 text-gray-500">{utc(row.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HealthPanel({ health }: { health: HealthRow | null }) {
  if (!health) return <div className="p-6 text-gray-500">{DASH}</div>;

  const facts: Array<[string, string]> = [
    ["Events in this view", formatCount(health.events)],
    ["Page loads", formatCount(health.loads)],
    ["Events browsers dropped", formatCount(health.dropped)],
    ["Rows in the table", formatCount(health.rows)],
    ["Oldest row (UTC)", health.oldest ? utc(health.oldest) : DASH],
    ["Newest row (UTC)", health.newest ? utc(health.newest) : DASH],
    ["Table size", formatBytes(health.sizeBytes)],
  ];

  return (
    <div className="p-4">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="font-semibold text-darkBlue tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {health.rows === 0 && (
        <p className="text-xs text-amber-700 mt-3">
          The table is empty. It is UNLOGGED, so it is also empty after a Postgres crash: an empty
          table is not the same as a quiet week.
        </p>
      )}
    </div>
  );
}
