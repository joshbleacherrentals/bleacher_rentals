import { describe, expect, it } from "vitest";
import {
  NO_CLOSING,
  asksOnStatusChange,
  bleachersAfterServiceChange,
  choiceFromSwitches,
  closeSections,
  initialSwitches,
  liveServiceBleachers,
  offeredFreeReports,
  type CloseCandidate,
} from "./closeReports";
import type { OpenReportForLink } from "./repairLinks";
import { REPAIR_STATUSES } from "./repairStatus";

// docs/specs/repairs-08a-choose-reports-to-close.md §3 and §7 (D238 to D249). The rules of the
// dialog that asks which damage reports to close are pure functions, so they are tested without
// React and without a database.

const TZ = "America/Toronto";

const candidate = (over: Partial<CloseCandidate> & { id: string }): CloseCandidate => ({
  group: "linked",
  bleacherNumber: 52,
  day: "2026-11-10",
  createdBy: "Pat Driver",
  seat: "minor",
  haul: "none",
  note: null,
  ...over,
});

const open = (over: Partial<OpenReportForLink> & { id: string }): OpenReportForLink => ({
  bleacherUuid: "b1",
  createdAt: "2026-11-05T15:00:00.000Z",
  repairId: null,
  ...over,
});

describe("NO_CLOSING", () => {
  it("closes nothing and unlinks nothing", () => {
    expect(NO_CLOSING).toEqual({ closeLinkedIds: [], unlinkLinkedIds: [], closeFreeIds: [] });
  });
});

describe("asksOnStatusChange", () => {
  it("is true only for a move into Completed from another status (D249)", () => {
    for (const from of REPAIR_STATUSES) {
      for (const to of REPAIR_STATUSES) {
        expect(asksOnStatusChange(from, to), `${from} -> ${to}`).toBe(
          to === "completed" && from !== "completed",
        );
      }
    }
  });

  it("counts a stored word the code does not know as not Completed", () => {
    expect(asksOnStatusChange("archived", "completed")).toBe(true);
    expect(asksOnStatusChange("archived", "triaged")).toBe(false);
  });
});

describe("offeredFreeReports (09b2 D179, D185)", () => {
  const input = {
    openReports: [
      open({ id: "early", createdAt: "2026-11-05T15:00:00.000Z" }),
      open({ id: "on-the-end-day", createdAt: "2026-11-10T20:00:00.000Z" }),
      open({ id: "late", createdAt: "2026-11-11T15:00:00.000Z" }),
      open({ id: "linked", repairId: "some-repair" }),
      open({ id: "other-bleacher", bleacherUuid: "b9" }),
      open({ id: "no-date", createdAt: "" }),
    ],
    gained: ["b1"],
    eventEnd: "2026-11-10",
    timezone: TZ,
  };

  it("keeps the free reports of a gained bleacher created no later than the end day, in order", () => {
    expect(offeredFreeReports(input).map((r) => r.id)).toEqual(["early", "on-the-end-day"]);
  });

  it("skips a report that is linked to any repair, a later one, one on another bleacher, one with no date", () => {
    const ids = offeredFreeReports(input).map((r) => r.id);
    for (const skipped of ["linked", "late", "other-bleacher", "no-date"]) {
      expect(ids).not.toContain(skipped);
    }
  });

  it("reads the day in the time zone: 23:30 on the 10th in Toronto is the 11th in UTC", () => {
    const late = open({ id: "night", createdAt: "2026-11-11T04:30:00.000Z" });
    expect(offeredFreeReports({ ...input, openReports: [late] }).map((r) => r.id)).toEqual([
      "night",
    ]);
    expect(offeredFreeReports({ ...input, openReports: [late], timezone: "UTC" })).toEqual([]);
  });

  it("gives none when the end day is empty or nothing is gained", () => {
    expect(offeredFreeReports({ ...input, eventEnd: null })).toEqual([]);
    expect(offeredFreeReports({ ...input, gained: [] })).toEqual([]);
  });
});

