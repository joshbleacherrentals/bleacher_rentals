import { describe, expect, it } from "vitest";
import {
  REPAIR_EVENT_NAME,
  REPAIR_FORM_MESSAGES,
  changedRepairFields,
  clearedRepairFormErrors,
  currencyForCountry,
  emptyRepairForm,
  invoiceNumberKey,
  isRepairFormDirty,
  nextCurrencyForVendor,
  normalizeInvoiceNumber,
  normalizeNotes,
  repairFormFromRow,
  validateRepairForm,
  vendorSelectOptions,
  type RepairFormValues,
} from "./repairForm";
import type { FilterOption } from "./repairFilters";
import { repairRow } from "./repairRowFixture";

// docs/specs/repairs-09a-repair-writes.md §3 and §7 (D130 to D138): the rules of the repair form
// that need no database and no React.

const base: RepairFormValues = {
  vendorUuid: "v1",
  invoiceNumber: "JJ-5",
  status: "in_repair",
  currency: "CAD",
  eventStart: "2026-11-01",
  eventEnd: "2026-11-05",
  notes: "Welded the spindle",
};

describe("emptyRepairForm and repairFormFromRow", () => {
  it("starts New repair as Inbound and USD with no vendor and empty text and dates (D18, D136)", () => {
    expect(emptyRepairForm()).toEqual({
      vendorUuid: null,
      invoiceNumber: "",
      status: "inbound",
      currency: "USD",
      eventStart: "",
      eventEnd: "",
      notes: "",
    });
  });

  it("names the fixed event name of a repair made here (D18)", () => {
    expect(REPAIR_EVENT_NAME).toBe("Maintenance / Repair");
  });

  it("turns the values of a repair into form values, with empty text for an empty column", () => {
    const row = repairRow({
      id: "r1",
      vendorUuid: "v1",
      invoiceNumber: "JJ-5",
      status: "triaged",
      currency: "CAD",
      eventStart: "2026-11-01",
      eventEnd: "2026-11-05",
      notes: "n",
    });
    expect(repairFormFromRow(row)).toEqual({
      vendorUuid: "v1",
      invoiceNumber: "JJ-5",
      status: "triaged",
      currency: "CAD",
      eventStart: "2026-11-01",
      eventEnd: "2026-11-05",
      notes: "n",
    });
    expect(repairFormFromRow(repairRow({ id: "r2" }))).toEqual({
      vendorUuid: null,
      invoiceNumber: "",
      status: "inbound",
      currency: "USD",
      eventStart: "",
      eventEnd: "",
      notes: "",
    });
  });
});

describe("normalizeInvoiceNumber and invoiceNumberKey (D137)", () => {
  it("trims the spaces at both ends and keeps the case", () => {
    expect(normalizeInvoiceNumber("  JJ-5 ")).toBe("JJ-5");
    expect(normalizeInvoiceNumber("jj-5")).toBe("jj-5");
    expect(normalizeInvoiceNumber("JJ 5")).toBe("JJ 5");
  });

  it("gives null for nothing, an empty text and spaces only", () => {
    expect(normalizeInvoiceNumber(null)).toBeNull();
    expect(normalizeInvoiceNumber(undefined)).toBeNull();
    expect(normalizeInvoiceNumber("")).toBeNull();
    expect(normalizeInvoiceNumber("   ")).toBeNull();
  });

  it("makes one key of numbers that differ only in case and spaces at the ends", () => {
    expect(invoiceNumberKey(" JJ-5 ")).toBe("jj-5");
    expect(invoiceNumberKey("jj-5")).toBe(invoiceNumberKey("JJ-5"));
    expect(invoiceNumberKey("JJ-5")).not.toBe(invoiceNumberKey("JJ-6"));
    expect(invoiceNumberKey("  ")).toBeNull();
    expect(invoiceNumberKey(null)).toBeNull();
  });
});

describe("normalizeNotes", () => {
  it("gives null for nothing and for spaces only, and the text as typed otherwise", () => {
    expect(normalizeNotes(null)).toBeNull();
    expect(normalizeNotes("")).toBeNull();
    expect(normalizeNotes("  \n ")).toBeNull();
    expect(normalizeNotes("  two spaces kept ")).toBe("  two spaces kept ");
  });
});

