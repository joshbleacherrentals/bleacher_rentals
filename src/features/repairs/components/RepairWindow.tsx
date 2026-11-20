"use client";

import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
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
  emptyRepairForm,
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
import type { RepairListRow, RepairStatus } from "../utils/repairRows";
import { canChangeRepairStatus } from "../utils/repairStatus";
import { canReadRepairFiles, repairCreatedLine, repairWindowTitle } from "../utils/repairWindow";
import { BleacherChip, DeletedBadge, StatusPill } from "./RepairChips";
import { RepairFiles } from "./RepairFiles";
import { RepairFormFields, firstErrorFieldId } from "./RepairForm";
import { RepairWindowServices } from "./RepairServices";
import { RepairStatusMenu } from "./RepairStatusMenu";

/**
 * The repair window: the fields of one repair, its services with a Total row and its files. Read-only
 * for every role but an administrator and a maintainer; for those two (the page gives `editing`) it
 * has a footer with Edit and Delete, or Restore on a deleted repair, an Edit mode that turns the
 * fields into inputs in place, and a sibling window for New repair. docs/specs/repairs-07-repair-window.md
 * §2.2 to §2.5 and docs/specs/repairs-09a-repair-writes.md §2.1 to §2.4; the looks are the canvas's
 * (`InvoiceModal`, `InvoiceModalEdit`, `InvoiceModalNew`).
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
  /**
   * A status chosen in the menu of the Status field (spec 08 D110, D111). Given only to a role that
   * may change the status; without it, and for a deleted repair (D118), the field is the plain pill.
   */
  onChangeStatus?: (to: RepairStatus) => void;
  /** The small label over the title: "Repair" by default, "Edit repair" in Edit mode (spec 09a). */
  eyebrow?: string;
  /** Replaces the fields grid in Edit mode (spec 09a); the services and the files stay. */
  fields?: ReactNode;
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

        <h3 className="mt-7 text-base leading-6 font-semibold text-[#10365a]">Services</h3>
        <div className="mt-2.5">
          <RepairWindowServices repair={repair} onOpenService={onOpenService} />
        </div>

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

/** What the page gives the window of a role that may write (spec 09a D124). */
export type RepairEditing = {
  /** Every vendor, for the Vendor select (D131). */
  vendors: readonly FilterOption[];
  /** Save of an Edit: null when written, the errors when nothing was written (D138). */
  onSave: (initial: RepairFormValues, values: RepairFormValues) => Promise<RepairFormErrors | null>;
  onDelete: () => Promise<void>;
  onRestore: () => Promise<void>;
};

/**
 * The draft of the Edit and New repair modes (D128 to D139): the values, the errors under the fields,
 * whether a write runs, and Save. A change clears the errors of its own field; choosing a vendor in
 * New repair reads the vendor's country once and sets the currency while the person has not picked
 * one (D133). A failed write leaves the window as it is: the writer showed its red toast (D139).
 */
function useRepairDraft(params: {
  mode: "edit" | "new";
  initial: RepairFormValues;
  submit: (initial: RepairFormValues, values: RepairFormValues) => Promise<RepairFormErrors | null>;
  onSaved: () => void;
}) {
  const { mode, initial, submit, onSaved } = params;
  const [values, setValues] = useState<RepairFormValues>(initial);
  const [errors, setErrors] = useState<RepairFormErrors>({});
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
      const refused = await submit(initial, values);
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

  return { values, errors, saving, dirty: isRepairFormDirty(initial, values), change, save };
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
      <AlertDialogContent data-testid="repair-discard-dialog">
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
      <AlertDialogContent data-testid="repair-delete-dialog">
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
export const REPAIR_WINDOW_CLASS =
  "max-h-[90vh] gap-0 overflow-x-hidden overflow-y-auto rounded-xl p-0 sm:max-w-[1152px]";

/** The Edit mode of an existing repair: the content with the inputs, and Cancel and Save. */
function RepairEditBody({
  repair,
  initial,
  vendors,
  timezone,
  files,
  onOpenService,
  onOpenReports,
  onSave,
  onLeave,
  onDirtyChange,
}: {
  repair: RepairListRow;
  initial: RepairFormValues;
  vendors: readonly FilterOption[];
  timezone: string;
  files: ReactNode;
  onOpenService: (serviceId: string) => void;
  onOpenReports: () => void;
  onSave: RepairEditing["onSave"];
  onLeave: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const draft = useRepairDraft({ mode: "edit", initial, submit: onSave, onSaved: onLeave });
  const { dirty } = draft;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const vendorOptions = useMemo(
    () => vendorSelectOptions(vendors, { uuid: initial.vendorUuid, name: repair.vendorName }),
    [vendors, initial.vendorUuid, repair.vendorName],
  );

  return (
    <>
      <RepairWindowContent
        repair={repair}
        timezone={timezone}
        vendorAddress={null}
        onOpenService={onOpenService}
        onOpenReports={onOpenReports}
        files={files}
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

  // The values the draft opened with; null in view mode. The inputs are drawn only while it is set.
  const [session, setSession] = useState<RepairFormValues | null>(null);
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

  const files = canReadFiles ? <RepairFiles repairId={repair.id} /> : null;

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent data-testid="repair-window" className={REPAIR_WINDOW_CLASS}>
          <DialogDescription className="sr-only">
            A repair with its services and files.
          </DialogDescription>
          {session && editing ? (
            <RepairEditBody
              repair={repair}
              initial={session}
              vendors={editing.vendors}
              timezone={timezone}
              files={files}
              onOpenService={onOpenService}
              onOpenReports={onOpenReports}
              onSave={editing.onSave}
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
                files={files}
                Title={DialogTitle}
                onChangeStatus={onChangeStatus}
              />
              {editing && (
                <RepairWindowFooter
                  mode="view"
                  deleted={repair.deleted}
                  saving={false}
                  onEdit={() => setSession(repairFormFromRow(repair))}
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
  onCreate: (values: RepairFormValues) => Promise<RepairFormErrors | null>;
  onClose: () => void;
};

/** The window of New repair: the fields only, Cancel and Add repair (D128, D129). */
export function NewRepairWindow({ vendors, onCreate, onClose }: NewRepairWindowProps) {
  const [initial] = useState(emptyRepairForm);
  const draft = useRepairDraft({
    mode: "new",
    initial,
    submit: (_initial, values) => onCreate(values),
    onSaved: onClose,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const vendorOptions = useMemo(
    () => vendorSelectOptions(vendors, { uuid: null, name: null }),
    [vendors],
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
        <DialogContent data-testid="new-repair-window" className={REPAIR_WINDOW_CLASS}>
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
    </>
  );
}
