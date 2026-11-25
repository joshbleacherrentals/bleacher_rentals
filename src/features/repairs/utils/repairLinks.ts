import { offeredFreeReports } from "./closeReports";
import type { ServicesDraft } from "./serviceForm";

/**
 * The rules of what a service does to the repair around it: the zone of a bleacher on a day, the
 * verdict about the zones of a repair, the bleachers that gain or lose their services, the bleachers a
 * draft checks, and the plan of the junction, the zone and the damage report links. Pure, with no
 * database behind it. docs/specs/repairs-09b2-bleachers-zone-reports.md §3 (D169 to D186; the types
 * here are locked by that spec).
 */

/** What the zone of one bleacher on one day is made from (D171, D175, D177). */
export type ZoneFacts = {
  bleacherUuid: string;
  ownZoneUuid: string | null;
  /** Each accepted sub-rental of the bleacher that covers the day: the zone it borrows, or null. */
  coveringZones: readonly (string | null)[];
};

/**
 * No cover: the own zone. Cover: the zone all the covering sub-rentals borrow, and null when they
 * borrow different zones or one of them borrows none. A bleacher with no zone gives null.
 */
export function zoneOnDay(facts: ZoneFacts): string | null {
  const { coveringZones, ownZoneUuid } = facts;
  if (coveringZones.length === 0) return ownZoneUuid;
  const first = coveringZones[0];
  if (first === null) return null;
  return coveringZones.every((zone) => zone === first) ? first : null;
}

export type ZoneVerdict =
  | { ok: true; zoneToStore: string | null }
  | { ok: false; bleacherUuid: string; bleacherZoneUuid: string; repairZoneUuid: string };

/**
 * D172, D174 to D177. `storedZoneUuid` is the repair's zone before the write. `liveBleacherUuids` are
 * the bleachers of its live services after the write, one entry per service, in the list's order.
 * `zones` maps a bleacher to its zone on `event_start` (null: none). The zone to compare with is the
 * stored zone, else the first zone among the live bleachers. The first checked bleacher whose zone is
 * not null and differs from it is a refusal. Otherwise `zoneToStore` is the zone to compare with when
 * nothing was stored, and null when a zone is stored or none exists.
 */
export function judgeZones(input: {
  storedZoneUuid: string | null;
  liveBleacherUuids: readonly string[];
  checkedBleacherUuids: readonly string[];
  zones: ReadonlyMap<string, string | null>;
}): ZoneVerdict {
  const { storedZoneUuid, liveBleacherUuids, checkedBleacherUuids, zones } = input;

  let repairZone: string | null = storedZoneUuid;
  if (!repairZone) {
    for (const bleacherUuid of liveBleacherUuids) {
      const zone = zones.get(bleacherUuid) ?? null;
      if (zone) {
        repairZone = zone;
        break;
      }
    }
  }

  if (repairZone) {
    for (const bleacherUuid of checkedBleacherUuids) {
      const zone = zones.get(bleacherUuid) ?? null;
      if (zone && zone !== repairZone) {
        return { ok: false, bleacherUuid, bleacherZoneUuid: zone, repairZoneUuid: repairZone };
      }
    }
  }
  return { ok: true, zoneToStore: storedZoneUuid ? null : repairZone };
}

/** "Bleacher #60 is in Zone 2, but this repair is in Zone 1." (with the day: "... on 2026-11-20, ..."). */
export function zoneConflictMessage(input: {
  bleacherNumber: number | null; // null gives "#?"
  bleacherZoneName: string | null; // null gives "another zone"
  repairZoneName: string | null;
  day: string | null;
}): string {
  const number = input.bleacherNumber === null ? "#?" : `#${input.bleacherNumber}`;
  const bleacherZone = input.bleacherZoneName?.trim() || "another zone";
  const repairZone = input.repairZoneName?.trim() || "another zone";
  const on = input.day ? ` on ${input.day}` : "";
  return `Bleacher ${number} is in ${bleacherZone}${on}, but this repair is in ${repairZone}.`;
}

