import { describe, expect, it } from "vitest";
import { repairRow, repairService } from "./repairRowFixture";
import type { FilterOption } from "./repairFilters";
import {
  SERVICE_FORM_MESSAGES,
  addDraftService,
  amountTextToCents,
  bleacherSelectOptions,
  categorySelectOptions,
  centsToAmountText,
  changedServiceFields,
  clearedServiceFormErrors,
  draftServiceRows,
  emptyServiceForm,
  isServiceFormDirty,
  isServicesDraftChanged,
  newRepairDisplayRow,
  normalizeDescription,
  removeDraftService,
  repairWithServicesDraft,
  serviceFormCents,
  serviceFormFromRow,
  serviceLookups,
  servicesDraftFromRepair,
  updateDraftService,
  validateServiceForm,
  type ServiceFormValues,
} from "./serviceForm";
import { emptyRepairForm } from "./repairForm";

// docs/specs/repairs-09b1-services.md §2.2, §2.6, §3 and §7 (D151 to D155, D161 to D163). Pure rules:
// the form, its checks, the lists of the selects and the draft of services of New repair and Edit.

const values = (over: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
  bleacherUuid: "b1",
  categoryUuid: "c1",
  severity: "minor",
  description: "Needed spindles rewelded",
  laborText: "1,260.00",
  partsText: "348.60",
  taxText: "34.55",
  freightText: "0.00",
  ...over,
});

const option = (value: string, label: string, inactive = false): FilterOption => ({
  value,
  label,
  inactive,
});

const lookups = serviceLookups(
  [option("b1", "#26"), option("b2", "#27"), option("b3", "#?")],
  [option("c1", "Welding"), option("c2", "Tires")],
);

describe("emptyServiceForm and serviceFormFromRow", () => {
  it("Add service starts with nothing chosen and empty text and amounts (D151)", () => {
    expect(emptyServiceForm()).toEqual({
      bleacherUuid: null,
      categoryUuid: null,
      severity: null,
      description: "",
      laborText: "",
      partsText: "",
      taxText: "",
      freightText: "",
    });
  });

  it("takes the stored values; an amount as 1,260.00 and zero as 0.00", () => {
    const service = repairService({
      id: "s1",
      bleacherUuid: "b1",
      damageCategoryUuid: "c1",
      severity: "major",
      description: "Needed spindles rewelded",
      laborCents: 126000,
      partsCents: 34860,
      taxCents: 3455,
      freightCents: 0,
    });
    expect(serviceFormFromRow(service)).toEqual({
      bleacherUuid: "b1",
      categoryUuid: "c1",
      severity: "major",
      description: "Needed spindles rewelded",
      laborText: "1,260.00",
      partsText: "348.60",
      taxText: "34.55",
      freightText: "0.00",
    });
  });

  it("an empty category and description become null and empty text", () => {
    const form = serviceFormFromRow(
      repairService({ id: "s1", damageCategoryUuid: null, categoryName: null, description: null }),
    );
    expect(form.categoryUuid).toBeNull();
    expect(form.description).toBe("");
  });
});

describe("amounts", () => {
  it("reads text as cents: empty is 0, commas are ignored", () => {
    expect(amountTextToCents("")).toBe(0);
    expect(amountTextToCents("0")).toBe(0);
    expect(amountTextToCents("1,260.00")).toBe(126000);
    expect(amountTextToCents("1260")).toBe(126000);
    expect(amountTextToCents("12.5")).toBe(1250);
    expect(amountTextToCents("0.05")).toBe(5);
  });

  it("writes cents as text with commas and two decimals", () => {
    expect(centsToAmountText(126000)).toBe("1,260.00");
    expect(centsToAmountText(0)).toBe("0.00");
    expect(centsToAmountText(5)).toBe("0.05");
    expect(centsToAmountText(100000000)).toBe("1,000,000.00");
  });

  it("serviceFormCents gives the four amounts and their sum, an empty text as 0", () => {
    expect(serviceFormCents(values({ freightText: "" }))).toEqual({
      laborCents: 126000,
      partsCents: 34860,
      taxCents: 3455,
      freightCents: 0,
      totalCents: 164315,
    });
  });
});

describe("normalizeDescription", () => {
  it("spaces only and empty give null; other text is kept as typed", () => {
    expect(normalizeDescription("   ")).toBeNull();
    expect(normalizeDescription("")).toBeNull();
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription("  two spaces in front")).toBe("  two spaces in front");
  });
});

