export type DriverKind = { kind: "employee" } | { kind: "contractor"; vendorName: string | null };

/** A driver paid through a vendor is a contractor; one with no vendor is an employee. Pure. */
export function driverKindOf(row: {
  vendor_uuid: string | null;
  vendor_name: string | null;
}): DriverKind {
  return row.vendor_uuid
    ? { kind: "contractor", vendorName: row.vendor_name }
    : { kind: "employee" };
}
