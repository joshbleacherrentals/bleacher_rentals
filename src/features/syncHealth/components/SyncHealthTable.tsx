import type { SyncHealthRow } from "../utils/buildSyncHealthRows";
import { formatReportAge } from "../utils/formatReportAge";

const DASH = "—";

type Props = {
  rows: SyncHealthRow[];
  now: Date;
};

const HEADERS = ["Driver", "Buckets", "Limit", "% of limit", "App version", "Last report"];

export function SyncHealthTable({ rows, now }: Props) {
  if (rows.length === 0) {
    return <div className="p-6 text-gray-500">No drivers to show.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
          <tr>
            {HEADERS.map((header) => (
              <th key={header} className="text-left font-semibold px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SyncHealthTableRow key={row.driverId} row={row} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SyncHealthTableRow({ row, now }: { row: SyncHealthRow; now: Date }) {
  return (
    <tr
      data-driver-id={row.driverId}
      data-near-limit={row.isNearLimit ? "true" : "false"}
      className={`border-t border-gray-100 ${row.isNearLimit ? "bg-amber-50" : ""}`}
    >
      <td className="px-4 py-3 font-medium text-darkBlue">{row.name}</td>
      <td className="px-4 py-3 tabular-nums">
        {row.hasReport ? (
          <span>{row.bucketCount}</span>
        ) : (
          <span className="text-gray-400" title="This driver's app has not reported yet">
            {DASH} <span className="text-xs">no report yet</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-500">{row.limit}</td>
      <td
        className={`px-4 py-3 tabular-nums ${row.isNearLimit ? "font-semibold text-amber-700" : ""}`}
      >
        {row.percentOfLimit === null ? (
          <span className="text-gray-400">{DASH}</span>
        ) : (
          <span>{row.percentOfLimit}%</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.appVersion ?? <span className="text-gray-400">{DASH}</span>}
        {row.appPlatform && <span className="text-xs text-gray-400"> · {row.appPlatform}</span>}
        {row.syncVersion !== null && (
          <span className="text-xs text-gray-400"> · sync v{row.syncVersion}</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-500">
        {row.reportedAt ? (
          <span title={row.reportedAt}>{formatReportAge(row.reportedAt, now)}</span>
        ) : (
          <span className="text-gray-400">{DASH}</span>
        )}
      </td>
    </tr>
  );
}
