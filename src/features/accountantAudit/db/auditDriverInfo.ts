import { db } from "@/components/providers/SystemProvider";
import { isDriverInactive } from "../utils/auditDrivers";

/** Sentinel that matches no driver (inert query for "no driver"). */
const NO_DRIVER = "__none__";

export type AuditDriverInfo = {
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Spec 05 (R13, R14): the heading of the driver page. */
  firstName: string;
  lastName: string;
  isInactive: boolean;
};

export type AuditDriverInfoRow = {
  /** The driver's id: the hook uses it to tell an answer for this driver from a stale one. */
  id: string;
  first_name: string | null;
  last_name: string | null;
  is_active: number | null;
  status_uuid: string | null;
  phone_number: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
};

/**
 * The driver's contact facts, and their name and inactive flag for the heading, from the local
 * database. docs/specs/accountant-audit-02-driver-select.md §3; accountant-audit-05 R13, R14.
 */
export function buildAuditDriverInfoQuery(driverUuid: string | null) {
  return db
    .selectFrom("Drivers as d")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .leftJoin("Addresses as a", "a.id", "d.address_uuid")
    .select([
      "d.id as id",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "d.is_active as is_active",
      "u.status_uuid as status_uuid",
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
  if (!row) {
    return {
      address: null,
      phone: null,
      email: null,
      firstName: "",
      lastName: "",
      isInactive: false,
    };
  }
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
    firstName: clean(row.first_name) ?? "",
    lastName: clean(row.last_name) ?? "",
    isInactive: isDriverInactive(row),
  };
}
