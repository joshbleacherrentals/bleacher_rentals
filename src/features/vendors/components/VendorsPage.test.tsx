import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/features/manageTeam/components/EditVendorModal", () => ({
  EditVendorModal: () => null,
}));
vi.mock("@/features/manageTeam/hooks/useVendors", () => ({
  useVendors: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/userAccess/client", () => ({
  useUserAccess: () => ({ status: "loading" }),
}));

import { VendorsPageView } from "./VendorsPage";
import { STATUS_FILTER_OPTIONS, VendorStatusFilterList } from "./VendorsToolbar";
import { INITIAL_VENDOR_LIST_STATE, type VendorListState } from "../utils/vendorListRows";
import type { VendorRecord } from "@/features/manageTeam/utils/vendorForm";

// docs/specs/vendors-page.md §4.6 (D20 to D24): the page's header, toolbar and table drawn from a
// list and a state. The same view is what every role gets; only the Add button depends on the role.

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

const vendors = [
  vendor({ id: "zed", displayName: "Zed Freight" }),
  vendor({
    id: "dallas",
    displayName: "Dallas Trailer Repair",
    type: "repairs",
    status: "verified",
  }),
  vendor({ id: "alpha", displayName: "Alpha Hauling" }),
  vendor({ id: "gone", displayName: "Old Co", isActive: false }),
];

const view = (canManage: boolean, over: Partial<VendorListState> = {}) =>
  renderToStaticMarkup(
    <VendorsPageView
      vendors={vendors}
      canManage={canManage}
      state={{ ...INITIAL_VENDOR_LIST_STATE, ...over }}
      onStateChange={() => {}}
      onAdd={() => {}}
      onOpen={() => {}}
    />,
  );
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const rowIds = (markup: string) =>
  [...markup.matchAll(/data-vendor-id="([^"]+)"/g)].map((m) => m[1]);

describe("VendorsPageView: the header and the Add button (D23)", () => {
  it("is titled Vendors and shows the Add button to the four roles that manage vendors", () => {
    const m = view(true);
    expect(text(m)).toContain("Vendors");
    expect(text(m)).toContain("Add vendor");
  });

  it("shows a viewer no Add button", () => {
    expect(text(view(false))).not.toContain("Add vendor");
  });
});

describe("VendorsPageView: the toolbar (D20, D21, D24)", () => {
  it("has the search, the Type filter, the Status filter and Show Deleted", () => {
    const m = view(true);
    expect(m).toContain('placeholder="Search vendors..."');
    expect(m).toContain("Type: All");
    expect(m).toContain("Type: Driver");
    expect(m).toContain("Type: Repairs");
    expect(text(m)).toContain("Status");
    expect(text(m)).toContain("Show Deleted");
  });

  it("shows a viewer the Show Deleted switch too (D24)", () => {
    expect(text(view(false))).toContain("Show Deleted");
  });

  it("shows how many statuses are ticked on the Status button", () => {
    const m = view(true, { statuses: ["verified", "none"] });
    expect(m).toMatch(/Status\s*<span[^>]*>2<\/span>/);
    expect(view(true)).not.toMatch(/Status\s*<span[^>]*>\d<\/span>/);
  });

  it("shows the text that was typed in the search", () => {
    expect(view(true, { search: "dallas" })).toContain('value="dallas"');
  });

  it("checks the Show Deleted switch when it is on", () => {
    expect(view(true, { showDeleted: true })).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(view(true)).not.toMatch(/type="checkbox"[^>]*checked=""/);
  });
});

describe("VendorsPageView: the rows (D19, D21)", () => {
  it("lists the active vendors A to Z at the start", () => {
    expect(rowIds(view(true))).toEqual(["alpha", "dallas", "zed"]);
  });

  it("lists only the deleted vendors with Show Deleted", () => {
    expect(rowIds(view(true, { showDeleted: true }))).toEqual(["gone"]);
  });

  it("narrows by the search and by the Type", () => {
    expect(rowIds(view(true, { search: "dallas repair" }))).toEqual(["dallas"]);
    expect(rowIds(view(true, { type: "driver" }))).toEqual(["alpha", "zed"]);
  });

  it("says 'No vendors found' when nothing matches", () => {
    expect(text(view(true, { search: "nothing like this" }))).toContain("No vendors found");
  });
});

describe("VendorStatusFilterList (D21)", () => {
  const render = (selected: Parameters<typeof VendorStatusFilterList>[0]["selected"]) =>
    renderToStaticMarkup(
      <VendorStatusFilterList selected={selected} onToggle={() => {}} onClear={() => {}} />,
    );

  it("offers the five statuses and 'No status'", () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      "Verified",
      "Caution",
      "Under review",
      "Prospect",
      "Do not use",
      "No status",
    ]);
    const t = text(render([]));
    for (const o of STATUS_FILTER_OPTIONS) expect(t).toContain(o.label);
    expect(t).toContain("Clear");
  });

  it("checks the ticked ones, several at once", () => {
    const m = render(["verified", "none"]);
    expect(m.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(m.match(/aria-checked="false"/g)).toHaveLength(4);
  });
});
