import { describe, expect, it } from "vitest";
import { canAccessPath, mergeRoleConfigs } from "./accessConfig";

describe("mergeRoleConfigs — the maintainer role", () => {
  it("lets a maintainer open the annual inspections queue", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).toContain("/annual-inspections");
  });

  it("lands a maintainer-only user on the dashboard, like every other role that has one", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).toContain("/dashboard");
    expect(config.defaultRedirect).toBe("/dashboard");
  });

  it("lets a maintainer read their own permissions and the changelog", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).toContain("/permissions");
    expect(config.allowedPaths).toContain("/changelog");
  });

  it("lets a maintainer open a bleacher to reach its annual inspection history", () => {
    expect(mergeRoleConfigs(["maintainer"]).allowedPaths).toContain("/assets");
  });

  it("lets a maintainer open damage reports and repairs", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).toContain("/damage-reports");
    expect(config.allowedPaths).toContain("/repairs");
  });

  it("gives a maintainer nothing else — not the inspections list, work trackers or quotes", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).not.toContain("/inspections");
    expect(config.allowedPaths).not.toContain("/work-trackers");
    expect(config.allowedPaths).not.toContain("/quotes-bookings");
  });

  it("shows the sidebar to a maintainer", () => {
    expect(mergeRoleConfigs(["maintainer"]).showSidebar).toBe(true);
  });

  it("takes the queue away from an account manager", () => {
    expect(mergeRoleConfigs(["account_manager"]).allowedPaths).not.toContain("/annual-inspections");
  });

  it("gives it back to an account manager who is also a maintainer", () => {
    const config = mergeRoleConfigs(["account_manager", "maintainer"]);
    expect(config.allowedPaths).toContain("/annual-inspections");
    // ...without taking away anything the account manager already had.
    expect(config.allowedPaths).toContain("/dashboard");
    expect(config.defaultRedirect).toBe("/dashboard");
  });

  it("leaves the roles that already had the page alone", () => {
    expect(mergeRoleConfigs(["admin"]).allowedPaths).toContain("/annual-inspections");
    expect(mergeRoleConfigs(["viewer"]).allowedPaths).toContain("/annual-inspections");
  });
});

