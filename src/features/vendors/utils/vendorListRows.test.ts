import { describe, expect, it } from "vitest";
import {
  INITIAL_VENDOR_LIST_STATE,
  buildVendorRows,
  matchesFilters,
  matchesSearch,
  nextSort,
  sortVendors,
  type VendorListState,
} from "./vendorListRows";
import type { VendorRecord } from "@/features/manageTeam/utils/vendorForm";

// docs/specs/vendors-page.md §4.6 (D19 to D22, D24): the search by words, the filters, the sorting
// and the active-or-deleted view, all as pure functions.

const vendor = (over: Partial<VendorRecord> & { id: string }): VendorRecord => ({
  displayName: "Vendor",
  type: "driver",
  isActive: true,
  logoUrl: null,
  qboVendorId: null,
  qboConnectionUuid: null,
  ein: null,
  hst: null,
  status: null,
  phone: null,
  contactName: null,
  contactEmail: null,
  doesTrailerRepair: false,
  doesAluminumWelding: false,
  doesMobileRepair: false,
  isPartsSupplier: false,
  notes: null,
  addressUuid: null,
  address: null,
  ...over,
});

const dallas = vendor({
  id: "dallas",
  displayName: "Dallas Trailer Repair",
  type: "repairs",
  status: "verified",
  contactName: "Sam Jones",
  contactEmail: "sam@dallastrailer.com",
  phone: "+1 (214) 555-0182",
  notes: "Fast on aluminum welding",
  addressUuid: "a1",
  address: {
    street: "1 Shop Rd",
    city: "Dallas",
    stateProvince: "TX",
    zipPostal: "75201",
    country: "US",
    latitude: null,
    longitude: null,
    placeId: null,
  },
});
const danielsville = vendor({
  id: "danielsville",
  displayName: "Danielsville Tire and Automotive",
  type: "repairs",
  status: "under_review",
});
const alpha = vendor({ id: "alpha", displayName: "alpha hauling", type: "driver" });
const zed = vendor({ id: "zed", displayName: "Zed Freight", type: "driver", status: "caution" });
const gone = vendor({ id: "gone", displayName: "Old Co", type: "driver", isActive: false });

const state = (over: Partial<VendorListState> = {}): VendorListState => ({
  ...INITIAL_VENDOR_LIST_STATE,
  ...over,
});
const ids = (list: VendorRecord[]) => list.map((v) => v.id);

describe("matchesSearch (D20)", () => {
  it("matches every vendor when the text is empty or only spaces", () => {
    expect(matchesSearch(dallas, "")).toBe(true);
    expect(matchesSearch(dallas, "   ")).toBe(true);
  });

  it("finds a vendor by words in any order: 'dallas repair' and 'repair dallas'", () => {
    expect(matchesSearch(dallas, "dallas repair")).toBe(true);
    expect(matchesSearch(dallas, "repair dallas")).toBe(true);
  });

  it("needs every word: one that is nowhere refuses the vendor", () => {
    expect(matchesSearch(dallas, "dallas welding repair shop")).toBe(false);
    expect(matchesSearch(dallas, "dallas plumbing")).toBe(false);
  });

  it("is not case-sensitive and a part of a word counts", () => {
    expect(matchesSearch(dallas, "DALLAS")).toBe(true);
    expect(matchesSearch(dallas, "trail")).toBe(true);
  });

  it("looks in the name, contact name, email, phone, city, state, country and notes", () => {
    expect(matchesSearch(dallas, "sam")).toBe(true); // contact name
    expect(matchesSearch(dallas, "dallastrailer.com")).toBe(true); // email
    expect(matchesSearch(dallas, "555-0182")).toBe(true); // phone
    expect(matchesSearch(dallas, "tx")).toBe(true); // state
    expect(matchesSearch(dallas, "us")).toBe(true); // country
    expect(matchesSearch(dallas, "aluminum")).toBe(true); // notes
  });

  it("finds a word in the city that is not in any other field", () => {
    const v = vendor({
      id: "v",
      displayName: "Acme",
      address: { ...dallas.address!, city: "Simcoe" },
    });
    expect(matchesSearch(v, "simcoe")).toBe(true);
  });

  it("does not search the street or the postal code", () => {
    expect(matchesSearch(dallas, "shop rd")).toBe(false);
    expect(matchesSearch(dallas, "75201")).toBe(false);
  });

  it("copes with a vendor that has no address and no contact", () => {
    expect(matchesSearch(alpha, "alpha")).toBe(true);
    expect(matchesSearch(alpha, "dallas")).toBe(false);
  });
});

