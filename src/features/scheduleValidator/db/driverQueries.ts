import { db } from "@/components/providers/SystemProvider";

/**
 * The local-database queries behind the driver checks (Driver Workload, Driver Availability), for one
 * zone and one week. A driver is in the zone when one of their DriverZones rows is that zone; a sub-
 * select, not a join, so a driver in several zones is not repeated.
 */

/** Work trackers that are off: nobody is making the trip, so it adds no driving and needs no driver. */
export const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

/** The drivers linked to a zone. */
export function driverUuidsInZone(zoneId: string) {
  return db
    .selectFrom("DriverZones as dz")
    .select("dz.driver_uuid")
    .where("dz.zone_uuid", "=", zoneId);
}

/** The work trackers dated in the week, with their driver's name, for drivers in the zone. */
function zoneDriverTrips(zoneId: string, weekStart: string, weekEnd: string) {
  return db
    .selectFrom("WorkTrackers as w")
    .innerJoin("Drivers as d", "d.id", "w.driver_uuid")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .where("w.date", ">=", weekStart)
    .where("w.date", "<=", weekEnd)
    .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
    .where("w.driver_uuid", "in", driverUuidsInZone(zoneId));
}

/** Driver Workload: each trip's driver, date, haul drive time and deadhead drive times. */
export function driverWorkloadQuery(zoneId: string, weekStart: string, weekEnd: string) {
  return zoneDriverTrips(zoneId, weekStart, weekEnd)
    .select([
      "w.driver_uuid as driver_uuid",
      "w.date as date",
      "w.drive_minutes as drive_minutes",
      "w.deadhead_in_drive_minutes as deadhead_in_drive_minutes",
      "w.return_home_drive_minutes as return_home_drive_minutes",
      "w.distance_meters as distance_meters",
      "w.deadhead_in_distance_meters as deadhead_in_distance_meters",
      "w.return_home_distance_meters as return_home_distance_meters",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .compile();
}

/** Driver Availability: each trip's driver, date and where it goes from and to. */
export function driverAvailabilityTripsQuery(zoneId: string, weekStart: string, weekEnd: string) {
  return zoneDriverTrips(zoneId, weekStart, weekEnd)
    .leftJoin("Addresses as pa", "pa.id", "w.pickup_address_uuid")
    .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
    .select([
      "w.id as id",
      "w.date as date",
      "w.driver_uuid as driver_uuid",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "pa.street as pickup_street",
      "da.street as dropoff_street",
    ])
    .compile();
}

/** Driver Availability: the days in the week that drivers in the zone marked unavailable. */
export function driverUnavailabilityQuery(zoneId: string, weekStart: string, weekEnd: string) {
  return db
    .selectFrom("DriverUnavailability as du")
    .innerJoin("Drivers as d", "d.id", "du.driver_uuid")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .select([
      "du.driver_uuid as driver_uuid",
      "du.date_unavailable as date_unavailable",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .where("du.date_unavailable", ">=", weekStart)
    .where("du.date_unavailable", "<=", weekEnd)
    .where("du.driver_uuid", "in", driverUuidsInZone(zoneId))
    .compile();
}

/**
 * Driver Data: every active driver in the zone with their home address, for the data checks, and
 * whether the office excluded them from the model.
 */
export function driverDataQuery(zoneId: string) {
  return db
    .selectFrom("Drivers as d")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .leftJoin("Addresses as a", "a.id", "d.address_uuid")
    .select([
      "d.id as driver_uuid",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "d.address_uuid as address_uuid",
      "d.exclude_from_auto_work_trackers as exclude_from_auto_work_trackers",
      "a.street as street",
      "a.city as city",
      "a.state_province as state_province",
      "a.zip_postal as zip_postal",
      "a.country as country",
      "a.latitude as latitude",
      "a.longitude as longitude",
      "a.place_id as place_id",
    ])
    .where("d.is_active", "=", 1)
    .where("d.id", "in", driverUuidsInZone(zoneId))
    .compile();
}

/** Whether the account manager manages the zone (a row, or none). */
export function managesZoneQuery(accountManagerUuid: string, zoneId: string) {
  return db
    .selectFrom("AccountManagerZones as amz")
    .select("amz.id")
    .where("amz.account_manager_uuid", "=", accountManagerUuid)
    .where("amz.zone_uuid", "=", zoneId)
    .limit(1)
    .compile();
}

/** Each driver in the zone's user (the Users row their other pages are keyed by). */
/**
 * Whether each of the zone's drivers is an employee or a contractor: a contractor is paid through a
 * vendor (Drivers.vendor_uuid), an employee has none. The vendor's name when it is synced.
 */
export function driverKindsQuery(zoneId: string) {
  return db
    .selectFrom("Drivers as d")
    .leftJoin("Vendors as v", "v.id", "d.vendor_uuid")
    .select([
      "d.id as driver_uuid",
      "d.vendor_uuid as vendor_uuid",
      "v.display_name as vendor_name",
    ])
    .where("d.id", "in", driverUuidsInZone(zoneId))
    .compile();
}

export function driverUserUuidsQuery(zoneId: string) {
  return db
    .selectFrom("Drivers as d")
    .select(["d.id as driver_uuid", "d.user_uuid as user_uuid"])
    .where("d.id", "in", driverUuidsInZone(zoneId))
    .compile();
}
