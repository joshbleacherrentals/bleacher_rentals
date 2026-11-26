import { describe, it, expect } from "vitest";
import { driverLinks } from "./driverLinks";

describe("driverLinks", () => {
  const links = driverLinks({
    userUuid: "u1",
    weekStart: "2026-09-14",
    zoneId: "z1",
    fromSlug: "driver-workload",
  });

  it("opens the schedule in place, and the profile and week in new tabs, by user id", () => {
    expect(links).toEqual([
      {
        key: "schedule",
        label: "Open driver schedule",
        href: "/auto-work-trackers/driver-schedule?zone=z1&week=2026-09-14&user=u1&from=driver-workload",
        newTab: false,
      },
      { key: "profile", label: "Open driver profile", href: "/team/u1/edit/driver", newTab: true },
      {
        key: "week",
        label: "Open work tracker week",
        href: "/work-trackers/2026-09-14/u1",
        newTab: true,
      },
    ]);
  });
});
