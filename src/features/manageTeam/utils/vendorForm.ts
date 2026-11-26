/**
 * Everything the vendor window and the Vendors page know about one vendor that is not React: the
 * types, the form values, the checks, the mapping to the columns and to a record, and the rules
 * of the window's four modes. Spec: docs/specs/vendors-page.md §4.
 */

export type VendorType = "driver" | "repairs";
export type VendorStatus = "verified" | "caution" | "under_review" | "prospect" | "do_not_use";

export type VendorAddress = {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

/** One vendor as the window and the list read it. */
export type VendorRecord = {
  id: string;
  displayName: string;
  type: VendorType;
  isActive: boolean;
  logoUrl: string | null;
  qboVendorId: string | null;
  qboConnectionUuid: string | null;
  ein: string | null;
  hst: string | null;
  status: VendorStatus | null;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  doesTrailerRepair: boolean;
  doesAluminumWelding: boolean;
  doesMobileRepair: boolean;
  isPartsSupplier: boolean;
  notes: string | null;
  addressUuid: string | null;
  address: VendorAddress | null;
};

/** A vendor record with the number of drivers that have it. */
export type VendorOption = VendorRecord & { driverCount: number };

export type EditVendorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The driver page passes it: "Save & Assign" shows, and gets the vendor's id. */
  onSave?: (vendorId: string) => void;
  /** The Type a new vendor starts with. The driver page passes "driver"; /vendors passes none. */
  defaultType?: VendorType;
  /** null or absent: a new vendor. */
  existingVendor?: VendorRecord | null;
  /** A viewer: every field locked, only Close, no QuickBooks block (D16). */
  readOnly?: boolean;
  /**
   * The Display Name a new vendor starts with. The repair windows pass the text typed in the
   * search of their Vendor select (docs/specs/vendors-page.md D27).
   */
  initialName?: string;
  /**
   * Called after a new vendor is created, with its id and name. The repair windows select it
   * (D26). Not called for an edit.
   */
  onCreated?: (vendor: { id: string; displayName: string }) => void;
  /**
   * Classes for the window's layer, a `z-[...]` class, when it opens over another window: the
   * repair windows pass theirs, so this one lies over them (D28).
   */
  layerClassName?: string;
};

export const VENDOR_TYPES: readonly VendorType[] = ["driver", "repairs"];
export const VENDOR_STATUSES: readonly VendorStatus[] = [
  "verified",
  "caution",
  "under_review",
  "prospect",
  "do_not_use",
];

/** What the inputs of the window hold. Texts are strings; "" means nothing is chosen or typed. */
export type VendorFormValues = {
  displayName: string;
  type: VendorType | "";
  status: VendorStatus | "";
  qboConnectionUuid: string | null;
  qboVendorId: string | null;
  address: VendorAddress | null;
  contactName: string;
  phone: string;
  contactEmail: string;
  doesTrailerRepair: boolean;
  doesAluminumWelding: boolean;
  doesMobileRepair: boolean;
  isPartsSupplier: boolean;
  ein: string;
  hst: string;
  notes: string;
};

/** D10: a new vendor starts on the given Type, or on none; D27: and on the given name, or none. */
export function emptyVendorForm(defaultType?: VendorType, displayName = ""): VendorFormValues {
  return {
    displayName,
    type: defaultType ?? "",
    status: "",
    qboConnectionUuid: null,
    qboVendorId: null,
    address: null,
    contactName: "",
    phone: "",
    contactEmail: "",
    doesTrailerRepair: false,
    doesAluminumWelding: false,
    doesMobileRepair: false,
    isPartsSupplier: false,
    ein: "",
    hst: "",
    notes: "",
  };
}

export function vendorFormFromRecord(v: VendorRecord): VendorFormValues {
  return {
    displayName: v.displayName,
    type: v.type,
    status: v.status ?? "",
    qboConnectionUuid: v.qboConnectionUuid,
    qboVendorId: v.qboVendorId,
    address: v.address,
    contactName: v.contactName ?? "",
    phone: v.phone ?? "",
    contactEmail: v.contactEmail ?? "",
    doesTrailerRepair: v.doesTrailerRepair,
    doesAluminumWelding: v.doesAluminumWelding,
    doesMobileRepair: v.doesMobileRepair,
    isPartsSupplier: v.isPartsSupplier,
    ein: v.ein ?? "",
    hst: v.hst ?? "",
    notes: v.notes ?? "",
  };
}

// ── The checks (D12) ──────────────────────────────────────────────────────────

