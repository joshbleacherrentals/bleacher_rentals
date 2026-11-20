import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { repairLabel, repairOpenLabel } from "../utils/repairDetails";
import { formatRepairDay, formatRepairMoney, reportedCell } from "../utils/repairFormat";
import type {
  RepairCurrency,
  RepairListRow,
  RepairStatus,
  ReportedReport,
} from "../utils/repairRows";
import type { RepairSort, RepairSortKey } from "../utils/repairSort";
import { canChangeRepairStatus } from "../utils/repairStatus";
import { BleacherChip, CategoryChip, SeverityPill, StatusPill } from "./RepairChips";
import { RepairServicesBlock } from "./RepairServices";
import { RepairStatusMenu } from "./RepairStatusMenu";

export type RepairsTableProps = {
  /** The rows of the page shown. */
  rows: RepairListRow[];
  isLoading: boolean;
  /** The Show Deleted view for a role that may restore: adds the last column with Restore. */
  showRestore: boolean;
  onRestore: (repairId: string) => void;
  /** The column the rows are sorted by, or null for the starting order. */
  sort: RepairSort | null;
  /** A click on the header of a sortable column. */
  onSort: (key: RepairSortKey) => void;
  /** The repairs whose block of services is open (spec 06 D80 to D82). */
  expandedIds: ReadonlySet<string>;
  /** A click on a row or on its arrow. */
  onToggleRepair: (repairId: string) => void;
  /** A click on a service row of an open block. */
  onOpenService: (repairId: string, serviceId: string) => void;
  /** A click on the Reported day of a row: the reports found for that repair (D87). */
  onOpenReports: (reported: ReportedReport[]) => void;
  /** A click on the button at the end of a row: the repair window (spec 07 D94). */
  onOpenRepair: (repairId: string) => void;
  /**
   * A status chosen in the menu of a row's pill (spec 08 D110). Given only to a role that may change
   * the status; without it every pill is the plain one. A deleted row never gets the menu (D118).
   */
  onChangeStatus?: (repair: RepairListRow, to: RepairStatus) => void;
};

/**
 * The Repairs table: 17 columns drawn as a CSS grid, the first column sticky, inside a box that
 * scrolls sideways. Read-only. A click on a row, or on the arrow in its first cell, opens its block
 * of services under it (spec 06 D80); the Reported day opens the damage reports (D87). The last
 * column is always there: it holds the button that opens the repair window and, in the Show Deleted
 * view, Restore beside it (spec 07 D94, spec 04 D41).
 * docs/specs/repairs-04-table.md §2.2 to §2.5 and §2.10, docs/specs/repairs-06-expanded-row.md §2.1
 * and docs/specs/repairs-07-repair-window.md §2.1; the widths and looks are the canvas's.
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
  /** Set on the columns whose header sorts the table; this key is what `onSort` receives. */
  sortKey?: RepairSortKey;
  /** Classes of every cell of the column (on top of the grid cell's own). */
  cellClass?: string;
  /** The `title` of the cell, for text that is cut to one line. */
  title?: (row: RepairListRow) => string | null;
  render: (row: RepairListRow, ctx: CellContext) => ReactNode;
};

/** What a cell needs of the table besides its row: the open state and the actions. */
type CellContext = {
  expanded: boolean;
  blockId: string;
  onToggle: () => void;
  onOpenReports: (reported: ReportedReport[]) => void;
  /** Present only when this row's pill is a menu: already bound to the row (spec 08). */
  onChangeStatus?: (to: RepairStatus) => void;
};

const money = (pick: (row: RepairListRow) => number | null) => (row: RepairListRow) =>
  textOrDash(formatRepairMoney(pick(row), row.currency as RepairCurrency));

