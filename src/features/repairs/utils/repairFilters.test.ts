import { describe, expect, it } from "vitest";
import {
  SEARCH_HINT,
  buildRepairFilterOptions,
  filterRepairs,
  repairMatchesSearch,
  searchOptions,
  withUnknownSelected,
  type RepairFilterCriteria,
} from "./repairFilters";
import { repairRow } from "./repairRowFixture";
import type { RepairListRow } from "./repairRows";

// docs/specs/repairs-05-toolbar.md §2.2 to §2.4 and §7 (D57, D58, D61, D62, D68, D77).

const NONE: RepairFilterCriteria = {
  search: "",
  bleacherUuids: [],
  zoneUuids: [],
  vendorUuids: [],
  categoryUuids: [],
};

const ids = (rows: readonly RepairListRow[]) => rows.map((r) => r.id);

describe("SEARCH_HINT", () => {
  it("names the five things the search reads (D57)", () => {
    expect(SEARCH_HINT).toBe("Search invoice #, vendor, notes, bleacher #, category");
  });
});

describe("repairMatchesSearch", () => {
  const row = repairRow({
    id: "r",
    invoiceNumber: "DTR-2377",
    vendorName: "Caprock Tire",
    notes: "Welded new spindle",
    bleachers: [
      { uuid: "b52", number: 52 },
      { uuid: "bq", number: null },
    ],
    categories: [{ uuid: "c1", name: "Hydraulics" }],
  });

  it("finds a repair by each of the five fields (D57)", () => {
    expect(repairMatchesSearch(row, "2377")).toBe(true); // invoice number
    expect(repairMatchesSearch(row, "caprock")).toBe(true); // vendor
    expect(repairMatchesSearch(row, "spindle")).toBe(true); // notes
    expect(repairMatchesSearch(row, "hydra")).toBe(true); // category
    expect(repairMatchesSearch(row, "#52")).toBe(true); // bleacher, written #N
  });

  it("finds a bleacher by the bare number as well as by #number", () => {
    expect(repairMatchesSearch(row, "52")).toBe(true);
    expect(repairMatchesSearch(row, "#5")).toBe(true);
    expect(repairMatchesSearch(row, "#53")).toBe(false);
  });

  it("does not search a bleacher that has no number", () => {
    expect(repairMatchesSearch(row, "#?")).toBe(false);
    expect(repairMatchesSearch(row, "?")).toBe(false);
  });

  it("ignores case and matches any part of a field (D58)", () => {
    expect(repairMatchesSearch(row, "CAPROCK TIRE")).toBe(true);
    expect(repairMatchesSearch(row, "tire")).toBe(true);
    expect(repairMatchesSearch(row, "dtr-23")).toBe(true);
  });

  it("trims the text at both ends but keeps spaces inside it", () => {
    expect(repairMatchesSearch(row, "  caprock  ")).toBe(true);
    expect(repairMatchesSearch(row, "caprock  tire")).toBe(false);
  });

  it("takes an empty or only-spaces text as no search", () => {
    expect(repairMatchesSearch(row, "")).toBe(true);
    expect(repairMatchesSearch(row, "   ")).toBe(true);
  });

  it("finds nothing for a text that needs two fields (D58)", () => {
    expect(repairMatchesSearch(row, "Caprock Tire DTR-2377")).toBe(false);
    expect(repairMatchesSearch(row, "DTR-2377 Caprock")).toBe(false);
  });

  it("does not search the service descriptions (D57)", () => {
    const withService = repairRow({
      id: "s",
      services: [
        {
          id: "x",
          bleacherUuid: "b",
          bleacherNumber: 1,
          damageCategoryUuid: null,
          categoryName: null,
          severity: "minor",
          description: "secret description",
          laborCents: 0,
          partsCents: 0,
          taxCents: 0,
          freightCents: 0,
          totalCents: 0,
          deleted: false,
          createdAt: null,
          reported: [],
        },
      ],
    });
    expect(repairMatchesSearch(withService, "secret")).toBe(false);
  });

  it("copes with a repair that has nothing to read", () => {
    expect(repairMatchesSearch(repairRow({ id: "e" }), "anything")).toBe(false);
  });
});

