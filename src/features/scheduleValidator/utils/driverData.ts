/**
 * Driver Data: what each driver needs on file for the work tracker model to plan with them. Each
 * requirement is one entry in DRIVER_REQUIREMENTS; adding a check is adding an entry (and selecting
 * what it reads in driverDataQuery). Pure: no database.
 */

import { checkAddress, type RequirementResult, type StoredAddress } from "./addressCheck";

export type { RequirementResult };
/** A driver's home address as stored, null when the driver has none linked. */
export type DriverAddress = StoredAddress;

/** One driver in the zone and the data the requirements read. */
export type DriverDataInput = {
  driverUuid: string;
  driverName: string;
  /** The Addresses row the driver points at, null when none. */
  addressUuid: string | null;
  address: DriverAddress | null;
  /** Left out of the Auto Work Trackers model by the office: never given a trip. */
  excluded: boolean;
};

export type DriverRequirement = {
  key: string;
  label: string;
  /** Why the model needs it, shown on the column heading. */
  why: string;
  check: (driver: DriverDataInput) => RequirementResult;
};

export type DriverData = {
  driverUuid: string;
  driverName: string;
  addressUuid: string | null;
  address: DriverAddress | null;
  excluded: boolean;
  results: Record<string, RequirementResult>;
  /** Every requirement passed. */
  ok: boolean;
};

/** The home address, with every column filled: the model measures distance from its coordinates. */
export const ADDRESS_REQUIREMENT: DriverRequirement = {
  key: "address",
  label: "Address",
  why: "The model measures each driver's distance to a pickup from their home address's coordinates.",
  check: ({ address }) => checkAddress(address, "No home address"),
};

/** Every requirement, in column order. */
export const DRIVER_REQUIREMENTS: DriverRequirement[] = [ADDRESS_REQUIREMENT];

/** Each driver's result on every requirement, sorted by name. */
export function buildDriverData(
  drivers: DriverDataInput[],
  requirements: DriverRequirement[] = DRIVER_REQUIREMENTS,
): DriverData[] {
  return drivers
    .map((driver) => {
      const results = Object.fromEntries(requirements.map((r) => [r.key, r.check(driver)]));
      return {
        driverUuid: driver.driverUuid,
        driverName: driver.driverName,
        addressUuid: driver.addressUuid,
        address: driver.address,
        excluded: driver.excluded,
        results,
        ok: Object.values(results).every((r) => r.ok),
      };
    })
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}
