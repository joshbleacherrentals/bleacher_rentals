import { describe, it, expect } from "vitest";
import { planSiteWorkLines, siteWorkFor } from "./siteWork";

describe("siteWorkFor", () => {
  it("tears down when picking up from the event, and always sets up at the next one", () => {
    expect(siteWorkFor({ pickupAtEvent: true })).toEqual({ teardown: true, setup: true });
  });

  it("does not tear down when an earlier work tracker already moved the bleacher", () => {
    expect(siteWorkFor({ pickupAtEvent: false })).toEqual({ teardown: false, setup: true });
  });
});

describe("planSiteWorkLines", () => {
  const rates = new Map([["d1", { setupCents: 5500, teardownCents: 4500 }]]);
  let n = 0;
  const newId = () => `id-${++n}`;

  it("adds a Setup and a Teardown line at the driver's rates, as the modal does", () => {
    const lines = planSiteWorkLines(
      [{ workTrackerId: "w1", driverUuid: "d1", work: { teardown: true, setup: true } }],
      rates,
      newId,
    );
    expect(
      lines.map((l) => [l.type, l.qtyDecimal, l.unitAmtCents, l.isAutomaticallyManaged]),
    ).toEqual([
      ["setup", 1, 5500, true],
      ["teardown", 1, 4500, true],
    ]);
    expect(lines.every((l) => l.workTrackerId === "w1")).toBe(true);
  });

  it("adds only the Setup when there is no teardown", () => {
    const lines = planSiteWorkLines(
      [{ workTrackerId: "w1", driverUuid: "d1", work: { teardown: false, setup: true } }],
      rates,
      newId,
    );
    expect(lines.map((l) => l.type)).toEqual(["setup"]);
  });

  it("still adds the lines at $0 when the driver has no rate, as the modal does", () => {
    const lines = planSiteWorkLines(
      [{ workTrackerId: "w1", driverUuid: "d2", work: { teardown: true, setup: true } }],
      rates,
      newId,
    );
    expect(lines.map((l) => l.unitAmtCents)).toEqual([0, 0]);
  });
});
