import type { FilterOption } from "./repairFilters";
import type { RepairCurrency, RepairListRow, RepairStatus } from "./repairRows";

/**
 * The rules of the repair form that need no database and no React: the values, what counts as a
 * change, the checks on the two days, the invoice number's two forms, the currency of a vendor's
 * country and the vendors a select offers. docs/specs/repairs-09a-repair-writes.md §2.3, §3 and §7
 * (the signatures here are locked by that spec).
 */

/** The fixed event name of a repair made here (D18). */
export const REPAIR_EVENT_NAME = "Maintenance / Repair";

export type RepairFormValues = {
  vendorUuid: string | null;
  invoiceNumber: string; // as typed
  status: RepairStatus;
  currency: RepairCurrency;
  eventStart: string; // YYYY-MM-DD, "" while empty
  eventEnd: string; // YYYY-MM-DD, "" while empty
  notes: string; // as typed
};
export type RepairFormField = keyof RepairFormValues;

/** The fields in the order of the type: the order `changedRepairFields` answers in. */
const FIELDS: readonly RepairFormField[] = [
  "vendorUuid",
  "invoiceNumber",
  "status",
  "currency",
  "eventStart",
  "eventEnd",
  "notes",
];

/** New repair: Inbound, USD, no vendor, empty text and dates (D18, D136). */
export function emptyRepairForm(): RepairFormValues {
  return {
    vendorUuid: null,
    invoiceNumber: "",
    status: "inbound",
    currency: "USD",
    eventStart: "",
    eventEnd: "",
    notes: "",
  };
}

/** The values of a repair as the window opens it; empty text for an empty column. */
export function repairFormFromRow(row: RepairListRow): RepairFormValues {
  return {
    vendorUuid: row.vendorUuid,
    invoiceNumber: row.invoiceNumber ?? "",
    status: row.status,
    currency: row.currency,
    eventStart: row.eventStart ?? "",
    eventEnd: row.eventEnd ?? "",
    notes: row.notes ?? "",
  };
}

/** Trimmed; empty is null; the case is kept (D137). */
export function normalizeInvoiceNumber(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** `normalizeInvoiceNumber` in lower case: the key two numbers are compared by (D137). */
export function invoiceNumberKey(text: string | null | undefined): string | null {
  return normalizeInvoiceNumber(text)?.toLowerCase() ?? null;
}

/** Spaces only is null; any other text as typed. */
export function normalizeNotes(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return text.trim() === "" ? null : text;
}

/** One field as it is compared: the invoice number and the notes after normalizing. */
function comparable(values: RepairFormValues, field: RepairFormField): string | null {
  switch (field) {
    case "invoiceNumber":
      return normalizeInvoiceNumber(values.invoiceNumber);
    case "notes":
      return normalizeNotes(values.notes);
    default:
      return values[field];
  }
}

/**
 * The fields that differ, in the order of the type, compared after normalizing the invoice number
 * and the notes (D134). `vendorUuid`, `status`, `currency` and the dates compare as they are.
 */
export function changedRepairFields(
  initial: RepairFormValues,
  current: RepairFormValues,
): RepairFormField[] {
  return FIELDS.filter((field) => comparable(initial, field) !== comparable(current, field));
}

export function isRepairFormDirty(initial: RepairFormValues, current: RepairFormValues): boolean {
  return changedRepairFields(initial, current).length > 0;
}

/**
 * `services` is the red line above the table of services (09b2 D186): a zone conflict found at Save,
 * which no single field owns.
 */
export type RepairFormErrors = {
  eventStart?: string;
  eventEnd?: string;
  invoiceNumber?: string;
  services?: string;
};

export const REPAIR_FORM_MESSAGES = {
  eventStartRequired: "Repair from is required.",
  eventEndRequired: "Repair to is required.",
  eventEndBeforeStart: "Repair to must not be before Repair from.",
  invoiceDuplicate: "This vendor already has a repair with this invoice number.",
  restoreDuplicate: "A live repair already has this invoice number for this vendor.",
  saveFailed: "Failed to save the repair.",
  deleteFailed: "Failed to delete the repair.",
  restoreFailed: "Failed to restore the repair.",
} as const;

/**
 * The errors without the ones a change of `field` makes stale (D138): the invoice number's duplicate
 * error depends on the vendor and the number, and both days' errors depend on both days. The same
 * object comes back when nothing is cleared.
 */
export function clearedRepairFormErrors(
  errors: RepairFormErrors,
  field: RepairFormField,
): RepairFormErrors {
  if (field === "vendorUuid" || field === "invoiceNumber") {
    if (errors.invoiceNumber === undefined) return errors;
    const { invoiceNumber: _cleared, ...rest } = errors;
    return rest;
  }
  if (field === "eventStart" || field === "eventEnd") {
    // `Repair from` decides the zone of the services (09b2 D186), so a change of it clears that line.
    const clearsServices = field === "eventStart" && errors.services !== undefined;
    if (errors.eventStart === undefined && errors.eventEnd === undefined && !clearsServices) {
      return errors;
    }
    const { eventStart: _start, eventEnd: _end, ...rest } = errors;
    if (field === "eventStart") {
      const { services: _services, ...withoutServices } = rest;
      return withoutServices;
    }
    return rest;
  }
  return errors;
}

/** The checks that need no database: both days present, the order (D130, D136). */
export function validateRepairForm(values: RepairFormValues): RepairFormErrors {
  const errors: RepairFormErrors = {};
  if (!values.eventStart) errors.eventStart = REPAIR_FORM_MESSAGES.eventStartRequired;
  if (!values.eventEnd) errors.eventEnd = REPAIR_FORM_MESSAGES.eventEndRequired;
  // Days are `YYYY-MM-DD`, so the text order is the day order.
  if (values.eventStart && values.eventEnd && values.eventEnd < values.eventStart) {
    errors.eventEnd = REPAIR_FORM_MESSAGES.eventEndBeforeStart;
  }
  return errors;
}

/** `CA` gives CAD, `US` gives USD (trimmed, any case); anything else is null (D133). */
export function currencyForCountry(country: string | null | undefined): RepairCurrency | null {
  const code = country?.trim().toUpperCase();
  if (code === "CA") return "CAD";
  if (code === "US") return "USD";
  return null;
}

/** The currency after a vendor is chosen: changed only while untouched and the country is known. */
export function nextCurrencyForVendor(params: {
  current: RepairCurrency;
  touched: boolean;
  country: string | null;
}): RepairCurrency {
  if (params.touched) return params.current;
  return currencyForCountry(params.country) ?? params.current;
}

export type VendorSelectOption = { value: string; label: string };

/**
 * The active vendors, plus the repair's own vendor (`current`) even when inactive or not in the list
 * yet (then labelled with `current.name`); in the order of `vendors` (D131). "No vendor" is not an
 * option here: the select draws it.
 */
export function vendorSelectOptions(
  vendors: readonly FilterOption[],
  current: { uuid: string | null; name: string | null },
): VendorSelectOption[] {
  const options = vendors
    .filter((vendor) => !vendor.inactive || vendor.value === current.uuid)
    .map((vendor) => ({ value: vendor.value, label: vendor.label }));
  if (current.uuid && !options.some((option) => option.value === current.uuid)) {
    options.push({ value: current.uuid, label: current.name?.trim() || "Unknown" });
  }
  return options;
}
