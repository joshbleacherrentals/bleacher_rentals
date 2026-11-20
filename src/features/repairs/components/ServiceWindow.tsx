"use client";

import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RawServiceBleacherRow } from "../db/serviceWindowQueries";
import { useServiceBleacher } from "../hooks/useRepairDetails";
import { reportsButtonLabel, serviceWindowTitle } from "../utils/repairDetails";
import type { FilterOption } from "../utils/repairFilters";
import { formatRepairMoney, reportedCell } from "../utils/repairFormat";
import type { RepairListRow, RepairService } from "../utils/repairRows";
import {
  bleacherSelectOptions,
  categorySelectOptions,
  clearedServiceFormErrors,
  emptyServiceForm,
  isServiceFormDirty,
  serviceFormFromRow,
  type ServiceFormErrors,
  type ServiceFormField,
  type ServiceFormValues,
} from "../utils/serviceForm";
import { BleacherChip, CategoryChip, DeletedBadge, SeverityPill, StatusPill } from "./RepairChips";
import { ServiceFormFields, firstServiceErrorFieldId, focusServiceField } from "./ServiceForm";

/**
 * The service window: the fields and amounts of one service, the repair it belongs to, the damage
 * reports found for it and the bleacher's card. For an administrator and a maintainer (the page gives
 * `editing`) it has a footer with Edit and Delete and an Edit mode that turns the fields into inputs
 * in place, and a sibling window for Add service; for every other role it is read-only with only the
 * cross of the dialog to close it. Its repair strip has an Open repair button when the page gives the
 * handler (spec 07 D98). docs/specs/repairs-06-expanded-row.md §2.3,
 * docs/specs/repairs-07-repair-window.md §2.6 and docs/specs/repairs-09b1-services.md §2.1 to §2.3;
 * the looks are the canvas's (`ServiceModal`, `ServiceModalEdit`, `ServiceModalNew`).
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

/** The eyebrow and the title of the window, with the grey Deleted mark of D89. */
function ServiceHeader({
  eyebrow,
  title,
  deleted,
  Title,
}: {
  eyebrow: string;
  title: string;
  deleted: boolean;
  Title: ElementType;
}) {
  return (
    <div className="px-6 pt-5 pb-4 pr-12">
      <div className={EYEBROW}>{eyebrow}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <Title className="text-xl leading-7 font-semibold text-[#10365a]">{title}</Title>
        {deleted && <DeletedBadge />}
      </div>
    </div>
  );
}

