import { describe, expect, it } from "vitest";
import {
  driverVendorChoices,
  emptyVendorForm,
  isEmptyVendorAddress,
  isValidEmail,
  isValidPhone,
  validateVendorForm,
  vendorColumns,
  vendorFormFromRecord,
  vendorRecordFromRow,
  vendorWindowMode,
  type VendorAddress,
  type VendorFormValues,
  type VendorOption,
  type VendorRecord,
  type VendorRow,
} from "./vendorForm";

// docs/specs/vendors-page.md §4.1 to §4.4 (D9 to D13, D16, D17): the types, the checks, the
// mapping to the columns and the pure rules the vendor window and the driver picker use.

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

const valid = (over: Partial<VendorFormValues> = {}): VendorFormValues => ({
  ...emptyVendorForm("repairs"),
  displayName: "Dallas Trailer Repair",
  ...over,
});

const record = (over: Partial<VendorRecord> = {}): VendorRecord => ({
  id: "v1",
  displayName: "Dallas Trailer Repair",
  type: "repairs",
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

describe("emptyVendorForm", () => {
  it("starts with no Type when none is given (D10: the Vendors page preselects nothing)", () => {
    expect(emptyVendorForm().type).toBe("");
  });

  it("starts on the given Type (D10: the driver page passes driver)", () => {
    expect(emptyVendorForm("driver").type).toBe("driver");
  });

  it("starts with the given Display Name, as the repair windows pass the text typed in the search", () => {
    const f = emptyVendorForm("repairs", "Dallas Trailer");
    expect(f.displayName).toBe("Dallas Trailer");
    expect(f.type).toBe("repairs");
    expect(emptyVendorForm("repairs").displayName).toBe("");
  });

  it("starts with every text empty, every service off and no address", () => {
    const f = emptyVendorForm();
    expect(f).toMatchObject({
      displayName: "",
      status: "",
      contactName: "",
      phone: "",
      contactEmail: "",
      ein: "",
      hst: "",
      notes: "",
      doesTrailerRepair: false,
      doesAluminumWelding: false,
      doesMobileRepair: false,
      isPartsSupplier: false,
      address: null,
      qboConnectionUuid: null,
      qboVendorId: null,
    });
  });
});

describe("isValidEmail (D12)", () => {
  it("accepts an empty email: it is optional", () => {
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("   ")).toBe(true);
  });

  it("accepts text@text.text", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("sam.jones@repair-shop.com")).toBe(true);
  });

  it.each(["a@b", "a b@c.d", "@b.co", "a@.co", "plain"])("refuses %s", (v) => {
    expect(isValidEmail(v)).toBe(false);
  });
});

describe("isValidPhone (D12)", () => {
  it("accepts an empty phone: it is optional", () => {
    expect(isValidPhone("")).toBe(true);
    expect(isValidPhone("  ")).toBe(true);
  });

  it.each([
    ["+1 (214) 555-0182", "11 digits"],
    ["214-555-0182", "10 digits"],
    ["+380 44 123 4567", "12 digits"],
    ["1234567", "7 digits, the lowest"],
    ["123456789012345", "15 digits, the highest"],
    ["214.555.0182", "dots"],
  ])("accepts %s (%s)", (v) => {
    expect(isValidPhone(v)).toBe(true);
  });

  it.each([
    ["123456", "6 digits"],
    ["1234567890123456", "16 digits"],
    ["214-555-CALL", "letters"],
    ["214/555/0182", "a slash"],
    ["ext. 12 345 678", "letters among the digits"],
  ])("refuses %s (%s)", (v) => {
    expect(isValidPhone(v)).toBe(false);
  });
});