describe("bleachersAfterServiceChange", () => {
  it("adds a bleacher when a service is added", () => {
    expect(bleachersAfterServiceChange(["a", "b"], { removed: null, added: "c" })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("swaps one occurrence when a service changes its bleacher", () => {
    expect(bleachersAfterServiceChange(["a", "b", "a"], { removed: "a", added: "c" })).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("only removes when nothing is added, and ignores a bleacher that is not in the list", () => {
    expect(bleachersAfterServiceChange(["a", "b"], { removed: "a", added: null })).toEqual(["b"]);
    expect(bleachersAfterServiceChange(["a"], { removed: "z", added: null })).toEqual(["a"]);
  });

  it("does not change the list it was given", () => {
    const before = ["a", "b"];
    bleachersAfterServiceChange(before, { removed: "a", added: "c" });
    expect(before).toEqual(["a", "b"]);
  });
});

describe("liveServiceBleachers", () => {
  it("lists the bleacher of each live service, one per service, leaving out the deleted ones", () => {
    expect(
      liveServiceBleachers({
        services: [
          { bleacherUuid: "a", deleted: false },
          { bleacherUuid: "b", deleted: true },
          { bleacherUuid: "a", deleted: false },
        ],
      }),
    ).toEqual(["a", "a"]);
    expect(liveServiceBleachers({ services: [] })).toEqual([]);
  });
});

describe("initialSwitches (D242)", () => {
  it("has every switch on, linked and free", () => {
    const candidates = [candidate({ id: "a" }), candidate({ id: "b", group: "free" })];
    expect(initialSwitches(candidates)).toEqual({ a: true, b: true });
  });

  it("is empty for no candidate", () => {
    expect(initialSwitches([])).toEqual({});
  });
});

describe("choiceFromSwitches (D240, D244, D245, D246)", () => {
  const candidates = [
    candidate({ id: "l-on" }),
    candidate({ id: "l-off" }),
    candidate({ id: "f-on", group: "free" }),
    candidate({ id: "f-off", group: "free" }),
  ];
  const switches = { "l-on": true, "l-off": false, "f-on": true, "f-off": false };

  it("linked on closes, linked off unlinks, free on closes, free off writes nothing", () => {
    expect(choiceFromSwitches(candidates, switches)).toEqual({
      closeLinkedIds: ["l-on"],
      unlinkLinkedIds: ["l-off"],
      closeFreeIds: ["f-on"],
    });
  });

  it("all off: nothing is closed, the linked reports are unlinked (Confirm with every switch off)", () => {
    const allOff = Object.fromEntries(candidates.map((c) => [c.id, false]));
    expect(choiceFromSwitches(candidates, allOff)).toEqual({
      closeLinkedIds: [],
      unlinkLinkedIds: ["l-on", "l-off"],
      closeFreeIds: [],
    });
  });

  it("all on: everything is closed and nothing is unlinked", () => {
    expect(choiceFromSwitches(candidates, initialSwitches(candidates))).toEqual({
      closeLinkedIds: ["l-on", "l-off"],
      unlinkLinkedIds: [],
      closeFreeIds: ["f-on", "f-off"],
    });
  });

  it("treats a candidate with no entry in the switches as off", () => {
    expect(choiceFromSwitches(candidates, {})).toEqual({
      closeLinkedIds: [],
      unlinkLinkedIds: ["l-on", "l-off"],
      closeFreeIds: [],
    });
  });

  it("never puts an id in the list of the other group", () => {
    const choice = choiceFromSwitches(candidates, switches);
    const linked = [...choice.closeLinkedIds, ...choice.unlinkLinkedIds];
    expect(linked.some((id) => choice.closeFreeIds.includes(id))).toBe(false);
  });
});

describe("closeSections (D248)", () => {
  it("splits by group and puts the earliest day first, then the id", () => {
    const sections = closeSections([
      candidate({ id: "b", day: "2026-11-10" }),
      candidate({ id: "a", day: "2026-11-10" }),
      candidate({ id: "c", day: "2026-11-01" }),
      candidate({ id: "f2", group: "free", day: "2026-11-09" }),
      candidate({ id: "f1", group: "free", day: "2026-11-02" }),
    ]);
    expect(sections.linked.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(sections.free.map((c) => c.id)).toEqual(["f1", "f2"]);
  });

  it("has an empty section when the group has no report", () => {
    expect(closeSections([candidate({ id: "a" })]).free).toEqual([]);
    expect(closeSections([]).linked).toEqual([]);
  });
});