function distinct(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Bleachers that gain or lose their live services (D169, D182): distinct, in order of appearance. */
export function gainsAndLosses(
  before: readonly string[],
  after: readonly string[],
): { gained: string[]; lost: string[] } {
  const had = new Set(before);
  const has = new Set(after);
  return {
    gained: distinct(after).filter((bleacher) => !had.has(bleacher)),
    lost: distinct(before).filter((bleacher) => !has.has(bleacher)),
  };
}

/**
 * The bleachers a draft's Save checks (D176): those of the added entries and of the stored entries
 * whose bleacher changed; removed entries and unchosen bleachers are left out.
 */
export function checkedBleachersOfDraft(draft: ServicesDraft): string[] {
  const checked: string[] = [];
  for (const entry of draft) {
    if (entry.removed) continue;
    const bleacher = entry.values.bleacherUuid;
    if (!bleacher) continue;
    if (entry.stored === null || entry.initial?.bleacherUuid !== bleacher) checked.push(bleacher);
  }
  return distinct(checked);
}

/**
 * The bleachers of the live entries of a draft, in the draft's order, one per entry, without the
 * entry `exceptId`; the context of a draft's check (D176).
 */
export function liveBleachersOfDraft(draft: ServicesDraft, exceptId?: string): string[] {
  const live: string[] = [];
  for (const entry of draft) {
    if (entry.removed || entry.id === exceptId) continue;
    const bleacher = entry.values.bleacherUuid;
    if (bleacher) live.push(bleacher);
  }
  return live;
}

/** The check a draft's service window calls before a service goes into the draft (D176). */
export type ServiceZoneCheck = (input: {
  bleacherUuid: string;
  /** `Repair from` as the window has it; null while it is empty. */
  eventStart: string | null;
  /** The bleachers of the other live services of the draft, in the draft's order. */
  otherLiveBleacherUuids: readonly string[];
}) => Promise<string | null>; // the refusal text, or null

export type OpenReportForLink = {
  id: string;
  bleacherUuid: string;
  createdAt: string; // the stored timestamp
  repairId: string | null; // the repair it is linked to
};

export type LinkPlanInput = {
  repair: { id: string; status: string; eventEnd: string | null; zoneUuid: string | null };
  gained: readonly string[];
  lost: readonly string[];
  /** The repair's junction rows now (after the action's own statements). */
  junction: readonly { id: string; bleacherUuid: string }[];
  /** The open, not deleted reports of the gained and lost bleachers. */
  openReports: readonly OpenReportForLink[];
  zoneToStore: string | null; // from `judgeZones`
  timezone: string;
  /** The free reports the person chose to close in the dialog (08a D245, D246); none when nobody was asked. */
  closeFreeIds: readonly string[];
};

export type LinkPlan = {
  junctionDeleteBleachers: string[]; // lost and in the junction: every row of the pair goes (D169)
  junctionInsertBleachers: string[]; // gained and not in the junction (D170)
  zoneToWrite: string | null; // D172: only with a gain, and only when `repair.zoneUuid` is empty
  unlinkBleachers: string[]; // D180: the lost ones
  linkReportIds: string[]; // D178, D179: not Completed: reports of gained bleachers linked to no repair
  closeReportIds: string[]; // D181, D185: Completed: the same, created no later than `eventEnd`
};

/**
 * The plan of §2.1 step 6. A report linked to any repair (this one included) is never in a list. On a
 * Completed repair the free reports are not linked and closed on their own: those that
 * `offeredFreeReports` offers and whose id is in `closeFreeIds` are closed, and the rest stay open and
 * unlinked (08a D243 to D246).
 */
export function planRepairLinks(input: LinkPlanInput): LinkPlan {
  const { repair, gained, lost, junction, openReports, zoneToStore, timezone, closeFreeIds } =
    input;

  const inJunction = new Set(junction.map((row) => row.bleacherUuid));
  const gainedSet = new Set(gained);

  const free = openReports.filter(
    (report) => gainedSet.has(report.bleacherUuid) && !report.repairId,
  );
  const completed = repair.status === "completed";

  const linkReportIds: string[] = [];
  let closeReportIds: string[] = [];
  if (!completed) {
    for (const report of free) linkReportIds.push(report.id);
  } else {
    const chosen = new Set(closeFreeIds);
    closeReportIds = offeredFreeReports({
      openReports,
      gained,
      eventEnd: repair.eventEnd,
      timezone,
    })
      .map((report) => report.id)
      .filter((id) => chosen.has(id));
  }

  return {
    junctionDeleteBleachers: lost.filter((bleacher) => inJunction.has(bleacher)),
    junctionInsertBleachers: gained.filter((bleacher) => !inJunction.has(bleacher)),
    zoneToWrite: gained.length > 0 && !repair.zoneUuid ? zoneToStore : null,
    unlinkBleachers: [...lost],
    linkReportIds,
    closeReportIds,
  };
}
