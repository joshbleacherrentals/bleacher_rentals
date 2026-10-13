import { describe, it, expect, vi, beforeEach } from "vitest";

// What the WorkTrackerGroups lookup returns for the group id the client sent.
let groupLookup: { data: unknown; error: unknown };
const groupUpdates: { table: string; data: unknown; id: unknown }[] = [];
const fetchSpy = vi.fn();

vi.mock("@/features/userAccess/logic/requireAuth", () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/quickbooks-integration/util", () => ({
  getBaseUrl: () => "https://qbo.test",
  getQboAccessTokenAndRealmId: vi.fn().mockResolvedValue({ accessToken: "t", realmId: "r" }),
}));
vi.mock("@/features/workTrackers/generatePdf", () => ({
  generateDriverPdfBuffer: vi.fn(),
}));
vi.mock("@/utils/supabase/getClerkSupabaseServerClient", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (_col: string, val: unknown) => {
          chain.lastEq = val;
          return chain;
        },
        update: (data: unknown) => {
          const updateChain: any = {
            eq: (_col: string, id: unknown) => {
              groupUpdates.push({ table, data, id });
              return Promise.resolve({ error: null });
            },
          };
          return updateChain;
        },
        maybeSingle: () => Promise.resolve(table === "WorkTrackerGroups" ? groupLookup : {}),
        // Everything past the group guard: the driver lookup. "Not found" is enough to show the
        // request got past the guard, without standing up the whole bill build.
        single: () => Promise.resolve({ data: null, error: { message: "no driver" } }),
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

const DRIVER = "driver-usa";
const WEEK = "2026-10-05";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/quickbooks/create-bill", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/quickbooks/create-bill — group guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupUpdates.length = 0;
    vi.stubGlobal("fetch", fetchSpy);
    groupLookup = { data: null, error: null };
  });

  it("rejects a group that belongs to a different driver, before anything reaches QuickBooks", async () => {
    // The bug: a stale modal posted the USA driver's uuid with the Canadian driver's group id.
    groupLookup = {
      data: { id: "group-can", driver_uuid: "driver-can", week_start: WEEK },
      error: null,
    };

    const res = await POST(
      makeRequest({ driverUuid: DRIVER, startDate: WEEK, workTrackerGroupId: "group-can" }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not belong/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not mark the other driver's group as errored when it rejects", async () => {
    groupLookup = {
      data: { id: "group-can", driver_uuid: "driver-can", week_start: WEEK },
      error: null,
    };

    await POST(
      makeRequest({ driverUuid: DRIVER, startDate: WEEK, workTrackerGroupId: "group-can" }),
    );

    expect(groupUpdates).toEqual([]);
  });

  it("rejects a group for the right driver but a different week", async () => {
    groupLookup = {
      data: { id: "group-old", driver_uuid: DRIVER, week_start: "2026-09-28" },
      error: null,
    };

    const res = await POST(
      makeRequest({ driverUuid: DRIVER, startDate: WEEK, workTrackerGroupId: "group-old" }),
    );

    expect(res.status).toBe(400);
    expect(groupUpdates).toEqual([]);
  });

  it("rejects a group id that does not exist", async () => {
    const res = await POST(
      makeRequest({ driverUuid: DRIVER, startDate: WEEK, workTrackerGroupId: "ghost" }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("lets a group that matches the driver and week through to the rest of the route", async () => {
    groupLookup = {
      data: { id: "group-usa", driver_uuid: DRIVER, week_start: WEEK },
      error: null,
    };

    const res = await POST(
      makeRequest({ driverUuid: DRIVER, startDate: WEEK, workTrackerGroupId: "group-usa" }),
    );

    // Past the guard, the stub has no driver — so the route's own next check answers.
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Driver not found");
  });

  it("still works without a group id (an update of an existing bill, or a caller with none)", async () => {
    const res = await POST(makeRequest({ driverUuid: DRIVER, startDate: WEEK }));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Driver not found");
  });
});