describe("changedRepairFields and isRepairFormDirty (D129, D134)", () => {
  it("finds nothing changed in an unchanged form", () => {
    expect(changedRepairFields(base, { ...base })).toEqual([]);
    expect(isRepairFormDirty(base, { ...base })).toBe(false);
  });

  it("finds each field alone", () => {
    const cases: [Partial<RepairFormValues>, string][] = [
      [{ vendorUuid: "v2" }, "vendorUuid"],
      [{ vendorUuid: null }, "vendorUuid"],
      [{ invoiceNumber: "JJ-6" }, "invoiceNumber"],
      [{ status: "completed" }, "status"],
      [{ currency: "USD" }, "currency"],
      [{ eventStart: "2026-11-02" }, "eventStart"],
      [{ eventEnd: "2026-11-09" }, "eventEnd"],
      [{ notes: "Other" }, "notes"],
    ];
    for (const [patch, field] of cases) {
      expect(changedRepairFields(base, { ...base, ...patch }), field).toEqual([field]);
      expect(isRepairFormDirty(base, { ...base, ...patch }), field).toBe(true);
    }
  });

  it("lists several changed fields in the order of the type", () => {
    const current = { ...base, notes: "x", vendorUuid: "v9", eventEnd: "2026-12-01" };
    expect(changedRepairFields(base, current)).toEqual(["vendorUuid", "eventEnd", "notes"]);
  });

  it("does not count spaces around the invoice number as a change", () => {
    expect(changedRepairFields(base, { ...base, invoiceNumber: " JJ-5  " })).toEqual([]);
    expect(isRepairFormDirty(base, { ...base, invoiceNumber: "JJ-5 " })).toBe(false);
  });

  it("does not count empty notes against spaces-only notes as a change, nor a changed case as none", () => {
    const empty = { ...base, notes: "" };
    expect(changedRepairFields(empty, { ...empty, notes: "   " })).toEqual([]);
    expect(changedRepairFields(base, { ...base, invoiceNumber: "jj-5" })).toEqual([
      "invoiceNumber",
    ]);
  });
});

describe("validateRepairForm (D130, D136, D138)", () => {
  it("asks for both days when both are empty", () => {
    expect(validateRepairForm({ ...base, eventStart: "", eventEnd: "" })).toEqual({
      eventStart: REPAIR_FORM_MESSAGES.eventStartRequired,
      eventEnd: REPAIR_FORM_MESSAGES.eventEndRequired,
    });
  });

  it("asks for the one that is empty", () => {
    expect(validateRepairForm({ ...base, eventStart: "" })).toEqual({
      eventStart: REPAIR_FORM_MESSAGES.eventStartRequired,
    });
    expect(validateRepairForm({ ...base, eventEnd: "" })).toEqual({
      eventEnd: REPAIR_FORM_MESSAGES.eventEndRequired,
    });
  });

  it("puts the order error on Repair to when it is before Repair from", () => {
    expect(
      validateRepairForm({ ...base, eventStart: "2026-11-05", eventEnd: "2026-11-04" }),
    ).toEqual({
      eventEnd: REPAIR_FORM_MESSAGES.eventEndBeforeStart,
    });
  });

  it("accepts the same day for both, and a valid form, with no errors", () => {
    expect(
      validateRepairForm({ ...base, eventStart: "2026-11-05", eventEnd: "2026-11-05" }),
    ).toEqual({});
    expect(validateRepairForm(base)).toEqual({});
  });

  it("does not ask for a vendor or an invoice number", () => {
    expect(validateRepairForm({ ...base, vendorUuid: null, invoiceNumber: "" })).toEqual({});
  });

  it("has the words of the spec", () => {
    expect(REPAIR_FORM_MESSAGES.eventStartRequired).toBe("Repair from is required.");
    expect(REPAIR_FORM_MESSAGES.eventEndRequired).toBe("Repair to is required.");
    expect(REPAIR_FORM_MESSAGES.eventEndBeforeStart).toBe(
      "Repair to must not be before Repair from.",
    );
    expect(REPAIR_FORM_MESSAGES.invoiceDuplicate).toBe(
      "This vendor already has a repair with this invoice number.",
    );
    expect(REPAIR_FORM_MESSAGES.restoreDuplicate).toBe(
      "A live repair already has this invoice number for this vendor.",
    );
    expect(REPAIR_FORM_MESSAGES.saveFailed).toBe("Failed to save the repair.");
    expect(REPAIR_FORM_MESSAGES.deleteFailed).toBe("Failed to delete the repair.");
    expect(REPAIR_FORM_MESSAGES.restoreFailed).toBe("Failed to restore the repair.");
  });
});