describe("changedServiceFields and isServiceFormDirty (D155)", () => {
  it("nothing changed gives none and false", () => {
    expect(changedServiceFields(values(), values())).toEqual([]);
    expect(isServiceFormDirty(values(), values())).toBe(false);
  });

  it("every field alone gives itself", () => {
    const cases: [Partial<ServiceFormValues>, string][] = [
      [{ bleacherUuid: "b2" }, "bleacherUuid"],
      [{ categoryUuid: null }, "categoryUuid"],
      [{ severity: "major" }, "severity"],
      [{ description: "Other" }, "description"],
      [{ laborText: "1,261.00" }, "laborText"],
      [{ partsText: "1.00" }, "partsText"],
      [{ taxText: "0.01" }, "taxText"],
      [{ freightText: "5" }, "freightText"],
    ];
    for (const [over, field] of cases) {
      expect(changedServiceFields(values(), values(over))).toEqual([field]);
      expect(isServiceFormDirty(values(), values(over))).toBe(true);
    }
  });

  it("another form of the same number is not a change", () => {
    expect(changedServiceFields(values(), values({ laborText: "1260" }))).toEqual([]);
    expect(changedServiceFields(values(), values({ laborText: "1,260" }))).toEqual([]);
    expect(
      changedServiceFields(values({ freightText: "0.00" }), values({ freightText: "" })),
    ).toEqual([]);
  });

  it("a description of spaces against an empty one is not a change", () => {
    expect(
      changedServiceFields(values({ description: "" }), values({ description: "   " })),
    ).toEqual([]);
  });

  it("fields come in the order of the type", () => {
    expect(
      changedServiceFields(
        values(),
        values({ freightText: "9", bleacherUuid: "b2", severity: "major" }),
      ),
    ).toEqual(["bleacherUuid", "severity", "freightText"]);
  });
});

describe("validateServiceForm and clearedServiceFormErrors (D151)", () => {
  it("asks for a bleacher and a severity, nothing else", () => {
    expect(validateServiceForm(emptyServiceForm())).toEqual({
      bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired,
      severity: SERVICE_FORM_MESSAGES.severityRequired,
    });
    expect(validateServiceForm(values({ bleacherUuid: null }))).toEqual({
      bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired,
    });
    expect(validateServiceForm(values({ severity: null }))).toEqual({
      severity: SERVICE_FORM_MESSAGES.severityRequired,
    });
  });

  it("a category and amounts alone are not required; a valid form gives {}", () => {
    expect(validateServiceForm(values({ categoryUuid: null, laborText: "" }))).toEqual({});
    expect(validateServiceForm(values())).toEqual({});
  });

  it("a change of a field clears its own error only; the same object when nothing is cleared", () => {
    const errors = {
      bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired,
      severity: SERVICE_FORM_MESSAGES.severityRequired,
    };
    expect(clearedServiceFormErrors(errors, "bleacherUuid")).toEqual({
      severity: SERVICE_FORM_MESSAGES.severityRequired,
    });
    expect(clearedServiceFormErrors(errors, "severity")).toEqual({
      bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired,
    });
    expect(clearedServiceFormErrors(errors, "laborText")).toBe(errors);
  });
});

describe("the lists of the selects (D153)", () => {
  const bleachers = [option("b1", "#26"), option("b2", "#27")];

  it("the bleachers are the list as it is", () => {
    expect(bleacherSelectOptions(bleachers, { uuid: "b1", number: 26 })).toEqual([
      { value: "b1", label: "#26" },
      { value: "b2", label: "#27" },
    ]);
  });

  it("adds the service's own bleacher when the list lacks it, as #N or #?", () => {
    expect(bleacherSelectOptions(bleachers, { uuid: "b9", number: 52 })).toEqual([
      { value: "b1", label: "#26" },
      { value: "b2", label: "#27" },
      { value: "b9", label: "#52" },
    ]);
    expect(bleacherSelectOptions(bleachers, { uuid: "b9", number: null }).at(-1)).toEqual({
      value: "b9",
      label: "#?",
    });
  });

  it("adds nothing without a current bleacher", () => {
    expect(bleacherSelectOptions(bleachers, { uuid: null, number: null })).toHaveLength(2);
  });

  const categories = [
    option("c1", "Hydraulics"),
    option("c2", "Old category", true),
    option("c3", "Welding"),
  ];

  it("lists only the active categories, in the order of the input; No category is not an option", () => {
    expect(categorySelectOptions(categories, { uuid: null, name: null })).toEqual([
      { value: "c1", label: "Hydraulics" },
      { value: "c3", label: "Welding" },
    ]);
  });

  it("keeps the service's own category while it is inactive, without a duplicate", () => {
    expect(categorySelectOptions(categories, { uuid: "c2", name: "Old category" })).toEqual([
      { value: "c1", label: "Hydraulics" },
      { value: "c2", label: "Old category" },
      { value: "c3", label: "Welding" },
    ]);
    expect(
      categorySelectOptions(categories, { uuid: "c1", name: "Hydraulics" }).filter(
        (o) => o.value === "c1",
      ),
    ).toHaveLength(1);
  });

  it("adds a current category that is not in the list, with its name or Unknown", () => {
    expect(categorySelectOptions(categories, { uuid: "c9", name: "Gone" }).at(-1)).toEqual({
      value: "c9",
      label: "Gone",
    });
    expect(categorySelectOptions(categories, { uuid: "c9", name: null }).at(-1)).toEqual({
      value: "c9",
      label: "Unknown",
    });
  });
});

