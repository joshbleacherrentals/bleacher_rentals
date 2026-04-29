import { SupabaseClient } from "@supabase/supabase-js";
import { CurrentUserState, TeamRoleTab } from "../state/useCurrentUserStore";
import { Database } from "@/../database.types";
import { STATUSES } from "../constants";

type TypedSupabaseClient = SupabaseClient<Database>;

// Helper function to create or update an address
async function upsertAddress(
  supabase: TypedSupabaseClient,
  state: CurrentUserState,
  existingAddressUuid: string | null,
): Promise<string | null> {
  // Check if we have address data
  if (!state.homeAddress || !state.homeCity || !state.homeState) {
    return existingAddressUuid; // Return existing UUID if no new data
  }

  const addressData = {
    street: state.homeAddress,
    city: state.homeCity,
    state_province: state.homeState,
    zip_postal: state.homePostalCode,
  };

  if (existingAddressUuid) {
    // Update existing address
    const { error } = await supabase
      .from("Addresses")
      .update(addressData)
      .eq("id", existingAddressUuid);

    if (error) {
      console.error("Error updating address:", error);
      return existingAddressUuid;
    }
    return existingAddressUuid;
  } else {
    // Create new address
    const { data, error } = await supabase
      .from("Addresses")
      .insert(addressData)
      .select("id")
      .single();

    if (error) {
      console.error("Error creating address:", error);
      return null;
    }
    return data.id;
  }
}

// Helper function to create or update a vehicle
async function upsertVehicle(
  supabase: TypedSupabaseClient,
  state: CurrentUserState,
  existingVehicleUuid: string | null,
): Promise<string | null> {
  // Check if we have vehicle data
  if (!state.vehicleMake || !state.vehicleModel || !state.vehicleYear) {
    return existingVehicleUuid; // Return existing UUID if no new data
  }

  const vehicleData = {
    make: state.vehicleMake,
    model: state.vehicleModel,
    year: state.vehicleYear,
    vin_number: state.vehicleVin,
  };

  if (existingVehicleUuid) {
    // Update existing vehicle
    const { error } = await supabase
      .from("Vehicles")
      .update(vehicleData)
      .eq("id", existingVehicleUuid);

    if (error) {
      console.error("Error updating vehicle:", error);
      return existingVehicleUuid;
    }
    return existingVehicleUuid;
  } else {
    // Create new vehicle
    const { data, error } = await supabase
      .from("Vehicles")
      .insert(vehicleData)
      .select("id")
      .single();

    if (error) {
      console.error("Error creating vehicle:", error);
      return null;
    }
    return data.id;
  }
}

