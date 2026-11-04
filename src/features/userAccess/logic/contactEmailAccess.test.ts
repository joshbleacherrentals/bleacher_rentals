import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canOpenContactEmails,
  canPullContactEmails,
  CANNOT_OPEN_CONTACT_EMAILS_MESSAGE,
  CANNOT_PULL_CONTACT_EMAILS_MESSAGE,
} from "./contactEmailAccess";
import type { WebRole } from "./determineAccess";

const ALL_ROLES: WebRole[] = [
  "admin",
  "account_manager",
  "developer",
  "viewer",
  "driver",
  "maintainer",
  "accountant",
];

const granted = (check: (roles: readonly WebRole[]) => boolean) =>
  ALL_ROLES.filter((role) => check([role]));

describe("canPullContactEmails", () => {
  it("is only an admin, an account manager or an accountant", () => {
    expect(granted(canPullContactEmails)).toEqual(["admin", "account_manager", "accountant"]);
  });

  it("is true when any one of several roles qualifies", () => {
    expect(canPullContactEmails(["viewer", "account_manager"])).toBe(true);
    expect(canPullContactEmails([])).toBe(false);
  });
});

describe("canOpenContactEmails", () => {
  it("is those three, and a viewer", () => {
    expect(granted(canOpenContactEmails)).toEqual([
      "admin",
      "account_manager",
      "viewer",
      "accountant",
    ]);
  });
});

const auth = vi.fn();
const resolveUserAccessForRequest = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));
vi.mock("./resolveUserAccessForRequest", () => ({
  resolveUserAccessForRequest: (id: string) => resolveUserAccessForRequest(id),
}));

async function statusOf(
  promise: Promise<unknown>,
): Promise<{ status: number; error?: string } | null> {
  try {
    await promise;
    return null;
  } catch (e) {
    if (!(e instanceof Response)) throw e;
    return { status: e.status, error: (await e.json()).error };
  }
}

describe("the contact email guards", () => {
  beforeEach(() => {
    auth.mockReset().mockResolvedValue({ userId: "clerk_1" });
    resolveUserAccessForRequest.mockReset();
  });

  it("let a puller through, and a viewer only to read", async () => {
    const { requireContactEmailPuller, requireContactEmailReader } =
      await import("./requireContactEmailAccess");

    resolveUserAccessForRequest.mockResolvedValue({ status: "active", roles: ["accountant"] });
    await expect(requireContactEmailPuller()).resolves.toBe("clerk_1");
    await expect(requireContactEmailReader()).resolves.toBe("clerk_1");

    resolveUserAccessForRequest.mockResolvedValue({ status: "active", roles: ["viewer"] });
    await expect(requireContactEmailReader()).resolves.toBe("clerk_1");
    expect(await statusOf(requireContactEmailPuller())).toEqual({
      status: 403,
      error: CANNOT_PULL_CONTACT_EMAILS_MESSAGE,
    });
  });

  it("refuse a role with neither, saying why", async () => {
    const { requireContactEmailReader } = await import("./requireContactEmailAccess");
    resolveUserAccessForRequest.mockResolvedValue({ status: "active", roles: ["developer"] });

    expect(await statusOf(requireContactEmailReader())).toEqual({
      status: 403,
      error: CANNOT_OPEN_CONTACT_EMAILS_MESSAGE,
    });
  });

  it("refuse a signed-out request with 401 and a blocked account with 403", async () => {
    const { requireContactEmailPuller } = await import("./requireContactEmailAccess");

    auth.mockResolvedValue({ userId: null });
    expect((await statusOf(requireContactEmailPuller()))?.status).toBe(401);
    expect(resolveUserAccessForRequest).not.toHaveBeenCalled();

    auth.mockResolvedValue({ userId: "clerk_1" });
    resolveUserAccessForRequest.mockResolvedValue({ status: "blocked", reason: "driver-only" });
    expect((await statusOf(requireContactEmailPuller()))?.status).toBe(403);
  });
});