describe("validateVendorForm (D9, D10, D12)", () => {
  it("passes a vendor with a name and a type", () => {
    expect(validateVendorForm(valid())).toBeNull();
  });

  it("refuses an empty or blank Display Name", () => {
    expect(validateVendorForm(valid({ displayName: "" }))?.title).toBe("Display name required");
    expect(validateVendorForm(valid({ displayName: "   " }))?.title).toBe("Display name required");
  });

  it("refuses a missing Type with 'Type required' (D10)", () => {
    expect(validateVendorForm(valid({ type: "" }))?.title).toBe("Type required");
  });

  it("checks the name before the type", () => {
    expect(validateVendorForm(valid({ displayName: "", type: "" }))?.title).toBe(
      "Display name required",
    );
  });

  it("checks EIN as before: nine digits once the signs are removed, or empty", () => {
    expect(validateVendorForm(valid({ ein: "12-3456789" }))).toBeNull();
    expect(validateVendorForm(valid({ ein: "" }))).toBeNull();
    expect(validateVendorForm(valid({ ein: "12-34567" }))?.title).toBe("Invalid EIN");
  });

  it("checks HST as before: 9 digits, 2 capital letters, 4 digits, or empty", () => {
    expect(validateVendorForm(valid({ hst: "123456789RT0001" }))).toBeNull();
    expect(validateVendorForm(valid({ hst: "123456789rt0001" }))?.title).toBe("Invalid HST number");
    expect(validateVendorForm(valid({ hst: "12345" }))?.title).toBe("Invalid HST number");
  });

  it("checks an email, when filled", () => {
    expect(validateVendorForm(valid({ contactEmail: "sam@shop.com" }))).toBeNull();
    expect(validateVendorForm(valid({ contactEmail: "sam@shop" }))?.title).toBe("Invalid email");
  });

  it("checks a phone, when filled", () => {
    expect(validateVendorForm(valid({ phone: "214-555-0182" }))).toBeNull();
    expect(validateVendorForm(valid({ phone: "12345" }))?.title).toBe("Invalid phone number");
  });

  it("gives every refusal a title and a line", () => {
    const e = validateVendorForm(valid({ type: "" }));
    expect(e?.title).toBeTruthy();
    expect(e?.message).toBeTruthy();
  });
});

describe("vendorColumns (D12, D13)", () => {
  it("maps empty texts to null, keeps EIN as digits and passes the type", () => {
    const cols = vendorColumns(valid({ ein: "12-3456789", hst: "" }), null, null);
    expect(cols).toMatchObject({
      display_name: "Dallas Trailer Repair",
      type: "repairs",
      status: null,
      ein: "123456789",
      hst: null,
      phone: null,
      contact_name: null,
      contact_email: null,
      notes: null,
      address_uuid: null,
      logo_url: null,
      qbo_vendor_id: null,
      qbo_connection_uuid: null,
    });
  });

  it("stores the phone and the email as typed, trimmed at the ends", () => {
    const cols = vendorColumns(
      valid({ phone: " +1 (214) 555-0182 ", contactEmail: " sam@shop.com ", contactName: " Sam " }),
      null,
      null,
    );
    expect(cols.phone).toBe("+1 (214) 555-0182");
    expect(cols.contact_email).toBe("sam@shop.com");
    expect(cols.contact_name).toBe("Sam");
  });

  it("writes the four services as 0 and 1", () => {
    const cols = vendorColumns(
      valid({ doesTrailerRepair: true, isPartsSupplier: true }),
      null,
      null,
    );
    expect(cols).toMatchObject({
      does_trailer_repair: 1,
      does_aluminum_welding: 0,
      does_mobile_repair: 0,
      is_parts_supplier: 1,
    });
  });

  it("carries the status, the QuickBooks ids, the logo and the address id", () => {
    const cols = vendorColumns(
      valid({ status: "verified", qboConnectionUuid: "c1", qboVendorId: "q9", notes: "Good" }),
      "addr-1",
      "https://x/logo.png",
    );
    expect(cols).toMatchObject({
      status: "verified",
      qbo_connection_uuid: "c1",
      qbo_vendor_id: "q9",
      notes: "Good",
      address_uuid: "addr-1",
      logo_url: "https://x/logo.png",
    });
  });
});

describe("isEmptyVendorAddress (D13)", () => {
  it("is empty with no street, city and state", () => {
    expect(isEmptyVendorAddress(null)).toBe(true);
    expect(isEmptyVendorAddress({ ...address, street: "", city: "", stateProvince: "" })).toBe(
      true,
    );
  });

  it("is not empty with a street, a city or a state", () => {
    expect(isEmptyVendorAddress(address)).toBe(false);
    expect(isEmptyVendorAddress({ ...address, street: "", stateProvince: "" })).toBe(false);
  });
});

describe("vendorFormFromRecord", () => {
  it("turns nulls into empty texts and keeps the type, the status and the address", () => {
    const f = vendorFormFromRecord(
      record({ status: "caution", ein: "123456789", address, doesMobileRepair: true }),
    );
    expect(f).toMatchObject({
      displayName: "Dallas Trailer Repair",
      type: "repairs",
      status: "caution",
      ein: "123456789",
      phone: "",
      notes: "",
      doesMobileRepair: true,
      address,
    });
  });
});

