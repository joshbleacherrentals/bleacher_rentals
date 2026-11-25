"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ElementType,
  type ReactNode,
  type SetStateAction,
} from "react";
import { AlertTriangle } from "lucide-react";
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
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { readVendorCountry } from "../db/repairWrite";
import { useVendorAddress } from "../hooks/useRepairDetails";
import { repairLabel, reportsButtonLabel } from "../utils/repairDetails";
import {
  clearedRepairFormErrors,
  isRepairFormDirty,
  nextCurrencyForVendor,
  repairFormFromRow,
  vendorSelectOptions,
  type RepairFormErrors,
  type RepairFormField,
  type RepairFormValues,
} from "../utils/repairForm";
import type { FilterOption } from "../utils/repairFilters";
import { reportedCell } from "../utils/repairFormat";
import { liveBleachersOfDraft, type ServiceZoneCheck } from "../utils/repairLinks";
import { REPAIR_LAYER_CLASS } from "../utils/repairLayer";
import {
  presetRepairForm,
  requiredServiceError,
  type NewRepairPreset,
} from "../utils/newRepairPreset";
import type { RepairListRow, RepairStatus, ReportedReport } from "../utils/repairRows";
import { canChangeRepairStatus } from "../utils/repairStatus";
import {
  addDraftService,
  isServicesDraftChanged,
  newRepairDisplayRow,
  removeDraftService,
  repairWithServicesDraft,
  serviceLookups,
  servicesDraftFromRepair,
  updateDraftService,
  validateServiceForm,
  type ServiceFormErrors,
  type ServiceFormValues,
  type ServicesDraft,
} from "../utils/serviceForm";
import { canReadRepairFiles, repairCreatedLine, repairWindowTitle } from "../utils/repairWindow";
import { EMPTY_FILES_DRAFT, isFilesDraftChanged, type FilesDraft } from "../utils/repairFiles";
import { BleacherChip, DeletedBadge, StatusPill } from "./RepairChips";
import { RepairFiles, RepairFilesEdit, RepairFilesNew } from "./RepairFiles";
import { RepairFormFields, firstErrorFieldId } from "./RepairForm";
import { RepairWindowServices } from "./RepairServices";
import { RepairStatusMenu } from "./RepairStatusMenu";
import { NewServiceWindow, ServiceWindow } from "./ServiceWindow";

/**
 * The repair window: the fields of one repair, its services with a Total row and its files. Read-only
 * for every role but an administrator and a maintainer; for those two (the page gives `editing`) it
 * has a footer with Edit and Delete, or Restore on a deleted repair, an Edit mode that turns the
 * fields into inputs in place, and a sibling window for New repair. Its services have Add service, and
 * in Edit and in New repair they are a draft that Save writes with the repair (spec 09b1).
 * docs/specs/repairs-07-repair-window.md §2.2 to §2.5, docs/specs/repairs-09a-repair-writes.md §2.1 to
 * §2.4 and docs/specs/repairs-09b1-services.md §2.6; the looks are the canvas's (`InvoiceModal`,
 * `InvoiceModalEdit`, `InvoiceModalNew`).
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

export type RepairServicesSectionProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
  /** Add service under the table; the button is drawn only when it is given (spec 09b1 D158). */
  onAddService?: () => void;
  /** The red line above the table: a zone conflict found at Save (spec 09b2 D186). */
  error?: string;
};