describe("the draft of services (D149, D161)", () => {
  const stored = repairRow({
    id: "r1",
    services: [
      repairService({ id: "s1", laborCents: 1000, totalCents: 1000 }),
      repairService({ id: "s2", deleted: true }),
      repairService({ id: "s3", bleacherUuid: "b2", bleacherNumber: 27 }),
    ],
  });

  it("servicesDraftFromRepair takes the live services in the list's order; null gives []", () => {
    const draft = servicesDraftFromRepair(stored);
    expect(draft.map((d) => d.id)).toEqual(["s1", "s3"]);
    expect(draft[0].stored).toBe(stored.services[0]);
    expect(draft[0].initial).toEqual(draft[0].values);
    expect(draft[0].removed).toBe(false);
    expect(servicesDraftFromRepair(null)).toEqual([]);
  });

  it("addDraftService appends an entry that was never stored", () => {
    const draft = addDraftService(servicesDraftFromRepair(stored), "new-1", values());
    expect(draft.map((d) => d.id)).toEqual(["s1", "s3", "new-1"]);
    expect(draft[2]).toEqual({
      id: "new-1",
      stored: null,
      initial: null,
      values: values(),
      removed: false,
    });
  });

  it("updateDraftService changes only the entry with that id and not the list it was given", () => {
    const before = servicesDraftFromRepair(stored);
    const after = updateDraftService(before, "s3", values({ severity: "major" }));
    expect(after[1].values.severity).toBe("major");
    expect(after[0]).toBe(before[0]);
    expect(before[1].values.severity).toBe("minor");
  });

  it("removeDraftService drops an added entry and marks a stored one removed", () => {
    const withNew = addDraftService(servicesDraftFromRepair(stored), "new-1", values());
    expect(removeDraftService(withNew, "new-1").map((d) => d.id)).toEqual(["s1", "s3"]);
    const removed = removeDraftService(withNew, "s1");
    expect(removed.map((d) => d.id)).toEqual(["s1", "s3", "new-1"]);
    expect(removed[0].removed).toBe(true);
  });

  it("isServicesDraftChanged is false for an empty, an untouched, a re-removed and a restored draft", () => {
    expect(isServicesDraftChanged([])).toBe(false);
    expect(isServicesDraftChanged(servicesDraftFromRepair(stored))).toBe(false);
    const added = addDraftService(servicesDraftFromRepair(stored), "new-1", values());
    expect(isServicesDraftChanged(removeDraftService(added, "new-1"))).toBe(false);
    const edited = updateDraftService(
      servicesDraftFromRepair(stored),
      "s1",
      values({ laborText: "999" }),
    );
    expect(isServicesDraftChanged(edited)).toBe(true);
    const back = updateDraftService(edited, "s1", servicesDraftFromRepair(stored)[0].values);
    expect(isServicesDraftChanged(back)).toBe(false);
  });

  it("isServicesDraftChanged is true for an added, a removed and a changed entry", () => {
    const base = servicesDraftFromRepair(stored);
    expect(isServicesDraftChanged(addDraftService(base, "n", values()))).toBe(true);
    expect(isServicesDraftChanged(removeDraftService(base, "s1"))).toBe(true);
    expect(
      isServicesDraftChanged(updateDraftService(base, "s3", values({ severity: "major" }))),
    ).toBe(true);
  });
});

describe("serviceLookups (D153)", () => {
  it("names a bleacher number and a category from their uuids", () => {
    expect(lookups.bleacherNumber("b1")).toBe(26);
    expect(lookups.bleacherNumber("b3")).toBeNull(); // #?
    expect(lookups.bleacherNumber("nope")).toBeNull();
    expect(lookups.categoryName("c2")).toBe("Tires");
    expect(lookups.categoryName("nope")).toBeNull();
  });
});

