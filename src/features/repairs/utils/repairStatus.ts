import { statusPill } from "./repairFormat";
import type { RepairStatus } from "./repairRows";

/**
 * The rules of the status menu, pure so they are tested without React and without a database: the
 * order of the menu, what a change writes and who gets the menu. Which reports a move into Completed
 * closes is the person's choice (utils/closeReports.ts, docs/specs/repairs-08a-choose-reports-to-close.md).
 * docs/specs/repairs-08-status.md §2.3 and §3 (D110 to D118; the signatures here are locked by it).
 */

/** The six statuses in the course of a repair: the order of the menu (spec 05 D74). */
export const REPAIR_STATUSES: readonly RepairStatus[] = [
  "inbound",
  "triaged",
  "waiting_repair",
  "in_repair",
  "confirm_repair",
  "completed",
];

/** What a change writes on the repair itself. */
export type StatusPatch = {
  status: RepairStatus;
  /** A moment: written. null: cleared. undefined: left as it is. */
  completedAt: string | null | undefined;
};

/**
 * `null` when the status does not change. Into Completed: `completedAt` is `now` (D112). Out of
 * Completed (`from` is "completed"): `null`, the date is cleared (D113). Otherwise `undefined`.
 * `from` is any stored word, so a word the code does not know counts as not Completed.
 */
export function statusPatch(from: string, to: RepairStatus, now: string): StatusPatch | null {
  if (from === to) return null;
  if (to === "completed") return { status: to, completedAt: now };
  if (from === "completed") return { status: to, completedAt: null };
  return { status: to, completedAt: undefined };
}

/** The menu is drawn when the role may (`allowed`) and the repair is live (D110, D118). */
export function canChangeRepairStatus(params: { allowed: boolean; deleted: boolean }): boolean {
  return params.allowed && !params.deleted;
}

export type StatusMenuEntry = {
  status: RepairStatus;
  label: string; // the word of the pill
  dotClassName: string; // a background class in the colour of the status, written out in full
  current: boolean;
};

// The dot of a status is the ink of its pill (repairFormat.ts). Tailwind finds these class names
// because they are written out in full.
const DOT_CLASS: Record<RepairStatus, string> = {
  inbound: "bg-[#1a5892]",
  triaged: "bg-[#563b9c]",
  waiting_repair: "bg-[#7d5a1c]",
  in_repair: "bg-[#93440d]",
  confirm_repair: "bg-[#1b6464]",
  completed: "bg-[#2f6b4c]",
};

/** The six entries of the menu in order; `current` is any stored word, ticked when it matches. */
export function statusMenuEntries(current: string): StatusMenuEntry[] {
  return REPAIR_STATUSES.map((status) => ({
    status,
    label: statusPill(status).label,
    dotClassName: DOT_CLASS[status],
    current: status === current,
  }));
}
