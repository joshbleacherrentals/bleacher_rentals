import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { formatRepairMoney, reportedCell } from "../utils/repairFormat";
import { repairLabel, serviceRowLabel } from "../utils/repairDetails";
import type { RepairListRow, RepairService } from "../utils/repairRows";
import { BleacherChip, CategoryChip, DeletedBadge, SeverityPill } from "./RepairChips";

export type RepairServicesBlockProps = {
  repair: RepairListRow;
  /** The id the arrow of the row points to with `aria-controls`. */
  id: string;
  onOpenService: (serviceId: string) => void;
  /** Add service under the table; the button is drawn only when it is given (spec 09b1 D158). */
  onAddService?: () => void;
};

/**
 * The block under an open repair: a card with the table of its services (Bleacher, Category,
 * Severity, Reported, Description, Labor, Parts, Tax, Freight, Total). A click, Enter or Space on a
 * row opens the service window. It has no total row (spec 06 D84); it has Add service under the
 * table when the page gives the handler (spec 09b1 D158).
 * docs/specs/repairs-06-expanded-row.md §2.2; the grid and the looks are the canvas's.
 *
 * The same rows, on the canvas's narrower window grid and with a Total row, are the table of the
 * repair window (`RepairWindowServices`, docs/specs/repairs-07-repair-window.md §2.4).
 */

const GAP = 12;
/** 84 + 148 + 96 + 124 + 100 + 100 + 88 + 88 + 112 + 20 + 10 gaps + 32 padding + 220 description. */
const MIN_WIDTH = 1332;

const GRID: CSSProperties = {
  gridTemplateColumns: "84px 148px 96px 124px minmax(220px, 1fr) 100px 100px 88px 88px 112px 20px",
  columnGap: GAP,
};

/** The repair window's grid (the canvas's `InvoiceModal`): 76 + 120 + 84 + 108 + 120 + 88 + 88 + 72
 *  + 72 + 100 + 16 + 10 gaps of 8 + 32 padding. */
const WINDOW_GRID: CSSProperties = {
  gridTemplateColumns: "76px 120px 84px 108px minmax(120px, 1fr) 88px 88px 72px 72px 100px 16px",
  columnGap: 8,
};
/** The table never gets narrower than this; the repair window is wide enough for it (spec 09a). */
export const WINDOW_MIN_WIDTH = 1056;

const HEADER_BASE =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";
const MONEY = "text-right whitespace-nowrap tabular-nums";

const HEADERS: { label: string; align?: "right" }[] = [
  { label: "Bleacher" },
  { label: "Category" },
  { label: "Severity" },
  { label: "Reported" },
  { label: "Description" },
  { label: "Labor", align: "right" },
  { label: "Parts", align: "right" },
  { label: "Tax", align: "right" },
  { label: "Freight", align: "right" },
  { label: "Total", align: "right" },
];

function Dash() {
  return <span className="text-[#9ca3af]">—</span>;
}

/** The Add service button under a table of services (the canvas's `rp-addbtn`; spec 09b1 D158). */
function AddServiceButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="add-service"
      onClick={onClick}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d1d5db] bg-white px-3 text-sm leading-5 font-semibold text-[#10365a] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
    >
      <Plus className="size-3.5" aria-hidden="true" />
      Add service
    </button>
  );
}

/** One service of a repair: a focusable row that opens the service window. The grid is the caller's. */
export function ServiceRow({
  repair,
  service,
  onOpen,
  grid,
}: {
  repair: RepairListRow;
  service: RepairService;
  onOpen: () => void;
  grid: CSSProperties;
}) {
  const money = (cents: number) => formatRepairMoney(cents, repair.currency);
  const reported = reportedCell(service.reported);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only the row's own keys: a key pressed on something inside it is not the row's.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  const cell = (key: string, className: string, children: ReactNode, title?: string) => (
    <div data-col={`service-${key}`} role="cell" title={title} className={className}>
      {children}
    </div>
  );

  return (
    <div
      data-testid="repair-service-row"
      role="row"
      tabIndex={0}
      aria-label={serviceRowLabel(service)}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      style={grid}
      className="grid min-h-12 cursor-pointer items-center border-t border-[#e5e7eb] bg-white px-4 py-2 text-gray-900 hover:bg-[#f9fafb] focus-visible:bg-[#f9fafb] focus-visible:outline-none"
    >
      {cell("bleacher", "", <BleacherChip number={service.bleacherNumber} />)}
      {cell(
        "category",
        "",
        service.categoryName ? <CategoryChip name={service.categoryName} /> : <Dash />,
      )}
      {cell("severity", "", <SeverityPill severity={service.severity} />)}
      {cell(
        "reported",
        "whitespace-nowrap tabular-nums",
        reported ? (
          <>
            <span>{reported.day}</span>
            {reported.more && (
              <span className="ml-1.5 text-xs text-[#6b7280]">{reported.more}</span>
            )}
          </>
        ) : (
          <Dash />
        ),
      )}
      {cell(
        "description",
        "flex min-w-0 items-center gap-2 text-[#4b5563]",
        <>
          {service.deleted && <DeletedBadge />}
          {service.description ? (
            <span className="min-w-0 truncate">{service.description}</span>
          ) : (
            <Dash />
          )}
        </>,
        service.description || undefined,
      )}
      {cell("labor", MONEY, money(service.laborCents))}
      {cell("parts", MONEY, money(service.partsCents))}
      {cell("tax", MONEY, money(service.taxCents))}
      {cell("freight", MONEY, money(service.freightCents))}
      {cell("total", `${MONEY} font-semibold`, money(service.totalCents))}
      <div role="cell" className="flex justify-end text-[#9ca3af]">
        <ChevronRight className="size-4" aria-hidden="true" />
      </div>
    </div>
  );
}

