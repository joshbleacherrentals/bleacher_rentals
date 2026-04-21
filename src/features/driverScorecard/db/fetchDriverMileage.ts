import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";
import { DriverMileageData, DriverMileageRow } from "../types";

export async function fetchDriverMileage(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
): Promise<DriverMileageData> {
  // Fetch active drivers with their user info and pay unit
  const { data: drivers, error: driversError } = await supabase
    .from("Drivers")
    .select(
      `
      id,
      pay_per_unit,
      user:Users!Drivers_user_uuid_fkey(
        id,
        first_name,
        last_name
      )
    `,
    )
    .eq("is_active", true);

  if (driversError) throw driversError;

  // Fetch work trackers within the date range (exclude drafts and cancelled)
  const { data: workTrackers, error: wtError } = await supabase
    .from("WorkTrackers")
    .select("driver_uuid, distance_meters, drive_minutes")
    .gte("date", startDate)
    .lt("date", endDate)
    .not("status", "in", '("draft","cancelled")');

  if (wtError) throw wtError;

  // Aggregate per driver
  const distanceByDriver = new Map<string, number>();
  const minutesByDriver = new Map<string, number>();
  const tripsByDriver = new Map<string, number>();

  (workTrackers || []).forEach((wt) => {
    if (!wt.driver_uuid) return;
    distanceByDriver.set(
      wt.driver_uuid,
      (distanceByDriver.get(wt.driver_uuid) || 0) + (wt.distance_meters || 0),
    );
    minutesByDriver.set(
      wt.driver_uuid,
      (minutesByDriver.get(wt.driver_uuid) || 0) + (wt.drive_minutes || 0),
    );
    tripsByDriver.set(wt.driver_uuid, (tripsByDriver.get(wt.driver_uuid) || 0) + 1);
  });

  let fleetTotalDistanceMeters = 0;
  let fleetTotalDriveMinutes = 0;
  let fleetTotalTrips = 0;

  const rows: DriverMileageRow[] = (drivers || []).map((d) => {
    const user = Array.isArray(d.user) ? d.user[0] : d.user;
    const totalDistanceMeters = distanceByDriver.get(d.id) || 0;
    const totalDriveMinutes = minutesByDriver.get(d.id) || 0;
    const tripCount = tripsByDriver.get(d.id) || 0;

    fleetTotalDistanceMeters += totalDistanceMeters;
    fleetTotalDriveMinutes += totalDriveMinutes;
    fleetTotalTrips += tripCount;

    return {
      driverUuid: d.id,
      userUuid: user?.id ?? "",
      firstName: user?.first_name ?? null,
      lastName: user?.last_name ?? null,
      payPerUnit: (d.pay_per_unit as "KM" | "MI" | "HR") || "KM",
      totalDistanceMeters,
      totalDriveMinutes,
      tripCount,
    };
  });

  // Sort by distance descending
  rows.sort((a, b) => b.totalDistanceMeters - a.totalDistanceMeters);

  return {
    drivers: rows,
    fleetTotalDistanceMeters,
    fleetTotalDriveMinutes,
    fleetTotalTrips,
  };
}