describe("currencyForCountry and nextCurrencyForVendor (D133)", () => {
  it("reads CA as CAD and US as USD, trimmed and in any case", () => {
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("ca")).toBe("CAD");
    expect(currencyForCountry(" US ")).toBe("USD");
    expect(currencyForCountry("us")).toBe("USD");
  });

  it("gives null for anything else", () => {
    expect(currencyForCountry("Canada")).toBeNull();
    expect(currencyForCountry("MX")).toBeNull();
    expect(currencyForCountry("")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry(undefined)).toBeNull();
  });

  it("changes the currency while untouched and the country is known", () => {
    expect(nextCurrencyForVendor({ current: "USD", touched: false, country: "CA" })).toBe("CAD");
    expect(nextCurrencyForVendor({ current: "CAD", touched: false, country: "US" })).toBe("USD");
  });

  it("keeps the current currency when it was picked by hand", () => {
    expect(nextCurrencyForVendor({ current: "USD", touched: true, country: "CA" })).toBe("USD");
  });

  it("keeps the current currency when the country is unknown or there is no address", () => {
    expect(nextCurrencyForVendor({ current: "CAD", touched: false, country: null })).toBe("CAD");
    expect(nextCurrencyForVendor({ current: "CAD", touched: false, country: "MX" })).toBe("CAD");
  });
});

describe("vendorSelectOptions (D131)", () => {
  const vendors: FilterOption[] = [
    { value: "v1", label: "Alpha Welding", inactive: false },
    { value: "v2", label: "Beta Tire", inactive: true },
    { value: "v3", label: "Gamma Trailer", inactive: false },
  ];

  it("lists only the active vendors, in the order given", () => {
    expect(vendorSelectOptions(vendors, { uuid: null, name: null })).toEqual([
      { value: "v1", label: "Alpha Welding" },
      { value: "v3", label: "Gamma Trailer" },
    ]);
  });

  it("keeps the repair's own vendor when it is inactive, at its place in the list", () => {
    expect(vendorSelectOptions(vendors, { uuid: "v2", name: "Beta Tire" })).toEqual([
      { value: "v1", label: "Alpha Welding" },
      { value: "v2", label: "Beta Tire" },
      { value: "v3", label: "Gamma Trailer" },
    ]);
  });

  it("adds the repair's own vendor with its own name when the list does not have it yet", () => {
    expect(vendorSelectOptions([], { uuid: "v9", name: "Zeta Axle" })).toEqual([
      { value: "v9", label: "Zeta Axle" },
    ]);
  });

  it("does not list an active current vendor twice", () => {
    const options = vendorSelectOptions(vendors, { uuid: "v1", name: "Alpha Welding" });
    expect(options.filter((o) => o.value === "v1")).toHaveLength(1);
  });
});

describe("clearedRepairFormErrors (D138)", () => {
  const all = {
    eventStart: "a",
    eventEnd: "b",
    invoiceNumber: "c",
  };

  it("clears the duplicate error when the vendor or the invoice number changes", () => {
    expect(clearedRepairFormErrors(all, "invoiceNumber")).toEqual({
      eventStart: "a",
      eventEnd: "b",
    });
    expect(clearedRepairFormErrors(all, "vendorUuid")).toEqual({ eventStart: "a", eventEnd: "b" });
  });

  it("clears both day errors when either day changes", () => {
    expect(clearedRepairFormErrors(all, "eventStart")).toEqual({ invoiceNumber: "c" });
    expect(clearedRepairFormErrors(all, "eventEnd")).toEqual({ invoiceNumber: "c" });
  });

  it("leaves the errors alone when the status, the currency or the notes change", () => {
    for (const field of ["status", "currency", "notes"] as const) {
      expect(clearedRepairFormErrors(all, field)).toBe(all);
    }
  });

  it("gives the same object back when there is nothing to clear", () => {
    const none = {};
    expect(clearedRepairFormErrors(none, "invoiceNumber")).toBe(none);
    expect(clearedRepairFormErrors(none, "eventStart")).toBe(none);
  });

  // docs/specs/repairs-09b2-bleachers-zone-reports.md §3 (D186): the red line above the services.
  it("clears the services error when Repair from changes", () => {
    const withServices = {
      ...all,
      services: "Bleacher #60 is in Zone 2, but this repair is in Zone 1.",
    };
    expect(clearedRepairFormErrors(withServices, "eventStart")).toEqual({ invoiceNumber: "c" });
    expect(clearedRepairFormErrors({ services: "x" }, "eventStart")).toEqual({});
  });

  it("keeps the services error when any other field changes", () => {
    const withServices = { ...all, services: "x" };
    expect(clearedRepairFormErrors(withServices, "eventEnd")).toEqual({
      invoiceNumber: "c",
      services: "x",
    });
    expect(clearedRepairFormErrors(withServices, "invoiceNumber")).toEqual({
      eventStart: "a",
      eventEnd: "b",
      services: "x",
    });
    for (const field of ["status", "currency", "notes"] as const) {
      expect(clearedRepairFormErrors(withServices, field)).toBe(withServices);
    }
    const onlyServices = { services: "x" };
    expect(clearedRepairFormErrors(onlyServices, "invoiceNumber")).toBe(onlyServices);
  });
});
