"use client";

import { create } from "zustand";
import { useEventsStore } from "@/state/eventsStore";
import { calculateBestHue, updateCurrentEventAlerts } from "@/features/dashboard/functions";

export type AddressData = {
  addressUuid: string | null;
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
};

import { EventStatus } from "@/features/dashboard/types";
import { AlertPayload } from "@/features/alerts/types";

export type CurrentEventState = {
  eventUuid: string | null;
  // User who created/owns the event (will default to current logged in user on open)
  ownerUserUuid: string | null;
  // Persisted owner (created_by_user_uuid) at load time. Null for new events.
  // Used by permission gates so live edits to ownerUserUuid don't change who
  // the event "belongs to". Set only by loaders, never by the Owner dropdown.
  originalOwnerUserUuid: string | null;
  eventName: string;
  addressData: AddressData | null;
  // Set when addressData came from picking a Venue; null when the address
  // was typed/edited directly ("manual" / detached — see
  // docs/specs/venue-history.md §2.3, §3.5).
  venueUuid: string | null;
  seats: number | null;
  sevenRow: number | null;
  tenRow: number | null;
  fifteenRow: number | null;
  bleacherRequirements: { bleacherTypeUuid: string; quantity: number }[];
  setupStart: string;
  sameDaySetup: boolean;
  eventStart: string;
  eventEnd: string;
  teardownEnd: string;
  sameDayTeardown: boolean;
  lenient: boolean;
  selectedStatus: EventStatus;
  notes: string;
  mustBeClean: boolean;
  bleacherUuids: string[];
  isFormExpanded: boolean;
  isFormMinimized: boolean;
  hslHue: number | null;
  alerts: AlertPayload[];
  goodshuffleUrl: string | null;
  hueOpen: boolean;
  contractRevenueCents: number | null;
  bookedAt: string | null;
  createdAt: string | null;
  /**
   * When an event is initiated from a subrental row, constrains the date pickers
   * to the accepted subrental window. Cleared on resetForm.
   */
  subrentalConstraint: { eventStart: string; eventEnd: string } | null;
  // Modal state for Create Quote modal
  isModalOpen: boolean;
};

// Me take event form stuff, add tools to change it.
export type CurrentEventStore = CurrentEventState & {
  // Me give key and value. Me change that part in box.
  setField: <K extends keyof CurrentEventState>(key: K, value: CurrentEventState[K]) => void;

  // Me smash reset. Everything go back to start.
  resetForm: () => void;

  // Open the Create Quote modal
  openModal: () => void;

  // Close the Create Quote modal
  closeModal: () => void;
};

const initialState: CurrentEventState = {
  eventUuid: null,
  ownerUserUuid: null,
  originalOwnerUserUuid: null,
  eventName: "",
  addressData: null,
  venueUuid: null,
  seats: 0,
  sevenRow: 0,
  tenRow: 0,
  fifteenRow: 0,
  bleacherRequirements: [],
  setupStart: "",
  sameDaySetup: true,
  eventStart: "",
  eventEnd: "",
  teardownEnd: "",
  sameDayTeardown: true,
  lenient: false,
  selectedStatus: "quoted",
  notes: "",
  mustBeClean: false,
  bleacherUuids: [],
  isFormExpanded: false,
  isFormMinimized: false,
  hslHue: null,
  alerts: [],
  goodshuffleUrl: null,
  hueOpen: false,
  contractRevenueCents: null,
  isModalOpen: false,
  bookedAt: null,
  createdAt: null,
  subrentalConstraint: null,
};

// Me make magic state box. Inside: all starting data. Also tools to change data.
export const useCurrentEventStore = create<CurrentEventStore>((set) => ({
  // Me copy all default values.
  ...initialState,

  // Me update one thing inside box.
  setField: (key, value) => set((state) => ({ ...state, [key]: value })),

  // Boom. Reset everything.
  resetForm: () => set(initialState),

  // Open modal with fresh form
  openModal: () => set({ ...initialState, isModalOpen: true }),

  // Close modal and reset form
  closeModal: () => set(initialState),
}));

useCurrentEventStore.subscribe((state) => {
  // 💥 Update alerts too!
  // console.log("Update alerts too!");
  updateCurrentEventAlerts();

  if (state.eventStart === "" || state.hslHue !== null || state.eventEnd === "") return;

  const events = useEventsStore.getState().events;
  const newHue = calculateBestHue(state, events);
  // console.log("newHue", newHue);

  if (newHue !== null) {
    useCurrentEventStore.getState().setField("hslHue", newHue);
  }
});