/** The band under the title: the repair's vendor, invoice number, status and currency. */
function ServiceRepairStrip({
  repair,
  onOpenRepair,
}: {
  repair: RepairListRow;
  onOpenRepair?: () => void;
}) {
  const orDash = (value: string | null | undefined) => (value?.trim() ? value : <Dash />);
  return (
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
      {onOpenRepair && (
        <button
          type="button"
          data-testid="service-window-open-repair"
          onClick={onOpenRepair}
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#d1d5db] bg-white px-3 text-[13px] font-semibold text-[#10365a] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
        >
          Open repair
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** The card of the service's bleacher: its number, model number, type and zone. */
function ServiceBleacherCard({
  bleacherNumber,
  bleacher,
}: {
  bleacherNumber: number | null;
  bleacher: RawServiceBleacherRow | null;
}) {
  const orDash = (value: string | null | undefined) => (value?.trim() ? value : <Dash />);
  return (
    <div
      data-testid="service-window-bleacher"
      className="mx-6 mt-4 mb-6 rounded-lg border border-[#e5e7eb] px-4 py-3.5"
    >
      <div className={EYEBROW}>Bleacher</div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm leading-5 sm:grid-cols-4">
        <CardCell name="number" label="Number">
          {`#${bleacherNumber ?? "?"}`}
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
  );
}

export type ServiceWindowContentProps = {
  repair: RepairListRow;
  service: RepairService;
  /** The card of the service's bleacher; null while it loads or when it is not on the device. */
  bleacher: RawServiceBleacherRow | null;
  onOpenReports: () => void;
  /** Opens the repair window over this one; the button is drawn only when it is given (D98). */
  onOpenRepair?: () => void;
  /** The element the title is drawn with: `h2`, or the dialog's own title. */
  Title?: ElementType;
  /** The small label over the title: "Service" by default, "Edit service" in Edit mode (09b1). */
  eyebrow?: string;
  /** Replaces the fields and the amounts in Edit mode (09b1); the strip and the card stay. */
  form?: ReactNode;
};

/** The whole content of the window, a plain component so that a test can render it. */
export function ServiceWindowContent({
  repair,
  service,
  bleacher,
  onOpenReports,
  onOpenRepair,
  Title = "h2",
  eyebrow = "Service",
  form,
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
      <ServiceHeader
        eyebrow={eyebrow}
        title={serviceWindowTitle(service)}
        deleted={service.deleted}
        Title={Title}
      />

      <ServiceRepairStrip repair={repair} onOpenRepair={onOpenRepair} />

      {form ?? (
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
      )}

      <ServiceBleacherCard bleacherNumber={service.bleacherNumber} bleacher={bleacher} />
    </>
  );
}

const BUTTON =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_PRIMARY = `${BUTTON} bg-darkBlue text-white shadow-sm hover:bg-lightBlue`;
const BUTTON_PLAIN = `${BUTTON} border border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f3f4f6]`;
const BUTTON_DANGER = `${BUTTON} border border-[#a8403a] bg-white text-[#a8403a] hover:bg-[#a8403a] hover:text-white`;

export type ServiceWindowFooterProps = {
  mode: "view" | "edit" | "new";
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * The footer of the window (spec 09b1 §2.1): Delete at the left and Edit at the right in the view
 * mode, Cancel and Save in Edit, Cancel and Add service in Add. A plain component, so that a test can
 * render it.
 */
export function ServiceWindowFooter({
  mode,
  saving,
  onEdit,
  onDelete,
  onCancel,
  onSave,
}: ServiceWindowFooterProps) {
  return (
    <div
      data-testid="service-window-footer"
      className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[#e5e7eb] bg-white px-6 py-4"
    >
      <div>
        {mode === "view" && (
          <button
            type="button"
            data-testid="service-delete"
            onClick={onDelete}
            className={BUTTON_DANGER}
          >
            Delete
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {mode === "view" ? (
          <button
            type="button"
            data-testid="service-edit"
            onClick={onEdit}
            className={BUTTON_PRIMARY}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="service-cancel"
              disabled={saving}
              onClick={onCancel}
              className={BUTTON_PLAIN}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="service-save"
              disabled={saving}
              onClick={onSave}
              className={BUTTON_PRIMARY}
            >
              {saving ? "Saving..." : mode === "new" ? "Add service" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Whether the window has the footer: only with the handlers, for a service that is not deleted of a
 * repair that is not deleted (spec 09b1 D157, D165).
 */
export function serviceIsEditable(params: {
  editing: boolean;
  serviceDeleted: boolean;
  repairDeleted: boolean;
}): boolean {
  return params.editing && !params.serviceDeleted && !params.repairDeleted;
}

/** What the page (or the repair window, for a draft) gives the window of a role that may write. */
export type ServiceEditing = {
  /** The lists of the selects (D153). */
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  /** Save of an Edit: null when written, the errors when nothing was written. */
  onSave: (
    initial: ServiceFormValues,
    values: ServiceFormValues,
  ) => Promise<ServiceFormErrors | null>;
  onDelete: () => Promise<void>;
};

/**
 * The draft of the Edit and Add modes (D155): the values, the errors under the fields, whether a write
 * runs, and Save. A change clears the error of its own field. A failed write leaves the window as it
 * is: the writer showed its red toast.
 */
function useServiceDraft(params: {
  initial: ServiceFormValues;
  submit: (
    initial: ServiceFormValues,
    values: ServiceFormValues,
  ) => Promise<ServiceFormErrors | null>;
  onSaved: () => void;
}) {
  const { initial, submit, onSaved } = params;
  const [values, setValues] = useState<ServiceFormValues>(initial);
  const [errors, setErrors] = useState<ServiceFormErrors>({});
  const [saving, setSaving] = useState(false);

  const change = <K extends ServiceFormField>(field: K, value: ServiceFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearedServiceFormErrors(current, field));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const refused = await submit(initial, values);
      if (refused) {
        setErrors(refused);
        const id = firstServiceErrorFieldId(refused);
        if (id) setTimeout(() => focusServiceField(id), 0);
      } else {
        onSaved();
      }
    } catch {
      // The writer showed its red toast; the window stays as it is (D155).
    } finally {
      setSaving(false);
    }
  };

  return { values, errors, saving, dirty: isServiceFormDirty(initial, values), change, save };
}

/** "Discard changes?" (D155): asked by the cross, Esc and a click outside, when a field changed. */
function DiscardServiceChangesDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <AlertDialogContent data-testid="service-discard-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The changes you made to this service have not been saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-sm">Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
            onClick={onDiscard}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The existing delete dialog with the words of D156: Delete of a service is final in the app. */
function DeleteServiceDialog({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent data-testid="service-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the service from the repair. It cannot be undone in the app.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-sm">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
            onClick={onContinue}
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const SERVICE_WINDOW_CLASS = "max-h-[90vh] gap-0 overflow-y-auto rounded-xl p-0 sm:max-w-[760px]";

/** The Edit mode of a stored service: the content with the inputs, and Cancel and Save. */
function ServiceEditBody({
  repair,
  service,
  initial,
  editing,
  onOpenReports,
  onOpenRepair,
  onLeave,
  onDirtyChange,
}: {
  repair: RepairListRow;
  service: RepairService;
  initial: ServiceFormValues;
  editing: ServiceEditing;
  onOpenReports: () => void;
  onOpenRepair?: () => void;
  onLeave: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const draft = useServiceDraft({ initial, submit: editing.onSave, onSaved: onLeave });
  const { dirty } = draft;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // The card follows the bleacher the form has chosen, not only the stored one.
  const { bleacher } = useServiceBleacher(draft.values.bleacherUuid ?? service.bleacherUuid);
  const bleacherOptions = useMemo(
    () =>
      bleacherSelectOptions(editing.bleachers, {
        uuid: initial.bleacherUuid,
        number: service.bleacherNumber,
      }),
    [editing.bleachers, initial.bleacherUuid, service.bleacherNumber],
  );
  const categoryOptions = useMemo(
    () =>
      categorySelectOptions(editing.categories, {
        uuid: initial.categoryUuid,
        name: service.categoryName,
      }),
    [editing.categories, initial.categoryUuid, service.categoryName],
  );

  return (
    <>
      <ServiceWindowContent
        repair={repair}
        service={service}
        bleacher={bleacher}
        onOpenReports={onOpenReports}
        onOpenRepair={onOpenRepair}
        Title={DialogTitle}
        eyebrow="Edit service"
        form={
          <ServiceFormFields
            mode="edit"
            values={draft.values}
            errors={draft.errors}
            bleachers={bleacherOptions}
            categories={categoryOptions}
            currency={repair.currency}
            reportedDay={service.reported[0]?.day ?? null}
            disabled={draft.saving}
            onChange={draft.change}
          />
        }
      />
      <ServiceWindowFooter
        mode="edit"
        saving={draft.saving}
        onEdit={() => {}}
        onDelete={() => {}}
        onCancel={onLeave}
        onSave={draft.save}
      />
    </>
  );
}

export type ServiceWindowProps = {
  repair: RepairListRow;
  service: RepairService;
  onOpenReports: () => void;
  /** Opens the repair window over this one; the button is drawn only when it is given (D98). */
  onOpenRepair?: () => void;
  onClose: () => void;
  /**
   * Given only to a role that may write, for a service that is not deleted of a repair that is not
   * deleted (spec 09b1 D165); absent, the window is read-only.
   */
  editing?: ServiceEditing;
};

/**
 * The dialog around the content; it also reads the bleacher's card. With `editing` it has the footer of
 * the view mode and the Edit mode (D155, D156).
 */
export function ServiceWindow({
  repair,
  service,
  onOpenReports,
  onOpenRepair,
  onClose,
  editing,
}: ServiceWindowProps) {
  const { bleacher } = useServiceBleacher(service.bleacherUuid);
  const writable = serviceIsEditable({
    editing: !!editing,
    serviceDeleted: service.deleted,
    repairDeleted: repair.deleted,
  });

  // The values the draft opened with; null in view mode. The inputs are drawn only while it is set.
  const [session, setSession] = useState<ServiceFormValues | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirtyRef = useRef(false);
  const onDirtyChange = useMemo(
    () => (dirty: boolean) => {
      dirtyRef.current = dirty;
    },
    [],
  );

  const leaveEdit = () => {
    dirtyRef.current = false;
    setConfirmDiscard(false);
    setSession(null);
  };
  // The cross, Esc and a click outside (D155): ask when a field changed, otherwise leave at once.
  const requestClose = () => {
    if (!session) onClose();
    else if (dirtyRef.current) setConfirmDiscard(true);
    else leaveEdit();
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent data-testid="service-window" className={SERVICE_WINDOW_CLASS}>
          <DialogDescription className="sr-only">
            {writable ? "A service of a repair." : "A service of a repair. Read-only."}
          </DialogDescription>
          {session && editing && writable ? (
            <ServiceEditBody
              repair={repair}
              service={service}
              initial={session}
              editing={editing}
              onOpenReports={onOpenReports}
              onOpenRepair={onOpenRepair}
              onLeave={leaveEdit}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <>
              <ServiceWindowContent
                repair={repair}
                service={service}
                bleacher={bleacher}
                onOpenReports={onOpenReports}
                onOpenRepair={onOpenRepair}
                Title={DialogTitle}
              />
              {editing && writable && (
                <ServiceWindowFooter
                  mode="view"
                  saving={false}
                  onEdit={() => setSession(serviceFormFromRow(service))}
                  onDelete={() => setConfirmDelete(true)}
                  onCancel={() => {}}
                  onSave={() => {}}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <DiscardServiceChangesDialog
        open={confirmDiscard}
        onKeep={() => setConfirmDiscard(false)}
        onDiscard={leaveEdit}
      />
      <DeleteServiceDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onContinue={() => {
          setConfirmDelete(false);
          void editing?.onDelete().catch(() => {});
        }}
      />
    </>
  );
}

export type NewServiceWindowProps = {
  repair: RepairListRow; // shown in the strip (in a draft, the repair as the window shows it)
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  onCreate: (values: ServiceFormValues) => Promise<ServiceFormErrors | null>;
  onClose: () => void;
};

/** The window of Add service: the fields only, Cancel and "Add service" (D155). */
export function NewServiceWindow({
  repair,
  bleachers,
  categories,
  onCreate,
  onClose,
}: NewServiceWindowProps) {
  const [initial] = useState(emptyServiceForm);
  const draft = useServiceDraft({
    initial,
    submit: (_initial, values) => onCreate(values),
    onSaved: onClose,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const bleacherOptions = useMemo(
    () => bleacherSelectOptions(bleachers, { uuid: null, number: null }),
    [bleachers],
  );
  const categoryOptions = useMemo(
    () => categorySelectOptions(categories, { uuid: null, name: null }),
    [categories],
  );
  const requestClose = () => (draft.dirty ? setConfirmDiscard(true) : onClose());

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent data-testid="new-service-window" className={SERVICE_WINDOW_CLASS}>
          <DialogDescription className="sr-only">Add a service to a repair.</DialogDescription>
          <ServiceHeader
            eyebrow="New service"
            title="Add service"
            deleted={false}
            Title={DialogTitle}
          />
          <ServiceRepairStrip repair={repair} />
          <ServiceFormFields
            mode="new"
            values={draft.values}
            errors={draft.errors}
            bleachers={bleacherOptions}
            categories={categoryOptions}
            currency={repair.currency}
            reportedDay={null}
            disabled={draft.saving}
            onChange={draft.change}
          />
          <ServiceWindowFooter
            mode="new"
            saving={draft.saving}
            onEdit={() => {}}
            onDelete={() => {}}
            onCancel={onClose}
            onSave={draft.save}
          />
        </DialogContent>
      </Dialog>
      <DiscardServiceChangesDialog
        open={confirmDiscard}
        onKeep={() => setConfirmDiscard(false)}
        onDiscard={onClose}
      />
    </>
  );
}