describe("mergeRoleConfigs — the accountant role (Work Trackers and the Accountant page)", () => {
  it("lets an accountant open the Accountant page, Quotes & Bookings, the Work Trackers pages, the chat, Companies & Contacts and the two pages every role may read", () => {
    const config = mergeRoleConfigs(["accountant"]);
    // docs/specs/accountant-quotes-11-accountant-internal-chat.md §4: /messages comes after
    // /work-trackers, and /accountant stays first so that it stays the landing page.
    // docs/specs/accountant-address-book.md §4: /companies-contacts follows /messages.
    expect(config.allowedPaths).toEqual([
      "/accountant",
      "/quotes-bookings",
      "/work-trackers",
      "/messages",
      "/companies-contacts",
      "/permissions",
      "/changelog",
    ]);
  });

  // docs/specs/accountant-address-book.md: the accountant creates, edits and soft-deletes companies,
  // contacts and venues on /companies-contacts. Prefix match, like every other path.
  it("lets an accountant open Companies & Contacts", () => {
    expect(canAccessPath(["accountant"], "/companies-contacts")).toBe(true);
  });

  it("keeps the Accountant page as the landing page after Companies & Contacts was added", () => {
    expect(mergeRoleConfigs(["accountant"]).defaultRedirect).toBe("/accountant");
  });

  it("lets an accountant open the internal chat, and /external by the same prefix (D4: reachable, a placeholder)", () => {
    expect(canAccessPath(["accountant"], "/messages/internal")).toBe(true);
    expect(
      canAccessPath(["accountant"], "/messages/internal/00000000-0000-0000-0000-000000000000"),
    ).toBe(true);
    expect(canAccessPath(["accountant"], "/messages/external")).toBe(true);
  });

  it("lands an accountant-only user on the Accountant page — there is no dashboard for them", () => {
    expect(mergeRoleConfigs(["accountant"]).defaultRedirect).toBe("/accountant");
  });

  it("shows the sidebar to an accountant", () => {
    expect(mergeRoleConfigs(["accountant"]).showSidebar).toBe(true);
  });

  it("gives an accountant nothing else operational", () => {
    const { allowedPaths } = mergeRoleConfigs(["accountant"]);
    for (const path of [
      "/dashboard",
      "/team",
      "/assets",
      "/all-work-trackers",
      "/work-tracker-types",
      "/quickbooks",
      "/stripe-connections",
    ]) {
      expect(allowedPaths).not.toContain(path);
    }
  });

  it("leaves /messages to the roles that had it: an admin and an account manager keep it, a viewer, maintainer, developer and driver still do not have it", () => {
    expect(mergeRoleConfigs(["admin"]).allowedPaths).toContain("/messages");
    expect(mergeRoleConfigs(["account_manager"]).allowedPaths).toContain("/messages");
    for (const role of ["viewer", "maintainer", "developer", "driver"] as const) {
      expect(mergeRoleConfigs([role]).allowedPaths, role).not.toContain("/messages");
    }
  });

  it("takes nothing away from an account manager who is also an accountant, and adds the Accountant page", () => {
    const am = mergeRoleConfigs(["account_manager"]);
    const both = mergeRoleConfigs(["account_manager", "accountant"]);
    expect(both.allowedPaths).toEqual([...am.allowedPaths, "/accountant"]);
    expect(both.defaultRedirect).toBe("/dashboard");
  });

  it("lets an admin open the Accountant page, and nobody else but an accountant", () => {
    expect(mergeRoleConfigs(["admin"]).allowedPaths).toContain("/accountant");
    for (const role of [
      "account_manager",
      "viewer",
      "maintainer",
      "developer",
      "driver",
    ] as const) {
      expect(mergeRoleConfigs([role]).allowedPaths, role).not.toContain("/accountant");
    }
  });

  it("leaves every other role's pages exactly as they were", () => {
    // The accountant role adds a config entry; it must not edit anyone else's.
    expect(mergeRoleConfigs(["admin"]).allowedPaths).toContain("/annual-inspections");
    expect(mergeRoleConfigs(["maintainer"]).defaultRedirect).toBe("/dashboard");
    expect(mergeRoleConfigs(["developer"]).allowedPaths).toContain("/dev-tools");
  });
});

describe("canAccessPath — a link is shown only if its destination is reachable", () => {
  const driverProfile = "/team/00000000-0000-0000-0000-000000000000/edit/driver";

  it("matches the way the redirect guard matches: by path prefix", () => {
    expect(canAccessPath(["account_manager"], driverProfile)).toBe(true);
    expect(canAccessPath(["account_manager"], "/work-trackers/2026-09-21/abc")).toBe(true);
  });

  it("keeps an accountant away from the driver profile — they have no Team page", () => {
    expect(canAccessPath(["accountant"], driverProfile)).toBe(false);
  });

  it("lets an accountant into the Accountant page and keeps everyone else out of it", () => {
    expect(canAccessPath(["accountant"], "/accountant")).toBe(true);
    expect(canAccessPath(["admin"], "/accountant")).toBe(true);
    expect(canAccessPath(["account_manager"], "/accountant")).toBe(false);
    expect(canAccessPath(["viewer"], "/accountant")).toBe(false);
  });

  it("lets an accountant into Quotes & Bookings: the list, a quote, and by prefix its form pages (the pages guard themselves)", () => {
    expect(canAccessPath(["accountant"], "/quotes-bookings")).toBe(true);
    expect(
      canAccessPath(["accountant"], "/quotes-bookings/00000000-0000-0000-0000-000000000000"),
    ).toBe(true);
    expect(canAccessPath(["accountant"], "/quotes-bookings/new")).toBe(true);
  });

  it("lets an accountant into the Work Trackers pages, week and driver included", () => {
    expect(canAccessPath(["accountant"], "/work-trackers")).toBe(true);
    expect(canAccessPath(["accountant"], "/work-trackers/2026-09-21/abc")).toBe(true);
  });

  it("is a union over the roles: an account manager who is also an accountant has Team", () => {
    expect(canAccessPath(["accountant", "account_manager"], driverProfile)).toBe(true);
  });

  it("answers no when there are no roles", () => {
    expect(canAccessPath([], "/work-trackers")).toBe(false);
  });
});
