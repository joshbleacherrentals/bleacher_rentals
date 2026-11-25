import { describe, it, expect } from "vitest";
import {
  estimateLeg,
  matrixBlocks,
  matrixBody,
  pairKey,
  parseMatrix,
  type Pair,
  type Point,
} from "./roadTimes";

const A: Point = [43.100001, -79.2];
const B: Point = [43.2, -79.3];
const C: Point = [43.3, -79.4];

describe("pairKey", () => {
  it("rounds both points to 5 decimals, without commas", () => {
    expect(pairKey(A, B)).toBe("43.10000_-79.20000_43.20000_-79.30000");
  });
});

describe("matrixBody", () => {
  it("asks for driving with no live traffic, avoiding tolls", () => {
    const body = matrixBody([A], [B, C]);
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_UNAWARE");
    expect(body.origins[0].routeModifiers).toEqual({ avoidTolls: true });
    expect(body.destinations[1].waypoint.location.latLng).toEqual({
      latitude: 43.3,
      longitude: -79.4,
    });
  });
});

describe("parseMatrix", () => {
  it("reads each answer by pair, keeps no-route, drops errors", () => {
    const legs = parseMatrix(
      [
        {
          originIndex: 0,
          destinationIndex: 0,
          condition: "ROUTE_EXISTS",
          distanceMeters: 1200,
          duration: "95s",
        },
        { originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },
        { originIndex: 0, destinationIndex: 1, status: { code: 3 } },
      ],
      [A],
      [B, C],
    );
    expect(legs.get(pairKey(A, B))).toEqual({ found: true, meters: 1200, seconds: 95 });
    expect(legs.get(pairKey(A, C))).toEqual({ found: false, meters: null, seconds: null });
  });
});

describe("matrixBlocks", () => {
  it("covers every pair within Google's 625-pair cap", () => {
    const origins: Point[] = Array.from({ length: 30 }, (_, i) => [43 + i / 100, -79]);
    const dests: Point[] = Array.from({ length: 30 }, (_, j) => [44 + j / 100, -80]);
    const pairs: Pair[] = origins.flatMap((o) => dests.map((d) => [o, d] as Pair));
    const blocks = matrixBlocks(pairs);
    expect(blocks.every(([o, d]) => o.length * d.length <= 625)).toBe(true);
    const covered = new Set(
      blocks.flatMap(([os, ds]) => os.flatMap((o) => ds.map((d) => pairKey(o, d)))),
    );
    expect(pairs.every(([o, d]) => covered.has(pairKey(o, d)))).toBe(true);
  });
});

describe("estimateLeg", () => {
  it("is the straight line times 1.3 at 80 km/h", () => {
    const leg = estimateLeg([51.05, -114.07], [53.55, -113.49]);
    expect(leg.meters).toBeGreaterThan(360_000);
    expect(leg.meters).toBeLessThan(380_000);
    expect(leg.minutes).toBeGreaterThan(270);
    expect(leg.minutes).toBeLessThan(290);
  });
});
