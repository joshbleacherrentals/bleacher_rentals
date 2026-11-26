import { describe, expect, it } from "vitest";
import { pathMatches } from "./pathMatches";

// docs/specs/dashboard-analytics-02-access-shell.md §2.1 and §5: one rule for "is this address
// under this path", used by the access check and by the sidebar highlight.
describe("pathMatches", () => {
  it("is true when the address equals the path", () => {
    expect(pathMatches("/dashboard", "/dashboard")).toBe(true);
    expect(pathMatches("/roadmap/backlog", "/roadmap/backlog")).toBe(true);
  });

  it("is true when the address continues the path after a slash", () => {
    expect(pathMatches("/dashboard", "/dashboard/anything")).toBe(true);
    expect(pathMatches("/roadmap/backlog", "/roadmap/backlog/123")).toBe(true);
    expect(pathMatches("/team", "/team/00000000-0000-0000-0000-000000000000/edit/driver")).toBe(
      true,
    );
  });

  it("is false when the address only starts with the same letters (the whole point)", () => {
    expect(pathMatches("/dashboard", "/dashboard-analytics")).toBe(false);
    expect(pathMatches("/quote", "/quotes-bookings")).toBe(false);
    expect(pathMatches("/inspections", "/inspections-archive")).toBe(false);
  });

  it("is false for the parent of a longer path", () => {
    expect(pathMatches("/roadmap/backlog", "/roadmap")).toBe(false);
    expect(pathMatches("/roadmap/backlog", "/roadmap/sprints")).toBe(false);
  });

  it("still matches an address with a trailing slash", () => {
    expect(pathMatches("/repairs", "/repairs/")).toBe(true);
    expect(pathMatches("/dashboard", "/dashboard/")).toBe(true);
    expect(pathMatches("/dashboard", "/dashboard-analytics/")).toBe(false);
  });

  it("is false for an empty address", () => {
    expect(pathMatches("/dashboard", "")).toBe(false);
  });

  it("lets a path that ends with a slash match every address that starts with it", () => {
    expect(pathMatches("/dev-tools/", "/dev-tools/sync-health")).toBe(true);
    expect(pathMatches("/dev-tools/", "/dev-tools/")).toBe(true);
    expect(pathMatches("/dev-tools/", "/dev-toolsx")).toBe(false);
  });

  it("compares the case exactly", () => {
    expect(pathMatches("/dashboard", "/Dashboard")).toBe(false);
    expect(pathMatches("/dashboard", "/dashboard/Anything")).toBe(true);
  });
});
