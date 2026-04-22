export type DriverDistanceRow = {
  driverUuid: string;
  firstName: string | null;
  lastName: string | null;
  distanceMeters: number;
  driveMinutes: number;
  payCents: number;
  tripCount: number;
};
export type TimeRange = "weekly" | "quarterly" | "annually";

export type DriverMileageRow = {
  driverUuid: string;
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
  payPerUnit: "KM" | "MI" | "HR";
  totalDistanceMeters: number;
  totalDriveMinutes: number;
  tripCount: number;
};

export type DriverMileageData = {
  drivers: DriverMileageRow[];
  fleetTotalDistanceMeters: number;
  fleetTotalDriveMinutes: number;
  fleetTotalTrips: number;
};