const COLUMNS: Column[] = [
  {
    key: "bleachers",
    label: "Bleachers",
    width: 176,
    cellClass: "flex items-start gap-1.5 self-stretch py-3.5 pl-3",
    render: (row, ctx) => (
      <>
        <button
          type="button"
          data-testid="repair-toggle"
          aria-expanded={ctx.expanded}
          aria-controls={ctx.blockId}
          aria-label={`${ctx.expanded ? "Collapse" : "Expand"} ${repairLabel(row)}`}
          onClick={(event) => {
            // The row toggles on a click too; this click must count once.
            event.stopPropagation();
            ctx.onToggle();
          }}
          className="-mt-px inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-[#6b7280] hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
        >
          <ChevronRight
            className={`size-4 transition-transform ${ctx.expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </button>
        <div className="flex min-w-0 flex-wrap content-center gap-1">
          {row.bleachers.length ? (
            row.bleachers.map((b) => <BleacherChip key={b.uuid} number={b.number} />)
          ) : (
            <Dash />
          )}
        </div>
      </>
    ),
  },
  {
    key: "reported",
    sortKey: "reported",
    label: "Reported",
    width: 124,
    cellClass: NUMERIC,
    render: (row, ctx) => {
      const cell = reportedCell(row.reported);
      if (!cell) return <Dash />;
      return (
        <>
          <button
            type="button"
            data-testid="repair-reported-link"
            title={row.reported.length > 1 ? "Open damage reports" : "Open damage report"}
            onClick={(event) => {
              // Opening the reports must not also open or close the row.
              event.stopPropagation();
              ctx.onOpenReports(row.reported);
            }}
            className="cursor-pointer text-[#1d62a3] underline decoration-[#1d62a3]/35 underline-offset-[3px] hover:decoration-[#1d62a3]"
          >
            {cell.day}
          </button>
          {cell.more && <span className="ml-1.5 text-xs text-[#6b7280]">{cell.more}</span>}
        </>
      );
    },
  },
  {
    key: "from",
    sortKey: "from",
    label: "Repair from",
    width: 124,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.eventStart)),
  },
  {
    key: "to",
    sortKey: "to",
    label: "Repair to",
    width: 124,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.eventEnd)),
  },
  {
    key: "zone",
    sortKey: "zone",
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
    sortKey: "notes",
    label: "Notes",
    width: 220,
    cellClass: `${TRUNCATE} whitespace-nowrap text-[#4b5563]`,
    title: (row) => row.notes || null,
    render: (row) => row.notes || <Dash />,
  },
  {
    key: "status",
    sortKey: "status",
    label: "Status",
    width: 160,
    render: (row, ctx) =>
      ctx.onChangeStatus ? (
        <RepairStatusMenu
          status={row.status}
          repairLabel={repairLabel(row)}
          onChange={ctx.onChangeStatus}
        />
      ) : (
        <StatusPill status={row.status} />
      ),
  },
  {
    key: "vendor",
    sortKey: "vendor",
    label: "Vendor",
    width: 200,
    cellClass: `${TRUNCATE} whitespace-nowrap`,
    title: (row) => row.vendorName || null,
    render: (row) => row.vendorName || <Dash />,
  },
  {
    key: "invoice",
    sortKey: "invoice",
    label: "Invoice #",
    width: 132,
    cellClass: NUMERIC,
    render: (row) => row.invoiceNumber || <Dash />,
  },
  {
    key: "labor",
    sortKey: "labor",
    label: "Labor",
    width: 100,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.laborCents),
  },
  {
    key: "parts",
    sortKey: "parts",
    label: "Parts",
    width: 100,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.partsCents),
  },
  {
    key: "tax",
    sortKey: "tax",
    label: "Tax",
    width: 92,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.taxCents),
  },
  {
    key: "freight",
    sortKey: "freight",
    label: "Freight",
    width: 92,
    align: "right",
    cellClass: MONEY,
    render: money((r) => r.freightCents),
  },
  {
    key: "total",
    sortKey: "total",
    label: "Total",
    width: 112,
    align: "right",
    cellClass: `${MONEY} font-semibold`,
    render: money((r) => r.totalCents),
  },
  {
    key: "completed",
    sortKey: "completed",
    label: "Completed",
    width: 116,
    cellClass: NUMERIC,
    render: (row) => textOrDash(formatRepairDay(row.completedOn)),
  },
];

/** The last column: the open button (32 px with its padding), or that and Restore (112 px). */
const ACTIONS_WIDTH = 48;
const RESTORE_WIDTH = 112;

