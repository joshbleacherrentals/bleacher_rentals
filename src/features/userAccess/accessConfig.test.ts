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

  it("gives a maintainer nothing else — not the dashboard, not the rest of quality assurance", () => {
    const config = mergeRoleConfigs(["maintainer"]);
    expect(config.allowedPaths).not.toContain("/dashboard");
    expect(config.allowedPaths).not.toContain("/inspections");
    expect(config.allowedPaths).not.toContain("/damage-reports");
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
