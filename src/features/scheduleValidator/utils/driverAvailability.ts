/**
 * The driver-availability check: a work tracker is fine when its driver has not marked that date as
 * unavailable. Pure: dates are "YYYY-MM-DD" strings.
 */

/** A work tracker that has a driver. */
export type DriverTrip = {
  workTrackerId: string;
  date: string;
  driverUuid: string;
  driverName: string;
  fromStreet: string | null;
  toStreet: string | null;
};

/** A date a driver said they cannot work (a DriverUnavailability row). */
export type Unavailability = { driverUuid: string; date: string };

export type DriverTripCheck = DriverTrip & { available: boolean };

/** Each trip with whether its driver is free that day, ordered by date, driver name, then id. */
export function checkDriverAvailability(
  trips: DriverTrip[],
  unavailability: Unavailability[],
): DriverTripCheck[] {
  const blocked = new Set(unavailability.map((u) => `${u.driverUuid}|${u.date}`));
  return trips
    .map((trip) => ({ ...trip, available: !blocked.has(`${trip.driverUuid}|${trip.date}`) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.driverName.localeCompare(b.driverName) ||
        a.workTrackerId.localeCompare(b.workTrackerId),
    );
}