export async function createUser(
  supabase: TypedSupabaseClient,
  state: CurrentUserState,
): Promise<{ success: boolean; userUuid?: string; error?: string }> {
  try {
    // 1. Insert into Users table
    const { data: userData, error: userError } = await supabase
      .from("Users")
      .insert({
        first_name: state.firstName,
        last_name: state.lastName,
        email: state.email.toLowerCase(),
        is_admin: state.isAdmin,
        status_uuid: STATUSES.invited, // Active
      })
      .select("id")
      .single();

    if (userError) throw userError;
    const userUuid = userData.id;

    // 2. If driver, insert into Drivers table
    if (state.isDriver) {
      // Create address if provided
      const addressUuid = await upsertAddress(supabase, state, null);

      // Create vehicle if provided
      const vehicleUuid = await upsertVehicle(supabase, state, null);

      const { error: driverError } = await supabase.from("Drivers").insert({
        user_uuid: userUuid,
        tax: state.tax ?? 0,
        pay_rate_cents: state.payRateCents ?? 0,
        pay_currency: state.payCurrency,
        pay_per_unit: state.payPerUnit,
        account_manager_uuid: state.accountManagerUuid,
        vendor_uuid: state.vendorUuid,
        phone_number: state.phoneNumber,
        address_uuid: addressUuid,
        vehicle_uuid: vehicleUuid,
        license_photo_path: state.licensePhotoPath,
        insurance_photo_path: state.insurancePhotoPath,
        medical_card_photo_path: state.medicalCardPhotoPath,
        is_active: true,
      });

      if (driverError) throw driverError;
    }

    // 3. If account manager, insert into AccountManagers table
    if (state.isAccountManager) {
      const { error: amError } = await supabase.from("AccountManagers").insert({
        user_uuid: userUuid,
        is_active: true,
      });

      if (amError) throw amError;

      // 4. Update bleacher assignments
      await updateBleacherAssignments(supabase, userUuid, state);
    }

    // 4. If developer, insert into Developers table
    if (state.isDeveloper) {
      const { error: devError } = await supabase.from("Developers").insert({
        user_uuid: userUuid,
        is_active: true,
        auto_subscribe_to_new_tickets: state.autoSubscribeToNewTickets,
      });
      if (devError) throw devError;
    }

    return { success: true, userUuid };
  } catch (error) {
    console.error("Error creating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateUser(
  supabase: TypedSupabaseClient,
  state: CurrentUserState,
): Promise<{ success: boolean; error?: string }> {
  if (!state.existingUserUuid) {
    return { success: false, error: "No user UUID provided" };
  }

  try {
    const userUuid = state.existingUserUuid;

    // 1. Update Users table
    const { error: userError } = await supabase
      .from("Users")
      .update({
        first_name: state.firstName,
        last_name: state.lastName,
        email: state.email.toLowerCase(),
        is_admin: state.isAdmin,
      })
      .eq("id", userUuid);

    if (userError) throw userError;

    // 2. Handle Driver role (check for existing driver regardless of is_active status)
    const { data: existingDriver } = await supabase
      .from("Drivers")
      .select("id")
      .eq("user_uuid", userUuid)
      .single();

    if (state.isDriver) {
      // Create/update address if provided
      const addressUuid = await upsertAddress(supabase, state, state.addressUuid);

      // Create/update vehicle if provided
      const vehicleUuid = await upsertVehicle(supabase, state, state.vehicleUuid);

      if (existingDriver) {
        // Update existing driver and set to active
        const { error: driverUpdateError } = await supabase
          .from("Drivers")
          .update({
            tax: state.tax ?? 0,
            pay_rate_cents: state.payRateCents ?? 0,
            pay_currency: state.payCurrency,
            pay_per_unit: state.payPerUnit,
            account_manager_uuid: state.accountManagerUuid,
            vendor_uuid: state.vendorUuid,
            phone_number: state.phoneNumber,
            address_uuid: addressUuid,
            vehicle_uuid: vehicleUuid,
            license_photo_path: state.licensePhotoPath,
            insurance_photo_path: state.insurancePhotoPath,
            medical_card_photo_path: state.medicalCardPhotoPath,
            is_active: true,
          })
          .eq("user_uuid", userUuid);
        if (driverUpdateError) throw driverUpdateError;
      } else {
        // Create new driver record
        const { error: driverInsertError } = await supabase.from("Drivers").insert({
          user_uuid: userUuid,
          tax: state.tax ?? 0,
          pay_rate_cents: state.payRateCents ?? 0,
          pay_currency: state.payCurrency,
          pay_per_unit: state.payPerUnit,
          account_manager_uuid: state.accountManagerUuid,
          vendor_uuid: state.vendorUuid,
          phone_number: state.phoneNumber,
          address_uuid: addressUuid,
          vehicle_uuid: vehicleUuid,
          license_photo_path: state.licensePhotoPath,
          insurance_photo_path: state.insurancePhotoPath,
          medical_card_photo_path: state.medicalCardPhotoPath,
          is_active: true,
        });

        if (driverInsertError) throw driverInsertError;
      }
    } else if (existingDriver) {
      // Mark driver as inactive instead of deleting
      const { error: driverUpdateError } = await supabase
        .from("Drivers")
        .update({ is_active: false })
        .eq("user_uuid", userUuid);

      if (driverUpdateError) throw driverUpdateError;
    }

    // 3. Handle Account Manager role (check for existing AM regardless of is_active status)
    const { data: existingAM } = await supabase
      .from("AccountManagers")
      .select("id")
      .eq("user_uuid", userUuid)
      .single();

    if (state.isAccountManager) {
      if (!existingAM) {
        // Create new account manager record
        const { error: amInsertError } = await supabase.from("AccountManagers").insert({
          user_uuid: userUuid,
          is_active: true,
        });

        if (amInsertError) throw amInsertError;
      } else {
        // Reactivate existing account manager
        const { error: amUpdateError } = await supabase
          .from("AccountManagers")
          .update({ is_active: true })
          .eq("user_uuid", userUuid);

        if (amUpdateError) throw amUpdateError;
      }

      // Update bleacher assignments
      await updateBleacherAssignments(supabase, userUuid, state);
    } else if (existingAM) {
      // Remove account manager role
      // First clear bleacher assignments using the AccountManager's ID
      const { error: bleacherClearError } = await supabase
        .from("Bleachers")
        .update({
          summer_account_manager_uuid: null,
          winter_account_manager_uuid: null,
        })
        .or(
          `summer_account_manager_uuid.eq.${existingAM.id},winter_account_manager_uuid.eq.${existingAM.id}`,
        );
      if (bleacherClearError) throw bleacherClearError;

      // Mark account manager as inactive instead of deleting
      const { error: amUpdateError } = await supabase
        .from("AccountManagers")
        .update({ is_active: false })
        .eq("user_uuid", userUuid);

      if (amUpdateError) throw amUpdateError;
    }

    // 4. Handle Developer role
    const { data: existingDev } = await supabase
      .from("Developers")
      .select("id")
      .eq("user_uuid", userUuid)
      .single();

    if (state.isDeveloper) {
      if (!existingDev) {
        const { error: devInsertError } = await supabase.from("Developers").insert({
          user_uuid: userUuid,
          is_active: true,
          auto_subscribe_to_new_tickets: state.autoSubscribeToNewTickets,
        });
        if (devInsertError) throw devInsertError;
      } else {
        const { error: devUpdateError } = await supabase
          .from("Developers")
          .update({
            is_active: true,
            auto_subscribe_to_new_tickets: state.autoSubscribeToNewTickets,
          })
          .eq("user_uuid", userUuid);
        if (devUpdateError) throw devUpdateError;
      }
    } else if (existingDev) {
      const { error: devDeactivateError } = await supabase
        .from("Developers")
        .update({ is_active: false })
        .eq("user_uuid", userUuid);
      if (devDeactivateError) throw devDeactivateError;
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function updateBleacherAssignments(
  supabase: TypedSupabaseClient,
  userUuid: string,
  state: CurrentUserState,
): Promise<void> {
  // First, get the account_manager_id for this user
  const { data: amData, error: amError } = await supabase
    .from("AccountManagers")
    .select("id")
    .eq("user_uuid", userUuid)
    .single();

  if (amError || !amData) {
    console.error("Failed to get account manager ID:", amError);
    return;
  }

  const accountManagerUuid = amData.id;

  // Clear existing assignments for this account manager
  await supabase
    .from("Bleachers")
    .update({
      summer_account_manager_uuid: null,
    })
    .eq("summer_account_manager_uuid", accountManagerUuid);

  await supabase
    .from("Bleachers")
    .update({
      winter_account_manager_uuid: null,
    })
    .eq("winter_account_manager_uuid", accountManagerUuid);

  // Set new summer assignments
  if (state.summerBleacherUuids.length > 0) {
    await supabase
      .from("Bleachers")
      .update({
        summer_account_manager_uuid: accountManagerUuid,
      })
      .in("id", state.summerBleacherUuids);
  }

  // Set new winter assignments
  if (state.winterBleacherUuids.length > 0) {
    await supabase
      .from("Bleachers")
      .update({
        winter_account_manager_uuid: accountManagerUuid,
      })
      .in("id", state.winterBleacherUuids);
  }
}

export async function sendUserInvite(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send invite");
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending invite:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function fetchUserById(
  supabase: TypedSupabaseClient,
  userUuid: string,
): Promise<Partial<CurrentUserState> | null> {
  try {
    // 1. Fetch user basic info
    const { data: user, error: userError } = await supabase
      .from("Users")
      .select("*")
      .eq("id", userUuid)
      .single();

    if (userError || !user) {
      console.error("Error fetching user:", userError);
      return null;
    }

    // Build role tabs array
    const roleTabs: TeamRoleTab[] = [];
    if (user.is_admin) roleTabs.push("administrator");

    // Initialize result object
    const result: Partial<CurrentUserState> = {
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      email: user.email,
      isAdmin: user.is_admin,
      statusUuid: user.status_uuid,
      phoneNumber: user.phone,
      isDriver: false,
      isAccountManager: false,
      isDeveloper: false,
    };

    // 2. Check if user is a driver
    const { data: driver, error: driverError } = await supabase
      .from("Drivers")
      .select("*, Addresses(*), Vehicles(*)")
      .eq("user_uuid", userUuid)
      .single();

    // Only process if driver exists (ignore PGRST116 "no rows" error)
    if (driver && !driverError) {
      // Only show driver tab/flag if actively enabled
      if (driver.is_active) {
        roleTabs.push("driver");
        result.isDriver = true;
      }
      // Always load driver data so re-enabling restores saved values
      result.tax = driver.tax;
      result.payRateCents = driver.pay_rate_cents;
      result.payCurrency = driver.pay_currency as "CAD" | "USD";
      result.payPerUnit = driver.pay_per_unit as "KM" | "MI" | "HR";
      result.accountManagerUuid = driver.account_manager_uuid;
      result.vendorUuid = driver.vendor_uuid;
      result.licensePhotoPath = driver.license_photo_path;
      result.insurancePhotoPath = driver.insurance_photo_path;
      result.medicalCardPhotoPath = driver.medical_card_photo_path;
      result.phoneNumber = driver.phone_number;

      // Address info
      if (driver.Addresses) {
        result.addressUuid = driver.address_uuid;
        result.homeAddress = driver.Addresses.street;
        result.homeCity = driver.Addresses.city;
        result.homeState = driver.Addresses.state_province;
        result.homePostalCode = driver.Addresses.zip_postal;
      }

      // Vehicle info
      if (driver.Vehicles) {
        result.vehicleUuid = driver.vehicle_uuid;
        result.vehicleMake = driver.Vehicles.make;
        result.vehicleModel = driver.Vehicles.model;
        result.vehicleYear = driver.Vehicles.year;
        result.vehicleVin = driver.Vehicles.vin_number;
      }
    }

    // 3. Check if user is an account manager
    const { data: accountManager, error: accountManagerError } = await supabase
      .from("AccountManagers")
      .select("*")
      .eq("user_uuid", userUuid)
      .single();

    // Only process if account manager exists (ignore PGRST116 "no rows" error)
    if (accountManager && !accountManagerError) {
      // Only show AM tab/flag if actively enabled
      if (accountManager.is_active) {
        roleTabs.push("account-manager");
        result.isAccountManager = true;
      }

      const accountManagerId = accountManager.id;

      // Fetch bleacher assignments from Bleachers table
      // Summer bleachers where this AM is assigned
      const { data: summerBleachers } = await supabase
        .from("Bleachers")
        .select("id")
        .eq("summer_account_manager_uuid", accountManagerId);

      // Winter bleachers where this AM is assigned
      const { data: winterBleachers } = await supabase
        .from("Bleachers")
        .select("id")
        .eq("winter_account_manager_uuid", accountManagerId);

      result.summerBleacherUuids = summerBleachers?.map((b) => b.id) || [];
      result.winterBleacherUuids = winterBleachers?.map((b) => b.id) || [];
    }

    // 4. Check if user is a developer
    const { data: developer } = await supabase
      .from("Developers")
      .select("id, is_active, auto_subscribe_to_new_tickets")
      .eq("user_uuid", userUuid)
      .single();

    if (developer && developer.is_active) {
      roleTabs.push("developer");
      result.isDeveloper = true;
      result.autoSubscribeToNewTickets = developer.auto_subscribe_to_new_tickets ?? true;
    }

    result.roleTabs = roleTabs;

    return result;
  } catch (error) {
    console.error("Error in fetchUserById:", error);
    return null;
  }
}
