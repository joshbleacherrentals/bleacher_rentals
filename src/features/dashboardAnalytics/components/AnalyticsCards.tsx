import type { ReactNode } from "react";
import { CARD_CLASS, LABEL_CLASS } from "./AnalyticsBlock";
import { formatPercent, formatUsd, formatUsdWhole } from "../utils/analyticsFormat";
import type { AnalyticsFigures, OpenStatus } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.4 (D14 to D18, D27, D40) and the board Main.dc.html.
// Five cards share one row and wrap when the screen is narrow. A card is an uppercase 12 px label,
// a 28 px value and a 13 px grey caption.

const OPEN_STATUS_LABELS: [OpenStatus, string][] = [
  ["inbound", "Inbound"],
  ["triaged", "Triaged"],
  ["waiting_repair", "Waiting repair"],
  ["in_repair", "In repair"],
  ["confirm_repair", "Confirm repair"],
];

const RED_TEXT = "text-[#b91c1c]";
const VALUE_CLASS = "text-[28px] leading-9 font-semibold tabular-nums";
const NOTE_CLASS = "text-[13px] leading-[18px]";

function Card({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return (
    <div
      data-testid={`card-${id}`}
      className={`${CARD_CLASS} box-border min-w-0 flex-[1_1_230px] px-5 py-4`}
    >
      {label}
      {children}
    </div>
  );
}

function SimpleCard({
  id,
  label,
  value,
  note,
}: {
  id: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card id={id} label={<div className={LABEL_CLASS}>{label}</div>}>
      <div data-testid={`card-${id}-value`} className={`${VALUE_CLASS} text-darkBlue`}>
        {value}
      </div>
      <div data-testid={`card-${id}-note`} className={`${NOTE_CLASS} text-[#6b7280]`}>
        {note}
      </div>
    </Card>
  );
}

/** The width of the bar: the used share, never more than the whole bar; empty with no budget. */
function barWidth(ratio: number | null): string {
  return ratio === null ? "0%" : `${Math.min(100, ratio * 100).toFixed(1)}%`;
}

function BudgetCard({ figures }: { figures: AnalyticsFigures }) {
  const { budget } = figures.cards;
  const { period } = figures;
  const isSet = budget.setCents !== null && budget.remainingCents !== null;
  const over = budget.isOver;

  const line1 = isSet
    ? `Spent: ${formatUsdWhole(budget.spentCents)} | Remaining: ${formatUsdWhole(budget.remainingCents ?? 0)}`
    : "Budget not set";
  const line2 = isSet
    ? period.kind === "all"
      ? `Budgets of all years: ${formatUsdWhole(budget.setCents ?? 0)}`
      : `Budget ${period.year}: ${formatUsdWhole(budget.setCents ?? 0)}`
    : period.kind === "all"
      ? "No budget is set for any year"
      : `No budget is set for ${period.year}`;

  return (
    <Card
      id="budget"
      label={
        <div className="flex items-center justify-between gap-2">
          <div className={LABEL_CLASS}>Annual Budget Utilization</div>
          {over && (
            <span
              data-testid="budget-over-badge"
              className="inline-block rounded-full bg-[#fee2e2] px-2 py-px text-xs leading-[18px] font-semibold whitespace-nowrap text-[#991b1b]"
            >
              Over budget
            </span>
          )}
        </div>
      }
    >
      <div
        data-testid="budget-value"
        className={`${VALUE_CLASS} ${over ? RED_TEXT : "text-darkBlue"}`}
      >
        {budget.usedRatio === null ? "—" : formatPercent(budget.usedRatio)}
      </div>
      <div className="mt-1 mb-2 h-1.5 overflow-hidden rounded-[3px] bg-[#e5e7eb]">
        <div
          data-testid="budget-bar-fill"
          className={`h-full ${over ? "bg-[#dc2626]" : "bg-[#10365a]"}`}
          style={{ width: barWidth(budget.usedRatio) }}
        />
      </div>
      <div
        data-testid="budget-line-1"
        className={`${NOTE_CLASS} ${over ? RED_TEXT : "text-[#6b7280]"}`}
      >
        {line1}
      </div>
      <div data-testid="budget-line-2" className={`${NOTE_CLASS} text-[#6b7280]`}>
        {line2}
      </div>
    </Card>
  );
}

export function AnalyticsCards({ figures }: { figures: AnalyticsFigures }) {
  const { cards, period } = figures;
  const open = cards.openWorkOrders;
  const periodWord = period.kind === "all" ? "All-time" : String(period.year);

  return (
    <div className="flex flex-wrap gap-4">
      <SimpleCard
        id="total"
        label="Total Fleet Maintenance Spend"
        value={formatUsd(cards.totalSpendCents)}
        note={`${periodWord} spend across ${cards.bleachersTotal} bleachers`}
      />
      <SimpleCard
        id="ready"
        label="Bleachers Ready"
        value={formatPercent(cards.ready.ratio)}
        note={`${cards.ready.ready} of ${cards.ready.total} ready to go`}
      />
      <SimpleCard
        id="avg"
        label="Avg Maint Spend / Bleacher"
        value={formatUsd(cards.avgPerBleacherCents)}
        note={`Range: ${formatUsdWhole(cards.rangeCents.min)} – ${formatUsdWhole(cards.rangeCents.max)}`}
      />
      <SimpleCard
        id="open"
        label="Active Open Work Orders"
        value={String(open.total)}
        note={
          open.total === 0
            ? "No open repairs"
            : OPEN_STATUS_LABELS.map(([status, label]) => `${label} ${open.byStatus[status]}`).join(
                " | ",
              )
        }
      />
      <BudgetCard figures={figures} />
    </div>
  );
}