/** The Services heading and the table of services of a window (also the New repair window's draft). */
export function RepairServicesSection({
  repair,
  onOpenService,
  onAddService,
  error,
}: RepairServicesSectionProps) {
  return (
    <>
      <h3 className="mt-7 text-base leading-6 font-semibold text-[#10365a]">Services</h3>
      {error ? (
        <p
          id="repair-services-error"
          data-testid="repair-services-error"
          role="alert"
          tabIndex={-1}
          className="mt-2 text-sm leading-5 text-[#a8403a] outline-none"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-2.5">
        <RepairWindowServices
          repair={repair}
          onOpenService={onOpenService}
          onAddService={onAddService}
        />
      </div>
    </>
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
  /**
   * A status chosen in the menu of the Status field (spec 08 D110, D111). Given only to a role that
   * may change the status; without it, and for a deleted repair (D118), the field is the plain pill.
   */
  onChangeStatus?: (to: RepairStatus) => void;
  /** The small label over the title: "Repair" by default, "Edit repair" in Edit mode (spec 09a). */
  eyebrow?: string;
  /** Replaces the fields grid in Edit mode (spec 09a); the services and the files stay. */
  fields?: ReactNode;
  /** Add service under the table of services; absent, no button (spec 09b1 D158). */
  onAddService?: () => void;
  /** The red line above the table of services (spec 09b2 D186). */
  servicesError?: string;
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
  onChangeStatus,
  eyebrow = "Repair",
  fields,
  onAddService,
  servicesError,
}: RepairWindowContentProps) {
  const created = repairCreatedLine(repair, timezone);
  const reported = reportedCell(repair.reported);
  const buttonLabel = reportsButtonLabel(repair.reported.length);

  return (
    <>
      <div className="px-6 pt-5 pr-12 pb-4">
        <div className={EYEBROW}>{eyebrow}</div>
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
        {fields ? (
          <div className="mt-5">{fields}</div>
        ) : (
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
              {onChangeStatus &&
              canChangeRepairStatus({ allowed: true, deleted: repair.deleted }) ? (
                <RepairStatusMenu
                  status={repair.status}
                  repairLabel={repairLabel(repair)}
                  onChange={onChangeStatus}
                />
              ) : (
                <StatusPill status={repair.status} />
              )}
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
        )}

        <RepairServicesSection
          repair={repair}
          onOpenService={onOpenService}
          onAddService={onAddService}
          error={servicesError}
        />

        {files}
      </div>
    </>
  );
}

const BUTTON =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_PRIMARY = `${BUTTON} bg-darkBlue text-white shadow-sm hover:bg-lightBlue`;
const BUTTON_PLAIN = `${BUTTON} border border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f3f4f6]`;
const BUTTON_DANGER = `${BUTTON} border border-[#a8403a] bg-white text-[#a8403a] hover:bg-[#a8403a] hover:text-white`;

export type RepairWindowFooterProps = {
  mode: "view" | "edit" | "new";
  deleted: boolean;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * The footer of the window (spec 09a §2.1): Delete at the left and Edit at the right of a live repair
 * in view mode, Restore alone on a deleted one, Cancel and Save in Edit mode, Cancel and Add repair
 * in New repair. A plain component, so that a test can render it.
 */
export function RepairWindowFooter({
  mode,
  deleted,
  saving,
  onEdit,
  onDelete,
  onRestore,
  onCancel,
  onSave,
}: RepairWindowFooterProps) {
  return (
    <div
      data-testid="repair-window-footer"
      className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[#e5e7eb] bg-white px-6 py-4"
    >
      <div>
        {mode === "view" && !deleted && (
          <button
            type="button"
            data-testid="repair-delete"
            onClick={onDelete}
            className={BUTTON_DANGER}
          >
            Delete
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {mode === "view" && !deleted && (
          <button
            type="button"
            data-testid="repair-edit"
            onClick={onEdit}
            className={BUTTON_PRIMARY}
          >
            Edit
          </button>
        )}
        {mode === "view" && deleted && (
          <button
            type="button"
            data-testid="repair-restore"
            onClick={onRestore}
            className={BUTTON_PRIMARY}
          >
            Restore
          </button>
        )}
        {mode !== "view" && (
          <>
            <button
              type="button"
              data-testid="repair-cancel"
              disabled={saving}
              onClick={onCancel}
              className={BUTTON_PLAIN}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="repair-save"
              disabled={saving}
              onClick={onSave}
              className={BUTTON_PRIMARY}
            >
              {saving ? "Saving..." : mode === "new" ? "Add repair" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** What the page gives the window of a role that may write (spec 09a D124, spec 09b1 D158, D161). */
export type RepairEditing = {
  /** Every vendor, for the Vendor select (D131). */
  vendors: readonly FilterOption[];
  /** The lists of the service selects (09b1 D153). */
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  /**
   * Save of an Edit: the fields, the services draft (09b1 D161) and the files draft (09b3 D191). Null
   * when written, the errors when nothing was written (D138).
   */
  onSave: (
    initial: RepairFormValues,
    values: RepairFormValues,
    services: ServicesDraft,
    files: FilesDraft,
  ) => Promise<RepairFormErrors | null>;
  onDelete: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** Add service in the view mode: the page opens the New service window (09b1 D158). */
  onAddService: () => void;
  /** The damage reports of a stored service of an Edit draft, opened through the page. */
  onOpenServiceReports: (reported: ReportedReport[]) => void;
  /** Called before a service goes into the draft: the refusal text of a zone conflict, or null (09b2 D176). */
  checkServiceZone: ServiceZoneCheck;
};

/**
 * The service window a draft has open (spec 09b1 D162): one service of the draft, or Add service. Add
 * service may start with a bleacher chosen (spec 11 D229).
 */
export type DraftServiceWindowState =
  | { kind: "view"; id: string }
  | { kind: "new"; bleacherUuid?: string }
  | null;

/**
 * What the New repair window starts with (spec 11 §2.6): the form, with the days of the preset, and
 * the service window, open at once with the bleacher of the preset chosen. Pure, so it is tested
 * without the dialog.
 */
export function newRepairStart(preset: NewRepairPreset | undefined): {
  initial: RepairFormValues;
  serviceWindow: DraftServiceWindowState;
} {
  return {
    initial: presetRepairForm(preset),
    serviceWindow: preset?.bleacherUuid ? { kind: "new", bleacherUuid: preset.bleacherUuid } : null,
  };
}

/**
 * The service windows of a draft, drawn by the repair window itself over it: the stack of the page
 * finds services in the stored list, and a draft is not there (09b1 §0). A change goes into the draft
 * and nothing is written; a service that has left the draft closes its window.
 */
function DraftServiceWindows({
  state,
  repair,
  bleachers,
  categories,
  services,
  eventStart,
  checkServiceZone,
  setServices,
  onOpenReports,
  onClose,
}: {
  state: DraftServiceWindowState;
  repair: RepairListRow;
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  /** The draft, for the context of the zone check (09b2 D176). */
  services: ServicesDraft;
  /** `Repair from` as the window has it; null while it is empty. */
  eventStart: string | null;
  checkServiceZone: ServiceZoneCheck;
  setServices: Dispatch<SetStateAction<ServicesDraft>>;
  onOpenReports: (reported: ReportedReport[]) => void;
  onClose: () => void;
}) {
  if (!state) return null;

  if (state.kind === "new") {
    return (
      <NewServiceWindow
        repair={repair}
        bleachers={bleachers}
        categories={categories}
        initialBleacherUuid={state.bleacherUuid}
        onCreate={async (values) => {
          const errors = validateServiceForm(values);
          if (Object.keys(errors).length > 0) return errors;
          const refusal = await checkServiceZone({
            bleacherUuid: values.bleacherUuid as string,
            eventStart,
            otherLiveBleacherUuids: liveBleachersOfDraft(services),
          });
          if (refusal) return { bleacherUuid: refusal };
          setServices((draft) => addDraftService(draft, crypto.randomUUID(), values));
          return null;
        }}
        onClose={onClose}
      />
    );
  }

  const service = repair.services.find((row) => row.id === state.id);
  if (!service) return null;
  return (
    <ServiceWindow
      repair={repair}
      service={service}
      onOpenReports={() => onOpenReports(service.reported)}
      onClose={onClose}
      editing={{
        bleachers,
        categories,
        onSave: async (initial: ServiceFormValues, values: ServiceFormValues) => {
          const errors: ServiceFormErrors = validateServiceForm(values);
          if (Object.keys(errors).length > 0) return errors;
          if (values.bleacherUuid !== initial.bleacherUuid) {
            const refusal = await checkServiceZone({
              bleacherUuid: values.bleacherUuid as string,
              eventStart,
              otherLiveBleacherUuids: liveBleachersOfDraft(services, service.id),
            });
            if (refusal) return { bleacherUuid: refusal };
          }
          setServices((draft) => updateDraftService(draft, service.id, values));
          return null;
        },
        onDelete: async () => {
          setServices((draft) => removeDraftService(draft, service.id));
        },
      }}
    />
  );
}

/**
 * The draft of the Edit and New repair modes (D128 to D139): the values, the errors under the fields,
 * whether a write runs, and Save. A change clears the errors of its own field; choosing a vendor in
 * New repair reads the vendor's country once and sets the currency while the person has not picked
 * one (D133). The draft of services (09b1 D161) is part of it: it makes the window dirty and Save
 * hands it to the writer with the fields. A failed write leaves the window as it is: the writer
 * showed its red toast (D139).
 */
function useRepairDraft(params: {
  mode: "edit" | "new";
  initial: RepairFormValues;
  initialServices: ServicesDraft;
  submit: (
    initial: RepairFormValues,
    values: RepairFormValues,
    services: ServicesDraft,
    files: FilesDraft,
  ) => Promise<RepairFormErrors | null>;
  onSaved: () => void;
}) {
  const { mode, initial, initialServices, submit, onSaved } = params;
  const [values, setValues] = useState<RepairFormValues>(initial);
  const [services, setServicesState] = useState<ServicesDraft>(initialServices);
  // The files of the draft (09b3 D191): picked files and stored files marked removed.
  const [files, setFiles] = useState<FilesDraft>(EMPTY_FILES_DRAFT);
  const [errors, setErrors] = useState<RepairFormErrors>({});
  // A change of the services drops the red line above them (09b2 D186).
  const setServices: Dispatch<SetStateAction<ServicesDraft>> = (action) => {
    setServicesState(action);
    setErrors((current) => {
      if (current.services === undefined) return current;
      const { services: _cleared, ...rest } = current;
      return rest;
    });
  };
  const [saving, setSaving] = useState(false);
  const currencyTouched = useRef(false);

  const change = <K extends RepairFormField>(field: K, value: RepairFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearedRepairFormErrors(current, field));
    if (field === "currency") currencyTouched.current = true;
    if (field === "vendorUuid" && mode === "new" && value) {
      const vendorUuid = value as string;
      readVendorCountry(vendorUuid)
        .then((country) =>
          setValues((current) =>
            current.vendorUuid !== vendorUuid
              ? current
              : {
                  ...current,
                  currency: nextCurrencyForVendor({
                    current: current.currency,
                    touched: currencyTouched.current,
                    country,
                  }),
                },
          ),
        )
        .catch(() => {});
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const refused = await submit(initial, values, services, files);
      if (refused) {
        setErrors(refused);
        const id = firstErrorFieldId(refused);
        if (id) setTimeout(() => document.getElementById(id)?.focus(), 0);
      } else {
        onSaved();
      }
    } catch {
      // The writer showed its red toast; the window stays in Edit with the draft (D139).
    } finally {
      setSaving(false);
    }
  };

  return {
    values,
    services,
    setServices,
    files,
    setFiles,
    errors,
    saving,
    dirty:
      isRepairFormDirty(initial, values) ||
      isServicesDraftChanged(services) ||
      isFilesDraftChanged(files),
    change,
    save,
  };
}

/** "Discard changes?" (D129): asked by the cross, Esc and a click outside, when a field changed. */
function DiscardChangesDialog({
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
      <AlertDialogContent
        data-testid="repair-discard-dialog"
        className={REPAIR_LAYER_CLASS}
        overlayClassName={REPAIR_LAYER_CLASS}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The changes you made to this repair have not been saved.
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

/** The existing delete dialog with the words of D143: Delete is soft, and Restore brings it back. */
function DeleteRepairDialog({
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
      <AlertDialogContent
        data-testid="repair-delete-dialog"
        className={REPAIR_LAYER_CLASS}
        overlayClassName={REPAIR_LAYER_CLASS}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This moves the repair to Show Deleted. An administrator or a maintainer can restore it.
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

/**
 * The width of the repair window and of the New repair window. The table of services needs 1056 px
 * (`WINDOW_MIN_WIDTH`), and the window gives it 2 px of border, 48 px of padding and 2 px of the table's
 * own border less than its width: at 1080 px the table had 1030 px and scrolled sideways, so the
 * window is 1152 px. The window itself never scrolls sideways.
 */
export const REPAIR_WINDOW_WIDTH = 1152;
export const REPAIR_WINDOW_CLASS = `${REPAIR_LAYER_CLASS} max-h-[90vh] gap-0 overflow-x-hidden overflow-y-auto rounded-xl p-0 sm:max-w-[1152px]`;

/** The Edit mode of an existing repair: the content with the inputs, and Cancel and Save. */
function RepairEditBody({
  repair,
  initial,
  initialServices,
  editing,
  timezone,
  onOpenReports,
  onLeave,
  onDirtyChange,
}: {
  repair: RepairListRow;
  initial: RepairFormValues;
  initialServices: ServicesDraft;
  editing: RepairEditing;
  timezone: string;
  onOpenReports: () => void;
  onLeave: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const draft = useRepairDraft({
    mode: "edit",
    initial,
    initialServices,
    submit: editing.onSave,
    onSaved: onLeave,
  });
  const { dirty } = draft;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const vendorOptions = useMemo(
    () =>
      vendorSelectOptions(editing.vendors, { uuid: initial.vendorUuid, name: repair.vendorName }),
    [editing.vendors, initial.vendorUuid, repair.vendorName],
  );
  // The window shows the repair with the services of the draft, and the draft's currency (D163).
  const lookups = useMemo(
    () => serviceLookups(editing.bleachers, editing.categories),
    [editing.bleachers, editing.categories],
  );
  const shown = useMemo(
    () => ({
      ...repairWithServicesDraft(repair, draft.services, lookups),
      currency: draft.values.currency,
    }),
    [repair, draft.services, draft.values.currency, lookups],
  );
  const [serviceWindow, setServiceWindow] = useState<DraftServiceWindowState>(null);

  return (
    <>
      <RepairWindowContent
        repair={shown}
        timezone={timezone}
        vendorAddress={null}
        onOpenService={(id) => setServiceWindow({ kind: "view", id })}
        onOpenReports={onOpenReports}
        onAddService={() => setServiceWindow({ kind: "new" })}
        servicesError={draft.errors.services}
        files={
          <RepairFilesEdit
            repairId={repair.id}
            draft={draft.files}
            onChange={draft.setFiles}
            disabled={draft.saving}
          />
        }
        Title={DialogTitle}
        eyebrow="Edit repair"
        fields={
          <RepairFormFields
            mode="edit"
            values={draft.values}
            errors={draft.errors}
            vendors={vendorOptions}
            zones={repair.zones}
            completedOn={repair.completedOn}
            disabled={draft.saving}
            onChange={draft.change}
          />
        }
      />
      <RepairWindowFooter
        mode="edit"
        deleted={false}
        saving={draft.saving}
        onEdit={() => {}}
        onDelete={() => {}}
        onRestore={() => {}}
        onCancel={onLeave}
        onSave={draft.save}
      />
      <DraftServiceWindows
        state={serviceWindow}
        repair={shown}
        bleachers={editing.bleachers}
        categories={editing.categories}
        services={draft.services}
        eventStart={draft.values.eventStart || null}
        checkServiceZone={editing.checkServiceZone}
        setServices={draft.setServices}
        onOpenReports={editing.onOpenServiceReports}
        onClose={() => setServiceWindow(null)}
      />
    </>
  );
}

export type RepairWindowProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
  onOpenReports: () => void;
  onClose: () => void;
  /** Given only to a role that may change the status (spec 08 D110); see `RepairWindowContentProps`. */
  onChangeStatus?: (to: RepairStatus) => void;
  /** Given only to a role that may write (spec 09a D124); absent, the window is read-only. */
  editing?: RepairEditing;
};

/**
 * The dialog around the content; it also reads the vendor's address and, for three roles, the files.
 * With `editing` it has the footer of view mode and the Edit mode (D128, D129, D143, D145).
 */
export function RepairWindow({
  repair,
  onOpenService,
  onOpenReports,
  onClose,
  onChangeStatus,
  editing,
}: RepairWindowProps) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const { address } = useVendorAddress(repair.vendorUuid);
  const { isAdmin, isAccountManager, isMaintainer } = useTeamPermissions();
  const canReadFiles = canReadRepairFiles({ isAdmin, isAccountManager, isMaintainer });

  // What the draft opened with (the fields and the services); null in view mode. The inputs are drawn
  // only while it is set.
  const [session, setSession] = useState<{
    initial: RepairFormValues;
    services: ServicesDraft;
  } | null>(null);
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
  // The cross, Esc and a click outside (D129): ask when a field changed, otherwise leave at once.
  const requestClose = () => {
    if (!session) onClose();
    else if (dirtyRef.current) setConfirmDiscard(true);
    else leaveEdit();
  };

  const files = canReadFiles ? (
    <RepairFiles repairId={repair.id} canWrite={!!editing && !repair.deleted} />
  ) : null;

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          data-testid="repair-window"
          className={REPAIR_WINDOW_CLASS}
          overlayClassName={REPAIR_LAYER_CLASS}
        >
          <DialogDescription className="sr-only">
            A repair with its services and files.
          </DialogDescription>
          {session && editing ? (
            <RepairEditBody
              repair={repair}
              initial={session.initial}
              initialServices={session.services}
              editing={editing}
              timezone={timezone}
              onOpenReports={onOpenReports}
              onLeave={leaveEdit}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <>
              <RepairWindowContent
                repair={repair}
                timezone={timezone}
                vendorAddress={address}
                onOpenService={onOpenService}
                onOpenReports={onOpenReports}
                onAddService={editing && !repair.deleted ? editing.onAddService : undefined}
                files={files}
                Title={DialogTitle}
                onChangeStatus={onChangeStatus}
              />
              {editing && (
                <RepairWindowFooter
                  mode="view"
                  deleted={repair.deleted}
                  saving={false}
                  onEdit={() =>
                    setSession({
                      initial: repairFormFromRow(repair),
                      services: servicesDraftFromRepair(repair),
                    })
                  }
                  onDelete={() => setConfirmDelete(true)}
                  onRestore={() => void editing.onRestore().catch(() => {})}
                  onCancel={() => {}}
                  onSave={() => {}}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={confirmDiscard}
        onKeep={() => setConfirmDiscard(false)}
        onDiscard={leaveEdit}
      />
      <DeleteRepairDialog
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

export type NewRepairWindowProps = {
  vendors: readonly FilterOption[];
  /** The lists of the service selects (09b1 D153). */
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  onCreate: (
    values: RepairFormValues,
    services: ServicesDraft,
    files: FilesDraft,
  ) => Promise<RepairFormErrors | null>;
  /** Called before a service goes into the draft: the refusal text of a zone conflict, or null (09b2 D176). */
  checkServiceZone: ServiceZoneCheck;
  /** What the window starts with, when it is opened from the Dashboard or a damage report (spec 11). */
  preset?: NewRepairPreset;
  onClose: () => void;
};

/**
 * The window of New repair: the fields and the draft of services (spec 09b1 D149), Cancel and Add
 * repair (D128, D129), and the draft of files (spec 09b3 D149, D191).
 */
export function NewRepairWindow({
  vendors,
  bleachers,
  categories,
  onCreate,
  checkServiceZone,
  preset,
  onClose,
}: NewRepairWindowProps) {
  const [start] = useState(() => newRepairStart(preset));
  const draft = useRepairDraft({
    mode: "new",
    initial: start.initial,
    initialServices: [],
    // A window opened from a damage report refuses a save with no service (D222); a repair that is
    // added tells the preset, so the card of the report can close (D234).
    submit: async (_initial, values, services, files) => {
      const refusal = requiredServiceError(preset, services);
      if (refusal) return { services: refusal };
      const errors = await onCreate(values, services, files);
      if (!errors) preset?.onCreated?.();
      return errors;
    },
    onSaved: onClose,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [serviceWindow, setServiceWindow] = useState<DraftServiceWindowState>(start.serviceWindow);
  const vendorOptions = useMemo(
    () => vendorSelectOptions(vendors, { uuid: null, name: null }),
    [vendors],
  );
  const lookups = useMemo(() => serviceLookups(bleachers, categories), [bleachers, categories]);
  const vendorName =
    vendors.find((vendor) => vendor.value === draft.values.vendorUuid)?.label ?? null;
  const shown = useMemo(
    () => newRepairDisplayRow({ values: draft.values, vendorName, draft: draft.services, lookups }),
    [draft.values, vendorName, draft.services, lookups],
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
        <DialogContent
          data-testid="new-repair-window"
          className={REPAIR_WINDOW_CLASS}
          overlayClassName={REPAIR_LAYER_CLASS}
        >
          <DialogDescription className="sr-only">Add a new repair.</DialogDescription>
          <div className="px-6 pt-5 pr-12 pb-4">
            <div className={EYEBROW}>New repair</div>
            <DialogTitle className="mt-0.5 text-xl leading-7 font-semibold text-[#10365a]">
              New repair
            </DialogTitle>
          </div>
          <div className="border-t border-[#e5e7eb] px-6 pt-1 pb-6">
            <div className="mt-5">
              <RepairFormFields
                mode="new"
                values={draft.values}
                errors={draft.errors}
                vendors={vendorOptions}
                zones={[]}
                completedOn={null}
                disabled={draft.saving}
                onChange={draft.change}
              />
            </div>
            <RepairServicesSection
              repair={shown}
              onOpenService={(id) => setServiceWindow({ kind: "view", id })}
              onAddService={() => setServiceWindow({ kind: "new" })}
              error={draft.errors.services}
            />
            <RepairFilesNew draft={draft.files} onChange={draft.setFiles} disabled={draft.saving} />
          </div>
          <RepairWindowFooter
            mode="new"
            deleted={false}
            saving={draft.saving}
            onEdit={() => {}}
            onDelete={() => {}}
            onRestore={() => {}}
            onCancel={onClose}
            onSave={draft.save}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={confirmDiscard}
        onKeep={() => setConfirmDiscard(false)}
        onDiscard={onClose}
      />
      <DraftServiceWindows
        state={serviceWindow}
        repair={shown}
        bleachers={bleachers}
        categories={categories}
        services={draft.services}
        eventStart={draft.values.eventStart || null}
        checkServiceZone={checkServiceZone}
        setServices={draft.setServices}
        onOpenReports={() => {}}
        onClose={() => setServiceWindow(null)}
      />
    </>
  );
}
