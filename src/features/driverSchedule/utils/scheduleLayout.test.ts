import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  DAY_START,
  DEFAULT_DEADHEAD_MINUTES,
  DEFAULT_HAUL_MINUTES,
  clock,
  duration,
  layoutSchedule,
  type ScheduleTracker,
} from "./scheduleLayout";

const WEEK = "2026-09-14";
const at = (date: string, hhmm: string) => DateTime.fromISO(`${date}T${hhmm}`).toISO(); // local time, as the viewer sees it

const tracker = (over: Partial<ScheduleTracker>): ScheduleTracker => ({
  id: "w1",
  date: WEEK,
  previousId: null,
  plannedPickupAt: null,
  plannedDropoffAt: null,
  haulMinutes: null,
  deadheadInMinutes: null,
  returnHomeMinutes: null,
  bleacherNumber: 12,
  pickupLabel: "Fair",
  dropoffLabel: "Rodeo",
  ...over,
});

describe("layoutSchedule", () => {
  it("always gives seven days, Monday first", () => {
    const days = layoutSchedule([], WEEK);
    expect(days.map((d) => d.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("paints a planned chain: deadhead in, haul, deadhead from the drop-off, haul, home", () => {
    const days = layoutSchedule(
      [
        tracker({
          id: "w1",
          plannedPickupAt: at(WEEK, "08:00"),
          plannedDropoffAt: at(WEEK, "10:00"),
          deadheadInMinutes: 60,
        }),
        tracker({
          id: "w2",
          previousId: "w1",
          plannedPickupAt: at(WEEK, "10:30"),
          plannedDropoffAt: at(WEEK, "12:00"),
          deadheadInMinutes: 30,
          returnHomeMinutes: 45,
        }),
      ],
      WEEK,
    );
    expect(days[0].spans.map((s) => [s.kind, s.start, s.end, s.estimated])).toEqual([
      ["deadhead", 7 * 60, 8 * 60, false],
      ["haul", 8 * 60, 10 * 60, false],
      ["deadhead", 10 * 60, 10 * 60 + 30, false],
      ["haul", 10 * 60 + 30, 12 * 60, false],
      ["deadhead", 12 * 60, 12 * 60 + 45, false],
    ]);
    expect(days[0].trips).toBe(2);
    expect(days[0].driveMinutes).toBe(60 + 120 + 30 + 90 + 45);
  });

  it("places trips with no planned times from the start of the day, as early as they can be", () => {
    const [monday] = layoutSchedule([tracker({ haulMinutes: 90 })], WEEK);
    expect(monday.spans.map((s) => [s.kind, s.start, s.end, s.estimated])).toEqual([
      ["deadhead", DAY_START, DAY_START + DEFAULT_DEADHEAD_MINUTES, true],
      ["haul", DAY_START + 60, DAY_START + 150, true],
      ["deadhead", DAY_START + 150, DAY_START + 150 + DEFAULT_DEADHEAD_MINUTES, true],
    ]);
    expect(monday.spans[1].title).toContain("estimated");
  });

  it("uses a default haul when the drive time is unknown", () => {
    const [monday] = layoutSchedule([tracker({})], WEEK);
    const haul = monday.spans.find((s) => s.kind === "haul")!;
    expect(haul.end - haul.start).toBe(DEFAULT_HAUL_MINUTES);
  });

  it("puts a trip on the day of its planned pickup", () => {
    const days = layoutSchedule(
      [tracker({ date: WEEK, plannedPickupAt: at("2026-09-16", "09:00"), haulMinutes: 60 })],
      WEEK,
    );
    expect(days[2].spans.some((s) => s.kind === "haul")).toBe(true);
    expect(days[0].spans).toEqual([]);
  });
});

describe("clock / duration", () => {
  it("formats times and lengths", () => {
    expect(clock(9 * 60 + 5)).toBe("9:05 am");
    expect(duration(155)).toBe("2 h 35 min");
    expect(duration(45)).toBe("45 min");
    expect(duration(120)).toBe("2 h");
  });
});
