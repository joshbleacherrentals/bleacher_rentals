/**
 * The quick status button on the Quotes & Bookings list: one click steps the Status filter through
 * All -> Booked -> Quoted -> Lost -> Draft -> All. It reads and writes the same `filters.statuses` the
 * Filter Panel does, so the two never disagree.
 */

export type StatusPreset = "all" | "booked" | "quoted" | "lost" | "draft";

/** What the button shows when the Filter Panel holds a selection the button does not cycle to. */
export type StatusQuickState = StatusPreset | "custom";

const ORDER: readonly StatusPreset[] = ["all", "booked", "quoted", "lost", "draft"];

export function presetOfStatuses(statuses: string[]): StatusQuickState {
  if (statuses.length === 0) return "all";
  if (statuses.length === 1 && ORDER.includes(statuses[0] as StatusPreset)) {
    return statuses[0] as StatusPreset;
  }
  return "custom";
}

/** From a custom selection the first press lands on Booked, the first step of the cycle. */
export function nextStatusPreset(current: StatusQuickState): StatusPreset {
  if (current === "custom") return "booked";
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

export function statusesForPreset(preset: StatusPreset): string[] {
  return preset === "all" ? [] : [preset];
}
