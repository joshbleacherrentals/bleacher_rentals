import { describe, it, expect } from "vitest";
import {
  bleacherStops,
  currentBleacherLocations,
  parseWindow,
  pickBleachers,
  splitWindow,
} from "./bleacherLocations";
import type { LinxupStop } from "../server/linxup";

const NOW = Date.parse("2026-07-04T12:00:00Z");
const H = 3_600_000;

const rows = [
  { bleacher_number: 42, linxup_device_id: "111" },
  { bleacher_number: 7, linxup_device_id: "222" },
  { bleacher_number: 8, linxup_device_id: "222" },
  { bleacher_number: 9, linxup_device_id: null },
  { bleacher_number: 10, linxup_device_id: "333" },
];

describe("pickBleachers", () => {
  it("returns every bleacher in number order when none are named", () => {
    expect(pickBleachers(rows, undefined).picked.map((r) => r.bleacher_number)).toEqual([
      7, 8, 9, 10, 42,
    ]);
  });

  it("returns the named ones and lists numbers that do not exist", () => {
    const { picked, unknown } = pickBleachers(rows, [42, 999]);
    expect(picked.map((r) => r.bleacher_number)).toEqual([42]);
    expect(unknown).toEqual([999]);
  });
});

describe("currentBleacherLocations", () => {
  const positions = [
    {
      imei: "111",
      latitude: 27.9,
      longitude: -82.4,
      date: NOW - 30 * 60_000,
      speed: 0,
      status: "Stopped",
    },
    { imei: "222", latitude: 43.6, longitude: -79.3, date: NOW - H, speed: 55, status: "Moving" },
  ];

  it("matches a bleacher to its tracker's last report by IMEI", () => {
    const [b] = currentBleacherLocations([rows[0]], rows, positions, NOW);
    expect(b).toMatchObject({
      bleacher_number: 42,
      latitude: 27.9,
      longitude: -82.4,
      reported_at: "2026-07-04T11:30:00.000Z",
      minutes_since_report: 30,
      note: null,
    });
  });

  it("says when a tracker is on more than one bleacher", () => {
    const [b] = currentBleacherLocations([rows[1]], rows, positions, NOW);
    expect(b.shares_tracker_with).toEqual([8]);
    expect(b.note).toMatch(/more than one bleacher/);
  });

  it("explains a bleacher with no tracker, and a tracker Linxup does not know", () => {
    const [noTracker, unknown] = currentBleacherLocations([rows[3], rows[4]], rows, positions, NOW);
    expect(noTracker.latitude).toBeNull();
    expect(noTracker.note).toMatch(/No GPS tracker/);
    expect(unknown.note).toMatch(/no position/);
  });
});

describe("parseWindow", () => {
  it("accepts a window with offsets and stops it at now", () => {
    const w = parseWindow("2026-07-03T00:00:00-04:00", "2026-07-05T00:00:00-04:00", NOW);
    expect(w).toEqual({ ok: true, fromMs: Date.parse("2026-07-03T04:00:00Z"), toMs: NOW });
  });

  it("refuses a bad date, a backwards window, more than 7 days, and the future", () => {
    expect(parseWindow("yesterday", "today", NOW).ok).toBe(false);
    expect(parseWindow("2026-07-04T00:00:00Z", "2026-07-03T00:00:00Z", NOW).ok).toBe(false);
    expect(parseWindow("2026-06-01T00:00:00Z", "2026-06-09T00:00:00Z", NOW).ok).toBe(false);
    expect(parseWindow("2026-07-05T00:00:00Z", "2026-07-06T00:00:00Z", NOW).ok).toBe(false);
  });
});

describe("splitWindow", () => {
  it("cuts a window into pieces no longer than the limit", () => {
    expect(splitWindow(0, 100 * H, 48 * H)).toEqual([
      [0, 48 * H],
      [48 * H, 96 * H],
      [96 * H, 100 * H],
    ]);
    expect(splitWindow(0, 10 * H, 48 * H)).toEqual([[0, 10 * H]]);
  });
});

describe("bleacherStops", () => {
  const stop = (
    imei: string,
    begin: number,
    end: number | null,
    over: Partial<LinxupStop> = {},
  ) => ({
    imei,
    latitude: 1,
    longitude: 2,
    beginDate: begin,
    endDate: end,
    street: "1 Main St",
    city: "Tampa",
    stateCode: "FL",
    geofenceName: null,
    ...over,
  });

  it("keeps the bleacher's stops that overlap the window, oldest first, without duplicates", () => {
    const stops = [
      stop("111", 10 * H, 12 * H),
      stop("111", 2 * H, 5 * H), // began before the window, ended inside: kept
      stop("111", 10 * H, 12 * H), // the same stop from the next window
      stop("111", 0, 1 * H), // ended before the window: dropped
      stop("222", 4 * H, 6 * H), // another tracker
    ];
    const out = bleacherStops([rows[0]], stops, 3 * H, 20 * H).get(42)!;
    expect(out.map((s) => s.begin)).toEqual([
      new Date(2 * H).toISOString(),
      new Date(10 * H).toISOString(),
    ]);
    expect(out[0]).toMatchObject({ minutes: 180, address: "1 Main St, Tampa, FL" });
  });

  it("gives an empty list to a bleacher with no tracker", () => {
    expect(bleacherStops([rows[3]], [stop("111", 0, H)], 0, 2 * H).get(9)).toEqual([]);
  });
});
