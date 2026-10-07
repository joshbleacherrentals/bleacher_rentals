import { createErrorToast } from "@/components/toasts/ErrorToast";
import { Database, Tables } from "../../../../database.types";
import { USER_ROLES } from "@/types/Constants";
import { DateTime } from "luxon";
import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAddressFromUuid } from "@/features/dashboard/db/client/db";
import { deriveRegion } from "../util/addressCountry";

export async function fetchDriverName(
  userUuid: string,
  supabaseClient: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await supabaseClient
    .from("Users")
    .select("first_name, last_name")
    .eq("id", userUuid)
    .single();

  if (error) {
    throw new Error(["Failed to fetch work trackers", error.message].join("\n"));
  }
  const name = data?.first_name + " " + data?.last_name;
  return name;
}

export type DriverHeaderInfo = {
  driverName: string;
  driverPhone: string | null;
  driverEmail: string;
  address: {
    street: string;
    city: string;
    state_province: string;
    zip_postal: string | null;
  } | null;
  vendor: {
    display_name: string;
    ein: string | null;
    hst: string | null;
  } | null;
};

export async function fetchDriverHeaderInfo(
  supabase: SupabaseClient<Database>,
  userUuid: string,
): Promise<DriverHeaderInfo> {
  const { data, error } = await supabase
    .from("Drivers")
    .select(
      `
      phone_number,
      address:Addresses!Drivers_address_uuid_fkey(street, city, state_province, zip_postal),
      vendor:Vendors(display_name, ein, hst),
      user:Users!Drivers_user_uuid_fkey(first_name, last_name, email, phone)
    `,
    )
    .eq("user_uuid", userUuid)
    .single();

  if (error || !data) {
    return { driverName: "", driverPhone: null, driverEmail: "", address: null, vendor: null };
  }

  const user = (Array.isArray(data.user) ? data.user[0] : data.user) as {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
  } | null;
  const vendor = (Array.isArray(data.vendor) ? data.vendor[0] : data.vendor) as {
    display_name: string;
    ein: string | null;
    hst: string | null;
  } | null;
  const address = (Array.isArray(data.address) ? data.address[0] : data.address) as {
    street: string;
    city: string;
    state_province: string;
    zip_postal: string | null;
  } | null;

  return {
    driverName: `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim(),
    driverPhone: (data as any).phone_number ?? user?.phone ?? null,
    driverEmail: user?.email ?? "",
    address: address ?? null,
    vendor: vendor ?? null,
  };
}

export async function fetchUserByUuid(
  supabase: SupabaseClient<Database>,
  userUuid: string,
): Promise<string> {
  if (!supabase) {
    createErrorToast(["No supabase client found"]);
  }
  const { data, error } = await supabase
    .from("Users")
    .select("first_name, last_name")
    .eq("id", userUuid)
    .single();

  if (error) {
    createErrorToast(["Failed to fetch Drivers.", error.message]);
  }
  const name = data?.first_name + " " + data?.last_name;
  return name;
}

export type DriverWithMeta = Tables<"Users"> & {
  driver_uuid: string;
  tripCount: number;
  totalPayCents: number;
  payCurrency: string;
  payPerUnit: string;
  totalDistanceMeters: number;
  totalDriveMinutes: number;
  hasCrossBorderTrips: boolean;
  region: "US" | "CAN" | null;
  qbo_connection_uuid: string | null;
  taxDec: number;
  workTrackerGroup?: {
    id: string;
    status: Database["public"]["Enums"]["worktracker_group_status"];
    qbo_bill_id: string | null;
    week_start: string;
    week_end: string;
    /** Only the week's driver list reads this; the page and the payment window use useWorkTrackerGroupPaid. */
    is_paid?: boolean;
  } | null;
};

export async function fetchDriverWithMetaForWeek(
  supabase: SupabaseClient<Database>,
  userUuid: string,
  startDate: string,
): Promise<DriverWithMeta | null> {
  const endDate = DateTime.fromISO(startDate).plus({ days: 7 }).toISODate();
  const weekStart = startDate;
  const weekEnd = DateTime.fromISO(startDate).plus({ days: 6 }).toISODate();

  const { data: driverData, error: driverError } = await supabase
    .from("Drivers")
    .select(
      `
      id,
      pay_currency,
      pay_per_unit,
      tax_dec,
      address:Addresses!Drivers_address_uuid_fkey(street, country),
      vendor:Vendors(qbo_connection_uuid),
      user:Users!Drivers_user_uuid_fkey(*)
    `,
    )
    .eq("user_uuid", userUuid)
    .single();

  if (driverError || !driverData) return null;

  const driver = driverData as any;

  const { data: workTrackers } = await supabase
    .from("WorkTrackers")
    .select("driver_uuid, pay_cents, distance_meters, drive_minutes, dropoff_address_uuid")
    .eq("driver_uuid", driver.id)
    .gte("date", startDate)
    .lt("date", endDate!);

  const { data: workTrackerGroup } = await supabase
    .from("WorkTrackerGroups")
    .select("id, driver_uuid, status, qbo_bill_id, week_start, week_end")
    .eq("driver_uuid", driver.id)
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd!)
    .maybeSingle();

  const totalPayCents = (workTrackers || []).reduce((acc, wt) => acc + (wt.pay_cents || 0), 0);
  const totalDistanceMeters = (workTrackers || []).reduce(
    (acc, wt) => acc + (wt.distance_meters || 0),
    0,
  );
  const totalDriveMinutes = (workTrackers || []).reduce(
    (acc, wt) => acc + (wt.drive_minutes || 0),
    0,
  );

  return {
    ...driver.user,
    driver_uuid: driver.id,
    tripCount: (workTrackers || []).length,
    totalPayCents,
    payCurrency: driver.pay_currency ?? "USD",
    payPerUnit: driver.pay_per_unit ?? "KM",
    totalDistanceMeters,
    totalDriveMinutes,
    hasCrossBorderTrips: false,
    region: deriveRegion(driver.address?.country, driver.address?.street),
    taxDec: driver.tax_dec ?? 0,
    qbo_connection_uuid:
      (Array.isArray(driver.vendor) ? driver.vendor[0] : driver.vendor)?.qbo_connection_uuid ??
      null,
    workTrackerGroup: workTrackerGroup ?? null,
  } as DriverWithMeta;
}

export type WorkTrackersResult = {
  workTrackers: {
    workTracker: Tables<"WorkTrackers">;
    bleacherNumber: number | null;
    activityType: string | null;
    pickup_address: Tables<"Addresses"> | null;
    dropoff_address: Tables<"Addresses"> | null;
  }[];
  driverTax: number;
  driverAddress: Tables<"Addresses"> | null;
};

async function fetchDriverTaxByUuidServer(
  userUuid: string,
  supabaseClient: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await supabaseClient
    .from("Drivers")
    .select("tax_dec")
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (!data) {
    await insertDriverServer(userUuid, 0, supabaseClient);
    return 0;
  }

  if (error) return 0;
  return data.tax_dec ?? 0;
}

async function insertDriverServer(
  userUuid: string,
  taxDec: number,
  supabaseClient: SupabaseClient<Database>,
) {
  const { error } = await supabaseClient.from("Drivers").upsert(
    {
      user_uuid: userUuid,
      tax_dec: taxDec,
    },
    { onConflict: "user_uuid", ignoreDuplicates: true },
  );
  if (error) {
    return error;
  }
  return null;
}

export async function fetchWorkTrackersForUserUuidAndStartDate(
  supabase: SupabaseClient<Database>,
  userUuid: string,
  startDate: string,
  isServer: boolean,
): Promise<WorkTrackersResult> {
  if (!supabase && !isServer) {
    createErrorToast(["No Supabase client found"]);
  }

  const { data: driverData, error: driverError } = await supabase
    .from("Drivers")
    .select("id, tax_dec, address:Addresses!Drivers_address_uuid_fkey(*)")
    .eq("user_uuid", userUuid)
    .single();

  if (driverError || !driverData) {
    if (!isServer) {
      createErrorToast(["Failed to fetch driver", driverError?.message || "Driver not found"]);
    } else {
      throw new Error(
        ["Failed to fetch driver", driverError?.message || "Driver not found"].join("\n"),
      );
    }
    return { workTrackers: [], driverTax: 0, driverAddress: null };
  }

  const driverUuid = driverData.id;
  const driverTax: number = driverData.tax_dec ?? 0;
  const driverAddress = (driverData.address as Tables<"Addresses"> | null) ?? null;

  type WorkTrackerWithBleacher = Tables<"WorkTrackers"> & {
    bleacher: { bleacher_number: number } | null;
    work_tracker_type: { display_name: string } | null;
  };

  const { data, error } = await supabase
    .from("WorkTrackers")
    .select(
      `
      *,
      bleacher:Bleachers!WorkTrackers_bleacher_uuid_fkey(bleacher_number),
      work_tracker_type:WorkTrackerTypes(display_name)
    `,
    )
    .eq("driver_uuid", driverUuid)
    .gte("date", startDate)
    .lt("date", DateTime.fromISO(startDate).plus({ days: 7 }).toISODate())
    .order("date", { ascending: true })
    // Same-day trackers by pickup time — matches useWorkTrackersForWeek (the
    // trip-list view this PDF mirrors). Any Time (null) trackers sort last
    // within their date.
    .order("pickup_time_start", { ascending: true, nullsFirst: false });

  if (error) {
    if (!isServer) {
      createErrorToast(["Failed to fetch work trackers", error.message]);
    } else {
      throw new Error(["Failed to fetch work trackers", error.message].join("\n"));
    }
  }

  const result = await Promise.all(
    ((data || []) as WorkTrackerWithBleacher[]).map(async (tracker) => {
      const pickup =
        tracker.pickup_address_uuid != null
          ? await fetchAddressFromUuid(tracker.pickup_address_uuid, supabase, isServer)
          : null;
      const dropoff =
        tracker.dropoff_address_uuid != null
          ? await fetchAddressFromUuid(tracker.dropoff_address_uuid, supabase, isServer)
          : null;

      return {
        workTracker: tracker as Tables<"WorkTrackers">,
        bleacherNumber: tracker.bleacher?.bleacher_number ?? null,
        activityType: tracker.work_tracker_type?.display_name ?? null,
        pickup_address: pickup,
        dropoff_address: dropoff,
      };
    }),
  );

  return { workTrackers: result, driverTax, driverAddress };
}
