import { describe, it, expect } from "vitest";
import { GRACE_MS, deliveryVerdict, type Evidence } from "./verdict";

const H = 60 * 60 * 1000;
const DROP = { latitude: 43.0, longitude: -80.0 };
const AT_DROP = { latitude: 43.002, longitude: -80.0 }; // ~220 m away
const FAR = { latitude: 43.1, longitude: -80.0 }; // ~11 km away
const DONE = 1_000 * H; // when the driver tapped Complete

const stop = (place: typeof DROP, fromMs: number, toMs: number | null): Evidence => ({
  kind: "stop",
  ...place,
  fromMs,
  toMs,
});
const verdict = (evidence: Evidence[], nowMs = DONE + 5 * H, nextMoveMs: number | null = null) =>
  deliveryVerdict({ dropoff: DROP, completedMs: DONE, nextMoveMs, nowMs, evidence });

describe("deliveryVerdict", () => {
  it("is verified by a stop near the drop-off after Complete, and says how far", () => {
    const v = verdict([stop(AT_DROP, DONE + 0.5 * H, null)]);
    expect(v.status).toBe("verified");
    expect(v.final).toBe(true);
    expect(v.best?.meters).toBeGreaterThan(150);
    expect(v.best?.meters).toBeLessThan(300);
  });

  it("prefers a stop within the radius over a closer single position, as the proof to keep", () => {
    const v = verdict([
      { kind: "position", ...DROP, fromMs: DONE + H, toMs: DONE + H },
      stop(AT_DROP, DONE + 0.5 * H, null),
    ]);
    expect(v.status).toBe("verified");
    expect(v.best?.kind).toBe("stop");
  });

  it("counts a stop that began a little before Complete (the driver tapped it late)", () => {
    expect(verdict([stop(AT_DROP, DONE - 0.5 * H, DONE - 0.1 * H)]).status).toBe("verified");
  });

  it("waits when the only report is from before the delivery (e.g. the pickup, 5 h earlier)", () => {
    const v = verdict([stop(FAR, DONE - 5 * H, DONE - 4 * H)]);
    expect(v).toEqual({ status: "waiting", final: false, best: null });
  });

  it("is not found, still open, when it reported after Complete but elsewhere", () => {
    const v = verdict([stop(FAR, DONE + H, null)]);
    expect(v.status).toBe("not_found");
    expect(v.final).toBe(false);
    expect(v.best?.meters).toBeGreaterThan(10_000);
  });

  it("turns a not found into verified when the drop-off stop shows up later", () => {
    const v = verdict([stop(FAR, DONE + 0.2 * H, DONE + 0.5 * H), stop(AT_DROP, DONE + H, null)]);
    expect(v.status).toBe("verified");
  });

  it("ignores reports after the bleacher's next move began", () => {
    const next = DONE + 24 * H;
    const v = verdict([stop(AT_DROP, next + H, null)], DONE + 30 * H, next);
    expect(v).toEqual({ status: "no_gps", final: true, best: null });
  });

  it("counts the stop where it waited to be picked up for the next move", () => {
    const next = DONE + 24 * H;
    expect(verdict([stop(AT_DROP, next - 2 * H, next + 0.1 * H)], DONE + 30 * H, next).status).toBe(
      "verified",
    );
  });

  it("gives up with no GPS once the grace period has passed, and makes not found final", () => {
    expect(verdict([], DONE + GRACE_MS + H).status).toBe("no_gps");
    expect(verdict([stop(FAR, DONE + H, null)], DONE + GRACE_MS + H).final).toBe(true);
  });

  it("cannot check a drop-off with no coordinates", () => {
    expect(
      deliveryVerdict({
        dropoff: null,
        completedMs: DONE,
        nextMoveMs: null,
        nowMs: DONE,
        evidence: [],
      }),
    ).toEqual({ status: "no_location", final: true, best: null });
  });
});
