import { describe, it, expect } from "vitest";
import { useSidebarItems } from "./useSidebarItems";

describe("useSidebarItems", () => {
  // ═══ Admin ═══

  it("admin sees all sidebar items including configuration", () => {
    const items = useSidebarItems(["admin"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("quotes-bookings");
    expect(keys).toContain("team");
    expect(keys).toContain("assets");
    expect(keys).toContain("quality-assurance");
    expect(keys).toContain("work-trackers");
    expect(keys).toContain("scorecard");
    expect(keys).toContain("leaderboard");
    expect(keys).toContain("driver-calendar");
    expect(keys).toContain("configuration");
  });

  // ═══ Viewer ═══

  it("viewer sees team page", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("team");
  });

  it("viewer sees dashboard, quotes, assets, work-trackers", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("quotes-bookings");
    expect(keys).toContain("assets");
    expect(keys).toContain("work-trackers");
  });

  it("viewer does NOT see configuration", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("configuration");
  });

  it("viewer sees scorecard and leaderboard", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("scorecard");
    expect(keys).toContain("leaderboard");
  });

  // ═══ Account Manager ═══

  it("account_manager sees admin items minus configuration and documentation", () => {
    const adminItems = useSidebarItems(["admin"]);
    const amItems = useSidebarItems(["account_manager"]);
    const adminOnly = ["configuration"];
    expect(amItems.map((i) => i.key)).toEqual(
      adminItems.filter((i) => !adminOnly.includes(i.key)).map((i) => i.key),
    );
  });

  // ═══ Driver ═══

  it("driver sees no sidebar items", () => {
    const items = useSidebarItems(["driver"]);
    expect(items).toEqual([]);
  });

  // ═══ Multiple roles ═══

  it("viewer + admin merges to show everything (union)", () => {
    const items = useSidebarItems(["viewer", "admin"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("configuration");
    expect(keys).toContain("team");
  });

  // ═══ Empty roles ═══

  it("empty roles array returns no items", () => {
    const items = useSidebarItems([]);
    expect(items).toEqual([]);
  });

  // ═══ Maintainer ═══

  it("maintainer sees Quality Assurance with only Annual Inspections under it", () => {
    const items = useSidebarItems(["maintainer"]);
    const qa = items.find((i) => i.key === "quality-assurance");
    expect(qa).toBeDefined();
    expect(qa!.type).toBe("dropdown");
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual(["/annual-inspections"]);
  });

  it("maintainer sees nothing operational beyond assets — no dashboard or work trackers", () => {
    const keys = useSidebarItems(["maintainer"]).map((i) => i.key);
    expect(keys).not.toContain("dashboard");
    expect(keys).not.toContain("work-trackers");
    // Assets stays: a maintainer opens a bleacher to reach its inspection history.
    expect(keys).toContain("assets");
  });

  it("account_manager no longer sees Annual Inspections, but keeps the rest of Quality Assurance", () => {
    const items = useSidebarItems(["account_manager"]);
    const qa = items.find((i) => i.key === "quality-assurance");
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual(["/damage-reports", "/inspections", "/repairs"]);
  });

  it("admin and viewer still see every Quality Assurance child", () => {
    for (const role of ["admin", "viewer"] as const) {
      const qa = useSidebarItems([role]).find((i) => i.key === "quality-assurance");
      const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
      expect(children.map((c) => c.href)).toEqual([
        "/damage-reports",
        "/inspections",
        "/annual-inspections",
        "/repairs",
      ]);
    }
  });

  it("an account manager who is also a maintainer gets the union of the children", () => {
    const qa = useSidebarItems(["account_manager", "maintainer"]).find(
      (i) => i.key === "quality-assurance",
    );
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual([
      "/damage-reports",
      "/inspections",
      "/annual-inspections",
      "/repairs",
    ]);
  });
});
