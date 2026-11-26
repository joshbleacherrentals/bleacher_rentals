import type { ReactNode } from "react";

// docs/specs/dashboard-analytics-05-page.md §2.5 and the board Main.dc.html: the white block every
// part of the page below the cards sits in, and the table the four tables share. The look is the
// board's: a 1 px #e5e7eb border and a 10 px radius, a 16 px navy title with a short grey line
// beside it, and a table in a box that scrolls sideways (at least 760 px wide).

export const CARD_CLASS = "rounded-[10px] border border-[#e5e7eb] bg-white";
export const LABEL_CLASS =
  "text-xs leading-4 font-medium tracking-[0.05em] text-[#6b7280] uppercase";

type BlockProps = {
  /** The test id of the block, and the base of the id of its heading. */
  id: string;
  title: string;
  note: string;
  children: ReactNode;
};

/** A block: the heading, the grey line at its right, and the body. */
export function AnalyticsBlock({ id, title, note, children }: BlockProps) {
  return (
    <section
      data-testid={`${id}-block`}
      aria-labelledby={`${id}-heading`}
      className={`${CARD_CLASS} overflow-hidden`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4">
        <h2 id={`${id}-heading`} className="m-0 text-base leading-6 font-semibold text-darkBlue">
          {title}
        </h2>
        <span className="text-[13px] leading-[18px] text-[#6b7280]">{note}</span>
      </div>
      {children}
    </section>
  );
}

/** One centred grey line inside a block (the empty states). */
export function BlockEmpty({
  testId,
  title,
  sub,
}: {
  testId: string;
  title: string;
  sub?: string;
}) {
  if (sub === undefined) {
    return (
      <div
        data-testid={testId}
        className="border-t border-[#f3f4f6] px-5 pt-7 pb-8 text-center text-sm leading-5 text-[#6b7280]"
      >
        {title}
      </div>
    );
  }
  return (
    <div className="border-t border-[#f3f4f6] px-5 pt-7 pb-8 text-center">
      <div
        data-testid={`${testId}-title`}
        className="text-[15px] leading-[22px] font-semibold text-[#374151]"
      >
        {title}
      </div>
      <div data-testid={`${testId}-sub`} className="mt-1 text-[13px] leading-[18px] text-[#6b7280]">
        {sub}
      </div>
    </div>
  );
}

export type TableColumn = { header: string; align?: "left" | "right"; muted?: boolean };

type TableProps = {
  label: string;
  columns: TableColumn[];
  /** The Tailwind class that sets the column widths, the same for every row. */
  grid: string;
  rows: string[][];
  total: string[];
};

const ROW_CLASS = "grid items-center gap-x-4 px-5 py-2.5 text-sm leading-5 text-[#111827]";
const NUMBER_CLASS = "text-right tabular-nums";

/**
 * A table of plain text. The column headers are not buttons: the tables cannot be sorted (D41), and
 * the rows keep the order the figures give them. The last row is the total row.
 */
export function AnalyticsTable({ label, columns, grid, rows, total }: TableProps) {
  const alignClass = (column: TableColumn) => (column.align === "right" ? NUMBER_CLASS : "");
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label={label} className="min-w-[760px]">
        <div role="row" className={`${ROW_CLASS} ${grid} border-b border-[#e5e7eb] bg-[#f9fafb]`}>
          {columns.map((column) => (
            <div
              key={column.header}
              role="columnheader"
              className={`min-w-0 ${LABEL_CLASS} ${alignClass(column)}`}
            >
              {column.header}
            </div>
          ))}
        </div>
        {rows.map((cells, index) => (
          <div key={index} role="row" className={`${ROW_CLASS} ${grid} border-t border-[#f3f4f6]`}>
            {cells.map((cell, cellIndex) => (
              <div
                key={cellIndex}
                role="cell"
                className={`min-w-0 break-words ${alignClass(columns[cellIndex])} ${
                  columns[cellIndex].muted ? "text-[#6b7280]" : ""
                }`}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
        <div
          role="row"
          className={`${ROW_CLASS} ${grid} border-t border-[#e5e7eb] bg-[#f9fafb] font-semibold`}
        >
          {total.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              role="cell"
              className={`min-w-0 break-words ${alignClass(columns[cellIndex])}`}
            >
              {cell}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
