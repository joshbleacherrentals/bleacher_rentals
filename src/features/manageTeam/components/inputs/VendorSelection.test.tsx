import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditVendorModalProps, VendorOption } from "../../utils/vendorForm";

const modalProps: EditVendorModalProps[] = [];
let vendors: VendorOption[] = [];

vi.mock("../../hooks/useVendors", () => ({
  useVendors: () => ({ data: vendors, isLoading: false }),
}));
vi.mock("../EditVendorModal", () => ({
  EditVendorModal: (props: EditVendorModalProps) => {
    modalProps.push(props);
    return null;
  },
}));

import { VendorSelection } from "./VendorSelection";

// docs/specs/vendors-page.md §4.4 (D10, D11): the driver page keeps the card of the driver's vendor
// whatever its type, and opens the vendor window on Driver. The list to choose from is the pure
// function driverVendorChoices, tested in vendorForm.test.ts (the popover is closed here).

const option = (over: Partial<VendorOption>): VendorOption => ({
  id: "v",
  displayName: "Vendor",
  type: "driver",
  isActive: true,
  logoUrl: null,
  qboVendorId: "q1",
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
  driverCount: 1,
  ...over,
});

beforeEach(() => {
  modalProps.length = 0;
  vendors = [
    option({ id: "d1", displayName: "Alpha Hauling", type: "driver" }),
    option({ id: "r1", displayName: "Dallas Trailer Repair", type: "repairs" }),
  ];
});

const render = (value: string | null, driverType: "employee" | "contractor" = "contractor") =>
  renderToStaticMarkup(
    <VendorSelection value={value} onChange={() => {}} driverType={driverType} />,
  );

describe("VendorSelection", () => {
  it("shows the card of a driver's Driver vendor", () => {
    const markup = render("d1");
    expect(markup).toContain("Alpha Hauling");
    expect(markup).not.toContain("Please Assign a Vendor");
  });

  it("still shows the card when the driver's vendor was switched to Repairs (D11)", () => {
    const markup = render("r1");
    expect(markup).toContain("Dallas Trailer Repair");
    expect(markup).not.toContain("Please Assign a Vendor");
  });

  it("asks for a vendor when a contractor has none", () => {
    expect(render(null)).toContain("Please Assign a Vendor");
  });

  it("asks for a vendor when the id is not among the active vendors", () => {
    expect(render("gone")).toContain("Please Assign a Vendor");
  });

  it("says in-house drivers need no vendor", () => {
    expect(render(null, "employee")).toContain("required for in-house drivers");
  });

  it("opens the vendor window on Driver, for a new vendor, as the driver page's window (D10)", () => {
    render("d1");
    const first = modalProps[0];
    expect(first.defaultType).toBe("driver");
    expect(first.existingVendor ?? null).toBeNull();
    expect(first.isOpen).toBe(false);
    expect(first.onSave).toEqual(expect.any(Function));
  });
});
