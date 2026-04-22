"use client";

import { create } from "zustand";
import { AddressData } from "@/features/eventConfiguration/state/useCurrentEventStore";

export type MaintenanceEventState = {
  maintenanceEventUuid: string | null;
  ownerUserUuid: string | null;
  eventName: string;
  addressData: AddressData | null;
  eventStart: string;
  eventEnd: string;
  costCents: number | null;
  bleacherUuids: string[];
  notes: string;
  isModalOpen: boolean;
  isFormExpanded: boolean;
  isFormMinimized: boolean;
};

type MaintenanceEventActions = {
  setField: <K extends keyof MaintenanceEventState>(
    key: K,
    value: MaintenanceEventState[K],
  ) => void;
  resetForm: () => void;
  openModal: () => void;
  closeModal: () => void;
  openForm: () => void;
  closeForm: () => void;
};

export type MaintenanceEventStore = MaintenanceEventState & MaintenanceEventActions;

const initialState: MaintenanceEventState = {
  maintenanceEventUuid: null,
  ownerUserUuid: null,
  eventName: "Maintenance / Repair",
  addressData: null,
  eventStart: "",
  eventEnd: "",
  costCents: null,
  bleacherUuids: [],
  notes: "",
  isModalOpen: false,
  isFormExpanded: false,
  isFormMinimized: false,
};

export const useMaintenanceEventStore = create<MaintenanceEventStore>((set) => ({
  ...initialState,
  setField: (key, value) => set({ [key]: value }),
  resetForm: () => set({ ...initialState }),
  openModal: () => set({ ...initialState, isModalOpen: true }),
  closeModal: () => set({ ...initialState }),
  openForm: () => set({ ...initialState, isFormExpanded: true }),
  closeForm: () => set({ ...initialState }),
}));
