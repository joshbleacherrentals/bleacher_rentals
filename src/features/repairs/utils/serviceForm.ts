import type { FilterOption } from "./repairFilters";
import {
  REPAIR_EVENT_NAME,
  normalizeInvoiceNumber,
  normalizeNotes,
  type RepairFormValues,
} from "./repairForm";
import type { RepairListRow, RepairService, RepairSeverity } from "./repairRows";

/**
 * The rules of the service form and of the draft of services that New repair and the Edit mode hold,
 * with no database and no React: the values, what counts as a change, the checks, the lists of the
 * selects, and what the window shows of a draft. docs/specs/repairs-09b1-services.md §2.2, §2.6, §3
 * and §7 (the signatures here are locked by that spec).
 */

export type ServiceFormValues = {
  bleacherUuid: string | null;
  categoryUuid: string | null; // null = No category
  severity: RepairSeverity | null; // null until chosen
  description: string; // as typed
  laborText: string; // as typed, commas allowed; "" while empty
  partsText: string;
  taxText: string;
  freightText: string;
};
export type ServiceFormField = keyof ServiceFormValues;

/** The fields in the order of the type: the order `changedServiceFields` answers in. */
const FIELDS: readonly ServiceFormField[] = [
  "bleacherUuid",
  "categoryUuid",
  "severity",
  "description",
  "laborText",
  "partsText",
  "taxText",
  "freightText",
];

/** Add service: nothing chosen, empty text and amounts (D151). */
export function emptyServiceForm(): ServiceFormValues {
  return {
    bleacherUuid: null,
    categoryUuid: null,
    severity: null,
    description: "",
    laborText: "",
    partsText: "",
    taxText: "",
    freightText: "",
  };
}

/** The values of a stored service as the window opens it; amounts as "1,260.00", zero as "0.00". */
export function serviceFormFromRow(service: RepairService): ServiceFormValues {
  return {
    bleacherUuid: service.bleacherUuid,
    categoryUuid: service.damageCategoryUuid,
    severity: service.severity,
    description: service.description ?? "",
    laborText: centsToAmountText(service.laborCents),
    partsText: centsToAmountText(service.partsCents),
    taxText: centsToAmountText(service.taxCents),
    freightText: centsToAmountText(service.freightCents),
  };
}

