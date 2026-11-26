import { describe, it, expect } from "vitest";
import {
  evidenceByImei,
  lastReportByImei,
  stopPlace,
  nextMoveMs,
  proofRows,
  stopWindows,
  type CompletedTracker,
} from "./proofRows";

const H = 60 * 60 * 1000;
const DROP = { latitude: 43.0, longitude: -80.0 };
const tracker = (over: Partial<CompletedTracker> = {}): CompletedTracker => ({
  id: "w1",
  bleacherUuid: "b1",
  completedMs: 100 * H,
  dropoff: DROP,
  ...over,
});

describe("nextMoveMs", () => {
  it("is the earliest later start of a move of the same bleacher", () => {
    expect(
      nextMoveMs(tracker(), [
        { id: "w1", bleacherUuid: "b1", startedMs: 99 * H }, // itself
        { id: "w0", bleacherUuid: "b1", startedMs: 90 * H }, // an earlier move
        { id: "w2", bleacherUuid: "b2", startedMs: 101 * H }, // another bleacher
        { id: "w4", bleacherUuid: "b1", startedMs: 130 * H },
        { id: "w3", bleacherUuid: "b1", startedMs: 120 * H },
        { id: "w5", bleacherUuid: "b1", startedMs: null }, // not started
      ]),
    ).toBe(120 * H);
  });

  it("is null when the bleacher has not moved again", () => {
    expect(nextMoveMs(tracker(), [])).toBeNull();
  });
});

describe("stopWindows", () => {
  it("cuts the range into calls of at most 48 hours", () => {
    expect(stopWindows(0, 100 * H)).toEqual([
      [0, 48 * H],
      [48 * H, 96 * H],
      [96 * H, 100 * H],
    ]);
  });
});

describe("evidenceByImei", () => {
  it("groups stops and positions by tracker and drops a stop returned by two calls", () => {
    const stop = {
      imei: "i1",
      latitude: 1,
      longitude: 2,
      beginDate: 5,
      endDate: null,
      street: null,
      city: null,
      stateCode: null,
      geofenceName: null,
    };
    const map = evidenceByImei(
      [stop, stop],
      [{ imei: "i1", latitude: 3, longitude: 4, date: 9, speed: 0, status: null }],
    );
    expect(map.get("i1")?.map((e) => [e.kind, e.fromMs, e.toMs])).toEqual([
      ["stop", 5, null],
      ["position", 9, 9],
    ]);
  });
});

describe("stopPlace", () => {
  it("prefers Linxup's geofence name, else street and city", () => {
    expect(stopPlace({ geofenceName: "Main Yard", street: "1 Main St", city: "Fonthill" })).toBe(
      "Main Yard",
    );
    expect(stopPlace({ geofenceName: null, street: "1 Main St", city: "Fonthill" })).toBe(
      "1 Main St, Fonthill",
    );
    expect(stopPlace({ geofenceName: null, street: null, city: null })).toBeNull();
  });
});

describe("lastReportByImei", () => {
  it("keeps each tracker's latest report", () => {
    const pos = (imei: string, date: number) => ({
      imei,
      latitude: 0,
      longitude: 0,
      date,
      speed: null,
      status: null,
    });
    expect(lastReportByImei([pos("i1", 5), pos("i1", 9), pos("i2", 3)])).toEqual(
      new Map([
        ["i1", 9],
        ["i2", 3],
      ]),
    );
  });
});

describe("proofRows", () => {
  const base = {
    moves: [],
    attemptsSoFar: new Map([["w1", 2]]),
    nowMs: 105 * H,
  };

  it("records a verified delivery with its evidence and counts the attempt", () => {
    const [row] = proofRows({
      ...base,
      trackers: [tracker()],
      imeiByBleacher: new Map([["b1", "i1"]]),
      evidence: new Map([
        [
          "i1",
          [
            {
              kind: "stop",
              latitude: 43.001,
              longitude: -80.0,
              fromMs: 101 * H,
              toMs: 130 * H,
              place: "Fairgrounds",
            },
          ],
        ],
      ]),
      lastReport: new Map([["i1", 104 * H]]),
    });
    expect(row).toMatchObject({
      work_tracker_uuid: "w1",
      status: "verified",
      final: true,
      attempts: 3,
      imei: "i1",
      evidence_kind: "stop",
      evidence_place: "Fairgrounds",
      evidence_until: new Date(130 * H).toISOString(),
      gps_last_report_at: new Date(104 * H).toISOString(),
      window_end: null,
    });
    expect(row.distance_meters).toBeLessThan(200);
  });

  it("gives a bleacher with no GPS tracker no_gps, final, without asking Linxup", () => {
    const [row] = proofRows({
      ...base,
      trackers: [tracker()],
      imeiByBleacher: new Map(),
      evidence: new Map(),
    });
    expect(row).toMatchObject({ status: "no_gps", final: true, imei: null });
  });

  it("cannot check a drop-off with no coordinates", () => {
    const [row] = proofRows({
      ...base,
      trackers: [tracker({ dropoff: null })],
      imeiByBleacher: new Map([["b1", "i1"]]),
      evidence: new Map(),
    });
    expect(row).toMatchObject({ status: "no_location", final: true });
  });
});
