"use client";
import { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Horizontal alignment of the header and cells. Defaults to "left". */
  align?: "left" | "right";
  /** Set to make the header a sort toggle; this key is what `onSort` receives. */
  sortKey?: string;
  /**
   * An info icon beside the header that explains the column on hover. It sits
   * next to the sort button, not in it, so clicking it never sorts.
   */
  headerTooltip?: { label: string; content: string };
};

export type DataTableSort = { key: string; direction: "asc" | "desc" };

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[] | null;
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onRowClick?: (row: T) => void;
  /**
   * Makes every row a real link, so Cmd/Ctrl-click, middle-click and right-click → "Open in New
   * Tab" work like any other link; a plain click still navigates in-app. Use this instead of
   * `onRowClick` for rows that open a page — when set, `onRowClick` is ignored. Cells must not
   * contain their own links or buttons, since anchors cannot nest.
   */
  getRowHref?: (row: T) => string;
  /** The active sort, used to mark the header. Sorting the data is the caller's job. */
  sort?: DataTableSort;
  onSort?: (sortKey: string) => void;
};

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  const className = "h-3 w-3 shrink-0";
  if (direction === "asc") return <ArrowUp className={className} aria-hidden />;
  if (direction === "desc") return <ArrowDown className={className} aria-hidden />;
  return <ArrowUpDown className={`${className} opacity-40`} aria-hidden />;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data found",
  isLoading = false,
  loadingMessage = "Loading...",
  onRowClick,
  getRowHref,
  sort,
  onSort,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">{loadingMessage}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => {
                const sortable = column.sortKey !== undefined && onSort !== undefined;
                const direction =
                  sortable && sort && sort.key === column.sortKey ? sort.direction : null;
                const heading = sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.sortKey!)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer select-none hover:text-gray-800 ${
                      direction ? "text-gray-800" : ""
                    } ${column.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {column.header}
                    <SortIcon direction={direction} />
                  </button>
                ) : (
                  column.header
                );
                return (
                  <th
                    key={column.key}
                    aria-sort={
                      direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : undefined
                    }
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      column.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {column.headerTooltip ? (
                      <div className="inline-flex items-center gap-1">
                        {heading}
                        <InfoTooltip
                          label={column.headerTooltip.label}
                          content={column.headerTooltip.content}
                        />
                      </div>
                    ) : (
                      heading
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!data || data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-4 text-center text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const href = getRowHref?.(row);
                return (
                  <tr
                    key={keyExtractor(row)}
                    className={`hover:bg-gray-50 transition-colors ${
                      href || onRowClick ? "cursor-pointer" : ""
                    }`}
                    onClick={href ? undefined : () => onRowClick?.(row)}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap ${href ? "p-0" : "px-4 py-4"} ${
                          column.align === "right" ? "text-right" : ""
                        }`}
                      >
                        {href ? (
                          // The link fills the whole cell, so a click or right-click anywhere on the
                          // row lands on an anchor. No prefetch: a page of rows would otherwise
                          // request every quote up front. Only the first cell takes a tab stop.
                          <Link
                            href={href}
                            prefetch={false}
                            tabIndex={index === 0 ? undefined : -1}
                            className="block px-4 py-4"
                          >
                            {column.render(row)}
                          </Link>
                        ) : (
                          column.render(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper components for common cell styles
export function CellText({ children, bold = false }: { children: ReactNode; bold?: boolean }) {
  return <div className={`text-sm text-gray-900 ${bold ? "font-medium" : ""}`}>{children}</div>;
}

export function CellSecondary({ children }: { children: ReactNode }) {
  return <div className="text-sm text-gray-500">{children}</div>;
}

type BadgeVariant = "success" | "warning" | "error" | "default";

const badgeVariantClasses: Record<BadgeVariant, string> = {
  success: "bg-green-100 text-green-800 border-green-300",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
  error: "bg-red-100 text-red-800 border-red-300",
  default: "bg-gray-100 text-gray-800 border-gray-300",
};

export function CellBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${badgeVariantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
