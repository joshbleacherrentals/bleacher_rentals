import { AnalyticsBlock, AnalyticsTable, type TableColumn } from "./AnalyticsBlock";
import { formatPercent, formatUsd } from "../utils/analyticsFormat";
import type { AnalyticsFigures } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.5 (D21, D41). Every row is listed, also with zeros.
// The vendor column is left-aligned, a dash when the row has no top vendor.

const COLUMNS: TableColumn[] = [
  { header: "Failure Category" },
  { header: "Number of Repairs", align: "right" },
  { header: "Total Expense", align: "right" },
  { header: "Avg Cost / Job", align: "right" },
  { header: "% Fleet Spend", align: "right" },
  { header: "Largest Spend Vendor" },
];

export function CategoriesTable({ categories }: { categories: AnalyticsFigures["categories"] }) {
  return (
    <AnalyticsBlock
      id="categories"
      title="Unit Damage Category & Expense Breakdown"
      note="A repair with two categories counts in both"
    >
      <AnalyticsTable
        label="Expense by damage category"
        columns={COLUMNS}
        grid="grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_minmax(0,1.8fr)]"
        rows={categories.rows.map((row) => [
          row.name,
          String(row.repairs),
          formatUsd(row.expenseCents),
          formatUsd(row.avgCostCents),
          formatPercent(row.share),
          row.topVendor ?? "—",
        ])}
        total={[
          "Total Category Spend",
          String(categories.total.repairs),
          formatUsd(categories.total.expenseCents),
          formatUsd(categories.total.avgCostCents),
          formatPercent(categories.total.share),
          "",
        ]}
      />
    </AnalyticsBlock>
  );
}
