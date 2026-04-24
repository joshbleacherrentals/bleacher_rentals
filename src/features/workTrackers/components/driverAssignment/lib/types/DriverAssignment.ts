// types/driverAssignment.ts

export type AddressPoint = {
  uuid: string;
  lat: number;
  lng: number;
};

export type TripInput = {
  work_tracker_id: string;
  account_manager_uuid: string;
  date: string; // YYYY-MM-DD
  pickup_address: AddressPoint;
  dropoff_address: AddressPoint;
  distance_meters: number | null;
  current_driver_uuid: string | null;
};

export type DriverInput = {
  driver_uuid: string;
  user_uuid: string;
  account_manager_uuid: string;
  first_name: string | null;
  last_name: string | null;
  home_address: AddressPoint;
  days_off: string[]; // YYYY-MM-DD strings
};

export type SwapWarning = {
  conflicting_trip_id: string;
  conflicting_trip_date: string;
  suggested_swap_driver_uuid: string | null;
  suggested_swap_driver_name: string | null;
  message: string;
};

export type TripAssignment = {
  work_tracker_id: string;
  suggested_driver_uuid: string;
  suggested_driver_name: string;
  round_trip_meters: number;
  leg_home_to_pickup_meters: number;
  leg_pickup_to_dropoff_meters: number;
  swap_warning: SwapWarning | null;
};

export type AssignmentResponse = {
  assignments: TripAssignment[];
  total_distance_meters: number;
  unassigned_trip_ids: string[];
};