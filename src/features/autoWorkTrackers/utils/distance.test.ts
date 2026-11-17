import { describe, it, expect } from "vitest";
import { kmToMiles, straightLineKm } from "./distance";

describe("straightLineKm", () => {
  it("is zero between a place and itself", () => {
    expect(
      straightLineKm(
        { latitude: 51.05, longitude: -114.07 },
        { latitude: 51.05, longitude: -114.07 },
      ),
    ).toBe(0);
  });

  it("measures Calgary to Edmonton at about 280 km", () => {
    const calgary = { latitude: 51.0447, longitude: -114.0719 };
    const edmonton = { latitude: 53.5461, longitude: -113.4938 };
    const km = straightLineKm(calgary, edmonton)!;
    expect(km).toBeGreaterThan(275);
    expect(km).toBeLessThan(285);
  });

  it("is the same both ways", () => {
    const a = { latitude: 29.4241, longitude: -98.4936 };
    const b = { latitude: 32.7767, longitude: -96.797 };
    expect(straightLineKm(a, b)).toBeCloseTo(straightLineKm(b, a)!, 6);
  });

  it("is null when either place has no coordinates", () => {
    const place = { latitude: 51, longitude: -114 };
    expect(straightLineKm(place, { latitude: null, longitude: -114 })).toBeNull();
    expect(straightLineKm({ latitude: 51, longitude: undefined }, place)).toBeNull();
    expect(straightLineKm(null, place)).toBeNull();
  });
});

describe("kmToMiles", () => {
  it("converts kilometres to miles", () => {
    expect(kmToMiles(100)).toBeCloseTo(62.14, 1);
  });
});
