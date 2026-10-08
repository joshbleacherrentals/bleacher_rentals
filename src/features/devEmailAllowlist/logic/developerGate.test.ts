import { describe, it, expect } from "vitest";
import { developerGate } from "./developerGate";
import type { UserAccessState } from "@/features/userAccess/hooks/useUserAccess";

const state = (over: Record<string, unknown>) => over as unknown as UserAccessState;

describe("developerGate", () => {
  it("waits while access is loading", () => {
    expect(developerGate(state({ status: "loading" }))).toBe("loading");
  });

  it("lets an active developer in", () => {
    expect(developerGate(state({ status: "active", roles: ["developer"] }))).toBe("allowed");
  });

  it("turns away an admin — admins hold /dev-tools by prefix but this page is developers only", () => {
    expect(developerGate(state({ status: "active", roles: ["admin"] }))).toBe("redirect");
  });

  it("turns away a viewer", () => {
    expect(developerGate(state({ status: "active", roles: ["viewer"] }))).toBe("redirect");
  });

  it("turns away someone who is not active", () => {
    expect(developerGate(state({ status: "inactive", roles: ["developer"] }))).toBe("redirect");
  });
});
