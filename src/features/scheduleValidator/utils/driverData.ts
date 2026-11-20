/**
 * Driver Data: what each driver needs on file for the work tracker model to plan with them. Each
 * requirement is one entry in DRIVER_REQUIREMENTS; adding a check is adding an entry (and selecting
 * what it reads in driverDataQuery). Pure: no database.
 */

/** A driver's home address as stored, null when the driver has none linked. */
export type DriverAddress = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/** One driver in the zone and the data the requirements read. */
export type DriverDataInput = {
  driverUuid: string;
  driverName: string;
  address: DriverAddress | null;
};

/** How one driver did on one requirement: ok, or what is missing. */
export type RequirementResult = { ok: boolean; problem: string | null };

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
  results: Record<string, RequirementResult>;
  /** Every requirement passed. */
  ok: boolean;
};

const ADDRESS_FIELDS: { field: keyof DriverAddress; label: string }[] = [
  { field: "street", label: "street" },
  { field: "city", label: "city" },
  { field: "state_province", label: "state/province" },
  { field: "zip_postal", label: "zip/postal code" },
  { field: "country", label: "country" },
  { field: "latitude", label: "latitude" },
  { field: "longitude", label: "longitude" },
  { field: "place_id", label: "Google place" },
];

const isBlank = (value: string | number | null) =>
  value === null || (typeof value === "string" && value.trim() === "");

/** The home address, with every column filled: the model measures distance from its coordinates. */
export const ADDRESS_REQUIREMENT: DriverRequirement = {
  key: "address",
  label: "Address",
  why: "The model measures each driver's distance to a pickup from their home address's coordinates.",
  check: ({ address }) => {
    if (!address) return { ok: false, problem: "No home address" };
    const missing = ADDRESS_FIELDS.filter(({ field }) => isBlank(address[field])).map(
      ({ label }) => label,
    );
    return missing.length === 0
      ? { ok: true, problem: null }
      : { ok: false, problem: `Missing ${missing.join(", ")}` };
  },
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
        results,
        ok: Object.values(results).every((r) => r.ok),
      };
    })
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}