/** Optional; when filled it must look like text@text.text. */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Optional; when filled: digits, spaces and + - ( ) . only, with 7 to 15 digits. */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (!/^[\d\s+\-().]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

export type VendorFormError = { title: string; message: string };

/** The first refusal, in the order of the form, or null when the form may be saved. */
export function validateVendorForm(values: VendorFormValues): VendorFormError | null {
  if (!values.displayName.trim()) {
    return { title: "Display name required", message: "Please enter a display name" };
  }
  if (!values.type) {
    return { title: "Type required", message: "Please choose Driver or Repairs" };
  }
  const einDigits = values.ein.replace(/\D/g, "");
  if (einDigits && !/^\d{9}$/.test(einDigits)) {
    return { title: "Invalid EIN", message: "EIN must be exactly 9 digits (e.g. 12-3456789)" };
  }
  if (values.hst && !/^\d{9}[A-Z]{2}\d{4}$/.test(values.hst)) {
    return {
      title: "Invalid HST number",
      message: "HST must be 9 digits, 2 letters, then 4 digits (e.g. 123456789RT0001)",
    };
  }
  if (!isValidEmail(values.contactEmail)) {
    return { title: "Invalid email", message: "Enter an email like name@company.com" };
  }
  if (!isValidPhone(values.phone)) {
    return {
      title: "Invalid phone number",
      message: "Use 7 to 15 digits; spaces and + - ( ) . are allowed",
    };
  }
  return null;
}

// ── The columns (D12, D13) ────────────────────────────────────────────────────

const orNull = (text: string): string | null => {
  const t = text.trim();
  return t ? t : null;
};

/**
 * The `Vendors` columns the window writes, for an insert and for an update alike. Empty texts are
 * stored as null, EIN as digits only, the four services as 0 and 1 (the local table has no
 * booleans). `type` must be chosen: `validateVendorForm` runs first.
 */
export function vendorColumns(
  values: VendorFormValues,
  addressUuid: string | null,
  logoUrl: string | null,
) {
  return {
    display_name: values.displayName,
    type: (values.type || "driver") as VendorType,
    status: values.status || null,
    qbo_vendor_id: values.qboVendorId,
    qbo_connection_uuid: values.qboConnectionUuid,
    logo_url: logoUrl,
    ein: values.ein.replace(/\D/g, "") || null,
    hst: values.hst || null,
    phone: orNull(values.phone),
    contact_name: orNull(values.contactName),
    contact_email: orNull(values.contactEmail),
    does_trailer_repair: values.doesTrailerRepair ? 1 : 0,
    does_aluminum_welding: values.doesAluminumWelding ? 1 : 0,
    does_mobile_repair: values.doesMobileRepair ? 1 : 0,
    is_parts_supplier: values.isPartsSupplier ? 1 : 0,
    notes: orNull(values.notes),
    address_uuid: addressUuid,
  };
}

/** D13: no street, city or state: nothing worth storing. */
export function isEmptyVendorAddress(a: VendorAddress | null | undefined): boolean {
  return !a || (!a.street && !a.city && !a.stateProvince);
}

// ── Reading a vendor (§4.3) ───────────────────────────────────────────────────

/** One row of the vendor query: the vendor, its driver-less columns, and the joined address. */
export type VendorRow = {
  id: string;
  display_name: string | null;
  type: string | null;
  logo_url: string | null;
  qbo_vendor_id: string | null;
  qbo_connection_uuid: string | null;
  is_active: number | null;
  ein: string | null;
  hst: string | null;
  status: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  does_trailer_repair: number | null;
  does_aluminum_welding: number | null;
  does_mobile_repair: number | null;
  is_parts_supplier: number | null;
  notes: string | null;
  address_uuid: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state_province: string | null;
  address_zip_postal: string | null;
  address_country: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  address_place_id: string | null;
};

const asStatus = (value: string | null): VendorStatus | null =>
  (VENDOR_STATUSES as readonly string[]).includes(value ?? "") ? (value as VendorStatus) : null;

export function vendorRecordFromRow(row: VendorRow): VendorRecord {
  const hasAddressRow =
    row.address_uuid !== null &&
    (row.address_street !== null ||
      row.address_city !== null ||
      row.address_state_province !== null);
  return {
    id: row.id,
    displayName: row.display_name || "Unknown Vendor",
    type: row.type === "repairs" ? "repairs" : "driver",
    isActive: row.is_active === 1,
    logoUrl: row.logo_url,
    qboVendorId: row.qbo_vendor_id,
    qboConnectionUuid: row.qbo_connection_uuid,
    ein: row.ein,
    hst: row.hst,
    status: asStatus(row.status),
    phone: row.phone,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    doesTrailerRepair: row.does_trailer_repair === 1,
    doesAluminumWelding: row.does_aluminum_welding === 1,
    doesMobileRepair: row.does_mobile_repair === 1,
    isPartsSupplier: row.is_parts_supplier === 1,
    notes: row.notes,
    addressUuid: row.address_uuid,
    address: hasAddressRow
      ? {
          street: row.address_street ?? "",
          city: row.address_city ?? "",
          stateProvince: row.address_state_province ?? "",
          zipPostal: row.address_zip_postal,
          country: row.address_country,
          latitude: row.address_latitude,
          longitude: row.address_longitude,
          placeId: row.address_place_id,
        }
      : null,
  };
}

// ── The window's modes (§4.1) and the driver picker (D11) ─────────────────────

export type VendorWindowMode = "create" | "edit" | "deleted" | "read-only";

/** `readOnly` wins, a deleted vendor opened read-only included (D16). */
export function vendorWindowMode(params: {
  existingVendor?: VendorRecord | null;
  readOnly?: boolean;
}): VendorWindowMode {
  if (params.readOnly) return "read-only";
  if (!params.existingVendor) return "create";
  return params.existingVendor.isActive ? "edit" : "deleted";
}

/**
 * The list the driver page offers to choose from: Driver vendors only (D11), narrowed by the
 * picker's search (by name, not case-sensitive). The selected card is NOT looked up here: it is
 * found among all active vendors, so a driver whose vendor is a Repairs vendor still sees it.
 */
export function driverVendorChoices<T extends VendorRecord>(vendors: T[], search: string): T[] {
  const needle = search.toLowerCase();
  return vendors.filter((v) => v.type === "driver" && v.displayName.toLowerCase().includes(needle));
}
