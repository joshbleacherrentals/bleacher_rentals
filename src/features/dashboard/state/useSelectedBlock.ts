"use client";
import { create } from "zustand";

export type SelectedBlockState = {
  isOpen: boolean;
  key: string;
  blockUuid: string | null;
  /** Author of the note in the open cell; null when the cell is empty or the note is old. */
  createdByUserUuid: string | null;
  bleacherUuid: string;
  date: string;
  text: string;
  workTrackerUuid: string | null;
};

// Me take event form stuff, add tools to change it.
export type SelectedBlockStore = SelectedBlockState & {
  // Me give key and value. Me change that part in box.
  setField: <K extends keyof SelectedBlockState>(key: K, value: SelectedBlockState[K]) => void;

  // Me smash reset. Everything go back to start.
  resetForm: () => void;
};

const initialState: SelectedBlockState = {
  isOpen: false,
  key: "",
  blockUuid: null,
  createdByUserUuid: null,
  bleacherUuid: "",
  date: "",
  text: "",
  workTrackerUuid: null,
};

// Me make magic state box. Inside: all starting data. Also tools to change data.
export const useSelectedBlockStore = create<SelectedBlockStore>((set) => ({
  // Me copy all default values.
  ...initialState,

  // Me update one thing inside box.
  setField: (key, value) => set((state) => ({ ...state, [key]: value })),

  // Boom. Reset everything.
  resetForm: () => set(initialState),
}));
