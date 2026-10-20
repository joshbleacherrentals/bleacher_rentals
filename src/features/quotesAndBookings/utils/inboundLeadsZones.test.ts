import { describe, expect, it } from "vitest";
import { unstaffedZoneIds } from "./inboundLeadsZones";

describe("unstaffedZoneIds", () => {
  it("is every zone nobody works", () => {
    expect(unstaffedZoneIds(["z1", "z2", "z6"], ["z1", "z2", "z1"])).toEqual(["z6"]);
    expect(unstaffedZoneIds(["z1"], ["z1"])).toEqual([]);
    expect(unstaffedZoneIds(["z1", "z2"], [])).toEqual(["z1", "z2"]);
  });
});
