"use client";

import { create } from "zustand";
import { fetchUserById } from "../db/userOperations";
import type { DriverPayRange } from "../logic/driverPayRanges";

export type TeamRoleTab =
  | "administrator"
  | "account-manager"
  | "driver"
  | "developer"
  | "viewer"
  | "maintainer";

export type CurrentUserState = {
  // Basic user info
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  statusUuid: string | null;

  // Role flags
  isDriver: boolean;
  isAccountManager: boolean;
  isDeveloper: boolean;
  isMaintainer: boolean;
  isViewer: boolean;
  autoSubscribeToNewTickets: boolean;
  roleTabs: TeamRoleTab[];

  // Driver-specific fields
  /** Tax rate in percent, 3 decimals — `Drivers.tax_dec`. Quebec is 14.975. */
  taxDec: number | undefined;
  payRateCents: number | null;
  /** Amount paid per payPerUnit for deadhead travel — flat, no tiers. */
  deadheadRateCents: number | null;
  /** Flat amount paid for installing bleachers at an event. */
  setupCents: number | null;
  /** Flat amount paid for dismantling bleachers after an event. */
  teardownCents: number | null;
  payCurrency: "CAD" | "USD";
  payPerUnit: "KM" | "MI" | "HR";
  /** Tiered rates (DriverPayRanges). A matching range overrides payRateCents. */
  payRanges: DriverPayRange[];
  accountManagerUuid: string | null;
  /** Zones this driver is assigned to (DriverZones). */
  assignedDriverZoneUuids: string[];
  vendorUuid: string | null;

  // Driver setup (optional - can be set by driver in mobile app)
  phoneNumber: string | null;
  addressUuid: string | null;
  homeAddress: string | null;
  homeCity: string | null;
  homeState: string | null;
  homePostalCode: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homePlaceId: string | null;
  homeCountry: string | null;
  vehicleUuid: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleVin: string | null;
  licensePhotoPath: string | null;
  insurancePhotoPath: string | null;
  medicalCardPhotoPath: string | null;
  /** Drivers.license_expires_on — `YYYY-MM-DD`, or null when unknown. */
  licenseExpiresOn: string | null;
  /** Drivers.insurance_expires_on — `YYYY-MM-DD`, or null when unknown. */
  insuranceExpiresOn: string | null;
  /** Drivers.medical_card_expires_on — `YYYY-MM-DD`, or null when unknown. */
  medicalCardExpiresOn: string | null;
  /** Drivers.id — used as storage path prefix `{driverId}/license_ts.ext` */
  driverId: string | null;

  // Account Manager-specific fields
  assignedDriverUuids: string[];
  assignedZoneEntries: { zoneUuid: string; isLead: boolean }[];
  zoneDriverMap: Record<string, string[]>;

  // UI state
  existingUserUuid: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
};

export type CurrentUserStore = CurrentUserState & {
  setField: <K extends keyof CurrentUserState>(key: K, value: CurrentUserState[K]) => void;
  addRoleTab: (role: TeamRoleTab) => void;
  removeRoleTab: (role: TeamRoleTab) => void;
  setIsOpen: (isOpen: boolean) => void;
  resetForm: () => void;
  loadExistingUser: (userUuid: string, supabase: any) => Promise<void>;
  openForNewUser: () => void;
};

const initialState: CurrentUserState = {
  firstName: "",
  lastName: "",
  email: "",
  isAdmin: false,
  statusUuid: null,
  isDriver: false,
  isAccountManager: false,
  isDeveloper: false,
  isMaintainer: false,
  isViewer: false,
  autoSubscribeToNewTickets: true,
  roleTabs: [],
  taxDec: undefined,
  payRateCents: null,
  deadheadRateCents: null,
  setupCents: null,
  teardownCents: null,
  payCurrency: "CAD",
  payPerUnit: "KM",
  payRanges: [],
  accountManagerUuid: null,
  assignedDriverZoneUuids: [],
  vendorUuid: null,
  phoneNumber: null,
  addressUuid: null,
  homeAddress: null,
  homeCity: null,
  homeState: null,
  homePostalCode: null,
  homeLat: null,
  homeLng: null,
  homePlaceId: null,
  homeCountry: null,
  vehicleUuid: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
  vehicleVin: null,
  licensePhotoPath: null,
  insurancePhotoPath: null,
  medicalCardPhotoPath: null,
  licenseExpiresOn: null,
  insuranceExpiresOn: null,
  medicalCardExpiresOn: null,
  driverId: null,
  assignedDriverUuids: [],
  assignedZoneEntries: [],
  zoneDriverMap: {},
  existingUserUuid: null,
  isOpen: false,
  isSubmitting: false,
};

export const useCurrentUserStore = create<CurrentUserStore>((set) => ({
  ...initialState,

  setField: (key, value) => set((state) => ({ ...state, [key]: value })),

  addRoleTab: (role) =>
    set((state) => {
      if (state.roleTabs.includes(role)) return state;

      return {
        ...state,
        roleTabs: [...state.roleTabs, role],
        isAdmin: role === "administrator" ? true : state.isAdmin,
        isAccountManager: role === "account-manager" ? true : state.isAccountManager,
        isDriver: role === "driver" ? true : state.isDriver,
        isDeveloper: role === "developer" ? true : state.isDeveloper,
        isMaintainer: role === "maintainer" ? true : state.isMaintainer,
        isViewer: role === "viewer" ? true : state.isViewer,
        // Default auto-subscribe to true when developer role is first added
        autoSubscribeToNewTickets: role === "developer" ? true : state.autoSubscribeToNewTickets,
        // Pre-allocate Drivers.id so document uploads match the mobile app path convention
        driverId: role === "driver" && !state.driverId ? crypto.randomUUID() : state.driverId,
      };
    }),

  removeRoleTab: (role) =>
    set((state) => {
      if (!state.roleTabs.includes(role)) return state;

      const nextRoleTabs = state.roleTabs.filter((r) => r !== role);

      return {
        ...state,
        roleTabs: nextRoleTabs,
        isAdmin: role === "administrator" ? false : state.isAdmin,
        isAccountManager: role === "account-manager" ? false : state.isAccountManager,
        isDriver: role === "driver" ? false : state.isDriver,
        isDeveloper: role === "developer" ? false : state.isDeveloper,
        isMaintainer: role === "maintainer" ? false : state.isMaintainer,
        isViewer: role === "viewer" ? false : state.isViewer,
      };
    }),

  setIsOpen: (isOpen) => set({ isOpen }),

  resetForm: () => set(initialState),

  loadExistingUser: async (userUuid, supabase) => {
    set({ existingUserUuid: userUuid, isOpen: true });

    const result = await fetchUserById(supabase, userUuid);

    if (result) {
      set({ ...result, existingUserUuid: userUuid, isOpen: true, isSubmitting: false });
    } else {
      console.error("Failed to load user data");
      set({ isSubmitting: false });
    }
  },

  openForNewUser: () => {
    set({ ...initialState, isOpen: true });
  },
}));