describe("what the window shows of a draft (D163)", () => {
  const stored = repairRow({
    id: "r1",
    currency: "CAD",
    totalCents: 777700,
    laborCents: 1000,
    services: [
      repairService({
        id: "s1",
        bleacherUuid: "b1",
        bleacherNumber: 26,
        damageCategoryUuid: "c1",
        categoryName: "Welding",
        laborCents: 1000,
        totalCents: 1000,
        reported: [{ id: "rep", day: "2026-09-17", createdAt: "2026-09-17T12:00:00Z" }],
      }),
    ],
  });

  it("draftServiceRows leaves out removed entries and totals each row", () => {
    let draft = servicesDraftFromRepair(stored);
    draft = addDraftService(
      draft,
      "n1",
      values({ bleacherUuid: "b2", categoryUuid: "c2", severity: "major" }),
    );
    const rows = draftServiceRows(draft, lookups);
    expect(rows.map((r) => r.id)).toEqual(["s1", "n1"]);
    expect(rows[1]).toMatchObject({
      bleacherUuid: "b2",
      bleacherNumber: 27,
      damageCategoryUuid: "c2",
      categoryName: "Tires",
      severity: "major",
      description: "Needed spindles rewelded",
      laborCents: 126000,
      partsCents: 34860,
      taxCents: 3455,
      freightCents: 0,
      totalCents: 164315,
      deleted: false,
      reported: [],
      createdAt: null,
    });
    expect(draftServiceRows(removeDraftService(draft, "s1"), lookups).map((r) => r.id)).toEqual([
      "n1",
    ]);
  });

  it("keeps the reports of a stored service and its stored names while its uuids are unchanged", () => {
    const rows = draftServiceRows(servicesDraftFromRepair(stored), serviceLookups([], []));
    expect(rows[0].reported).toHaveLength(1);
    expect(rows[0].bleacherNumber).toBe(26);
    expect(rows[0].categoryName).toBe("Welding");
  });

  it("an empty description is null and an empty category has no name", () => {
    const rows = draftServiceRows(
      addDraftService([], "n1", values({ description: "  ", categoryUuid: null })),
      lookups,
    );
    expect(rows[0].description).toBeNull();
    expect(rows[0].damageCategoryUuid).toBeNull();
    expect(rows[0].categoryName).toBeNull();
  });

  it("repairWithServicesDraft: an untouched draft shows the stored Total (D101)", () => {
    const shown = repairWithServicesDraft(stored, servicesDraftFromRepair(stored), lookups);
    expect(shown.totalCents).toBe(777700);
    expect(shown.services).toHaveLength(1);
    expect(shown.laborCents).toBe(1000);
  });

  it("repairWithServicesDraft: a changed draft shows the sums and their total", () => {
    const draft = addDraftService(servicesDraftFromRepair(stored), "n1", values());
    const shown = repairWithServicesDraft(stored, draft, lookups);
    expect(shown.services.map((s) => s.id)).toEqual(["s1", "n1"]);
    expect(shown.laborCents).toBe(1000 + 126000);
    expect(shown.partsCents).toBe(34860);
    expect(shown.taxCents).toBe(3455);
    expect(shown.freightCents).toBe(0);
    expect(shown.totalCents).toBe(1000 + 164315);
  });

  it("repairWithServicesDraft: nothing left shows dashes for the sums and $0.00 for the total", () => {
    const shown = repairWithServicesDraft(
      stored,
      removeDraftService(servicesDraftFromRepair(stored), "s1"),
      lookups,
    );
    expect(shown.services).toEqual([]);
    expect(shown.laborCents).toBeNull();
    expect(shown.partsCents).toBeNull();
    expect(shown.totalCents).toBe(0);
  });

  it("newRepairDisplayRow takes the values and the services, with no bleachers, zone or total", () => {
    const form = {
      ...emptyRepairForm(),
      vendorUuid: "v1",
      invoiceNumber: " JJ-5 ",
      status: "triaged" as const,
      currency: "CAD" as const,
      eventStart: "2026-11-01",
      eventEnd: "2026-11-05",
    };
    const empty = newRepairDisplayRow({
      values: form,
      vendorName: "Dallas Trailer Repair",
      draft: [],
      lookups,
    });
    expect(empty).toMatchObject({
      vendorUuid: "v1",
      vendorName: "Dallas Trailer Repair",
      invoiceNumber: "JJ-5",
      status: "triaged",
      currency: "CAD",
      eventStart: "2026-11-01",
      eventEnd: "2026-11-05",
      bleachers: [],
      zones: [],
      services: [],
      totalCents: null,
      laborCents: null,
      deleted: false,
    });
    const withService = newRepairDisplayRow({
      values: form,
      vendorName: null,
      draft: addDraftService([], "n1", values()),
      lookups,
    });
    expect(withService.services).toHaveLength(1);
    expect(withService.totalCents).toBe(164315);
    expect(withService.laborCents).toBe(126000);
  });
});
