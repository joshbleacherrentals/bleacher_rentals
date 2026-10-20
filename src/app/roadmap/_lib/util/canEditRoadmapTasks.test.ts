import { describe, it, expect } from "vitest";
import { canEditRoadmapTasks } from "./canEditRoadmapTasks";

describe("canEditRoadmapTasks", () => {
  it("admin (isDeveloper=true) → true", () => {
    expect(canEditRoadmapTasks(true, false, false)).toBe(true);
  });

  it("developer (isDeveloper=true) → true", () => {
    expect(canEditRoadmapTasks(true, false, false)).toBe(true);
  });

  it("account manager → true", () => {
    expect(canEditRoadmapTasks(false, true, false)).toBe(true);
  });

  it("admin + account manager → true", () => {
    expect(canEditRoadmapTasks(true, true, false)).toBe(true);
  });

  it("maintainer → true", () => {
    expect(canEditRoadmapTasks(false, false, true)).toBe(true);
  });

  it("viewer (neither developer, AM nor maintainer) → false", () => {
    expect(canEditRoadmapTasks(false, false, false)).toBe(false);
  });
});
