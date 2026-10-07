"use client";

import { Panel } from "./Panel";
import { StatusPill } from "../StatusPill";
import { cn } from "@/lib/utils";

/**
 * Shared table chrome for the roadmap lists. The three pages differ only in their
 * columns, so the surface, header treatment and row rhythm live here rather than
 * being re-typed (and drifting) in each page.
 */
export function DataTable({
  headers,
  children,
}: {
  headers: { label: string; className?: string }[];
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-rm-hairline bg-rm-sunken">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-4 py-2.5 text-left text-[11px] font-semibold tracking-wide text-rm-ink-faint uppercase",
                    h.className,
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Panel>
  );
}

/**
 * `deleted` is how every roadmap list marks a soft-deleted row: faint red background and faded
 * cells. Pair it with `TitleCell deleted` and `DeletedStatusCell`; a cell carrying
 * `data-keep-opacity` (the status one) stays at full strength.
 */
export function Row({
  className,
  deleted,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { deleted?: boolean }) {
  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-rm-hairline transition-colors last:border-0 motion-reduce:transition-none",
        deleted
          ? "bg-rm-danger-soft/40 hover:bg-rm-danger-soft/70 [&>td:not([data-keep-opacity])]:opacity-60"
          : "hover:bg-rm-sunken",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Cell({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 text-rm-ink", className)} {...props}>
      {children}
    </td>
  );
}

/** Title cell that degrades to a muted "Untitled …" for drafts. */
export function TitleCell({
  title,
  fallback,
  deleted,
}: {
  title: string;
  fallback: string;
  deleted?: boolean;
}) {
  return (
    <Cell className={cn("font-medium", deleted && "line-through")}>
      {title.trim() ? title : <span className="text-rm-ink-faint italic">{fallback}</span>}
    </Cell>
  );
}

/** Status cell for a deleted row: a red "Deleted" pill in place of the real status. */
export function DeletedStatusCell() {
  return (
    <Cell data-keep-opacity>
      <StatusPill label="Deleted" tone="danger" />
    </Cell>
  );
}
