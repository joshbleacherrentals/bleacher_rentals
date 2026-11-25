"use client";

import { create } from "zustand";
import { closeFrom, openWindow, type WindowEntry } from "../utils/repairDetails";

/**
 * The stack of repair windows, in plain memory (not the address; spec 07 D95). The canvas of the
 * Dashboard, the cell editor, the "+ Create" menu and the card of a damage report are not part of the
 * React tree of a page, so they all open a window through this store, and the host of the page draws
 * it. docs/specs/repairs-11-dashboard.md §2.7 and §3.
 */
export type RepairWindowsStore = {
  stack: WindowEntry[];
  /** Puts a window on top; the window that is already on top is not opened twice. */
  open: (entry: WindowEntry) => void;
  /** Removes the window at `index` and every window above it. */
  close: (index: number) => void;
  reset: () => void;
};

export const useRepairWindowsStore = create<RepairWindowsStore>((set) => ({
  stack: [],
  open: (entry) => set((state) => ({ stack: openWindow(state.stack, entry) })),
  close: (index) => set((state) => ({ stack: closeFrom(state.stack, index) })),
  reset: () => set({ stack: [] }),
}));