/** The band with the ten headers of the table of services and an empty one for the chevron. */
function ServicesHeader({ grid }: { grid: CSSProperties }) {
  return (
    <div role="row" style={grid} className="grid min-h-9 items-center bg-[#f9fafb] px-4">
      {HEADERS.map((h) => (
        <div
          key={h.label}
          role="columnheader"
          className={`${HEADER_BASE} ${h.align === "right" ? "text-right" : ""}`}
        >
          {h.label}
        </div>
      ))}
      <div role="columnheader" />
    </div>
  );
}

export function RepairServicesBlock({
  repair,
  id,
  onOpenService,
  onAddService,
}: RepairServicesBlockProps) {
  const label = `Services of ${repairLabel(repair)}`;
  const isEmpty = repair.services.length === 0;

  return (
    <div
      id={id}
      data-testid="repair-services"
      className="sticky left-0 box-border w-[100cqw] px-4 pt-1 pb-4"
    >
      <div
        role={isEmpty ? undefined : "table"}
        aria-label={isEmpty ? undefined : label}
        className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,42,68,0.05)]"
      >
        {isEmpty ? (
          <div
            data-testid="repair-services-empty"
            className="px-4 py-6 text-center text-sm text-[#9ca3af]"
          >
            No services on this repair.
          </div>
        ) : (
          <div style={{ minWidth: MIN_WIDTH }}>
            <ServicesHeader grid={GRID} />
            {repair.services.map((service) => (
              <ServiceRow
                key={service.id}
                repair={repair}
                service={service}
                grid={GRID}
                onOpen={() => onOpenService(service.id)}
              />
            ))}
          </div>
        )}
      </div>
      {onAddService && (
        <div className="mt-3">
          <AddServiceButton onClick={onAddService} />
        </div>
      )}
    </div>
  );
}

export type RepairWindowServicesProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
  /** Add service under the table; the button is drawn only when it is given (spec 09b1 D158). */
  onAddService?: () => void;
};

/**
 * The table of services in the repair window: the canvas's window grid, the same rows as the block,
 * and a Total row (D101): the sums of the services under Labor, Parts, Tax and Freight, and the
 * repair's own total (`cost_cents`) under Total, which may differ from the sum for a moment (spec 03
 * D32). A repair with no services keeps the header band, says so, and still draws the Total row.
 * Add service is under it when the window gives the handler (spec 09b1 D158).
 */
export function RepairWindowServices({
  repair,
  onOpenService,
  onAddService,
}: RepairWindowServicesProps) {
  const isEmpty = repair.services.length === 0;
  const sum = (key: string, cents: number | null, className = "") => {
    const text = formatRepairMoney(cents, repair.currency);
    return (
      <div data-col={`total-${key}`} role="cell" className={`${MONEY} ${className}`}>
        {text === "—" ? <Dash /> : text}
      </div>
    );
  };

  const table = (
    <div
      role="table"
      aria-label={`Services of ${repairLabel(repair)}`}
      data-testid="repair-window-services"
      className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white"
    >
      <div style={{ minWidth: WINDOW_MIN_WIDTH }}>
        <ServicesHeader grid={WINDOW_GRID} />
        {isEmpty ? (
          <div
            data-testid="repair-services-empty"
            className="border-t border-[#e5e7eb] px-4 py-3.5 text-center text-sm text-[#9ca3af]"
          >
            No services on this repair.
          </div>
        ) : (
          repair.services.map((service) => (
            <ServiceRow
              key={service.id}
              repair={repair}
              service={service}
              grid={WINDOW_GRID}
              onOpen={() => onOpenService(service.id)}
            />
          ))
        )}
        <div
          role="row"
          data-testid="repair-window-total"
          style={WINDOW_GRID}
          className="grid min-h-11 items-center border-t border-[#e5e7eb] bg-[#f9fafb] px-4 text-sm leading-5 font-semibold"
        >
          <div data-col="total-label" role="cell" style={{ gridColumn: "1 / 6" }}>
            Total
          </div>
          {sum("labor", repair.laborCents)}
          {sum("parts", repair.partsCents)}
          {sum("tax", repair.taxCents)}
          {sum("freight", repair.freightCents)}
          {sum("total", repair.totalCents, "text-[#10365a]")}
          <div role="cell" />
        </div>
      </div>
    </div>
  );

  if (!onAddService) return table;
  return (
    <div>
      {table}
      <div className="mt-3">
        <AddServiceButton onClick={onAddService} />
      </div>
    </div>
  );
}
