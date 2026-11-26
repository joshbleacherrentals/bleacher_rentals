import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/AddressAutoComplete", () => ({
  default: (props: { initialValue?: string }) => (
    <div data-testid="address-autocomplete" data-initial={props.initialValue ?? ""} />
  ),
  formatAddressLine: (f: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  }) => [f.street, f.city, f.state, f.postalCode].filter(Boolean).join(", "),
}));
vi.mock("@/features/manageTeam/components/inputs/SelectQboVendorSimple", () => ({
  SelectQboVendorSimple: () => <div data-testid="qbo-vendor-select" />,
}));

import {
  VendorFormFields,
  VendorWindowFooter,
  type VendorFormFieldsProps,
} from "./VendorFormFields";
import { emptyVendorForm, type VendorAddress, type VendorFormValues } from "../utils/vendorForm";

// docs/specs/vendors-page.md §4.2 (D9, D10, D13, D14, D15, D16, D17): what the window's fields and
// buttons look like in each of its four modes. The dialog is drawn in a portal, which the server
// renderer cannot show, so the inside of the window is exported and tested here.

const address: VendorAddress = {
  street: "1 Shop Rd",
  city: "Dallas",
  stateProvince: "TX",
  zipPostal: "75201",
  country: "US",
  latitude: 32.78,
  longitude: -96.8,
  placeId: "place-1",
};

const fieldsProps = (
  over: Partial<VendorFormFieldsProps> = {},
  values: Partial<VendorFormValues> = {},
): VendorFormFieldsProps => ({
  values: { ...emptyVendorForm(), displayName: "Dallas Trailer Repair", ...values },
  onChange: () => {},
  onAddressSelect: () => {},
  onAddressClear: () => {},
  addressKey: 0,
  locked: false,
  showQuickBooks: true,
  qboConnections: [{ id: "c1", display_name: "Main QuickBooks" }],
  logo: {
    preview: null,
    url: null,
    method: "upload",
    onMethodChange: () => {},
    onFile: () => {},
    onUrl: () => {},
    onRemove: () => {},
  },
  ...over,
});

const html = (over: Partial<VendorFormFieldsProps> = {}, values: Partial<VendorFormValues> = {}) =>
  renderToStaticMarkup(<VendorFormFields {...fieldsProps(over, values)} />);

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("VendorFormFields: the fields (D9)", () => {
  it("has every field of the window: the old ones and the new ones", () => {
    const t = text(html());
    for (const label of [
      "Display Name",
      "Type",
      "Status",
      "QuickBooks Connection",
      "QuickBooks Vendor",
      "Address",
      "Contact name",
      "Phone",
      "Email",
      "Services",
      "Trailer repair",
      "Aluminum welding",
      "Mobile repair",
      "Parts supplier",
      "Notes",
      "Logo",
    ]) {
      expect(t, label).toContain(label);
    }
    expect(html()).toContain('id="displayName"');
  });

  it("shows the display name that was typed", () => {
    expect(html()).toContain('value="Dallas Trailer Repair"');
  });

  it("Type starts empty with a prompt when nothing is chosen (D10)", () => {
    const m = html({}, { type: "" });
    expect(m).toContain("Select a type");
    expect(m).toContain(">Driver</option>");
    expect(m).toContain(">Repairs</option>");
  });

  it("Type has no empty option once it is chosen", () => {
    const m = html({}, { type: "repairs" });
    expect(m).not.toContain("Select a type");
    expect(m).toMatch(/<option value="repairs" selected="">Repairs<\/option>/);
  });

  it("Status offers 'No status' and the five statuses", () => {
    const m = html();
    for (const label of [
      "No status",
      "Verified",
      "Caution",
      "Under review",
      "Prospect",
      "Do not use",
    ]) {
      expect(m, label).toContain(`>${label}</option>`);
    }
  });

  it("marks the services that are on", () => {
    const m = html({}, { doesAluminumWelding: true });
    expect(m).toMatch(/id="vendorServiceDoesAluminumWelding"[^>]*checked=""/);
    expect(m).not.toMatch(/id="vendorServiceDoesTrailerRepair"[^>]*checked=""/);
  });

  it("shows the stored address in the address field and a button to clear it (D13)", () => {
    const m = html({}, { address });
    expect(m).toContain('data-initial="1 Shop Rd, Dallas, TX, 75201"');
    expect(m).toContain("Clear address");
  });

  it("shows no Clear address button when there is no address", () => {
    const m = html({}, { address: null });
    expect(m).toContain('data-testid="address-autocomplete"');
    expect(m).not.toContain("Clear address");
  });
});

describe("VendorFormFields: locked and the QuickBooks block (D14, D16, D17)", () => {
  it("locks every field in a disabled fieldset when locked", () => {
    expect(html({ locked: true })).toMatch(/<fieldset[^>]*disabled=""/);
  });

  it("does not lock the fields when not locked", () => {
    expect(html({ locked: false })).not.toMatch(/<fieldset[^>]*disabled=""/);
  });

  it("shows the QuickBooks block with the connections", () => {
    const m = html({ showQuickBooks: true });
    expect(text(m)).toContain("QuickBooks Connection");
    expect(m).toContain("Main QuickBooks");
    expect(m).toContain('data-testid="qbo-vendor-select"');
  });

  it("leaves the QuickBooks block out when it is hidden (the viewer's window)", () => {
    const m = html({ showQuickBooks: false });
    expect(text(m)).not.toContain("QuickBooks");
    expect(m).not.toContain('data-testid="qbo-vendor-select"');
  });
});

describe("VendorWindowFooter: the buttons of each mode (D15, D16, D17)", () => {
  const footer = (over: Partial<Parameters<typeof VendorWindowFooter>[0]> = {}): string =>
    renderToStaticMarkup(
      <VendorWindowFooter
        mode="edit"
        canAssign={false}
        isSaving={false}
        onDelete={() => {}}
        onCancel={() => {}}
        onSave={() => {}}
        onSaveAndAssign={() => {}}
        onRestore={() => {}}
        onClose={() => {}}
        {...over}
      />,
    );
  const buttons = (markup: string) =>
    [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) =>
      text(m[1]).replace(/&amp;/g, "&"),
    );

  it("create: Cancel and Save", () => {
    expect(buttons(footer({ mode: "create" }))).toEqual(["Cancel", "Save"]);
  });

  it("create from the driver page: Cancel, Save and Save & Assign", () => {
    expect(buttons(footer({ mode: "create", canAssign: true }))).toEqual([
      "Cancel",
      "Save",
      "Save & Assign",
    ]);
  });

  it("edit: Delete, Cancel and Save", () => {
    expect(buttons(footer({ mode: "edit" }))).toEqual(["Delete", "Cancel", "Save"]);
  });

  it("edit from the driver page: also Save & Assign", () => {
    expect(buttons(footer({ mode: "edit", canAssign: true }))).toEqual([
      "Delete",
      "Cancel",
      "Save",
      "Save & Assign",
    ]);
  });

  it("deleted: Restore and Close, no Save and no Delete (D17)", () => {
    expect(buttons(footer({ mode: "deleted" }))).toEqual(["Restore", "Close"]);
  });

  it("read-only: only Close, whatever else is passed (D16)", () => {
    expect(buttons(footer({ mode: "read-only", canAssign: true }))).toEqual(["Close"]);
  });

  it("shows 'Saving...' while it saves", () => {
    expect(buttons(footer({ mode: "create", isSaving: true }))).toEqual(["Cancel", "Saving..."]);
  });
});
