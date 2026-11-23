import { describe, expect, it } from "vitest";
import {
  checkedBleachersOfDraft,
  gainsAndLosses,
  judgeZones,
  liveBleachersOfDraft,
  planRepairLinks,
  zoneConflictMessage,
  zoneOnDay,
  type LinkPlanInput,
  type OpenReportForLink,
} from "./repairLinks";
import {
  addDraftService,
  removeDraftService,
  servicesDraftFromRepair,
  updateDraftService,
  type ServiceFormValues,
} from "./serviceForm";
import { repairRow, repairService } from "./repairRowFixture";

// docs/specs/repairs-09b2-bleachers-zone-reports.md §3 and §7 (D169 to D186). Pure rules: the zone
// of a bleacher on a day, the verdict about the zones, the gains and losses of a write, the bleachers
// a draft checks, and the plan of the junction, the zone and the reports.

const Z1 = "z1";
const Z2 = "z2";

const serviceValues = (over: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
  bleacherUuid: "b1",
  categoryUuid: "c1",
  severity: "minor",
  description: "",
  laborText: "",
  partsText: "",
  taxText: "",
  freightText: "",
  ...over,
});

describe("zoneOnDay (D171, D175, D177)", () => {
  it("is the own zone when no sub-rental covers the day", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [] })).toBe(Z1);
  });

  it("is null for a bleacher with no zone and no cover", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: null, coveringZones: [] })).toBeNull();
  });

  it("is the borrowed zone, over the own one, when one sub-rental covers the day", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [Z2] })).toBe(Z2);
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: null, coveringZones: [Z2] })).toBe(Z2);
  });

  it("is that zone when two covering sub-rentals borrow the same one", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [Z2, Z2] })).toBe(Z2);
  });

  it("is null when two covering sub-rentals borrow different zones (D177)", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [Z1, Z2] })).toBeNull();
  });

  it("is null when a covering sub-rental borrows no zone", () => {
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [null] })).toBeNull();
    expect(zoneOnDay({ bleacherUuid: "b", ownZoneUuid: Z1, coveringZones: [Z2, null] })).toBeNull();
  });
});

describe("judgeZones (D172, D174 to D177)", () => {
  const zones = (entries: Record<string, string | null>) => new Map(Object.entries(entries));

  it("compares with the stored zone and refuses a checked bleacher in another zone", () => {
    const verdict = judgeZones({
      storedZoneUuid: Z1,
      liveBleacherUuids: ["b1", "b2"],
      checkedBleacherUuids: ["b2"],
      zones: zones({ b1: Z1, b2: Z2 }),
    });
    expect(verdict).toEqual({
      ok: false,
      bleacherUuid: "b2",
      bleacherZoneUuid: Z2,
      repairZoneUuid: Z1,
    });
  });

  it("accepts a checked bleacher in the stored zone and stores nothing", () => {
    expect(
      judgeZones({
        storedZoneUuid: Z1,
        liveBleacherUuids: ["b1"],
        checkedBleacherUuids: ["b1"],
        zones: zones({ b1: Z1 }),
      }),
    ).toEqual({ ok: true, zoneToStore: null });
  });

  it("with nothing stored, the zone to compare with is the first zone among the live bleachers", () => {
    expect(
      judgeZones({
        storedZoneUuid: null,
        liveBleacherUuids: ["b1", "b2"],
        checkedBleacherUuids: ["b1"],
        zones: zones({ b1: Z1, b2: Z1 }),
      }),
    ).toEqual({ ok: true, zoneToStore: Z1 });
  });

  it("refuses the second of two checked bleachers in different zones when nothing is stored", () => {
    const verdict = judgeZones({
      storedZoneUuid: null,
      liveBleacherUuids: ["b1", "b2"],
      checkedBleacherUuids: ["b1", "b2"],
      zones: zones({ b1: Z1, b2: Z2 }),
    });
    expect(verdict).toEqual({
      ok: false,
      bleacherUuid: "b2",
      bleacherZoneUuid: Z2,
      repairZoneUuid: Z1,
    });
  });

  it("never treats a bleacher with no zone as a conflict, and it sets no zone (D175)", () => {
    expect(
      judgeZones({
        storedZoneUuid: Z1,
        liveBleacherUuids: ["b1"],
        checkedBleacherUuids: ["b1"],
        zones: zones({ b1: null }),
      }),
    ).toEqual({ ok: true, zoneToStore: null });
    expect(
      judgeZones({
        storedZoneUuid: null,
        liveBleacherUuids: ["b1"],
        checkedBleacherUuids: ["b1"],
        zones: zones({ b1: null }),
      }),
    ).toEqual({ ok: true, zoneToStore: null });
  });

  it("a bleacher with no zone first and one with a zone second give the second's zone", () => {
    expect(
      judgeZones({
        storedZoneUuid: null,
        liveBleacherUuids: ["b0", "b1"],
        checkedBleacherUuids: ["b0", "b1"],
        zones: zones({ b0: null, b1: Z2 }),
      }),
    ).toEqual({ ok: true, zoneToStore: Z2 });
  });

  it("does not refuse an unchecked bleacher in another zone", () => {
    expect(
      judgeZones({
        storedZoneUuid: Z1,
        liveBleacherUuids: ["b1", "b2"],
        checkedBleacherUuids: ["b1"],
        zones: zones({ b1: Z1, b2: Z2 }),
      }),
    ).toEqual({ ok: true, zoneToStore: null });
  });

  it("stores nothing when no zone exists at all", () => {
    expect(
      judgeZones({
        storedZoneUuid: null,
        liveBleacherUuids: [],
        checkedBleacherUuids: [],
        zones: zones({}),
      }),
    ).toEqual({ ok: true, zoneToStore: null });
  });
});

