import type { CSSProperties, ReactNode } from "react";
import { RotateCcw, Wrench } from "lucide-react";
import { formatRepairDay, formatRepairMoney, reportedCell } from "../utils/repairFormat";
import type { RepairCurrency, RepairListRow } from "../utils/repairRows";
import { BleacherChip, CategoryChip, SeverityPill, StatusPill } from "./RepairChips";

export type RepairsTableProps = {
  /** The rows of the page shown. */
  rows: RepairListRow[];
  isLoading: boolean;
  /** The Show Deleted view for a role that may restore: adds the last column with Restore. */
  showRestore: boolean;
  onRestore: (repairId: string) => void;
};

/**
 * The Repairs table: 17 columns drawn as a CSS grid, the first column sticky, inside a box that
 * scrolls sideways. Read-only: no row click, no arrows, no sort buttons (spec 04 D40, D43). The
 * last column exists only to hold Restore in the Show Deleted view (D41).
 * docs/specs/repairs-04-table.md §2.2 to §2.5 and §2.10; the widths and looks are the canvas's.
 */

const GAP = 12;
const EDGE = 16;

const NUMERIC = "whitespace-nowrap tabular-nums";
const MONEY = `text-right ${NUMERIC}`;
const TRUNCATE = "min-w-0 truncate";

function Dash() {
  return <span className="text-[#9ca3af]">—</span>;
}

/** Text from a formatter, with the dash drawn in grey. */
function textOrDash(text: string): ReactNode {
  return text === "—" ? <Dash /> : text;
}

type Column = {
  key: string;
  label: string;
  width: number;
  /** Money columns: the header and the cells are right-aligned. */
  align?: "right";
  /** Classes of every cell of the column (on top of the grid cell's own). */
  cellClass?: string;
  /** The `title` of the cell, for text that is cut to one line. */
  title?: (row: RepairListRow) => string | null;
  render: (row: RepairListRow) => ReactNode;
};

const money = (pick: (row: RepairListRow) => number | null) => (row: RepairListRow) =>
  textOrDash(formatRepairMoney(pick(row), row.currency as RepairCurrency));

const COLUMNS: Column[] = [
  {
    key: "bleachers",
    label: "Bleachers",
    width: 176,
    cellClass: "flex flex-wrap content-center gap-1 self-stretch py-3.5 pl-4",
    render: (row) =>
      row.bleachers.length ? (
        row.bleachers.map((b) => <BleacherChip key={b.uuid} number={b.number} />)
      ) : (
        <Dash />
      ),
  },
  {
    key: "reported",
    label: "Reported",
    width: 124,
    cellClass: NUMERIC,
    render: (row) => {
      const cell = reportedCell(row.reported);
      if (!cell) return <Dash />;
      return (
        <>
          <span>{cell.day}</span>
          {cell.more && <span className="ml-1.5 text-xs text-[#6b7280]">{cell.more}</span>}
        </>
      );
    },
  },
  {
    key: "from",
    label: "Repair from",
    width: 124,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.eventStart)),
  },
  {
    key: "to",
    label: "Repair to",
    width: 124,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.eventEnd)),
  },
  {
    key: "zone",
    label: "Zone",
    width: 84,
    render: (row) =>
      row.zones.length ? row.zones.map((z) => <div key={z.uuid}>{z.name ?? "—"}</div>) : <Dash />,
  },
  {
    key: "severity",
    label: "Severity",
    width: 100,
    cellClass: "flex flex-wrap gap-1",
    render: (row) =>
      row.severities.length ? (
        row.severities.map((s) => <SeverityPill key={s} severity={s} />)
      ) : (
        <Dash />
      ),
  },
  {
    key: "categories",
    label: "Categories",
    width: 190,
    cellClass: "flex flex-wrap gap-1",
    render: (row) =>
      row.categories.length ? (
        row.categories.map((c) => <CategoryChip key={c.uuid} name={c.name} />)
      ) : (
        <Dash />
      ),
  },
  {
    key: "notes",
    label: "Notes",
    width: 220,
    cellClass: `${TRUNCATE} whitespace-nowrap text-[#4b5563]`,
    title: (row) => row.notes || null,
    render: (row) => row.notes || <Dash />,
  },
  {
    key: "status",
    label: "Status",
    width: 160,
    render: (row) => <StatusPill status={row.status} />,
  },
  {
    key: "vendor",
    label: "Vendor",
    width: 200,
    cellClass: `${TRUNCATE} whitespace-nowrap`,
    title: (row) => row.vendorName || null,
    render: (row) => row.vendorName || <Dash />,
  },
  {
    key: "invoice",
    label: "Invoice #",
    width: 132,
    cellClass: NUMERIC,
    render: (row) => row.invoiceNumber || <Dash />,
  },
  {
    key: "labor",
    label: "Labor",
    width: 100,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.laborCents),
  },
  {
    key: "parts",
    label: "Parts",
    width: 100,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.partsCents),
  },
  {
    key: "tax",
    label: "Tax",
    width: 92,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.taxCents),
  },
  {
    key: "freight",
    label: "Freight",
    width: 92,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.freightCents),
  },
  {
    key: "total",
    label: "Total",
    width: 112,
    align: "right",
    cellClass: `${MONEY} font-semibold`,
    render: money((r) => r.totalCents),
  },
  {
    key: "completed",
    label: "Completed",
    width: 116,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.completedOn)),
  },
];