/** "" is 0; commas are ignored; "1,260.00" is 126000. */
export function amountTextToCents(text: string): number {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

/** 126000 is "1,260.00"; 0 is "0.00". Whole units and cents are kept apart, so no float is shown. */
export function centsToAmountText(cents: number): string {
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (cents % 100).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export type ServiceFormCents = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
  totalCents: number; // the sum of the four
};

export function serviceFormCents(values: ServiceFormValues): ServiceFormCents {
  const laborCents = amountTextToCents(values.laborText);
  const partsCents = amountTextToCents(values.partsText);
  const taxCents = amountTextToCents(values.taxText);
  const freightCents = amountTextToCents(values.freightText);
  return {
    laborCents,
    partsCents,
    taxCents,
    freightCents,
    totalCents: laborCents + partsCents + taxCents + freightCents,
  };
}

/** The description after normalizing: spaces only is null, other text as typed (`normalizeNotes`). */
export function normalizeDescription(text: string | null | undefined): string | null {
  return normalizeNotes(text);
}

/** One field as it is compared: the description normalized, the amounts as cents. */
function comparable(values: ServiceFormValues, field: ServiceFormField): string | number | null {
  switch (field) {
    case "description":
      return normalizeDescription(values.description);
    case "laborText":
    case "partsText":
    case "taxText":
    case "freightText":
      return amountTextToCents(values[field]);
    default:
      return values[field];
  }
}

/**
 * The fields that differ, in the order of the type, compared after normalizing the description and
 * reading the amounts as cents (D155): "1,260", "1260.00" and "1,260.00" are one amount, "" and
 * "0.00" are one amount.
 */
export function changedServiceFields(
  initial: ServiceFormValues,
  current: ServiceFormValues,
): ServiceFormField[] {
  return FIELDS.filter((field) => comparable(initial, field) !== comparable(current, field));
}

export function isServiceFormDirty(
  initial: ServiceFormValues,
  current: ServiceFormValues,
): boolean {
  return changedServiceFields(initial, current).length > 0;
}

export type ServiceFormErrors = { bleacherUuid?: string; severity?: string };

export const SERVICE_FORM_MESSAGES = {
  bleacherRequired: "Bleacher is required.",
  severityRequired: "Severity is required.",
  saveFailed: "Failed to save the service.",
  deleteFailed: "Failed to delete the service.",
} as const;

/** The checks of D151: a bleacher and a severity. */
export function validateServiceForm(values: ServiceFormValues): ServiceFormErrors {
  const errors: ServiceFormErrors = {};
  if (!values.bleacherUuid) errors.bleacherUuid = SERVICE_FORM_MESSAGES.bleacherRequired;
  if (!values.severity) errors.severity = SERVICE_FORM_MESSAGES.severityRequired;
  return errors;
}

/** The errors without the one a change of `field` makes stale; the same object when none. */
export function clearedServiceFormErrors(
  errors: ServiceFormErrors,
  field: ServiceFormField,
): ServiceFormErrors {
  if (field === "bleacherUuid" && errors.bleacherUuid !== undefined) {
    const { bleacherUuid: _cleared, ...rest } = errors;
    return rest;
  }
  if (field === "severity" && errors.severity !== undefined) {
    const { severity: _cleared, ...rest } = errors;
    return rest;
  }
  return errors;
}

export type SelectOption = { value: string; label: string };

/**
 * The bleachers of the list (the ones that are not deleted, in its order), plus the service's own
 * bleacher (`current`) when it is not in the list, labelled `#N` (`#?` without a number) (D153).
 */
export function bleacherSelectOptions(
  bleachers: readonly FilterOption[],
  current: { uuid: string | null; number: number | null },
): SelectOption[] {
  const options = bleachers.map((b) => ({ value: b.value, label: b.label }));
  if (current.uuid && !options.some((option) => option.value === current.uuid)) {
    options.push({
      value: current.uuid,
      label: current.number === null ? "#?" : `#${current.number}`,
    });
  }
  return options;
}

/**
 * The active categories, plus the service's own category (`current`) even when inactive or not in
 * the list yet (then labelled `current.name`, or "Unknown"), in the order of `categories` (D153).
 * "No category" is not an option here: the select draws it.
 */
export function categorySelectOptions(
  categories: readonly FilterOption[],
  current: { uuid: string | null; name: string | null },
): SelectOption[] {
  const options = categories
    .filter((category) => !category.inactive || category.value === current.uuid)
    .map((category) => ({ value: category.value, label: category.label }));
  if (current.uuid && !options.some((option) => option.value === current.uuid)) {
    options.push({ value: current.uuid, label: current.name?.trim() || "Unknown" });
  }
  return options;
}

// ── The draft of New repair and Edit (D149, D161 to D163) ─────────────────────────────────────────

export type DraftService = {
  /** The stored service's id, or a new uuid for a service added in the draft. */
  id: string;
  /** The stored service as the window opened with it; null for a service added in the draft. */
  stored: RepairService | null;
  /** The values it opened with; null for an added service. */
  initial: ServiceFormValues | null;
  values: ServiceFormValues;
  /** A stored service deleted in the draft; written as `deleted` = 1 on Save. */
  removed: boolean;
};
export type ServicesDraft = DraftService[];

/** The live services of a repair, in the list's order; null (New repair) gives an empty draft. */
export function servicesDraftFromRepair(repair: RepairListRow | null): ServicesDraft {
  if (!repair) return [];
  return repair.services
    .filter((service) => !service.deleted)
    .map((service) => ({
      id: service.id,
      stored: service,
      initial: serviceFormFromRow(service),
      values: serviceFormFromRow(service),
      removed: false,
    }));
}

/** A new entry at the end. */
export function addDraftService(
  draft: ServicesDraft,
  id: string,
  values: ServiceFormValues,
): ServicesDraft {
  return [...draft, { id, stored: null, initial: null, values, removed: false }];
}

/** New values for the entry with that id. */
export function updateDraftService(
  draft: ServicesDraft,
  id: string,
  values: ServiceFormValues,
): ServicesDraft {
  return draft.map((entry) => (entry.id === id ? { ...entry, values } : entry));
}

/** An added entry is dropped; a stored entry is marked removed. */
export function removeDraftService(draft: ServicesDraft, id: string): ServicesDraft {
  return draft.flatMap((entry) => {
    if (entry.id !== id) return [entry];
    return entry.stored === null ? [] : [{ ...entry, removed: true }];
  });
}

/**
 * True when the draft differs from what was stored: an added entry that is not removed, a removed
 * stored entry, or a stored entry whose fields changed (`changedServiceFields`).
 */
export function isServicesDraftChanged(draft: ServicesDraft): boolean {
  return draft.some((entry) => {
    if (entry.stored === null || entry.initial === null) return !entry.removed;
    return entry.removed || isServiceFormDirty(entry.initial, entry.values);
  });
}

/** What the table of a draft needs to name a bleacher and a category from their uuids. */
export type ServiceLookups = {
  bleacherNumber: (uuid: string) => number | null;
  categoryName: (uuid: string) => string | null;
};

/** Lookups made from the two lists (`#52` gives 52, `#?` gives null). */
export function serviceLookups(
  bleachers: readonly FilterOption[],
  categories: readonly FilterOption[],
): ServiceLookups {
  return {
    bleacherNumber: (uuid) => {
      const label = bleachers.find((b) => b.value === uuid)?.label ?? "";
      const match = /^#(\d+)$/.exec(label);
      return match ? Number(match[1]) : null;
    },
    categoryName: (uuid) => categories.find((c) => c.value === uuid)?.label ?? null,
  };
}

/** The live entries of the draft as the rows of a table; `reported` is kept for a stored service. */
export function draftServiceRows(draft: ServicesDraft, lookups: ServiceLookups): RepairService[] {
  return draft
    .filter((entry) => !entry.removed)
    .map((entry) => {
      const { values, stored } = entry;
      const cents = serviceFormCents(values);
      const bleacherUuid = values.bleacherUuid ?? "";
      // While a uuid is the stored one, the stored number and name are shown: the lists may lack a
      // bleacher that was deleted or a category that was switched off.
      return {
        id: entry.id,
        bleacherUuid,
        bleacherNumber:
          stored && stored.bleacherUuid === values.bleacherUuid
            ? stored.bleacherNumber
            : lookups.bleacherNumber(bleacherUuid),
        damageCategoryUuid: values.categoryUuid,
        categoryName:
          values.categoryUuid === null
            ? null
            : stored && stored.damageCategoryUuid === values.categoryUuid
              ? stored.categoryName
              : lookups.categoryName(values.categoryUuid),
        severity: values.severity ?? "minor",
        description: normalizeDescription(values.description),
        laborCents: cents.laborCents,
        partsCents: cents.partsCents,
        taxCents: cents.taxCents,
        freightCents: cents.freightCents,
        totalCents: cents.totalCents,
        deleted: false,
        createdAt: stored?.createdAt ?? null,
        reported: stored?.reported ?? [],
      };
    });
}

/** The four sums of a list of rows (null when there are none) and the sum of all of them. */
function sumsOf(rows: readonly RepairService[]) {
  if (rows.length === 0) {
    return { laborCents: null, partsCents: null, taxCents: null, freightCents: null, total: 0 };
  }
  const add = (pick: (row: RepairService) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0);
  const laborCents = add((r) => r.laborCents);
  const partsCents = add((r) => r.partsCents);
  const taxCents = add((r) => r.taxCents);
  const freightCents = add((r) => r.freightCents);
  return {
    laborCents,
    partsCents,
    taxCents,
    freightCents,
    total: laborCents + partsCents + taxCents + freightCents,
  };
}

/**
 * The repair as the Edit window shows it: its services are the draft's, Labor, Parts, Tax and
 * Freight are their sums (null when none), and `totalCents` is the sum of the four sums when the
 * draft changed (0 when none remain) and the stored `cost_cents` when it did not (D163).
 */
export function repairWithServicesDraft(
  repair: RepairListRow,
  draft: ServicesDraft,
  lookups: ServiceLookups,
): RepairListRow {
  const services = draftServiceRows(draft, lookups);
  const { total, ...sums } = sumsOf(services);
  return {
    ...repair,
    services,
    ...sums,
    totalCents: isServicesDraftChanged(draft) ? total : repair.totalCents,
  };
}

/** The row the New repair window shows: the draft's values and services, nothing else (D149, D163). */
export function newRepairDisplayRow(input: {
  values: RepairFormValues;
  vendorName: string | null;
  draft: ServicesDraft;
  lookups: ServiceLookups;
}): RepairListRow {
  const { values, vendorName, draft, lookups } = input;
  const services = draftServiceRows(draft, lookups);
  const { total, ...sums } = sumsOf(services);
  return {
    id: "new-repair",
    eventName: REPAIR_EVENT_NAME,
    eventStart: values.eventStart || null,
    eventEnd: values.eventEnd || null,
    notes: normalizeNotes(values.notes),
    createdAt: null,
    deleted: false,
    status: values.status,
    currency: values.currency,
    invoiceNumber: normalizeInvoiceNumber(values.invoiceNumber),
    vendorUuid: values.vendorUuid,
    vendorName,
    completedOn: null,
    zones: [],
    bleachers: [],
    severities: [],
    categories: [],
    services,
    ...sums,
    totalCents: isServicesDraftChanged(draft) ? total : null,
    reported: [],
  };
}
