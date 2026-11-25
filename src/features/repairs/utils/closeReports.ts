import { dayInZone } from "./dayInZone";
import type { DamageLevel } from "./repairDetails";
import type { OpenReportForLink } from "./repairLinks";

/**
 * The rules of the dialog that asks which damage reports to close when a repair is Completed: when it
 * is asked, which free reports are offered, and what a choice of switches turns into. Pure, so they
 * are tested without React and without a database.
 * docs/specs/repairs-08a-choose-reports-to-close.md §3 (D238 to D249; the types here are locked by it).
 */

export type CloseGroup = "linked" | "free"; // D240 | D245, D246

export type CloseCandidate = {
  id: string;
  group: CloseGroup;
  bleacherNumber: number | null;
  day: string; // the Reported day, YYYY-MM-DD in the app time zone
  createdBy: string | null; // "First Last"
  seat: DamageLevel;
  haul: DamageLevel;
  note: string | null;
};

/** What the person chose; ids of one group never appear in the list of the other. */
export type CloseChoice = {
  closeLinkedIds: string[]; // D240, switch on
  unlinkLinkedIds: string[]; // D244, switch off
  closeFreeIds: string[]; // D245, D246, switch on
  /**
   * The moment of the Confirm click (D239): the writers use it for `completed_at`, `resolved_at` and
   * the other moments of the write. Absent when nobody was asked; then the writer's own `now` stands.
   */
  confirmedAt?: string;
};

/** Nothing is closed and nothing is unlinked: the choice when nobody was asked (D249). */
export const NO_CLOSING: CloseChoice = {
  closeLinkedIds: [],
  unlinkLinkedIds: [],
  closeFreeIds: [],
};

/** True only when `to` is "completed" and `from` is not (D249). `from` is any stored word. */
export function asksOnStatusChange(from: string, to: string): boolean {
  return to === "completed" && from !== "completed";
}

/**
 * The free reports a Completed repair may close (09b2 D179, D185): open, linked to no repair, on a
 * gained bleacher, created no later than `eventEnd` (a day in `timezone`). Empty when `eventEnd` is
 * null. Shared by the dialog and by `planRepairLinks`; the order of `openReports` is kept.
 */
export function offeredFreeReports(input: {
  openReports: readonly OpenReportForLink[];
  gained: readonly string[];
  eventEnd: string | null;
  timezone: string;
}): OpenReportForLink[] {
  const { openReports, gained, eventEnd, timezone } = input;
  if (!eventEnd) return [];
  const gainedSet = new Set(gained);
  return openReports.filter((report) => {
    if (report.repairId || !gainedSet.has(report.bleacherUuid)) return false;
    const day = dayInZone(report.createdAt, timezone);
    return day !== null && day <= eventEnd;
  });
}

/** The bleachers of the live services of a repair, one per service, in the list's order. */
export function liveServiceBleachers(repair: {
  services: readonly { bleacherUuid: string; deleted: boolean }[];
}): string[] {
  return repair.services.filter((service) => !service.deleted).map((s) => s.bleacherUuid);
}

/** One occurrence of `removed` leaves the list and `added` joins it (a service changes bleacher). */
export function bleachersAfterServiceChange(
  before: readonly string[],
  change: { removed: string | null; added: string | null },
): string[] {
  const after = [...before];
  if (change.removed !== null) {
    const index = after.indexOf(change.removed);
    if (index >= 0) after.splice(index, 1);
  }
  if (change.added !== null) after.push(change.added);
  return after;
}

/** Every switch is on when the dialog opens (D242). */
export function initialSwitches(candidates: readonly CloseCandidate[]): Record<string, boolean> {
  return Object.fromEntries(candidates.map((candidate) => [candidate.id, true]));
}

/**
 * Linked on closes, linked off unlinks (D244), free on closes, free off writes nothing. A candidate
 * with no entry in `switches` counts as off.
 */
export function choiceFromSwitches(
  candidates: readonly CloseCandidate[],
  switches: Readonly<Record<string, boolean>>,
): CloseChoice {
  const choice: CloseChoice = { closeLinkedIds: [], unlinkLinkedIds: [], closeFreeIds: [] };
  for (const candidate of candidates) {
    const on = switches[candidate.id] === true;
    if (candidate.group === "linked") {
      (on ? choice.closeLinkedIds : choice.unlinkLinkedIds).push(candidate.id);
    } else if (on) {
      choice.closeFreeIds.push(candidate.id);
    }
  }
  return choice;
}

/** The two sections of the dialog, each earliest first by day, then by id (D248). */
export function closeSections(candidates: readonly CloseCandidate[]): {
  linked: CloseCandidate[];
  free: CloseCandidate[];
} {
  const order = (a: CloseCandidate, b: CloseCandidate) =>
    a.day.localeCompare(b.day) || a.id.localeCompare(b.id);
  return {
    linked: candidates.filter((c) => c.group === "linked").sort(order),
    free: candidates.filter((c) => c.group === "free").sort(order),
  };
}
