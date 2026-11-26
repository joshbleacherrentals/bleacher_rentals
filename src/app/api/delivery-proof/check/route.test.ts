import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";

// Check now on Work Trackers → Verify → Proof of Delivery: administrators and account managers
// only (permissionPageData.ts, "GPS Proof of Delivery"). Anyone else is refused before the GPS
// check runs, so a viewer cannot make it call Linxup or write DeliveryProofs.

const auth = vi.fn(async (): Promise<{ userId: string | null }> => ({ userId: "clerk_1" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));

type Access =
  | { status: "active"; roles: WebRole[]; userId: string; accountManagerId: string | null }
  | { status: "blocked"; reason: string };
const resolveUserAccessForRequest = vi.fn(async (_clerkId: string): Promise<Access> => {
  throw new Error("set in the test");
});
vi.mock("@/features/userAccess/logic/resolveUserAccessForRequest", () => ({
  resolveUserAccessForRequest: (clerkId: string) => resolveUserAccessForRequest(clerkId),
}));

const run = vi.fn(async () => ({
  checked: 3,
  verified: 2,
  notFound: 1,
  waiting: 0,
  noGps: 0,
  noLocation: 0,
  linxupCalls: 2,
}));
vi.mock("@/features/deliveryProof/server/runFromEnv", () => ({
  runDeliveryProofsFromEnv: () => run(),
}));

import { POST } from "./route";

const as = (roles: WebRole[]) =>
  resolveUserAccessForRequest.mockResolvedValue({
    status: "active",
    roles,
    userId: "u1",
    accountManagerId: null,
  });

describe("POST /api/delivery-proof/check", () => {
  beforeEach(() => {
    run.mockClear();
    auth.mockResolvedValue({ userId: "clerk_1" });
  });

  it("runs the check for an administrator and an account manager", async () => {
    for (const role of ["admin", "account_manager"] as const) {
      as([role]);
      const res = await POST();
      expect(res.status, role).toBe(200);
      expect(await res.json()).toMatchObject({ checked: 3, verified: 2 });
    }
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("refuses every other role without running the check", async () => {
    for (const role of ["viewer", "accountant", "maintainer", "developer", "driver"] as const) {
      as([role]);
      expect((await POST()).status, role).toBe(403);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller and a blocked user", async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await POST()).status).toBe(401);
    auth.mockResolvedValue({ userId: "clerk_1" });
    resolveUserAccessForRequest.mockResolvedValue({ status: "blocked", reason: "inactive" });
    expect((await POST()).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 502 with the reason when the GPS check fails", async () => {
    as(["admin"]);
    run.mockRejectedValueOnce(new Error("Linxup timed out"));
    const res = await POST();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Linxup timed out" });
  });
});
