"use client";
import { updateDataBase } from "@/app/actions/db.actions";
import { STATUSES } from "../../../features/manageTeam/constants";
import { createErrorToast, createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { SupabaseClient } from "@supabase/supabase-js";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { Database } from "../../../../database.types";
import {
  toDriverPayRangeDrafts,
  type DriverPayRange,
} from "@/features/manageTeam/logic/driverPayRanges";

export async function fetchDriverTaxById(
  userUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<number> {
  if (!supabase) {
    createErrorToast(["No token found"]);
  }
  // const supabase = await getSupabaseClient(token);
  const { data, error } = await supabase
    .from("Drivers")
    .select("tax_dec")
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    createErrorToastNoThrow(["Failed to fetch driver tax.", error.message]);
    return 0;
  }

  // `maybeSingle()` avoids the noisy 406 (PGRST116) when no rows.
  if (!data) {
    await ensureDriverExists(userUuid, 0, 0, "CAD", "KM", supabase);
    return 0;
  }

  return data.tax_dec ?? 0;
}

export type DriverPaymentData = {
  /** Tax rate in percent, 3 decimals — `Drivers.tax_dec`. */
  taxDec: number;
  payRateCents: number;
  /** Flat amount paid per payPerUnit for deadhead travel — no tiers. */
  deadheadRateCents: number;
  payCurrency: "CAD" | "USD";
  payPerUnit: "KM" | "MI" | "HR";
  /** Tiered rates (DriverPayRanges). Empty = the flat payRateCents applies. */
  payRanges: DriverPayRange[];
};

const EMPTY_DRIVER_PAYMENT_DATA: DriverPaymentData = {
  taxDec: 0,
  payRateCents: 0,
  deadheadRateCents: 0,
  payCurrency: "CAD",
  payPerUnit: "KM",
  payRanges: [],
};

export async function fetchDriverPaymentData(
  userUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<DriverPaymentData> {
  if (!supabase) {
    createErrorToast(["No token found"]);
  }
  // const supabase = await getSupabaseClient(token);
  const { data, error } = await supabase
    .from("Drivers")
    .select("id, tax_dec, pay_rate_cents, deadhead_cents, pay_currency, pay_per_unit")
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    createErrorToastNoThrow(["Failed to fetch driver payment data.", error.message]);
    return EMPTY_DRIVER_PAYMENT_DATA;
  }

  // `maybeSingle()` avoids the noisy 406 (PGRST116) when no rows.
  if (!data) {
    await ensureDriverExists(userUuid, 0, 0, "CAD", "KM", supabase);
    return EMPTY_DRIVER_PAYMENT_DATA;
  }

  // Tiered rates, if this driver has any. A failure here is not worth blocking the
  // calculator over — no ranges means the flat rate applies, which is the old behaviour.
  const { data: rangeRows, error: rangeError } = await supabase
    .from("DriverPayRanges")
    .select("id, min_value, max_value, rate")
    .eq("driver_uuid", data.id);

  if (rangeError) {
    createErrorToastNoThrow(["Failed to fetch driver pay ranges.", rangeError.message]);
  }

  return {
    taxDec: data.tax_dec ?? 0,
    payRateCents: data.pay_rate_cents ?? 0,
    deadheadRateCents: data.deadhead_cents ?? 0,
    payCurrency: (data.pay_currency as "CAD" | "USD") ?? "CAD",
    payPerUnit: (data.pay_per_unit as "KM" | "MI" | "HR") ?? "KM",
    payRanges: toDriverPayRangeDrafts(rangeRows ?? []),
  };
}

async function ensureDriverExists(
  userUuid: string,
  taxDec: number,
  payRateCents: number,
  payCurrency: Database["public"]["Enums"]["pay_currency_type"],
  payPerUnit: Database["public"]["Enums"]["pay_per_unit_type"],
  supabaseClient: SupabaseClient<Database>,
) {
  // Use an upsert that *ignores* duplicates so we don't spam 409 conflicts.
  // This also keeps behavior safe: if a real driver row exists, we don't overwrite it.
  const { error } = await supabaseClient.from("Drivers").upsert(
    {
      user_uuid: userUuid,
      tax_dec: taxDec,
      pay_rate_cents: payRateCents,
      pay_currency: payCurrency,
      pay_per_unit: payPerUnit,
    },
    { onConflict: "user_uuid", ignoreDuplicates: true },
  );

  if (error) {
    // Don't throw here; this runs in queryFns and we prefer returning defaults.
    createErrorToastNoThrow(["Failed to ensure driver exists.", error.message]);
    return error;
  }

  return null;
}

export async function updateUserStatusToInvited(email: string, supabase: SupabaseClient<Database>) {
  if (!supabase) {
    createErrorToast(["No token found"]);
  }
  // const supabase = await getSupabaseClient(token);
  const { error } = await supabase
    .from("Users")
    .update({
      status_uuid: STATUSES.invited,
    })
    .eq("email", email);

  if (error) {
    createErrorToastNoThrow(["Failed to update user status to invited.", error.message]);
  } else {
    updateDataBase(["Users", "UserStatuses"]);
  }
}

// ------- BleacherUsers helpers -------

export async function fetchUserBleacherAssignments(
  userUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<{ summer: number[]; winter: number[] }> {
  if (!supabase) {
    createErrorToast(["No supabase client found"]);
  }
  // const supabase = await getSupabaseClient(token);
  const { data, error } = await supabase
    .from("BleacherUsers")
    .select("bleacher_uuid, season")
    .eq("user_uuid", userUuid);
  if (error) {
    createErrorToastNoThrow(["Failed to fetch bleacher assignments.", error.message]);
    return { summer: [], winter: [] };
  }
  const summer = (data ?? [])
    .filter((r: any) => r.season === "SUMMER")
    .map((r: any) => r.bleacher_uuid);
  const winter = (data ?? [])
    .filter((r: any) => r.season === "WINTER")
    .map((r: any) => r.bleacher_uuid);
  return { summer, winter };
}

export async function upsertUserBleacherAssignments(
  userUuid: string,
  summerUuids: string[],
  winterUuids: string[],
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    createErrorToast(["No supabase client found"]);
  }
  // const supabase = await getSupabaseClient(token);

  // Replace strategy: delete then insert
  const { error: delError } = await supabase
    .from("BleacherUsers")
    .delete()
    .eq("user_uuid", userUuid);
  if (delError) {
    createErrorToastNoThrow(["Failed to clear previous assignments.", delError.message]);
    return;
  }

  const rows = [
    ...summerUuids.map((id) => ({ user_uuid: userUuid, bleacher_uuid: id, season: "SUMMER" })),
    ...winterUuids.map((id) => ({ user_uuid: userUuid, bleacher_uuid: id, season: "WINTER" })),
  ];
  if (rows.length > 0) {
    const { error: insError } = await supabase.from("BleacherUsers").insert(rows);
    if (insError) {
      createErrorToastNoThrow(["Failed to save bleacher assignments.", insError.message]);
      return;
    }
  }
}

export async function deactivateUser(userUuid: string, supabase: SupabaseClient<Database>) {
  const { error: updateError } = await supabase
    .from("Users")
    .update({
      status_uuid: STATUSES.inactive,
    })
    .eq("id", userUuid);

  if (updateError) throw updateError;
  updateDataBase(["Users", "UserStatuses"]);
}

export async function reactivateUser(userUuid: string, supabase: SupabaseClient<Database>) {
  const { error: updateError } = await supabase
    .from("Users")
    .update({
      status_uuid: STATUSES.active,
    })
    .eq("id", userUuid);

  if (updateError) throw updateError;
  updateDataBase(["Users", "UserStatuses"]);
}

export async function deleteUser(userUuid: string, supabase: SupabaseClient<Database>) {
  const { error: updateError } = await supabase.from("Users").delete().eq("id", userUuid);

  if (updateError) throw updateError;
  updateDataBase(["UserStatuses", "Users", "UserHomeBases"]);
}

// export function fetchUsers() {
//   const users = useUsersStore((s) => s.users);
//   const userStatuses = useUserStatusesStore((s) => s.userStatuses);
//   const userRoles = useUserRolesStore((s) => s.userRoles);
//   const userHomeBases = useUserHomeBasesStore((s) => s.userHomeBases);
//   const homeBases = useHomeBasesStore((s) => s.homeBases);

//   // Get status and role display values for each user
//   const usersWithDetails = users.map((user) => {
//     const status = userStatuses.find((s) => s.id === user.status)?.status || "Unknown";
//     const role = userRoles.find((r) => r.id === user.role)?.role || "Unknown";

//     // Get this user's associated home_base_ids from the junction table
//     const linkedHomeBases = userHomeBases
//       .filter((uhb) => uhb.user_id === user.user_id)
//       .map((uhb) => {
//         const base = homeBases.find((hb) => hb.home_base_id === uhb.home_base_id);
//         return base ? { id: base.home_base_id, label: base.home_base_name } : null;
//       })
//       .filter((hb): hb is { id: number; label: string } => hb !== null); // type guard

//     return {
//       ...user,
//       statusDisplay: status,
//       roleDisplay: role,
//       homeBases: linkedHomeBases,
//     };
//   });

//   // console.log("usersWithDetails:", usersWithDetails);

//   return usersWithDetails;
// }