const RESTORE_WIDTH = 112;

const HEADER_BASE =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";

function gridFor(showRestore: boolean): { style: CSSProperties; minWidth: number } {
  const widths = COLUMNS.map((c) => c.width);
  if (showRestore) widths.push(RESTORE_WIDTH);
  return {
    style: {
      gridTemplateColumns: widths.map((w) => `${w}px`).join(" "),
      columnGap: GAP,
    },
    minWidth: widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1) + EDGE,
  };
}

export function RepairsTable({ rows, isLoading, showRestore, onRestore }: RepairsTableProps) {
  const grid = gridFor(showRestore);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-[#e5e7eb] bg-white [container-type:inline-size]">
      <div
        role="table"
        aria-label="Repairs"
        data-testid="repairs-table"
        style={{ minWidth: grid.minWidth }}
        className="text-sm leading-5 text-gray-900"
      >
        <div role="row" style={grid.style} className="grid min-h-11 items-center bg-[#f9fafb] pr-4">
          {COLUMNS.map((col, index) => (
            <div
              key={col.key}
              role="columnheader"
              className={`${HEADER_BASE} ${
                index === 0
                  ? "sticky left-0 z-[2] flex items-center self-stretch bg-[#f9fafb] pl-4"
                  : ""
              } ${col.align === "right" ? "text-right" : ""}`}
            >
              {col.label}
            </div>
          ))}
          {showRestore && (
            <div role="columnheader" className="sticky right-0 z-[2] self-stretch bg-[#f9fafb]">
              <span className="sr-only">Actions</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <div
            data-testid="repairs-loading"
            className="sticky left-0 w-[100cqw] border-t border-[#e5e7eb] px-4 py-14 text-center text-gray-500"
          >
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div
            data-testid="repairs-empty"
            className="sticky left-0 w-[100cqw] border-t border-[#e5e7eb] px-4 py-14 text-center text-[#9ca3af]"
          >
            <Wrench className="mx-auto mb-2 h-8 w-8 text-[#d1d5db]" aria-hidden="true" />
            No repairs found.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              role="row"
              data-testid="repair-row"
              style={grid.style}
              className="grid min-h-16 items-center border-t border-[#e5e7eb] bg-white pr-4 hover:bg-[#f9fafb]"
            >
              {COLUMNS.map((col, index) => (
                <div
                  key={col.key}
                  data-col={col.key}
                  role="cell"
                  title={col.title?.(row) ?? undefined}
                  className={`${col.cellClass ?? ""} ${
                    index === 0 ? "sticky left-0 z-[2] bg-inherit" : ""
                  }`}
                >
                  {col.render(row)}
                </div>
              ))}
              {showRestore && (
                <div
                  data-col="restore"
                  role="cell"
                  className="sticky right-0 z-[2] flex items-center justify-end self-stretch bg-inherit pl-2"
                >
                  <button
                    type="button"
                    data-testid="repair-restore"
                    onClick={() => onRestore(row.id)}
                    className="flex cursor-pointer items-center gap-1 text-sm text-green-700 hover:text-green-900"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restore
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
