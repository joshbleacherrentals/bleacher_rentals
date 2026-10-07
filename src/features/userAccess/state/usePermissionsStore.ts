import { create } from "zustand";
import type { WebRole } from "../logic/determineAccess";

/**
 * Lightweight permissions store that can be read from non-React code
 * (e.g. Pixi.js renderers). Populated by PermissionsSync component.
 */
type PermissionsState = {
  /** Every role the user holds. Empty until sign-in completes, so every capability is "no". */
  roles: WebRole[];
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
  accountManagerId: string | null;
  accountManagerZoneIds: string[];
  leadZoneIds: string[];
  userId: string | null;
};

export const usePermissionsStore = create<PermissionsState>(() => ({
  roles: [],
  isAdmin: false,
  isAccountManager: false,
  isMaintainer: false,
  accountManagerId: null,
  accountManagerZoneIds: [],
  leadZoneIds: [],
  userId: null,
}));
