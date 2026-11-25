import { emptyRepairForm, type RepairFormValues } from "./repairForm";
import type { ServicesDraft } from "./serviceForm";

/**
 * What a New repair window starts with when it is opened from the Dashboard or from a damage report,
 * and the days that the maintenance icon of a cell gives it. Pure, so it is tested without React.
 * docs/specs/repairs-11-dashboard.md §2.4, §2.6 and §3 (the signatures here are locked by that spec).
 */

/** What a New repair window starts with (D216, D222, D223, D229, D234). */
export type NewRepairPreset = {
  /** `YYYY-MM-DD`; absent means empty. */
  eventStart?: string;
  eventEnd?: string;
  /** The bleacher chosen in the service form that opens at once. */
  bleacherUuid?: string;
  /** Add repair is refused with no service. */
  requireService?: boolean;
  /** Called once after the repair is added, before the window closes. */
  onCreated?: () => void;
};

/** An accepted sub-rental block of a bleacher; the first ten characters are its day. */
export type SubrentalBlockDays = { eventStart: string; eventEnd: string };

/** The day part of a `YYYY-MM-DD` day or of an ISO time stamp. */
function dayOf(value: string): string {
  return value.substring(0, 10);
}

/** A day moved by whole calendar days, with no time zone in it. */
function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().substring(0, 10);
}

/**
 * The days of the icon of a cell (D216, §2.4): the clicked day, and seven days later, cut by the
 * accepted sub-rentals of the bleacher. A block that holds the start cuts the end at its own end; a
 * block that starts after the start cuts it the day before it starts; the end is never before the
 * start.
 */
export function cellRepairDates(
  date: string,
  blocks: readonly SubrentalBlockDays[],
): { eventStart: string; eventEnd: string } {
  const eventStart = dayOf(date);
  let eventEnd = addDays(eventStart, 7);
  for (const block of blocks) {
    const blockStart = dayOf(block.eventStart);
    const blockEnd = dayOf(block.eventEnd);
    if (blockStart <= eventStart && blockEnd >= eventStart) {
      if (blockEnd < eventEnd) eventEnd = blockEnd;
    } else if (blockStart > eventStart) {
      const dayBefore = addDays(blockStart, -1);
      if (dayBefore < eventEnd) eventEnd = dayBefore;
    }
  }
  if (eventEnd < eventStart) eventEnd = eventStart;
  return { eventStart, eventEnd };
}

/** `emptyRepairForm()` with the days of the preset (§2.6). */
export function presetRepairForm(preset: NewRepairPreset | undefined): RepairFormValues {
  return {
    ...emptyRepairForm(),
    eventStart: preset?.eventStart ?? "",
    eventEnd: preset?.eventEnd ?? "",
  };
}

/**
 * What the New repair window starts with when it is opened from the card of a damage report (D222,
 * D223, D234, D236): the bleacher of the report, a required service, and a tell-back when the repair
 * is added. `days` are the days of the cell the card was opened from; the Damage Reports page has no
 * cell, so it gives none and the days stay empty (D223).
 */
export function reportRepairPreset(args: {
  bleacherUuid: string;
  days?: { eventStart: string; eventEnd: string };
  onCreated: () => void;
}): NewRepairPreset {
  return {
    bleacherUuid: args.bleacherUuid,
    ...(args.days ? { eventStart: args.days.eventStart, eventEnd: args.days.eventEnd } : {}),
    requireService: true,
    onCreated: args.onCreated,
  };
}

/** The line above the services of a refused Add repair (D222). */
export const REQUIRE_SERVICE_MESSAGE = "Add at least one service.";

/**
 * The message of D222, or null: no preset, no `requireService`, or at least one service that is not
 * removed. A service of any bleacher counts (D233).
 */
export function requiredServiceError(
  preset: NewRepairPreset | undefined,
  services: ServicesDraft,
): string | null {
  if (!preset?.requireService) return null;
  return services.some((service) => !service.removed) ? null : REQUIRE_SERVICE_MESSAGE;
}
