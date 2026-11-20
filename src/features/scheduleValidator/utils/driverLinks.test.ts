import { describe, it, expect } from "vitest";
import { driverLinks } from "./driverLinks";

describe("driverLinks", () => {
  it("links the driver's profile and their work tracker week, by user id", () => {
    expect(driverLinks({ userUuid: "u1", weekStart: "2026-09-14" })).toEqual([
      { key: "profile", label: "Open driver profile", href: "/team/u1/edit/driver" },
      { key: "week", label: "Open work tracker week", href: "/work-trackers/2026-09-14/u1" },
    ]);
  });
});