describe("zoneConflictMessage (D176)", () => {
  it("names the bleacher and both zones", () => {
    expect(
      zoneConflictMessage({
        bleacherNumber: 60,
        bleacherZoneName: "Zone 2",
        repairZoneName: "Zone 1",
        day: null,
      }),
    ).toBe("Bleacher #60 is in Zone 2, but this repair is in Zone 1.");
  });

  it("adds the day when it is known", () => {
    expect(
      zoneConflictMessage({
        bleacherNumber: 60,
        bleacherZoneName: "Zone 2",
        repairZoneName: "Zone 1",
        day: "2026-11-20",
      }),
    ).toBe("Bleacher #60 is in Zone 2 on 2026-11-20, but this repair is in Zone 1.");
  });

  it("writes #? for a bleacher with no number and 'another zone' for a zone with no name", () => {
    expect(
      zoneConflictMessage({
        bleacherNumber: null,
        bleacherZoneName: null,
        repairZoneName: "Zone 1",
        day: null,
      }),
    ).toBe("Bleacher #? is in another zone, but this repair is in Zone 1.");
    expect(
      zoneConflictMessage({
        bleacherNumber: 1,
        bleacherZoneName: "Zone 2",
        repairZoneName: null,
        day: null,
      }),
    ).toBe("Bleacher #1 is in Zone 2, but this repair is in another zone.");
  });
});

describe("gainsAndLosses (D169, D182)", () => {
  it("is empty when nothing changes", () => {
    expect(gainsAndLosses([], [])).toEqual({ gained: [], lost: [] });
    expect(gainsAndLosses(["b1"], ["b1"])).toEqual({ gained: [], lost: [] });
  });

  it("the first service on a bleacher is a gain", () => {
    expect(gainsAndLosses([], ["b1"])).toEqual({ gained: ["b1"], lost: [] });
  });

  it("a second service on the same bleacher is neither", () => {
    expect(gainsAndLosses(["b1"], ["b1", "b1"])).toEqual({ gained: [], lost: [] });
  });

  it("a move is a gain and a loss", () => {
    expect(gainsAndLosses(["b1"], ["b2"])).toEqual({ gained: ["b2"], lost: ["b1"] });
  });

  it("the last service deleted is a loss, one of two is not", () => {
    expect(gainsAndLosses(["b1"], [])).toEqual({ gained: [], lost: ["b1"] });
    expect(gainsAndLosses(["b1", "b1"], ["b1"])).toEqual({ gained: [], lost: [] });
  });

  it("a bleacher removed and added again in one write is no change", () => {
    expect(gainsAndLosses(["b1", "b2"], ["b2", "b1"])).toEqual({ gained: [], lost: [] });
  });

  it("gives distinct bleachers in the order they appear", () => {
    expect(gainsAndLosses([], ["b2", "b1", "b2", "b3"])).toEqual({
      gained: ["b2", "b1", "b3"],
      lost: [],
    });
    expect(gainsAndLosses(["b3", "b1", "b3", "b2"], [])).toEqual({
      gained: [],
      lost: ["b3", "b1", "b2"],
    });
  });
});

