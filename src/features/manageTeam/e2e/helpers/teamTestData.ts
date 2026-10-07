import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role reads and cleanup for the accountant's Team specs. The UI is what writes; this is what
 * proves the write landed, because a write the server refuses still looks done on the client until
 * the next sync (docs/specs/accountant-team.md §7).
 */
function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("team e2e helper needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** `STATUSES.inactive` of src/features/manageTeam/constants.ts. */
const INACTIVE_STATUS = "7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5";

export type DriverRow = Record<string, unknown> & { id: string; user_uuid: string };

/** The whole Drivers row of a user, as Postgres has it. */
export async function readDriverRow(userUuid: string): Promise<DriverRow> {
  const { data, error } = await admin()
    .from("Drivers")
    .select("*")
    .eq("user_uuid", userUuid)
    .single();
  if (error || !data) throw new Error(`read driver failed: ${error?.message}`);
  return data as DriverRow;
}

/** Puts the pay and vendor columns of a driver back to what a snapshot held. */
export async function restoreDriverPay(snapshot: DriverRow): Promise<void> {
  const { error } = await admin()
    .from("Drivers")
    .update({
      tax_dec: snapshot.tax_dec,
      pay_rate_cents: snapshot.pay_rate_cents,
      pay_currency: snapshot.pay_currency,
      pay_per_unit: snapshot.pay_per_unit,
      deadhead_cents: snapshot.deadhead_cents,
      setup_cents: snapshot.setup_cents,
      teardown_cents: snapshot.teardown_cents,
      vendor_uuid: snapshot.vendor_uuid,
    })
    .eq("id", snapshot.id);
  if (error) throw new Error(`restore driver failed: ${error.message}`);
}

/** Every column except the ones an accountant may change. */
export function columnsAnAccountantCannotChange(row: DriverRow): Record<string, unknown> {
  const allowed = new Set([
    "tax_dec",
    "tax",
    "pay_rate_cents",
    "pay_currency",
    "pay_per_unit",
    "deadhead_cents",
    "setup_cents",
    "teardown_cents",
    "vendor_uuid",
  ]);
  return Object.fromEntries(Object.entries(row).filter(([column]) => !allowed.has(column)));
}

export async function readPayRanges(driverId: string) {
  const { data, error } = await admin()
    .from("DriverPayRanges")
    .select("id, min_value, max_value, rate")
    .eq("driver_uuid", driverId);
  if (error) throw new Error(`read pay ranges failed: ${error.message}`);
  return data ?? [];
}

export async function deletePayRanges(driverId: string): Promise<void> {
  const { error } = await admin().from("DriverPayRanges").delete().eq("driver_uuid", driverId);
  if (error) throw new Error(`delete pay ranges failed: ${error.message}`);
}

export async function findVendorsByName(prefix: string) {
  const { data, error } = await admin()
    .from("Vendors")
    .select("id, display_name, is_active")
    .like("display_name", `${prefix}%`);
  if (error) throw new Error(`read vendors failed: ${error.message}`);
  return data ?? [];
}

export async function deleteVendorsByName(prefix: string): Promise<void> {
  const supabase = admin();
  const vendors = await findVendorsByName(prefix);
  if (vendors.length === 0) return;
  const ids = vendors.map((v) => v.id as string);
  await supabase.from("Drivers").update({ vendor_uuid: null }).in("vendor_uuid", ids);
  const { error } = await supabase.from("Vendors").delete().in("id", ids);
  if (error) throw new Error(`delete vendors failed: ${error.message}`);
}

/**
 * A driver whose account is deactivated (Users.status = Inactive), for the "deactivated drivers are
 * edited like active ones" scenario. `Drivers.user_uuid` cascades, so `deleteUserByEmail` of the
 * accountant fixtures removes it.
 */
export async function seedInactiveDriver(email: string): Promise<{ userUuid: string }> {
  const supabase = admin();
  const { data: user, error: userError } = await supabase
    .from("Users")
    .insert({
      first_name: "Inactive",
      last_name: "Probe Driver",
      email: email.toLowerCase(),
      is_admin: false,
      is_viewer: false,
      status_uuid: INACTIVE_STATUS,
    })
    .select("id")
    .single();
  if (userError || !user) throw new Error(`seed inactive user failed: ${userError?.message}`);

  const { error: driverError } = await supabase
    .from("Drivers")
    .insert({ user_uuid: user.id, is_active: true, deadhead_cents: 0, setup_cents: 0 });
  if (driverError) throw new Error(`seed inactive driver failed: ${driverError.message}`);

  return { userUuid: user.id as string };
}
