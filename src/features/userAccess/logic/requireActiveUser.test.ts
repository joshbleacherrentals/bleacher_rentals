import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const resolveUserAccessForRequest = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));
vi.mock("./resolveUserAccessForRequest", () => ({
  resolveUserAccessForRequest: (id: string) => resolveUserAccessForRequest(id),
}));

import { requireActiveUser } from "./requireActiveUser";

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ userId: "clerk_1" });
  resolveUserAccessForRequest.mockReset();
});

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (e) {
    return e instanceof Response ? e.status : -1;
  }
}

describe("requireActiveUser", () => {
  it("returns the clerk id for an active user of any role", async () => {
    for (const roles of [["viewer"], ["maintainer"], ["account_manager", "developer"]]) {
      resolveUserAccessForRequest.mockResolvedValue({ status: "active", roles });
      await expect(requireActiveUser()).resolves.toBe("clerk_1");
    }
  });

  it("refuses a signed-out request with 401", async () => {
    auth.mockResolvedValue({ userId: null });

    expect(await statusOf(requireActiveUser())).toBe(401);
    expect(resolveUserAccessForRequest).not.toHaveBeenCalled();
  });

  it("refuses a blocked account (deactivated, driver-only, no roles) with 403", async () => {
    resolveUserAccessForRequest.mockResolvedValue({ status: "blocked", reason: "driver-only" });

    expect(await statusOf(requireActiveUser())).toBe(403);
  });
});
