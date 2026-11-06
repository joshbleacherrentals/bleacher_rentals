import { db } from "@/components/providers/SystemProvider";

/** Sentinel that matches no driver (inert query for "no driver"). */
const NO_DRIVER = "__none__";

export type AuditDriverInfo = {
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type AuditDriverInfoRow = {
  phone_number: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
};

/** The driver's contact facts from the local database. docs/specs/accountant-audit-02-driver-select.md §3 */
export function buildAuditDriverInfoQuery(driverUuid: string | null) {
  return db
    .selectFrom("Drivers as d")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .leftJoin("Addresses as a", "a.id", "d.address_uuid")
    .select([
      "d.phone_number as phone_number",
      "u.phone as phone",
      "u.email as email",
      "a.street as street",
      "a.city as city",
      "a.state_province as state_province",
      "a.zip_postal as zip_postal",
    ])
    .where("d.id", "=", driverUuid ?? NO_DRIVER)
    .limit(1);
}

const clean = (v: string | null | undefined) => v?.trim() || null;

/** R9: empty strings are missing; phone falls back from the driver's to the user's; the address is one line. */
export function toAuditDriverInfo(row: AuditDriverInfoRow | undefined | null): AuditDriverInfo {
  if (!row) return { address: null, phone: null, email: null };
  const stateAndZip = [row.state_province, row.zip_postal].map(clean).filter(Boolean).join(" ");
  const address = [row.street, row.city]
    .map(clean)
    .concat(stateAndZip || null)
    .filter(Boolean)
    .join(", ");
  return {
    address: address || null,
    phone: clean(row.phone_number) ?? clean(row.phone),
    email: clean(row.email),
  };
}