describe("vendorRecordFromRow (§4.3)", () => {
  const row = (over: Partial<VendorRow> = {}): VendorRow => ({
    id: "v1",
    display_name: "Dallas Trailer Repair",
    type: "repairs",
    logo_url: null,
    qbo_vendor_id: null,
    qbo_connection_uuid: null,
    is_active: 1,
    ein: null,
    hst: null,
    status: "verified",
    phone: "214-555-0182",
    contact_name: "Sam",
    contact_email: "sam@shop.com",
    does_trailer_repair: 1,
    does_aluminum_welding: 0,
    does_mobile_repair: null,
    is_parts_supplier: 1,
    notes: "n",
    address_uuid: "a1",
    address_street: "1 Shop Rd",
    address_city: "Dallas",
    address_state_province: "TX",
    address_zip_postal: "75201",
    address_country: "US",
    address_latitude: 32.78,
    address_longitude: -96.8,
    address_place_id: "place-1",
    ...over,
  });

  it("maps 0/1 to booleans, null to false, and the joined address", () => {
    const r = vendorRecordFromRow(row());
    expect(r).toMatchObject({
      id: "v1",
      displayName: "Dallas Trailer Repair",
      type: "repairs",
      isActive: true,
      status: "verified",
      doesTrailerRepair: true,
      doesAluminumWelding: false,
      doesMobileRepair: false,
      isPartsSupplier: true,
      addressUuid: "a1",
    });
    expect(r.address).toEqual(address);
  });

  it("reads a vendor with no address", () => {
    const r = vendorRecordFromRow(
      row({
        address_uuid: null,
        address_street: null,
        address_city: null,
        address_state_province: null,
        address_zip_postal: null,
        address_country: null,
        address_latitude: null,
        address_longitude: null,
        address_place_id: null,
      }),
    );
    expect(r.addressUuid).toBeNull();
    expect(r.address).toBeNull();
  });

  it("keeps the address id when the address row has not synced yet", () => {
    const r = vendorRecordFromRow(
      row({
        address_street: null,
        address_city: null,
        address_state_province: null,
        address_zip_postal: null,
        address_country: null,
        address_latitude: null,
        address_longitude: null,
        address_place_id: null,
      }),
    );
    expect(r.addressUuid).toBe("a1");
    expect(r.address).toBeNull();
  });

  it("treats a missing or unknown type as driver and an unknown status as none", () => {
    expect(vendorRecordFromRow(row({ type: null })).type).toBe("driver");
    expect(vendorRecordFromRow(row({ type: "nonsense" })).type).toBe("driver");
    expect(vendorRecordFromRow(row({ status: "nonsense" })).status).toBeNull();
    expect(vendorRecordFromRow(row({ status: null })).status).toBeNull();
  });

  it("reads is_active 0 as deleted", () => {
    expect(vendorRecordFromRow(row({ is_active: 0 })).isActive).toBe(false);
  });

  it("names an unnamed vendor 'Unknown Vendor' as the old hook did", () => {
    expect(vendorRecordFromRow(row({ display_name: null })).displayName).toBe("Unknown Vendor");
  });
});

describe("vendorWindowMode (§4.1, D16, D17)", () => {
  it("is create with no vendor", () => {
    expect(vendorWindowMode({ existingVendor: null, readOnly: false })).toBe("create");
    expect(vendorWindowMode({ existingVendor: undefined, readOnly: undefined })).toBe("create");
  });

  it("is edit for an active vendor", () => {
    expect(vendorWindowMode({ existingVendor: record(), readOnly: false })).toBe("edit");
  });

  it("is deleted for a deleted vendor", () => {
    expect(vendorWindowMode({ existingVendor: record({ isActive: false }), readOnly: false })).toBe(
      "deleted",
    );
  });

  it("is read-only whenever readOnly is set, a deleted vendor included (D16)", () => {
    expect(vendorWindowMode({ existingVendor: record(), readOnly: true })).toBe("read-only");
    expect(vendorWindowMode({ existingVendor: record({ isActive: false }), readOnly: true })).toBe(
      "read-only",
    );
  });
});

describe("driverVendorChoices (D11)", () => {
  const option = (over: Partial<VendorOption>): VendorOption => ({
    ...record(),
    driverCount: 0,
    ...over,
  });
  const list = [
    option({ id: "a", displayName: "Alpha Hauling", type: "driver" }),
    option({ id: "b", displayName: "Dallas Trailer Repair", type: "repairs" }),
    option({ id: "c", displayName: "Delta Transport", type: "driver" }),
  ];

  it("lists only the driver vendors", () => {
    expect(driverVendorChoices(list, "").map((v) => v.id)).toEqual(["a", "c"]);
  });

  it("keeps the search of the picker: by name, not case-sensitive", () => {
    expect(driverVendorChoices(list, "DELTA").map((v) => v.id)).toEqual(["c"]);
    expect(driverVendorChoices(list, "dallas")).toEqual([]);
  });
});
