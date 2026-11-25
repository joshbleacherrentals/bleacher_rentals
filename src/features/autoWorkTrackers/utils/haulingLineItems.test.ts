import { describe, it, expect } from "vitest";
import { describeDriverPay, type DriverPaymentData } from "@/features/workTrackers/util";
import { planHaulingLines, type CreatedHaul } from "./haulingLineItems";

const pay = (over: Partial<DriverPaymentData> = {}): DriverPaymentData => ({
  taxDec: 0,
  payRateCents: 204,
  payCurrency: "CAD",
  payPerUnit: "KM",
  payRanges: [],
  ...over,
});

const created = (over: Partial<CreatedHaul> = {}): CreatedHaul => ({
  workTrackerId: "w1",
  driverUuid: "d1",
  haulDistanceMeters: 141_187,
  haulDriveSeconds: 5_220,
  ...over,
});

describe("planHaulingLines", () => {
  it("prices the haul with the modal's own describeDriverPay", () => {
    const [line] = planHaulingLines([created()], new Map([["d1", pay()]]));
    const expected = describeDriverPay(pay(), {
      distanceMeters: 141_187,
      distanceText: null,
      durationSeconds: 5_220,
      durationText: null,
    })!;
    expect(line).toEqual({
      workTrackerId: "w1",
      unitAmtCents: Math.round(expected.amount * 100),
      description: expected.text,
    });
    expect(line.description).toBe("141.2KM × $2.04/KM = $288.02");
  });

  it("uses the driver's tiers, and hours for an hourly driver", () => {
    const tiered = pay({
      payRateCents: 300,
      payRanges: [
        { id: "a", minValue: 0, maxValue: 100, rateCents: 300 },
        { id: "b", minValue: 100, maxValue: null, rateCents: 200 },
      ],
    });
    const hourly = pay({ payPerUnit: "HR", payRateCents: 3000 });
    const lines = planHaulingLines(
      [created({ workTrackerId: "w1" }), created({ workTrackerId: "w2", driverUuid: "d2" })],
      new Map([
        ["d1", tiered],
        ["d2", hourly],
      ]),
    );
    expect(lines.map((l) => l.description)).toEqual([
      "141.2KM × $2.00/KM = $282.37",
      "1.4HR × $30.00/HR = $43.50",
    ]);
  });

  it("adds nothing without a driver, pay data, a haul or anything to pay", () => {
    const lines = planHaulingLines(
      [
        created({ workTrackerId: "no-driver", driverUuid: null }),
        created({ workTrackerId: "no-pay", driverUuid: "unknown" }),
        created({ workTrackerId: "no-haul", haulDistanceMeters: null }),
        created({ workTrackerId: "zero", driverUuid: "zero" }),
      ],
      new Map([
        ["d1", pay()],
        ["zero", pay({ payRateCents: 0 })],
      ]),
    );
    expect(lines).toEqual([]);
  });
});
