import type { ReactNode } from "react";
import { Dropdown } from "@/components/DropDown";
import { SearchableSelect } from "@/components/SearchableSelect";
import { statusPill } from "../utils/repairFormat";
import type {
  RepairFormErrors,
  RepairFormField,
  RepairFormValues,
  VendorSelectOption,
} from "../utils/repairForm";
import type { RepairCurrency, RepairStatus } from "../utils/repairRows";
import { REPAIR_STATUSES } from "../utils/repairStatus";

/**
 * The inputs of the Edit and New repair modes of the repair window: Vendor, Invoice #, Status,
 * Currency, the two days and Notes as inputs, Zone and Completed as read-only text, and the error
 * text under each field that can carry one. A plain component, so that a test can render it.
 * docs/specs/repairs-09a-repair-writes.md §2.3 and §3 (D128 to D138); the looks are the canvas's
 * (`InvoiceModalEdit`, `InvoiceModalNew`).
 */

const EYEBROW =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";
const INPUT =
  "block w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm leading-5 text-[#111827] placeholder:text-[#9ca3af] disabled:opacity-60";
const ERROR = "mt-1 text-[13px] leading-[18px] text-[#b23c36]";

/** The "No vendor" entry at the top of the Vendor list (D131). */
const NO_VENDOR = "__no_vendor__";

const STATUS_OPTIONS = REPAIR_STATUSES.map((status) => ({
  label: statusPill(status).label,
  value: status,
}));
const CURRENCY_OPTIONS: { label: string; value: RepairCurrency }[] = [
  { label: "USD", value: "USD" },
  { label: "CAD", value: "CAD" },
];

export type RepairFormFieldsProps = {
  mode: "edit" | "new";
  values: RepairFormValues;
  errors: RepairFormErrors;
  vendors: readonly VendorSelectOption[];
  zones: readonly { uuid: string; name: string | null }[]; // read-only; empty in New repair
  completedOn: string | null; // read-only
  disabled: boolean; // while Save runs
  onChange: <K extends RepairFormField>(field: K, value: RepairFormValues[K]) => void;
};

/**
 * The id of the first input that carries an error, in the order the fields are drawn (D138); the red
 * line above the services (09b2 D186) comes after the fields.
 */
export function firstErrorFieldId(errors: RepairFormErrors): string | null {
  if (errors.invoiceNumber) return "repair-invoice";
  if (errors.eventStart) return "repair-from";
  if (errors.eventEnd) return "repair-to";
  if (errors.services) return "repair-services-error";
  return null;
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={`${EYEBROW} mb-1.5 block`}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** The error text of a field, drawn right under its input. */
function FieldError({ name, message }: { name: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p data-testid={`repair-error-${name}`} role="alert" className={ERROR}>
      {message}
    </p>
  );
}

function ReadOnly({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`py-2 text-sm leading-5 text-[#111827] ${className}`}>{children}</div>;
}

export function RepairFormFields({
  mode,
  values,
  errors,
  vendors,
  zones,
  completedOn,
  disabled,
  onChange,
}: RepairFormFieldsProps) {
  const vendorOptions = [{ value: NO_VENDOR, label: "No vendor" }, ...vendors];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-[18px] sm:grid-cols-4">
      <Field label="Vendor" className="col-span-2">
        <SearchableSelect
          options={vendorOptions}
          selected={values.vendorUuid}
          onSelect={(value) => onChange("vendorUuid", value === NO_VENDOR ? null : value)}
          placeholder="Select a vendor"
          searchPlaceholder="Search vendors..."
          disabled={disabled}
        />
        {mode === "new" && (
          <p className="mt-1 text-[13px] leading-[18px] text-[#6b7280]">
            The currency is filled from the vendor&apos;s country
          </p>
        )}
      </Field>

      <Field label="Invoice #" htmlFor="repair-invoice">
        <input
          id="repair-invoice"
          type="text"
          value={values.invoiceNumber}
          placeholder="e.g. DTR-2377"
          disabled={disabled}
          onChange={(event) => onChange("invoiceNumber", event.target.value)}
          className={`${INPUT} tabular-nums`}
        />
        <FieldError name="invoice" message={errors.invoiceNumber} />
      </Field>

      <Field label="Status">
        <Dropdown<RepairStatus>
          options={STATUS_OPTIONS}
          selected={values.status}
          onSelect={(status) => onChange("status", status)}
          disabled={disabled}
        />
      </Field>

      <Field label="Currency">
        <Dropdown<RepairCurrency>
          options={CURRENCY_OPTIONS}
          selected={values.currency}
          onSelect={(currency) => onChange("currency", currency)}
          disabled={disabled}
        />
      </Field>

      <Field label="Zone">
        <ReadOnly>
          {mode === "new" ? (
            <span className="text-[#6b7280]">Set from the bleachers</span>
          ) : zones.length > 0 ? (
            zones.map((zone) => <div key={zone.uuid}>{zone.name ?? "—"}</div>)
          ) : (
            <span className="text-[#9ca3af]">—</span>
          )}
        </ReadOnly>
      </Field>

      <Field label="Repair from" htmlFor="repair-from">
        <input
          id="repair-from"
          type="date"
          value={values.eventStart}
          disabled={disabled}
          onChange={(event) => onChange("eventStart", event.target.value)}
          className={`${INPUT} tabular-nums`}
        />
        <FieldError name="from" message={errors.eventStart} />
      </Field>

      <Field label="Repair to" htmlFor="repair-to">
        <input
          id="repair-to"
          type="date"
          value={values.eventEnd}
          disabled={disabled}
          onChange={(event) => onChange("eventEnd", event.target.value)}
          className={`${INPUT} tabular-nums`}
        />
        <FieldError name="to" message={errors.eventEnd} />
      </Field>

      <Field label="Completed">
        <ReadOnly className="tabular-nums">
          {completedOn ? completedOn : <span className="text-[#9ca3af]">—</span>}
        </ReadOnly>
      </Field>

      <Field label="Notes" htmlFor="repair-notes" className="col-span-2 sm:col-span-3">
        <textarea
          id="repair-notes"
          rows={2}
          value={values.notes}
          placeholder="Notes about the repair"
          disabled={disabled}
          onChange={(event) => onChange("notes", event.target.value)}
          className={`${INPUT} resize-none`}
        />
      </Field>
    </div>
  );
}
