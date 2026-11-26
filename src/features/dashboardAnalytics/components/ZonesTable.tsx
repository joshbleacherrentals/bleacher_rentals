import { AnalyticsBlock, AnalyticsTable, type TableColumn } from "./AnalyticsBlock";
import { formatPercent, formatUsd } from "../utils/analyticsFormat";
import type { AnalyticsFigures } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.5 (D19, D41). Every zone, then Unassigned, then the
// total row; the rows keep the order `buildAnalytics` gives them.

const COLUMNS: TableColumn[] = [
  { header: "Operating Zone" },
  { header: "Assigned Units", align: "right" },
  { header: "Total Work Orders", align: "right" },
  { header: "Total Maintenance Cost", align: "right" },
  { header: "Average Cost / Unit", align: "right" },
  { header: "% of Total Spend", align: "right" },
];

export function ZonesTable({ zones }: { zones: AnalyticsFigures["zones"] }) {
  return (
    <AnalyticsBlock
      id="zones"
      title="Operating Zone Cost & Fleet Maintenance Cost"
      note="Repairs with no zone are counted in Unassigned"
    >
      <AnalyticsTable
        label="Maintenance cost by operating zone"
        columns={COLUMNS}
        grid="grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]"
        rows={zones.rows.map((row) => [
          row.name,
          String(row.units),
          String(row.workOrders),
          formatUsd(row.costCents),
          formatUsd(row.avgCostCents),
          formatPercent(row.share),
        ])}
        total={[
          "Total / Fleet Summary",
          String(zones.total.units),
          String(zones.total.workOrders),
          formatUsd(zones.total.costCents),
          formatUsd(zones.total.avgCostCents),
          formatPercent(zones.total.share),
        ]}
      />
    </AnalyticsBlock>
  );
}
