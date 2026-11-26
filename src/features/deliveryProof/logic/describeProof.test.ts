import { describe, it, expect } from "vitest";
import { describeProof, shortProof } from "./describeProof";

const proof = (over: Partial<Parameters<typeof describeProof>[0]>) => ({
  status: "verified",
  final: 1,
  evidence_at: "2026-11-24T19:14:00.000Z",
  distance_meters: 80,
  ...over,
});

describe("describeProof", () => {
  it("confirms a delivery with when and how close", () => {
    const line = describeProof(proof({}))!;
    expect(line.tone).toBe("good");
    expect(line.text).toMatch(/^Delivery confirmed by GPS · Nov 24, .* · 80 m from the drop-off$/);
  });

  it("flags a bleacher not seen at the drop-off, where and how far, and says when it is not final", () => {
    expect(
      describeProof(
        proof({
          status: "not_found",
          distance_meters: 3200,
          final: 0,
          evidence_place: "Main Yard, Fonthill",
        }),
      ),
    ).toEqual({
      tone: "bad",
      text: "GPS did not see it at the drop-off · seen at Main Yard, Fonthill, 3.2 km away · checking again tomorrow",
    });
  });

  it("says when the tracker last reported, so a dead tracker shows", () => {
    expect(
      describeProof(proof({ status: "no_gps", gps_last_report_at: "2026-11-12T15:00:00.000Z" }))
        ?.text,
    ).toMatch(/^GPS: no data to confirm this delivery · tracker last reported Nov 12, /);
  });

  it("is neutral, never red, when there is no GPS evidence", () => {
    expect(describeProof(proof({ status: "no_gps" }))?.tone).toBe("neutral");
    expect(describeProof(proof({ status: "waiting" }))?.tone).toBe("neutral");
  });

  it("shows nothing for an unknown status", () => {
    expect(describeProof(proof({ status: null }))).toBeNull();
  });
});

describe("shortProof", () => {
  const p = (status: string, distance_meters: number | null = null, evidence_place?: string) => ({
    status,
    distance_meters,
    evidence_place,
  });

  it("gives a tick and the distance for a confirmed delivery", () => {
    expect(shortProof(p("verified", 120), "completed")).toEqual({ tone: "good", text: "✓ 120 m" });
  });

  it("gives a cross, the distance and where GPS saw it when not found", () => {
    expect(shortProof(p("not_found", 79_039, "Main Yard"), "completed")).toEqual({
      tone: "bad",
      text: "✗ 79.0 km · Main Yard",
    });
    expect(shortProof(p("not_found", 900), "completed")?.text).toBe("✗ 900 m");
  });

  it("names the other outcomes in a word or two", () => {
    expect(shortProof(p("waiting"), "completed")?.text).toBe("Waiting");
    expect(shortProof(p("no_gps"), "completed")?.text).toBe("No GPS");
    expect(shortProof(p("no_location"), "completed")?.text).toBe("No location");
  });

  it("says a completed tracker is not checked yet, and shows nothing for any other", () => {
    expect(shortProof(null, "completed")).toEqual({ tone: "neutral", text: "Not checked yet" });
    expect(shortProof(null, "released")).toBeNull();
    expect(shortProof(null, null)).toBeNull();
  });
});
