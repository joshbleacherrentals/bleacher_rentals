import { describe, it, expect } from "vitest";
import {
  buildDriverProofs,
  canCheckDeliveryNow,
  dayLines,
  proofCategory,
  summarizeDeliveryProof,
  type ProofTrip,
} from "./proofList";

const WEEK = "2026-11-23"; // a Monday
const TODAY = "2026-11-26"; // the Thursday
const trip = (over: Partial<ProofTrip>): ProofTrip => ({
  driverUuid: "d1",
  driverName: "Justin",
  date: "2026-11-24",
  trackerStatus: "completed",
  proofStatus: null,
  ...over,
});

describe("proofCategory", () => {
  it("is the GPS verdict for a completed tracker, not checked yet before any check", () => {
    expect(proofCategory("completed", "verified", "2026-11-24", TODAY)).toBe("verified");
    expect(proofCategory("completed", "no_gps", "2026-11-24", TODAY)).toBe("no_gps");
    expect(proofCategory("completed", null, "2026-11-24", TODAY)).toBe("unchecked");
  });

  it("is overdue when not completed by the end of its day, and not completed until then", () => {
    for (const s of ["draft", "released", "accepted", null]) {
      expect(proofCategory(s, null, "2026-11-25", TODAY), `${s} yesterday`).toBe("overdue");
      expect(proofCategory(s, null, TODAY, TODAY), `${s} today`).toBe("not_completed");
      expect(proofCategory(s, null, "2026-11-27", TODAY), `${s} tomorrow`).toBe("not_completed");
    }
  });

  it("is cancelled when nobody makes the trip, never overdue", () => {
    for (const s of ["cancelled", "declined", "abandoned"]) {
      expect(proofCategory(s, null, "2026-11-23", TODAY), s).toBe("cancelled");
    }
  });
});

describe("buildDriverProofs", () => {
  const drivers = buildDriverProofs(
    [
      trip({ proofStatus: "waiting" }),
      trip({ proofStatus: "waiting" }),
      trip({ proofStatus: "no_gps" }),
      trip({ trackerStatus: "released" }), // Tuesday, not completed: overdue
      trip({ proofStatus: "verified", date: "2026-11-27" }),
      trip({ trackerStatus: "draft", date: "2026-11-27" }),
      trip({ trackerStatus: "cancelled", date: "2026-11-27" }),
      trip({ driverUuid: "d2", driverName: "Aaron", proofStatus: "not_found" }),
      trip({ date: "2026-12-01" }), // next week: ignored
    ],
    WEEK,
    TODAY,
  );

  it("gives each driver with a trip a row of seven days, by name", () => {
    expect(drivers.map((d) => d.driverName)).toEqual(["Aaron", "Justin"]);
    expect(drivers[1].days).toHaveLength(7);
  });

  it("counts every trip of a day by category, overdue first and cancelled last", () => {
    const tuesday = drivers[1].days[1];
    expect(tuesday.trips).toBe(4);
    expect(dayLines(tuesday).map((l) => l.text)).toEqual(["1 overdue", "1 no GPS", "2 waiting"]);
    expect(dayLines(drivers[1].days[4]).map((l) => l.text)).toEqual([
      "1 not completed",
      "1 verified",
      "1 cancelled",
    ]);
    expect(dayLines(drivers[1].days[0])).toEqual([]);
  });

  it("sums to verified out of the trips that are happening for the side panel", () => {
    // 8 trips in the week, 1 cancelled: 7 counted, 1 verified.
    expect(summarizeDeliveryProof(drivers)).toEqual({ passed: 1, total: 7 });
  });
});

describe("canCheckDeliveryNow", () => {
  it("lets administrators and account managers check now, nobody else", () => {
    expect(canCheckDeliveryNow(["admin"])).toBe(true);
    expect(canCheckDeliveryNow(["account_manager"])).toBe(true);
    for (const role of ["viewer", "accountant", "driver", "developer", "maintainer"] as const) {
      expect(canCheckDeliveryNow([role]), role).toBe(false);
    }
  });
});