describe("the bleachers of a draft (D176)", () => {
  const stored = repairRow({
    id: "r1",
    services: [
      repairService({ id: "s1", bleacherUuid: "b1" }),
      repairService({ id: "s2", bleacherUuid: "b2" }),
    ],
  });

  it("checks an added entry", () => {
    const draft = addDraftService(
      servicesDraftFromRepair(stored),
      "n1",
      serviceValues({ bleacherUuid: "b3" }),
    );
    expect(checkedBleachersOfDraft(draft)).toEqual(["b3"]);
  });

  it("checks a stored entry whose bleacher changed", () => {
    const base = servicesDraftFromRepair(stored);
    const draft = updateDraftService(base, "s1", { ...base[0].values, bleacherUuid: "b9" });
    expect(checkedBleachersOfDraft(draft)).toEqual(["b9"]);
  });

  it("leaves out a stored entry with the same bleacher, even when another field changed", () => {
    const base = servicesDraftFromRepair(stored);
    const draft = updateDraftService(base, "s1", { ...base[0].values, severity: "major" });
    expect(checkedBleachersOfDraft(draft)).toEqual([]);
  });

  it("leaves out a removed entry and an entry with no bleacher", () => {
    let draft = servicesDraftFromRepair(stored);
    draft = removeDraftService(draft, "s2");
    draft = addDraftService(draft, "n1", serviceValues({ bleacherUuid: null }));
    draft = addDraftService(draft, "n2", serviceValues({ bleacherUuid: "b5" }));
    draft = removeDraftService(draft, "n2");
    expect(checkedBleachersOfDraft(draft)).toEqual([]);
  });

  it("liveBleachersOfDraft keeps the draft's order, one per entry, and leaves out removed entries, entries with no bleacher and exceptId", () => {
    let draft = servicesDraftFromRepair(stored);
    draft = addDraftService(draft, "n1", serviceValues({ bleacherUuid: "b1" }));
    draft = addDraftService(draft, "n2", serviceValues({ bleacherUuid: null }));
    draft = removeDraftService(draft, "s2");
    expect(liveBleachersOfDraft(draft)).toEqual(["b1", "b1"]);
    expect(liveBleachersOfDraft(draft, "s1")).toEqual(["b1"]);
  });
});

