import type { ElementType, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useVendorAddress } from "../hooks/useRepairDetails";
import { reportsButtonLabel } from "../utils/repairDetails";
import { reportedCell } from "../utils/repairFormat";
import type { RepairListRow } from "../utils/repairRows";
import { canReadRepairFiles, repairCreatedLine, repairWindowTitle } from "../utils/repairWindow";
import { BleacherChip, DeletedBadge, StatusPill } from "./RepairChips";
import { RepairFiles } from "./RepairFiles";
import { RepairWindowServices } from "./RepairServices";

/**
 * The repair window: the fields of one repair, its services with a Total row and its files.
 * Read-only: no footer, no Edit, no Delete (spec 07 D84 rule). docs/specs/repairs-07-repair-window.md
 * §2.2 to §2.5; the looks are the canvas's (`InvoiceModal`).
 */

const EYEBROW =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";

function Dash() {
  return <span className="text-[#9ca3af]">—</span>;
}

const orDash = (value: string | null | undefined) => (value?.trim() ? value : <Dash />);

/** A stored day as the table writes it (D44), a grey dash when there is none. */
const dayOrDash = (day: string | null) => (day ? day : <Dash />);

/** A label over its value; `name` is the `data-field` the tests and e2e look for. */
function Field({
  name,
  label,
  className = "",
  valueClassName = "",
  children,
}: {
  name: string;
  label: string;
  className?: string;
  valueClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className={EYEBROW}>{label}</dt>
      <dd data-field={name} className={`mt-1 ${valueClassName}`}>
        {children}
      </dd>
    </div>
  );
}

export type RepairWindowContentProps = {
  repair: RepairListRow;
  /** The app time zone, for the Created day. */
  timezone: string;
  /** The vendor's address as one line, or null (D100). */
  vendorAddress: string | null;
  onOpenService: (serviceId: string) => void;
  /** The Reported field's button: opens the damage reports of the repair. */
  onOpenReports: () => void;
  /** The Files section, or null for a role that may not read files (D102). */
  files: ReactNode;
  /** The element the title is drawn with: `h2`, or the dialog's own title. */
  Title?: ElementType;
};

/** The whole content of the window, a plain component so that a test can render it. */
export function RepairWindowContent({
  repair,
  timezone,
  vendorAddress,
  onOpenService,
  onOpenReports,
  files,
  Title = "h2",
}: RepairWindowContentProps) {
  const created = repairCreatedLine(repair, timezone);
  const reported = reportedCell(repair.reported);
  const buttonLabel = reportsButtonLabel(repair.reported.length);

  return (
    <>
      <div className="px-6 pt-5 pr-12 pb-4">
        <div className={EYEBROW}>Repair</div>
        <div data-testid="repair-window-title" className="mt-0.5 flex flex-wrap items-center gap-2">
          <Title className="text-xl leading-7 font-semibold text-[#10365a]">
            {repairWindowTitle(repair)}
          </Title>
          {repair.deleted && <DeletedBadge />}
        </div>
        {created && (
          <div
            data-testid="repair-window-created"
            className="mt-0.5 text-[13px] leading-5 text-[#6b7280]"
          >
            {created}
          </div>
        )}
      </div>

      <div className="border-t border-[#e5e7eb] px-6 pt-1 pb-6">
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-[18px] text-sm leading-5 sm:grid-cols-4">
          <Field name="vendor" label="Vendor" className="col-span-2" valueClassName="font-medium">
            {orDash(repair.vendorName)}
            {vendorAddress && (
              <div
                data-field="address"
                className="text-[13px] leading-[18px] font-normal text-[#6b7280]"
              >
                {vendorAddress}
              </div>
            )}
          </Field>
          <Field name="invoice" label="Invoice #" valueClassName="tabular-nums">
            {orDash(repair.invoiceNumber)}
          </Field>
          <Field name="status" label="Status">
            <StatusPill status={repair.status} />
          </Field>

          <Field name="currency" label="Currency">
            {repair.currency}
          </Field>
          <Field name="zone" label="Zone">
            {repair.zones.length > 0 ? (
              repair.zones.map((zone) => <div key={zone.uuid}>{zone.name ?? "—"}</div>)
            ) : (
              <Dash />
            )}
          </Field>
          <Field name="from" label="Repair from" valueClassName="tabular-nums">
            {dayOrDash(repair.eventStart)}
          </Field>
          <Field name="to" label="Repair to" valueClassName="tabular-nums">
            {dayOrDash(repair.eventEnd)}
          </Field>

          <Field name="completed" label="Completed" valueClassName="tabular-nums">
            {dayOrDash(repair.completedOn)}
          </Field>
          <Field
            name="reported"
            label="Reported"
            valueClassName="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            {reported ? (
              <>
                <span className="tabular-nums">{reported.day}</span>
                {reported.more && <span className="text-xs text-[#6b7280]">{reported.more}</span>}
                {buttonLabel && (
                  <button
                    type="button"
                    data-testid="repair-window-reports"
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
          </Field>
          <Field
            name="bleachers"
            label="Bleachers"
            className="col-span-2"
            valueClassName="flex flex-wrap gap-1"
          >
            {repair.bleachers.length > 0 ? (
              repair.bleachers.map((b) => <BleacherChip key={b.uuid} number={b.number} />)
            ) : (
              <Dash />
            )}
          </Field>

          <Field
            name="notes"
            label="Notes"
            className="col-span-2 sm:col-span-4"
            valueClassName="whitespace-pre-wrap text-[#374151]"
          >
            {orDash(repair.notes)}
          </Field>
        </dl>

        <h3 className="mt-7 text-base leading-6 font-semibold text-[#10365a]">Services</h3>
        <div className="mt-2.5">
          <RepairWindowServices repair={repair} onOpenService={onOpenService} />
        </div>

        {files}
      </div>
    </>
  );
}

export type RepairWindowProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
  onOpenReports: () => void;
  onClose: () => void;
};

/** The dialog around the content; it also reads the vendor's address and, for three roles, the files. */
export function RepairWindow({ repair, onOpenService, onOpenReports, onClose }: RepairWindowProps) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const { address } = useVendorAddress(repair.vendorUuid);
  const { isAdmin, isAccountManager, isMaintainer } = useTeamPermissions();
  const canReadFiles = canReadRepairFiles({ isAdmin, isAccountManager, isMaintainer });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="repair-window"
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-xl p-0 sm:max-w-[1080px]"
      >
        <DialogDescription className="sr-only">
          A repair with its services and files. Read-only.
        </DialogDescription>
        <RepairWindowContent
          repair={repair}
          timezone={timezone}
          vendorAddress={address}
          onOpenService={onOpenService}
          onOpenReports={onOpenReports}
          files={canReadFiles ? <RepairFiles repairId={repair.id} /> : null}
          Title={DialogTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
