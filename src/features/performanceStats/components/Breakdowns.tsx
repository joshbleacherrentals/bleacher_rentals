import { Block, Heading, MetricName } from "./StatTables";
import { formatCount, formatMs, type BreakdownRow } from "../logic/stats";

/**
 * One metric split by who and where, for the metric in the address. Spec: §3 "Block E".
 *
 * An ordinary metric is split by role, device class, OS and browser, with percentiles. A sqlite.*
 * metric is split by op and tables as calls, slow calls and the slowest call: its fast calls are
 * only known to a bucket, so a percentile per slice would be invented precision.
 */

const ORDINARY = ["role", "device_class", "os", "browser"];
const SQLITE = ["op", "tables"];

const TITLES: Record<string, string> = {
  role: "By role",
  device_class: "By device class",
  os: "By OS",
  browser: "By browser",
  op: "By op",
  tables: "By tables",
};

const HEAD = "text-left font-semibold px-4 py-2";
const CELL = "px-4 py-2 tabular-nums";

export function Breakdowns({
  metric,
  rows,
  isLoading,
  error,
  onClear,
}: {
  metric: string | null;
  rows: BreakdownRow[] | undefined;
  isLoading: boolean;
  error: unknown;
  onClear: () => void;
}) {
  if (!metric) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500 mb-6">
        Choose a metric above to see it broken down by role, device, OS and browser.
      </section>
    );
  }

  const isSqlite = metric.startsWith("sqlite.");
  const order = isSqlite ? SQLITE : ORDINARY;
  const present = order.filter((dimension) => rows?.some((row) => row.dimension === dimension));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-darkBlue">
          Breakdown: <MetricName name={metric} />
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-darkBlue underline"
        >
          Clear
        </button>
      </div>

      {error || isLoading ? (
        <Block title={metric} state={{ isLoading, error, isEmpty: false }}>
          {null}
        </Block>
      ) : present.length === 0 ? (
        <section className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500 mb-6">
          No events for this metric in this period and environment.
        </section>
      ) : (
        present.map((dimension) => (
          <section
            key={dimension}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4"
          >
            <div className="px-4 py-2 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">
              {TITLES[dimension]}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                  <tr>
                    <Heading
                      table={isSqlite ? "sqliteBreakdown" : "breakdown"}
                      label="Value"
                      className={HEAD}
                    />
                    {(isSqlite
                      ? ["Calls", "Slow calls", "Slowest", "Errors"]
                      : ["Events", "P50", "P95", "P99", "Errors"]
                    ).map((header) => (
                      <Heading
                        key={header}
                        table={isSqlite ? "sqliteBreakdown" : "breakdown"}
                        label={header}
                        className={HEAD}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    ?.filter((row) => row.dimension === dimension)
                    .map((row) => (
                      <tr key={row.value} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-darkBlue">{row.value}</td>
                        {isSqlite ? (
                          <>
                            <td className={CELL}>{formatCount(row.calls ?? row.n)}</td>
                            <td className={CELL}>{formatCount(row.slowCalls ?? 0)}</td>
                            <td className={CELL}>{formatMs(row.maxMs)}</td>
                          </>
                        ) : (
                          <>
                            <td className={CELL}>{formatCount(row.n)}</td>
                            <td className={CELL}>{formatMs(row.p50)}</td>
                            <td className={CELL}>{formatMs(row.p95)}</td>
                            <td className={CELL}>{formatMs(row.p99)}</td>
                          </>
                        )}
                        <td className={CELL}>{formatCount(row.errors)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
