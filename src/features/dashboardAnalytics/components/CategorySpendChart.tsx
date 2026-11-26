"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { AnalyticsBlock, BlockEmpty, LABEL_CLASS } from "./AnalyticsBlock";
import { formatUsdWhole } from "../utils/analyticsFormat";
import { chartScale, formatTick } from "../utils/chartScale";
import type { CategoryRow, Period } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.6 (D22, D42, R4). One dark blue column of spend per
// category, the same rows as the table above it. The value is written above each column and there
// is no tooltip. The category names are plain text under the columns (one band each, so they line up
// with the columns and wrap in the words they are made of); the chart has no x axis of its own.

const CHART_TITLE = "Maintenance Spend by Category";
const AXIS_WIDTH = 56;
const CHART_HEIGHT = 300;
/** The narrowest the chart gets (the box scrolls sideways below it); its first size too. */
const MIN_WIDTH = 760;
const NAVY = "#10365a";

/** A thin column for a small value, none for zero. */
const minPointSize = (value: number | null | undefined) => (value && value > 0 ? 2 : 0);
const labelOf = (value: unknown) => formatUsdWhole(Number(value));

export function CategorySpendChart({ rows, period }: { rows: CategoryRow[]; period: Period }) {
  const maxCents = Math.max(0, ...rows.map((row) => row.expenseCents));
  const scale = chartScale(maxCents);
  const data = rows.map((row) => ({ name: row.name, expenseCents: row.expenseCents }));

  return (
    <AnalyticsBlock id="chart" title={CHART_TITLE} note="Total expense per damage category, USD">
      {maxCents > 0 ? (
        <div className="overflow-x-auto px-5 pt-2 pb-5">
          <div style={{ minWidth: MIN_WIDTH }}>
            <div role="img" aria-label={CHART_TITLE} style={{ height: CHART_HEIGHT }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: MIN_WIDTH, height: CHART_HEIGHT }}
              >
                <BarChart
                  data={data}
                  margin={{ top: 24, right: 0, bottom: 0, left: 0 }}
                  accessibilityLayer={false}
                >
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" hide />
                  <YAxis
                    width={AXIS_WIDTH}
                    ticks={scale.ticks.map((dollars) => dollars * 100)}
                    domain={[0, scale.topDollars * 100]}
                    tickFormatter={(cents: number) => formatTick(cents / 100)}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                  />
                  <Bar
                    dataKey="expenseCents"
                    fill={NAVY}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={72}
                    minPointSize={minPointSize}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="expenseCents"
                      position="top"
                      offset={4}
                      formatter={labelOf}
                      fontSize={12}
                      fill="#374151"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div
              className="mt-2 grid gap-0"
              style={{
                paddingLeft: AXIS_WIDTH,
                gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
              }}
            >
              {rows.map((row) => (
                <div
                  key={row.categoryId ?? "unassigned"}
                  className="min-w-0 px-2 text-center text-xs leading-4 break-words text-[#4b5563]"
                >
                  {row.name}
                </div>
              ))}
            </div>
            <div className={`mt-3 text-center ${LABEL_CLASS}`}>Damage category</div>
          </div>
        </div>
      ) : (
        <BlockEmpty
          testId="chart-empty"
          title={
            period.kind === "all" ? "No spend to show yet." : `No spend to show for ${period.year}.`
          }
        />
      )}
    </AnalyticsBlock>
  );
}
