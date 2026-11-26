import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VendorsTable, locationLine } from "./VendorsTable";
import type { VendorRecord } from "@/features/manageTeam/utils/vendorForm";
import type { VendorSort } from "../utils/vendorListRows";

// docs/specs/vendors-page.md §4.6 (D18, D19): the six columns, the dashes, and the headers that
// sort. A click handler cannot be fired by the server renderer; the rule it calls, `nextSort`, is
// tested in vendorListRows.test.ts and the click itself in the end to end scenarios.

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

const full = vendor({
  id: "full",
  displayName: "Dallas Trailer Repair",
  type: "repairs",
  status: "verified",
  doesTrailerRepair: true,
  isPartsSupplier: true,
  contactName: "Sam Jones",
  phone: "+1 (214) 555-0182",
  contactEmail: "sam@dallastrailer.com",
  logoUrl: "https://x/logo.png",
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
const bare = vendor({ id: "bare", displayName: "alpha hauling" });

const sort: VendorSort = { key: "vendor", direction: "asc" };
const render = (rows: VendorRecord[], s: VendorSort = sort) =>
  renderToStaticMarkup(<VendorsTable rows={rows} sort={s} onSort={() => {}} onOpen={() => {}} />);
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const cell = (markup: string, col: string) => {
  const m = markup.match(new RegExp(`<td data-col="${col}"[^>]*>(.*?)</td>`));
  return m ? text(m[1]) : null;
};

describe("VendorsTable columns (D18)", () => {
  it("has the six columns, left to right", () => {
    const head = render([]).match(/<thead[^>]*>(.*?)<\/thead>/)![1];
    const names = [...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => text(m[1]));
    expect(names).toEqual(["Vendor", "Type", "Status", "Services", "Contact", "Location"]);
  });

  it("shows a full vendor: name, type, status, services, contact and location", () => {
    const m = render([full]);
    expect(cell(m, "vendor")).toBe("Dallas Trailer Repair");
    expect(cell(m, "type")).toBe("Repairs");
    expect(cell(m, "status")).toBe("Verified");
    expect(cell(m, "services")).toBe("Trailer repair Parts supplier");
    expect(cell(m, "contact")).toBe("Sam Jones +1 (214) 555-0182 sam@dallastrailer.com");
    expect(cell(m, "location")).toBe("Dallas, TX, US");
    expect(m).toContain('src="https://x/logo.png"');
  });

  it("shows a dash in every empty cell and the first letter for a vendor with no logo", () => {
    const m = render([bare]);
    expect(cell(m, "status")).toBe("—");
    expect(cell(m, "services")).toBe("—");
    expect(cell(m, "contact")).toBe("—");
    expect(cell(m, "location")).toBe("—");
    expect(cell(m, "vendor")).toBe("A alpha hauling");
    expect(cell(m, "type")).toBe("Driver");
  });

  it("draws one row per vendor, with its id", () => {
    const m = render([full, bare]);
    expect(m.match(/data-testid="vendor-row"/g)).toHaveLength(2);
    expect(m).toContain('data-vendor-id="full"');
    expect(m).toContain('data-vendor-id="bare"');
  });

  it("says 'No vendors found' when there is nothing to show", () => {
    const m = render([]);
    expect(text(m)).toContain("No vendors found");
    expect(m).not.toContain('data-testid="vendor-row"');
  });
});

describe("VendorsTable sorting headers (D19)", () => {
  const head = (s: VendorSort) => render([], s).match(/<thead[^>]*>(.*?)<\/thead>/)![1];

  it("makes only Vendor and Type buttons", () => {
    const h = head(sort);
    expect(h.match(/<button/g)).toHaveLength(2);
    expect(h).toContain('data-testid="sort-vendor"');
    expect(h).toContain('data-testid="sort-type"');
  });

  it("marks the sorted column and its direction, and no other", () => {
    const up = head({ key: "vendor", direction: "asc" });
    expect(up).toMatch(/aria-sort="ascending"[^>]*>\s*<button[^>]*data-testid="sort-vendor"/);
    expect(up).toMatch(/aria-sort="none"[^>]*>\s*<button[^>]*data-testid="sort-type"/);

    const down = head({ key: "type", direction: "desc" });
    expect(down).toMatch(/aria-sort="descending"[^>]*>\s*<button[^>]*data-testid="sort-type"/);
    expect(down).toMatch(/aria-sort="none"[^>]*>\s*<button[^>]*data-testid="sort-vendor"/);
  });
});

describe("locationLine (D18)", () => {
  it("joins the city, the state or province and the country", () => {
    expect(locationLine(full.address)).toBe("Dallas, TX, US");
  });

  it("leaves out what is missing and is empty with no address", () => {
    expect(locationLine({ ...full.address!, country: null })).toBe("Dallas, TX");
    expect(locationLine({ ...full.address!, city: "", stateProvince: "" })).toBe("US");
    expect(locationLine(null)).toBe("");
  });
});
