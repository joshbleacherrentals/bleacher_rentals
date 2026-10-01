import { describe, expect, it } from "vitest";
import { mergeRoleConfigs } from "./accessConfig";

describe("mergeRoleConfigs — the maintainer role", () => {
  it("lets a maintainer open the annual inspections queue", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).toContain("/annual-inspections");
  });

  it("lands a maintainer-only user on the one page they have — there is no dashboard for them", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.defaultRedirect).toBe("/annual-inspections");
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

  it("gives a maintainer nothing else — not the dashboard, not the inspections list", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).not.toContain("/dashboard");
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

describe("mergeRoleConfigs — the accountant role (Stage 1: no permissions)", () => {
  it("lets an accountant open exactly the two pages every role may read", () => {
    const config = mergeRoleConfigs(["accountant"]);
    expect(config.allowedPaths).toEqual(["/permissions", "/changelog"]);
  });

  it("lands an accountant-only user on /permissions — there is no dashboard for them", () => {
    expect(mergeRoleConfigs(["accountant"]).defaultRedirect).toBe("/permissions");
  });

  it("shows the sidebar to an accountant", () => {
    expect(mergeRoleConfigs(["accountant"]).showSidebar).toBe(true);
  });

  it("gives an accountant nothing operational", () => {
    const { allowedPaths } = mergeRoleConfigs(["accountant"]);
    for (const path of [
      "/dashboard",
      "/quotes-bookings",
      "/team",
      "/assets",
      "/work-trackers",
      "/companies-contacts",
      "/messages",
      "/quickbooks",
      "/stripe-connections",
    ]) {
      expect(allowedPaths).not.toContain(path);
    }
  });

  it("takes nothing away from an account manager who is also an accountant", () => {
    const am = mergeRoleConfigs(["account_manager"]);
    const both = mergeRoleConfigs(["account_manager", "accountant"]);
    expect(both.allowedPaths).toEqual(am.allowedPaths);
    expect(both.defaultRedirect).toBe("/dashboard");
  });

  it("leaves every other role's pages exactly as they were", () => {
    // The accountant role adds a config entry; it must not edit anyone else's.
    expect(mergeRoleConfigs(["admin"]).allowedPaths).toContain("/annual-inspections");
    expect(mergeRoleConfigs(["maintainer"]).defaultRedirect).toBe("/annual-inspections");
    expect(mergeRoleConfigs(["developer"]).allowedPaths).toContain("/dev-tools");
  });
});