describe("matchesFilters (D21)", () => {
  it("passes everything with the initial filters", () => {
    for (const v of [dallas, alpha, zed]) {
      expect(matchesFilters(v, { type: "all", statuses: [] })).toBe(true);
    }
  });

  it("filters by Type", () => {
    expect(matchesFilters(dallas, { type: "repairs", statuses: [] })).toBe(true);
    expect(matchesFilters(dallas, { type: "driver", statuses: [] })).toBe(false);
    expect(matchesFilters(alpha, { type: "driver", statuses: [] })).toBe(true);
  });

  it("filters by several statuses at once", () => {
    const f = { type: "all" as const, statuses: ["verified", "caution"] as const };
    expect(matchesFilters(dallas, f)).toBe(true);
    expect(matchesFilters(zed, f)).toBe(true);
    expect(matchesFilters(danielsville, f)).toBe(false);
    expect(matchesFilters(alpha, f)).toBe(false);
  });

  it("'none' stands for a vendor with no status, and can be mixed with the others", () => {
    expect(matchesFilters(alpha, { type: "all", statuses: ["none"] })).toBe(true);
    expect(matchesFilters(dallas, { type: "all", statuses: ["none"] })).toBe(false);
    expect(matchesFilters(dallas, { type: "all", statuses: ["none", "verified"] })).toBe(true);
    expect(matchesFilters(alpha, { type: "all", statuses: ["none", "verified"] })).toBe(true);
    expect(matchesFilters(zed, { type: "all", statuses: ["none", "verified"] })).toBe(false);
  });

  it("needs the Type and the Status to match together", () => {
    expect(matchesFilters(dallas, { type: "repairs", statuses: ["verified"] })).toBe(true);
    expect(matchesFilters(dallas, { type: "driver", statuses: ["verified"] })).toBe(false);
    expect(matchesFilters(dallas, { type: "repairs", statuses: ["caution"] })).toBe(false);
  });
});

describe("sortVendors (D19)", () => {
  const all = [zed, dallas, alpha, danielsville];

  it("sorts by Vendor A to Z, not case-sensitive", () => {
    expect(ids(sortVendors(all, { key: "vendor", direction: "asc" }))).toEqual([
      "alpha",
      "dallas",
      "danielsville",
      "zed",
    ]);
  });

  it("sorts by Vendor Z to A", () => {
    expect(ids(sortVendors(all, { key: "vendor", direction: "desc" }))).toEqual([
      "zed",
      "danielsville",
      "dallas",
      "alpha",
    ]);
  });

  it("sorts by Type ascending (Driver, Repairs), ties by name A to Z", () => {
    expect(ids(sortVendors(all, { key: "type", direction: "asc" }))).toEqual([
      "alpha",
      "zed",
      "dallas",
      "danielsville",
    ]);
  });

  it("sorts by Type descending, and ties still go A to Z", () => {
    expect(ids(sortVendors(all, { key: "type", direction: "desc" }))).toEqual([
      "dallas",
      "danielsville",
      "alpha",
      "zed",
    ]);
  });

  it("does not change the list it was given", () => {
    const input = [zed, alpha];
    sortVendors(input, { key: "vendor", direction: "asc" });
    expect(ids(input)).toEqual(["zed", "alpha"]);
  });
});

describe("nextSort (D19: a click on a header)", () => {
  it("flips the direction of the column that is sorted", () => {
    expect(nextSort({ key: "vendor", direction: "asc" }, "vendor")).toEqual({
      key: "vendor",
      direction: "desc",
    });
    expect(nextSort({ key: "vendor", direction: "desc" }, "vendor")).toEqual({
      key: "vendor",
      direction: "asc",
    });
  });

  it("sorts the other column ascending", () => {
    expect(nextSort({ key: "vendor", direction: "desc" }, "type")).toEqual({
      key: "type",
      direction: "asc",
    });
    expect(nextSort({ key: "type", direction: "desc" }, "vendor")).toEqual({
      key: "vendor",
      direction: "asc",
    });
  });
});

describe("buildVendorRows (D21, D22, D24)", () => {
  const all = [zed, dallas, alpha, danielsville, gone];

  it("starts with the active vendors, Vendor A to Z", () => {
    expect(INITIAL_VENDOR_LIST_STATE).toMatchObject({
      search: "",
      type: "all",
      statuses: [],
      showDeleted: false,
      sort: { key: "vendor", direction: "asc" },
    });
    expect(ids(buildVendorRows(all, INITIAL_VENDOR_LIST_STATE))).toEqual([
      "alpha",
      "dallas",
      "danielsville",
      "zed",
    ]);
  });

  it("Show Deleted shows only the deleted vendors", () => {
    expect(ids(buildVendorRows(all, state({ showDeleted: true })))).toEqual(["gone"]);
  });

  it("the search and the filters apply to the deleted view too", () => {
    const deleted = [
      vendor({ id: "d1", displayName: "Gone Repairs", type: "repairs", isActive: false }),
      vendor({ id: "d2", displayName: "Gone Haul", type: "driver", isActive: false }),
      vendor({ id: "d3", displayName: "Other", type: "repairs", isActive: false }),
    ];
    expect(ids(buildVendorRows(deleted, state({ showDeleted: true, search: "gone" })))).toEqual([
      "d2",
      "d1",
    ]);
    expect(
      ids(buildVendorRows(deleted, state({ showDeleted: true, search: "gone", type: "repairs" }))),
    ).toEqual(["d1"]);
  });

  it("shows a row only when it matches the search, the Type and the Status together", () => {
    expect(ids(buildVendorRows(all, state({ search: "dall", type: "repairs" })))).toEqual([
      "dallas",
    ]);
    expect(ids(buildVendorRows(all, state({ type: "repairs", statuses: ["verified"] })))).toEqual([
      "dallas",
    ]);
    expect(ids(buildVendorRows(all, state({ search: "dall", type: "driver" })))).toEqual([]);
  });

  it("sorts what is left", () => {
    expect(
      ids(buildVendorRows(all, state({ sort: { key: "vendor", direction: "desc" } }))),
    ).toEqual(["zed", "danielsville", "dallas", "alpha"]);
  });
});
