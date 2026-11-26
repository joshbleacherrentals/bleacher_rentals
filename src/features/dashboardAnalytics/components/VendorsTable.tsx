import { AnalyticsBlock, AnalyticsTable, BlockEmpty, type TableColumn } from "./AnalyticsBlock";
import { formatPercent, formatUsd } from "../utils/analyticsFormat";
import type { AnalyticsFigures, Period } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.5 (D23, D41, §2.9). The six vendors with the most
// Labor + Parts; the total row and the percents are over every vendor that has spend.

const COLUMNS: TableColumn[] = [
  { header: "Service Vendor" },
  { header: "Work Orders", align: "right" },
  { header: "Labor Cost", align: "right" },
  { header: "Parts Cost", align: "right" },
  { header: "Total Labor & Parts Spend", align: "right" },
  { header: "% Labor & Parts", align: "right" },
];

export function VendorsTable({
  vendors,
  period,
}: {
  vendors: AnalyticsFigures["vendors"];
  period: Period;
}) {
  const { total } = vendors;
  const hasSpend = total.vendorsWithSpend > 0;
  return (
    <AnalyticsBlock
      id="vendors"
      title="Service Vendor Repair & Parts Cost Breakdown"
      note={
        hasSpend
          ? `Top 6 of ${total.vendorsWithSpend} vendors by Labor + Parts. Tax and freight are not included. Repairs with no vendor are not listed.`
          : "Top 6 vendors by Labor + Parts"
      }
    >
      {hasSpend ? (
        <AnalyticsTable
          label="Labor and parts cost by service vendor"
          columns={COLUMNS}
          grid="grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]"
          rows={vendors.rows.map((row) => [
            row.name,
            String(row.workOrders),
            formatUsd(row.laborCents),
            formatUsd(row.partsCents),
            formatUsd(row.totalCents),
            formatPercent(row.share),
          ])}
          total={[
            `Total Labor & Parts Spend, all ${total.vendorsWithSpend} vendors`,
            String(total.workOrders),
            formatUsd(total.laborCents),
            formatUsd(total.partsCents),
            formatUsd(total.totalCents),
            formatPercent(total.share),
          ]}
        />
      ) : (
        <BlockEmpty
          testId="vendors-empty"
          title={
            period.kind === "all" ? "No vendor spend yet." : `No vendor spend in ${period.year}.`
          }
        />
      )}
    </AnalyticsBlock>
  );
}
