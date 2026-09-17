import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

/**
 * A work tracker with both addresses set, for checking that the modal still
 * populates them.
 *
 * The lookup behind those fields used to read a Zustand mirror of the whole
 * `Addresses` table through `getState()`. That table was silently truncated at
 * 1000 rows, so roughly half of all lookups returned null and the fields opened
 * blank. It is now `useAddressFromUuid`, reading PowerSync.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for e2e fixture seeding",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SeededTripAddresses = {
  weekStart: string;
  driverUserUuid: string;
  note: string;
  pickupStreet: string;
  dropoffStreet: string;
  cleanup: () => Promise<void>;
};

export async function seedWorkTrackerWithAddresses(): Promise<SeededTripAddresses> {
  const supabase = adminClient();
  const note = `e2e-addr-${randomUUID()}`;

  const driverEmail = process.env.E2E_DRIVER_EMAIL;
  if (!driverEmail) throw new Error("Missing E2E_DRIVER_EMAIL for e2e fixture seeding");

  const { data: user, error: userError } = await supabase
    .from("Users")
    .select("id")
    .eq("email", driverEmail)
    .single();
  if (userError || !user)
    throw new Error(`fixture driver user lookup failed: ${userError?.message}`);

  const { data: driver, error: driverError } = await supabase
    .from("Drivers")
    .select("id")
    .eq("user_uuid", user.id)
    .single();
  if (driverError || !driver)
    throw new Error(`fixture driver lookup failed: ${driverError?.message}`);

  const tag = randomUUID().slice(0, 8);
  const pickupStreet = `${tag} Pickup Road`;
  const dropoffStreet = `${tag} Dropoff Road`;

  const { data: addresses, error: addressError } = await supabase
    .from("Addresses")
    .insert([
      { street: pickupStreet, city: "Springfield", state_province: "IL", zip_postal: "62701" },
      { street: dropoffStreet, city: "Shelbyville", state_province: "IL", zip_postal: "62565" },
    ])
    .select("id, street");
  if (addressError || addresses?.length !== 2) {
    throw new Error(`fixture address seed failed: ${addressError?.message}`);
  }
  const pickup = addresses.find((a) => a.street === pickupStreet)!;
  const dropoff = addresses.find((a) => a.street === dropoffStreet)!;

  // A week of its own: WorkTrackers' group trigger holds a UNIQUE
  // (driver_uuid, week_start), so two fixtures sharing a week race each other.
  const weekStartDt = DateTime.now()
    .startOf("week")
    .plus({ weeks: 600 + Math.floor(Math.random() * 400) });
  const weekStart = weekStartDt.toISODate()!;

  const { data: workTracker, error: wtError } = await supabase
    .from("WorkTrackers")
    .insert({
      driver_uuid: driver.id,
      date: weekStartDt.plus({ days: 2 }).toISODate()!,
      status: "accepted",
      notes: note,
      pickup_address_uuid: pickup.id,
      dropoff_address_uuid: dropoff.id,
    })
    .select("id")
    .single();
  if (wtError || !workTracker) {
    throw new Error(`fixture work tracker seed failed: ${wtError?.message}`);
  }

  return {
    weekStart,
    driverUserUuid: user.id,
    note,
    pickupStreet,
    dropoffStreet,
    cleanup: async () => {
      await supabase.from("WorkTrackers").delete().eq("id", workTracker.id);
      await supabase.from("Addresses").delete().in("id", [pickup.id, dropoff.id]);
    },
  };
}
