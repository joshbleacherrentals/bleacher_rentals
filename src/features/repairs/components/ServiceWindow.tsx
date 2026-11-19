import type { ElementType, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RawServiceBleacherRow } from "../db/serviceWindowQueries";
import { useServiceBleacher } from "../hooks/useRepairDetails";
import { reportsButtonLabel, serviceWindowTitle } from "../utils/repairDetails";
import { formatRepairMoney, reportedCell } from "../utils/repairFormat";
import type { RepairListRow, RepairService } from "../utils/repairRows";
import { BleacherChip, CategoryChip, DeletedBadge, SeverityPill, StatusPill } from "./RepairChips";

/**
 * The service window: the fields and amounts of one service, the repair it belongs to, the damage
 * reports found for it and the bleacher's card. Read-only, with only the cross of the dialog to
 * close it (spec 06 D84). docs/specs/repairs-06-expanded-row.md §2.3; the looks are the canvas's.
 */

const EYEBROW =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";

function Dash() {
  return <span className="text-[#9ca3af]">—</span>;
}

/** A label and its value in the bleacher card; spans only, so the cell is one block. */
function CardCell({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div data-card={name} className="min-w-0">
      <span className="block text-xs leading-4 text-[#6b7280]">{label}</span>
      <span className="block font-medium break-words">{children}</span>
    </div>
  );
}

export type ServiceWindowContentProps = {
  repair: RepairListRow;
  service: RepairService;
  /** The card of the service's bleacher; null while it loads or when it is not on the device. */
  bleacher: RawServiceBleacherRow | null;
  onOpenReports: () => void;
  /** The element the title is drawn with: `h2`, or the dialog's own title. */
  Title?: ElementType;
};

/** The whole content of the window, a plain component so that a test can render it. */
export function ServiceWindowContent({
  repair,
  service,
  bleacher,
  onOpenReports,
  Title = "h2",
}: ServiceWindowContentProps) {
  const money = (cents: number) => formatRepairMoney(cents, repair.currency);
  const reported = reportedCell(service.reported);
  const buttonLabel = reportsButtonLabel(service.reported.length);
  const amounts: [string, string, number][] = [
    ["labor", "Labor", service.laborCents],
    ["parts", "Parts", service.partsCents],
    ["tax", "Tax", service.taxCents],
    ["freight", "Freight", service.freightCents],
  ];
  const orDash = (value: string | null | undefined) => (value?.trim() ? value : <Dash />);

  return (
    <>
      <div className="px-6 pt-5 pb-4 pr-12">
        <div className={EYEBROW}>Service</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <Title className="text-xl leading-7 font-semibold text-[#10365a]">
            {serviceWindowTitle(service)}
          </Title>
          {service.deleted && <DeletedBadge />}
        </div>
      </div>

      <div
        data-testid="service-window-repair"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-[#e5e7eb] bg-[#f9fafb] px-6 py-2.5 text-sm leading-5"
      >
        <span className={EYEBROW}>Repair</span>
        <span className="font-medium">{orDash(repair.vendorName)}</span>
        <span aria-hidden="true" className="text-[#9ca3af]">
          ·
        </span>
        <span className="tabular-nums">{orDash(repair.invoiceNumber)}</span>
        <StatusPill status={repair.status} />
        <CategoryChip name={repair.currency} />
      </div>

      <div className="grid gap-6 px-6 pt-5 pb-2 sm:grid-cols-[minmax(0,1fr)_264px]">
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-4 text-sm leading-5">
          <dt className={`${EYEBROW} pt-0.5`}>Bleacher</dt>
          <dd data-field="bleacher">
            <BleacherChip number={service.bleacherNumber} />
          </dd>
          <dt className={`${EYEBROW} pt-0.5`}>Category</dt>
          <dd data-field="category">
            {service.categoryName ? <CategoryChip name={service.categoryName} /> : <Dash />}
          </dd>
          <dt className={`${EYEBROW} pt-0.5`}>Severity</dt>
          <dd data-field="severity">
            <SeverityPill severity={service.severity} />
          </dd>
          <dt className={`${EYEBROW} pt-0.5`}>Reported</dt>
          <dd data-field="reported" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {reported ? (
              <>
                <span className="tabular-nums">{reported.day}</span>
                {reported.more && <span className="text-xs text-[#6b7280]">{reported.more}</span>}
                {buttonLabel && (
                  <button
                    type="button"
                    data-testid="service-window-reports"
                    onClick={onOpenReports}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] leading-5 font-medium text-[#a8403a] hover:underline"
                  >
                    <AlertTriangle className="size-3.5 text-[#b23c36]" aria-hidden="true" />
                    {buttonLabel}
                  </button>
                )}
              </>
            ) : (
              <Dash />
            )}
          </dd>
          <dt className={`${EYEBROW} pt-0.5`}>Description</dt>
          <dd data-field="description" className="whitespace-pre-wrap text-[#374151]">
            {orDash(service.description)}
          </dd>
        </dl>

        <div className="self-start rounded-lg bg-[#f9fafb] p-4 text-sm leading-5">
          {amounts.map(([name, label, cents]) => (
            <div key={name} data-amount={name} className="flex justify-between py-1">
              <span className="text-[#6b7280]">{label}</span>
              <span className="tabular-nums">{money(cents)}</span>
            </div>
          ))}
          <div
            data-amount="total"
            className="mt-2 flex justify-between border-t border-[#d1d5db] pt-2.5 font-semibold"
          >
            <span>Total</span>
            <span className="tabular-nums">{money(service.totalCents)}</span>
          </div>
        </div>
      </div>

      <div
        data-testid="service-window-bleacher"
        className="mx-6 mt-4 mb-6 rounded-lg border border-[#e5e7eb] px-4 py-3.5"
      >
        <div className={EYEBROW}>Bleacher</div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm leading-5 sm:grid-cols-4">
          <CardCell name="number" label="Number">
            {`#${service.bleacherNumber ?? "?"}`}
          </CardCell>
          <CardCell name="model" label="Model number">
            {orDash(bleacher?.modelNumber)}
          </CardCell>
          <CardCell name="type" label="Type">
            {orDash(bleacher?.typeName)}
          </CardCell>
          <CardCell name="zone" label="Zone">
            {orDash(bleacher?.zoneName)}
          </CardCell>
        </div>
      </div>
    </>
  );
}

export type ServiceWindowProps = {
  repair: RepairListRow;
  service: RepairService;
  onOpenReports: () => void;
  onClose: () => void;
};

/** The dialog around the content; it also reads the bleacher's card. */
export function ServiceWindow({ repair, service, onOpenReports, onClose }: ServiceWindowProps) {
  const { bleacher } = useServiceBleacher(service.bleacherUuid);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="service-window"
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-xl p-0 sm:max-w-[760px]"
      >
        <DialogDescription className="sr-only">A service of a repair. Read-only.</DialogDescription>
        <ServiceWindowContent
          repair={repair}
          service={service}
          bleacher={bleacher}
          onOpenReports={onOpenReports}
          Title={DialogTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
