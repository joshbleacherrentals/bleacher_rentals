import type { ReactNode } from "react";
import CentsInput from "@/components/CentsInput";
import { Dropdown } from "@/components/DropDown";
import { SearchableSelect } from "@/components/SearchableSelect";
import { formatRepairMoney, severityPill } from "../utils/repairFormat";
import type { RepairCurrency, RepairSeverity } from "../utils/repairRows";
import {
  serviceFormCents,
  type SelectOption,
  type ServiceFormErrors,
  type ServiceFormField,
  type ServiceFormValues,
} from "../utils/serviceForm";

/**
 * The inputs of the Edit and Add modes of the service window: Bleacher, Category, Severity, Description
 * and the four money inputs with a live Total, a read-only line for the damage report day in Edit, and
 * the error text under each field that can carry one. A plain component, so that a test can render it.
 * docs/specs/repairs-09b1-services.md §2.2 and §3 (D151 to D155); the looks are the canvas's
 * (`ServiceModalEdit`, `ServiceModalNew`).
 */

const EYEBROW =
  "text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase";
const INPUT =
  "block w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm leading-5 text-[#111827] placeholder:text-[#9ca3af] disabled:opacity-60";
const ERROR = "mt-1 text-[13px] leading-[18px] text-[#b23c36]";

/** The "No category" entry at the top of the Category list (D151). */
const NO_CATEGORY = "__no_category__";

const SEVERITIES: RepairSeverity[] = ["minor", "major", "routine"];
const SEVERITY_OPTIONS = SEVERITIES.map((severity) => ({
  label: severityPill(severity).label,
  value: severity,
}));

/** The sign the money inputs carry, as the money of the table is written (`$` and `C$`). */
const CURRENCY_SIGN: Record<RepairCurrency, string> = { USD: "$", CAD: "C$" };

export type ServiceFormFieldsProps = {
  mode: "edit" | "new";
  values: ServiceFormValues;
  errors: ServiceFormErrors;
  bleachers: readonly SelectOption[];
  categories: readonly SelectOption[];
  currency: RepairCurrency; // the sign of the money inputs
  reportedDay: string | null; // the read-only line of Edit; null draws none
  disabled: boolean; // while Save runs
  onChange: <K extends ServiceFormField>(field: K, value: ServiceFormValues[K]) => void;
};

/** The id of the first input that carries an error, in the order the fields are drawn. */
export function firstServiceErrorFieldId(errors: ServiceFormErrors): string | null {
  if (errors.bleacherUuid) return "service-bleacher";
  if (errors.severity) return "service-severity";
  return null;
}

/** Puts the focus on the field with that id: the element itself, or the first control inside it. */
export function focusServiceField(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  const target = element.matches("button, input, textarea")
    ? element
    : element.querySelector<HTMLElement>("button, input, textarea");
  target?.focus();
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
    <p data-testid={`service-error-${name}`} role="alert" className={ERROR}>
      {message}
    </p>
  );
}

function MoneyField({
  id,
  label,
  sign,
  text,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  sign: string;
  text: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`${EYEBROW} mb-1 block`}>
        {label}
      </label>
      <div className="flex items-center rounded-md border border-[#d1d5db] bg-white focus-within:ring-2 focus-within:ring-[#1d62a3]">
        <span aria-hidden="true" className="pl-3 text-sm text-[#6b7280]">
          {sign}
        </span>
        <CentsInput
          value={text}
          onChange={(next) => onChange(next)}
          disabled={disabled}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-3 text-right text-sm leading-5 text-[#111827] tabular-nums placeholder:text-[#9ca3af] focus:outline-none disabled:opacity-60"
        />
      </div>
    </div>
  );
}

export function ServiceFormFields({
  mode,
  values,
  errors,
  bleachers,
  categories,
  currency,
  reportedDay,
  disabled,
  onChange,
}: ServiceFormFieldsProps) {
  const sign = CURRENCY_SIGN[currency];
  const total = serviceFormCents(values).totalCents;
  const categoryOptions = [{ value: NO_CATEGORY, label: "No category" }, ...categories];

  return (
    <div className="grid gap-6 px-6 pt-5 pb-6 sm:grid-cols-[minmax(0,1fr)_264px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Field label="Bleacher">
          <div id="service-bleacher">
            <SearchableSelect
              options={[...bleachers]}
              selected={values.bleacherUuid}
              onSelect={(value) => onChange("bleacherUuid", value)}
              placeholder="Select a bleacher"
              searchPlaceholder="Search bleachers..."
              disabled={disabled}
            />
          </div>
          <FieldError name="bleacher" message={errors.bleacherUuid} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <div id="service-category">
              <SearchableSelect
                options={categoryOptions}
                selected={values.categoryUuid}
                onSelect={(value) =>
                  onChange("categoryUuid", value === null || value === NO_CATEGORY ? null : value)
                }
                placeholder={mode === "edit" ? "No category" : "Select a category"}
                searchPlaceholder="Search categories..."
                disabled={disabled}
              />
            </div>
          </Field>
          <Field label="Severity">
            <div id="service-severity">
              <Dropdown<RepairSeverity>
                options={SEVERITY_OPTIONS}
                selected={values.severity ?? undefined}
                onSelect={(severity) => onChange("severity", severity)}
                placeholder="Select severity"
                disabled={disabled}
              />
            </div>
            <FieldError name="severity" message={errors.severity} />
          </Field>
        </div>

        <Field label="Description" htmlFor="service-description">
          <textarea
            id="service-description"
            rows={3}
            value={values.description}
            placeholder="What is wrong, or what was done"
            disabled={disabled}
            onChange={(event) => onChange("description", event.target.value)}
            className={`${INPUT} resize-none`}
          />
        </Field>

        {mode === "edit" && reportedDay && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-[#6b7280]">
            <span className={EYEBROW}>Reported</span>
            <span className="text-[#374151] tabular-nums">{reportedDay}</span>
            <span>found from the driver&apos;s damage report, not edited here</span>
          </div>
        )}
      </div>

      <div className="self-start rounded-lg bg-[#f9fafb] p-4">
        <div className="flex flex-col gap-3">
          <MoneyField
            id="service-labor"
            label="Labor"
            sign={sign}
            text={values.laborText}
            disabled={disabled}
            onChange={(text) => onChange("laborText", text)}
          />
          <MoneyField
            id="service-parts"
            label="Parts"
            sign={sign}
            text={values.partsText}
            disabled={disabled}
            onChange={(text) => onChange("partsText", text)}
          />
          <MoneyField
            id="service-tax"
            label="Tax"
            sign={sign}
            text={values.taxText}
            disabled={disabled}
            onChange={(text) => onChange("taxText", text)}
          />
          <MoneyField
            id="service-freight"
            label="Freight"
            sign={sign}
            text={values.freightText}
            disabled={disabled}
            onChange={(text) => onChange("freightText", text)}
          />
        </div>
        <div
          data-testid="service-form-total"
          className="mt-3 flex justify-between border-t border-[#d1d5db] pt-3 text-sm leading-5 font-semibold"
        >
          <span>Total</span>
          <span className="tabular-nums">{formatRepairMoney(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}
