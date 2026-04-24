// lib/driverAssignment/fetchAssignmentData.ts
// Fetches all data needed to build an AssignmentRequest for the optimizer.
// Addresses are geocoded on-the-fly via the Google Geocoding API —
// no lat/lng columns required in the Addresses table.

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../../../database.types"; // adjust path as needed
import { DriverInput, TripInput, AddressPoint } from "./types/DriverAssignment";

// ---------------------------------------------------------------------------
// In-memory geocode cache — avoids re-geocoding the same address within a
// single page session (e.g. same driver home used across multiple requests).
// ---------------------------------------------------------------------------
const geocodeCache = new Map<string, { lat: number; lng: number }>();

/**
 * Converts a plain address string into lat/lng using the Google Geocoding API.
 * Falls back to null if the API key is missing or the address can't be resolved.
 */
async function geocodeAddress(
  addressString: string,
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[geocodeAddress] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
    return null;
  }

  const cached = geocodeCache.get(addressString);
  if (cached) return cached;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(addressString)}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.status !== "OK" || !json.results?.length) {
      console.warn(`[geocodeAddress] No results for "${addressString}": ${json.status}`);
      return null;
    }

    const { lat, lng } = json.results[0].geometry.location;
    const coords = { lat: lat as number, lng: lng as number };
    geocodeCache.set(addressString, coords);
    return coords;
  } catch (err) {
    console.error(`[geocodeAddress] Failed for "${addressString}":`, err);
    return null;
  }
}

/**
 * Builds a single address string from the Addresses row columns,
 * then geocodes it.
 */
function buildAddressString(row: {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country?: string | null;
}): string {
  return [row.street, row.city, row.state_province, row.zip_postal, row.country]
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Core: fetch one address row and geocode it
// ---------------------------------------------------------------------------
async function resolveAddressPoint(
  supabase: SupabaseClient<Database>,
  addressUuid: string,
): Promise<AddressPoint | null> {
  const { data, error } = await supabase
    .from("Addresses")
    .select("id, street, city, state_province, zip_postal")
    .eq("id", addressUuid)
    .single();

  if (error || !data) {
    console.warn(`[resolveAddressPoint] Could not fetch address ${addressUuid}:`, error?.message);
    return null;
  }

  const addressString = buildAddressString(data as any);
  if (!addressString.trim()) {
    console.warn(`[resolveAddressPoint] Empty address string for ${addressUuid}`);
    return null;
  }

  const coords = await geocodeAddress(addressString);
  if (!coords) return null;

  return { uuid: data.id, lat: coords.lat, lng: coords.lng };
}

// ---------------------------------------------------------------------------
// Batch-resolve a list of address UUIDs, deduplicating geocode calls
// ---------------------------------------------------------------------------
async function resolveAddressPoints(
  supabase: SupabaseClient<Database>,
  uuids: string[],
): Promise<Map<string, AddressPoint>> {
  const unique = [...new Set(uuids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("Addresses")
    .select("id, street, city, state_province, zip_postal")
    .in("id", unique);

  if (error || !data) return new Map();

  // Geocode all unique address strings in parallel
  const entries = await Promise.all(
    (data as any[]).map(async (row) => {
      const addressString = buildAddressString(row);
      const coords = addressString.trim() ? await geocodeAddress(addressString) : null;
      if (!coords) return null;
      return [row.id, { uuid: row.id, lat: coords.lat, lng: coords.lng }] as const;
    }),
  );

  return new Map(entries.filter((e): e is [string, AddressPoint] => e !== null));
}

// ---------------------------------------------------------------------------
// Build DriverInput list for a given account manager
// ---------------------------------------------------------------------------
export async function fetchDriverInputsForAccountManager(
  supabase: SupabaseClient<Database>,
  accountManagerUuid: string,
): Promise<DriverInput[]> {
  const { data: driversData, error } = await supabase
    .from("Drivers")
    .select(
      `
      id,
      user_uuid,
      account_manager_uuid,
      address_uuid,
      user:Users!Drivers_user_uuid_fkey(first_name, last_name)
    `,
    )
    .eq("account_manager_uuid", accountManagerUuid)
    .eq("is_active", true);

  if (error || !driversData) return [];

  // Batch-geocode all driver home addresses in one pass
  const addressUuids = (driversData as any[])
    .map((d) => d.address_uuid)
    .filter(Boolean) as string[];

  const addressMap = await resolveAddressPoints(supabase, addressUuids);

  const results: DriverInput[] = [];

  for (const d of driversData as any[]) {
    const homeAddress = d.address_uuid ? addressMap.get(d.address_uuid) : undefined;
    if (!homeAddress) continue; // can't route without a geocoded home

    // Fetch days off for this driver
    const { data: daysOffData } = await supabase
      .from("DriverUnavailability") //
      .select("date")
      .eq("driver_uuid", d.id);

    const days_off = (daysOffData ?? []).map((row: any) => row.date as string);

    results.push({
      driver_uuid: d.id,
      user_uuid: d.user_uuid,
      account_manager_uuid: d.account_manager_uuid,
      first_name: d.user?.first_name ?? null,
      last_name: d.user?.last_name ?? null,
      home_address: homeAddress,
      days_off,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Build TripInput for one or more WorkTrackers
// ---------------------------------------------------------------------------
export async function fetchTripInputs(
  supabase: SupabaseClient<Database>,
  workTrackerIds: string[],
): Promise<TripInput[]> {
  if (workTrackerIds.length === 0) return [];

  const { data, error } = await supabase
    .from("WorkTrackers")
    .select(
      `
      id,
      date,
      driver_uuid,
      distance_meters,
      pickup_address_uuid,
      dropoff_address_uuid
    `,
    )
    .in("id", workTrackerIds);

  if (error || !data) return [];

  // Collect all address UUIDs and batch-geocode them
  const allUuids = (data as any[]).flatMap((wt) =>
    [wt.pickup_address_uuid, wt.dropoff_address_uuid].filter(Boolean),
  ) as string[];

  const addressMap = await resolveAddressPoints(supabase, allUuids);

  const results: TripInput[] = [];

  for (const wt of data as any[]) {
    const pickupAddr = wt.pickup_address_uuid
      ? addressMap.get(wt.pickup_address_uuid)
      : undefined;
    const dropoffAddr = wt.dropoff_address_uuid
      ? addressMap.get(wt.dropoff_address_uuid)
      : undefined;

    if (!pickupAddr || !dropoffAddr) continue; // skip trips with unresolvable addresses

    results.push({
      work_tracker_id: wt.id,
      account_manager_uuid: "", // stamped by the hook before sending to the optimizer
      date: wt.date ?? "",
      pickup_address: pickupAddr,
      dropoff_address: dropoffAddr,
      distance_meters: wt.distance_meters ?? null,
      current_driver_uuid: wt.driver_uuid ?? null,
    });
  }

  return results;
}