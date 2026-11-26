import { AnalyticsBlock, AnalyticsTable, BlockEmpty, type TableColumn } from "./AnalyticsBlock";
import { formatUsd } from "../utils/analyticsFormat";
import type { AnalyticsFigures, Period } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.5 (D20, D41, §2.9). Three states: no bleacher has a
// model number, model numbers but no repair in the period, and the table.

const COLUMNS: TableColumn[] = [
  { header: "Rank", muted: true },
  { header: "Model" },
  { header: "Assigned Units", align: "right" },
  { header: "Avg Cost / Unit", align: "right" },
  { header: "Repairs", align: "right" },
  { header: "Cost", align: "right" },
];

export function ModelsTable({
  models,
  period,
}: {
  models: AnalyticsFigures["models"];
  period: Period;
}) {
  return (
    <AnalyticsBlock
      id="models"
      title="Top High-Cost Models"
      note="The five models with the highest maintenance cost"
    >
      {!models.hasModelNumbers ? (
        <BlockEmpty
          testId="models-empty"
          title="No model numbers yet"
          sub="This block fills in once model numbers are set on the bleachers."
        />
      ) : models.rows.length === 0 || models.total === null ? (
        <BlockEmpty
          testId="models-empty"
          title={period.kind === "all" ? "No repairs yet" : `No repairs in ${period.year}`}
          sub="Models with maintenance cost will appear here."
        />
      ) : (
        <AnalyticsTable
          label="Top high-cost models"
          columns={COLUMNS}
          grid="grid-cols-[72px_minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]"
          rows={models.rows.map((row) => [
            `#${row.rank}`,
            row.model,
            String(row.units),
            formatUsd(row.avgCostCents),
            String(row.repairs),
            formatUsd(row.costCents),
          ])}
          total={[
            "",
            "Top 5 Models Total",
            String(models.total.units),
            formatUsd(models.total.avgCostCents),
            String(models.total.repairs),
            formatUsd(models.total.costCents),
          ]}
        />
      )}
    </AnalyticsBlock>
  );
}