describe("planRepairLinks (D169 to D185)", () => {
  const report = (over: Partial<OpenReportForLink> & { id: string }): OpenReportForLink => ({
    bleacherUuid: "b1",
    createdAt: "2026-11-10T15:00:00Z",
    repairId: null,
    ...over,
  });
  const input = (over: Partial<LinkPlanInput> = {}): LinkPlanInput => ({
    repair: { id: "r1", status: "inbound", eventEnd: "2026-11-05", zoneUuid: null },
    gained: [],
    lost: [],
    junction: [],
    openReports: [],
    zoneToStore: null,
    timezone: "America/Toronto",
    ...over,
  });

  it("is empty for a write with no gain, no loss and nothing to store", () => {
    expect(planRepairLinks(input())).toEqual({
      junctionDeleteBleachers: [],
      junctionInsertBleachers: [],
      zoneToWrite: null,
      unlinkBleachers: [],
      linkReportIds: [],
      closeReportIds: [],
    });
  });

  it("removes the rows of a lost bleacher, only when it has a row (D169)", () => {
    const plan = planRepairLinks(
      input({ lost: ["b1", "b2"], junction: [{ id: "j1", bleacherUuid: "b1" }] }),
    );
    expect(plan.junctionDeleteBleachers).toEqual(["b1"]);
  });

  it("inserts a row only for a gained bleacher that has none (D170)", () => {
    const plan = planRepairLinks(
      input({ gained: ["b1", "b2"], junction: [{ id: "j1", bleacherUuid: "b1" }] }),
    );
    expect(plan.junctionInsertBleachers).toEqual(["b2"]);
  });

  it("writes the zone only with a gain, only when none is stored and only when there is one to store (D172)", () => {
    expect(planRepairLinks(input({ gained: ["b1"], zoneToStore: Z1 })).zoneToWrite).toBe(Z1);
    expect(planRepairLinks(input({ zoneToStore: Z1 })).zoneToWrite).toBeNull();
    expect(
      planRepairLinks(
        input({
          gained: ["b1"],
          zoneToStore: Z1,
          repair: { id: "r1", status: "inbound", eventEnd: null, zoneUuid: Z2 },
        }),
      ).zoneToWrite,
    ).toBeNull();
    expect(planRepairLinks(input({ gained: ["b1"], zoneToStore: null })).zoneToWrite).toBeNull();
  });

  it("unlinks the lost bleachers (D180)", () => {
    expect(planRepairLinks(input({ lost: ["b1", "b2"] })).unlinkBleachers).toEqual(["b1", "b2"]);
  });

  it("links every open report of a gained bleacher that is linked to no repair, whatever its day, when the repair is not Completed (D178)", () => {
    const plan = planRepairLinks(
      input({
        gained: ["b1"],
        openReports: [
          report({ id: "old", createdAt: "2026-10-01T10:00:00Z" }),
          report({ id: "new", createdAt: "2026-12-01T10:00:00Z" }),
          report({ id: "other-bleacher", bleacherUuid: "b2" }),
        ],
      }),
    );
    expect(plan.linkReportIds).toEqual(["old", "new"]);
    expect(plan.closeReportIds).toEqual([]);
  });

  it("puts a report linked to another repair, and one linked to this repair, in no list (D179)", () => {
    const plan = planRepairLinks(
      input({
        gained: ["b1"],
        openReports: [
          report({ id: "elsewhere", repairId: "r2" }),
          report({ id: "here", repairId: "r1" }),
          report({ id: "free" }),
        ],
      }),
    );
    expect(plan.linkReportIds).toEqual(["free"]);
    expect(plan.closeReportIds).toEqual([]);
  });

  it("does not link the reports of a bleacher that only stayed or was lost", () => {
    const plan = planRepairLinks(input({ lost: ["b1"], openReports: [report({ id: "free" })] }));
    expect(plan.linkReportIds).toEqual([]);
    expect(plan.closeReportIds).toEqual([]);
  });

  it("for a Completed repair closes only the reports created no later than event_end, and links none to stay open (D181, D185)", () => {
    const plan = planRepairLinks(
      input({
        repair: { id: "r1", status: "completed", eventEnd: "2026-11-05", zoneUuid: null },
        gained: ["b1"],
        openReports: [
          report({ id: "before", createdAt: "2026-11-03T15:00:00Z" }),
          report({ id: "after", createdAt: "2026-11-10T15:00:00Z" }),
        ],
      }),
    );
    expect(plan.closeReportIds).toEqual(["before"]);
    expect(plan.linkReportIds).toEqual([]);
  });

  it("compares the report's day in the app time zone with event_end", () => {
    // 2026-11-06T02:00Z is 2026-11-05 in Toronto: it is on event_end, so it counts.
    const completed = { id: "r1", status: "completed", eventEnd: "2026-11-05", zoneUuid: null };
    const plan = planRepairLinks(
      input({
        repair: completed,
        gained: ["b1"],
        openReports: [report({ id: "edge", createdAt: "2026-11-06T02:00:00Z" })],
      }),
    );
    expect(plan.closeReportIds).toEqual(["edge"]);
    const utc = planRepairLinks(
      input({
        repair: completed,
        gained: ["b1"],
        timezone: "UTC",
        openReports: [report({ id: "edge", createdAt: "2026-11-06T02:00:00Z" })],
      }),
    );
    expect(utc.closeReportIds).toEqual([]);
  });

  it("closes nothing on a Completed repair that has no event_end, or for a report with no readable day", () => {
    const noEnd = planRepairLinks(
      input({
        repair: { id: "r1", status: "completed", eventEnd: null, zoneUuid: null },
        gained: ["b1"],
        openReports: [report({ id: "x" })],
      }),
    );
    expect(noEnd.closeReportIds).toEqual([]);
    const noDay = planRepairLinks(
      input({
        repair: { id: "r1", status: "completed", eventEnd: "2026-11-30", zoneUuid: null },
        gained: ["b1"],
        openReports: [report({ id: "x", createdAt: "" })],
      }),
    );
    expect(noDay.closeReportIds).toEqual([]);
  });

  it("a loss and a gain in one plan", () => {
    const plan = planRepairLinks(
      input({
        gained: ["b2"],
        lost: ["b1"],
        junction: [{ id: "j1", bleacherUuid: "b1" }],
        zoneToStore: Z1,
        openReports: [report({ id: "r-b2", bleacherUuid: "b2" })],
      }),
    );
    expect(plan).toEqual({
      junctionDeleteBleachers: ["b1"],
      junctionInsertBleachers: ["b2"],
      zoneToWrite: Z1,
      unlinkBleachers: ["b1"],
      linkReportIds: ["r-b2"],
      closeReportIds: [],
    });
  });
});