describe("filterRepairs", () => {
  const rows = [
    repairRow({
      id: "a",
      vendorUuid: "v1",
      vendorName: "Caprock",
      bleachers: [
        { uuid: "b1", number: 1 },
        { uuid: "b2", number: 2 },
      ],
      zones: [{ uuid: "z1", name: "Zone 1" }],
      categories: [
        { uuid: "c1", name: "Tires" },
        { uuid: "c2", name: "Welding" },
      ],
      invoiceNumber: "A-1",
    }),
    repairRow({
      id: "b",
      vendorUuid: "v2",
      vendorName: "Dallas",
      bleachers: [{ uuid: "b3", number: 3 }],
      zones: [
        { uuid: "z1", name: "Zone 1" },
        { uuid: "z2", name: "Zone 2" },
      ],
      categories: [{ uuid: "c1", name: "Tires" }],
      invoiceNumber: "B-2",
    }),
    // an old repair: no vendor, no zone, no category
    repairRow({ id: "old", bleachers: [{ uuid: "b4", number: 4 }], invoiceNumber: null }),
  ];

  it("keeps every row, in order, when nothing is asked", () => {
    expect(ids(filterRepairs(rows, NONE))).toEqual(["a", "b", "old"]);
  });

  it("filters by bleacher, by zone, by vendor and by category", () => {
    expect(ids(filterRepairs(rows, { ...NONE, bleacherUuids: ["b2"] }))).toEqual(["a"]);
    expect(ids(filterRepairs(rows, { ...NONE, zoneUuids: ["z2"] }))).toEqual(["b"]);
    expect(ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v2"] }))).toEqual(["b"]);
    expect(ids(filterRepairs(rows, { ...NONE, categoryUuids: ["c2"] }))).toEqual(["a"]);
  });

  it("takes several values in one filter as any of them", () => {
    expect(ids(filterRepairs(rows, { ...NONE, bleacherUuids: ["b2", "b3"] }))).toEqual(["a", "b"]);
    expect(ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v1", "v2"] }))).toEqual(["a", "b"]);
    expect(ids(filterRepairs(rows, { ...NONE, zoneUuids: ["z1", "z2"] }))).toEqual(["a", "b"]);
    expect(ids(filterRepairs(rows, { ...NONE, categoryUuids: ["c2", "c1"] }))).toEqual(["a", "b"]);
  });

  it("takes two filters, and the search, as all of them", () => {
    expect(
      ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v1", "v2"], categoryUuids: ["c2"] })),
    ).toEqual(["a"]);
    expect(ids(filterRepairs(rows, { ...NONE, zoneUuids: ["z1"], bleacherUuids: ["b3"] }))).toEqual(
      ["b"],
    );
    expect(ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v1"], search: "dallas" }))).toEqual(
      [],
    );
    expect(ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v2"], search: "dallas" }))).toEqual([
      "b",
    ]);
  });

  it("lets a repair with several zones pass on any of them and keeps all its chips", () => {
    const out = filterRepairs(rows, { ...NONE, zoneUuids: ["z2"] });
    expect(out[0].zones).toHaveLength(2);
  });

  it("does not let a repair with no vendor, no zone or no category pass that filter (D62)", () => {
    expect(ids(filterRepairs(rows, { ...NONE, vendorUuids: ["v1", "v2"] }))).not.toContain("old");
    expect(ids(filterRepairs(rows, { ...NONE, zoneUuids: ["z1", "z2"] }))).not.toContain("old");
    expect(ids(filterRepairs(rows, { ...NONE, categoryUuids: ["c1", "c2"] }))).not.toContain("old");
  });

  it("keeps nothing for a value no repair has", () => {
    expect(filterRepairs(rows, { ...NONE, vendorUuids: ["ghost"] })).toEqual([]);
  });

  it("applies the search to the same rows", () => {
    expect(ids(filterRepairs(rows, { ...NONE, search: "#4" }))).toEqual(["old"]);
  });
});

describe("buildRepairFilterOptions", () => {
  const raw = {
    bleachers: [
      { id: "b9", bleacherNumber: 9, deleted: 0 },
      { id: "b10", bleacherNumber: 10, deleted: null },
      { id: "bx", bleacherNumber: null, deleted: 0 },
      { id: "b2", bleacherNumber: 2, deleted: 0 },
      { id: "gone", bleacherNumber: 5, deleted: 1 },
      { id: "b2b", bleacherNumber: 2, deleted: 0 },
    ],
    zones: [
      { id: "z2", name: "Zone 2" },
      { id: "z10", name: "Zone 10" },
      { id: "z1", name: "zone 1" },
      { id: "zn", name: null },
    ],
    vendors: [
      { id: "v2", name: "Suncoast", isActive: 1 },
      { id: "v1", name: "caprock Tire", isActive: 0 },
      { id: "v3", name: "CURA", isActive: 1 },
      { id: "v4", name: "CURA", isActive: null },
      { id: "vn", name: null, isActive: 1 },
    ],
    categories: [
      { id: "c2", name: "Welding", isActive: 1 },
      { id: "c1", name: "Tires", isActive: 0 },
      { id: "c3", name: "Jacks", isActive: null },
    ],
  };
  const options = buildRepairFilterOptions(raw);

  it("lists the bleachers that are not deleted, as #N, by number, smallest first", () => {
    expect(options.bleacher.map((o) => o.label)).toEqual(["#2", "#2", "#9", "#10", "#?"]);
    expect(options.bleacher.map((o) => o.value)).not.toContain("gone");
  });

  it("breaks a tie of bleacher numbers by id", () => {
    expect(options.bleacher.slice(0, 2).map((o) => o.value)).toEqual(["b2", "b2b"]);
  });

  it("lists every zone A to Z with numbers as numbers, and names an unnamed one", () => {
    expect(options.zone.map((o) => o.label)).toEqual([
      "Unnamed zone",
      "zone 1",
      "Zone 2",
      "Zone 10",
    ]);
  });

  it("lists every vendor A to Z and keeps two vendors that share a name", () => {
    expect(options.vendor.map((o) => o.label)).toEqual([
      "caprock Tire",
      "CURA",
      "CURA",
      "Suncoast",
      "Unnamed vendor",
    ]);
    expect(options.vendor.filter((o) => o.label === "CURA").map((o) => o.value)).toEqual([
      "v3",
      "v4",
    ]);
  });

  it("marks a switched-off vendor and category inactive, and a null flag as active", () => {
    const flag = (list: typeof options.vendor) =>
      Object.fromEntries(list.map((o) => [o.value, o.inactive]));
    expect(flag(options.vendor)).toMatchObject({ v1: true, v2: false, v3: false, v4: false });
    expect(flag(options.category)).toMatchObject({ c1: true, c2: false, c3: false });
  });

  it("lists every category A to Z", () => {
    expect(options.category.map((o) => o.label)).toEqual(["Jacks", "Tires", "Welding"]);
  });

  it("never marks a bleacher or a zone inactive", () => {
    expect(options.bleacher.every((o) => !o.inactive)).toBe(true);
    expect(options.zone.every((o) => !o.inactive)).toBe(true);
  });

  it("gives empty lists for empty input", () => {
    expect(
      buildRepairFilterOptions({ bleachers: [], zones: [], vendors: [], categories: [] }),
    ).toEqual({ bleacher: [], zone: [], vendor: [], category: [] });
  });
});

describe("withUnknownSelected (D68)", () => {
  const options = [
    { value: "a", label: "Alpha", inactive: false },
    { value: "b", label: "Beta", inactive: false },
  ];

  it("adds the ticked values the list lacks at the top, labelled Unknown, in order", () => {
    const out = withUnknownSelected(options, ["a", "x", "y"]);
    expect(out.map((o) => [o.value, o.label])).toEqual([
      ["x", "Unknown"],
      ["y", "Unknown"],
      ["a", "Alpha"],
      ["b", "Beta"],
    ]);
  });

  it("adds nothing when every ticked value is listed or nothing is ticked", () => {
    expect(withUnknownSelected(options, ["a", "b"])).toEqual(options);
    expect(withUnknownSelected(options, [])).toEqual(options);
  });

  it("does not repeat a missing value ticked twice", () => {
    expect(withUnknownSelected(options, ["x", "x"]).filter((o) => o.value === "x")).toHaveLength(1);
  });
});

describe("searchOptions", () => {
  const options = [
    { value: "1", label: "Caprock Tire", inactive: false },
    { value: "2", label: "Dallas Trailer Repair", inactive: false },
    { value: "3", label: "Suncoast", inactive: true },
  ];

  it("matches any part of a label without difference of case", () => {
    expect(searchOptions(options, "TIRE").map((o) => o.value)).toEqual(["1"]);
    expect(searchOptions(options, "ra").map((o) => o.value)).toEqual(["2"]);
    expect(searchOptions(options, "c").map((o) => o.value)).toEqual(["1", "3"]);
  });

  it("keeps everything for an empty or only-spaces text and trims the rest", () => {
    expect(searchOptions(options, "")).toEqual(options);
    expect(searchOptions(options, "   ")).toEqual(options);
    expect(searchOptions(options, " sun ").map((o) => o.value)).toEqual(["3"]);
  });

  it("finds nothing for a text no label has", () => {
    expect(searchOptions(options, "zzz")).toEqual([]);
  });
});