const HEADER_BASE =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";

function gridFor(showRestore: boolean): { style: CSSProperties; minWidth: number } {
  const widths = COLUMNS.map((c) => c.width);
  widths.push(showRestore ? ACTIONS_WIDTH + RESTORE_WIDTH : ACTIONS_WIDTH);
  return {
    style: {
      gridTemplateColumns: widths.map((w) => `${w}px`).join(" "),
      columnGap: GAP,
    },
    minWidth: widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1) + EDGE,
  };
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  const className = "size-3 shrink-0";
  if (direction === "asc") return <ArrowUp className={className} aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className={className} aria-hidden="true" />;
  return <ArrowUpDown className={`${className} opacity-50`} aria-hidden="true" />;
}

export function RepairsTable({
  rows,
  isLoading,
  showRestore,
  onRestore,
  sort,
  onSort,
  expandedIds,
  onToggleRepair,
  onOpenService,
  onOpenReports,
  onOpenRepair,
  onChangeStatus,
}: RepairsTableProps) {
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
          {COLUMNS.map((col, index) => {
            const direction = sort && sort.key === col.sortKey ? sort.direction : null;
            return (
              <div
                key={col.key}
                role="columnheader"
                aria-sort={
                  direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : undefined
                }
                className={`${HEADER_BASE} ${
                  index === 0
                    ? "sticky left-0 z-[2] flex items-center self-stretch bg-[#f9fafb] pl-4"
                    : ""
                } ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.sortKey ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.sortKey as RepairSortKey)}
                    className={`inline-flex cursor-pointer items-center gap-1 uppercase select-none hover:text-gray-800 focus-visible:text-gray-800 focus-visible:outline-none ${
                      direction ? "text-gray-800" : ""
                    }`}
                  >
                    {col.label}
                    <SortIcon direction={direction} />
                  </button>
                ) : (
                  col.label
                )}
              </div>
            );
          })}
          <div role="columnheader" className="sticky right-0 z-[2] self-stretch bg-[#f9fafb]">
            <span className="sr-only">Actions</span>
          </div>
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
          rows.map((row) => {
            const expanded = expandedIds.has(row.id);
            const blockId = `repair-services-${row.id}`;
            const ctx: CellContext = {
              expanded,
              blockId,
              onToggle: () => onToggleRepair(row.id),
              onOpenReports,
              onChangeStatus:
                onChangeStatus && canChangeRepairStatus({ allowed: true, deleted: row.deleted })
                  ? (to) => onChangeStatus(row, to)
                  : undefined,
            };
            return (
              <div key={row.id} role="rowgroup" className="border-t border-[#e5e7eb]">
                <div
                  role="row"
                  data-testid="repair-row"
                  style={grid.style}
                  onClick={() => onToggleRepair(row.id)}
                  className={`grid min-h-16 cursor-pointer items-center pr-4 ${
                    expanded ? "bg-[#f1f6fc] hover:bg-[#f1f6fc]" : "bg-white hover:bg-[#f9fafb]"
                  }`}
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
                      {col.render(row, ctx)}
                    </div>
                  ))}
                  <div
                    data-col="actions"
                    role="cell"
                    className="sticky right-0 z-[2] flex items-center justify-end gap-2 self-stretch bg-inherit pl-2"
                  >
                    <button
                      type="button"
                      data-testid="repair-open"
                      aria-label={repairOpenLabel(row)}
                      title="Open repair"
                      onClick={(event) => {
                        // Opening the window must not also open or close the row.
                        event.stopPropagation();
                        onOpenRepair(row.id);
                      }}
                      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </button>
                    {showRestore && (
                      <button
                        type="button"
                        data-testid="repair-restore"
                        onClick={(event) => {
                          // Restoring must not also open or close the row.
                          event.stopPropagation();
                          onRestore(row.id);
                        }}
                        className="flex cursor-pointer items-center gap-1 text-sm text-green-700 hover:text-green-900"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <RepairServicesBlock
                    repair={row}
                    id={blockId}
                    onOpenService={(serviceId) => onOpenService(row.id, serviceId)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
