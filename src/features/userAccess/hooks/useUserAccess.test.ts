import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `useUserAccess` is a hook, and this repo has no DOM renderer. The hooks it calls are replaced by
// plain functions that run immediately, so calling it once is one render plus its effects.
const { query, fallback, clerk } = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: true, error: null as unknown },
  fallback: { value: null as unknown },
  clerk: { user: { id: "clerk_abc" } as { id: string } | null },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => unknown) => {
      effect();
    },
    useMemo: (factory: () => unknown) => factory(),
    useState: () => [fallback.value, () => {}],
  };
});

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: clerk.user }) }));

vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
  }),
}));

vi.mock("@/components/providers/SystemProvider", () => {
  // Any chain of Kysely calls, ending in `.compile()`.
  const chain: unknown = new Proxy(() => chain, {
    get: (_target, property) =>
      property === "compile" ? () => ({ sql: "select 1", parameters: [] }) : chain,
    apply: () => chain,
  });
  return { db: chain };
});

vi.mock("@/lib/powersync/typedQuery", () => ({
  useTypedQuery: () => query,
  expect: () => undefined,
}));

import { STATUSES } from "@/features/manageTeam/constants";
import { resetEventContextForTests } from "@/lib/perf/eventContext";
import { setMetricsSink } from "@/lib/perf/metrics";
import type { PerfEvent } from "@/lib/perf/telemetryEvent";
import { resetSyncObserverForTests, trackSqliteOpen } from "@/lib/powersync/syncObserver";
import { resetFirstDataForTests, useUserAccess } from "./useUserAccess";

let events: PerfEvent[];

const row = (over: Record<string, unknown> = {}) => ({
  id: "user-uuid-777",
  status_uuid: STATUSES.active,
  is_admin: 1,
  is_viewer: 0,
  account_manager_id: null,
  driver_id: null,
  developer_id: null,
  maintainer_id: null,
  accountant_id: null,
  ...over,
});

const firstData = () => events.filter((e) => e.name === "ui.first_data");

beforeEach(() => {
  events = [];
  resetEventContextForTests();
  resetSyncObserverForTests();
  resetFirstDataForTests();
  setMetricsSink((event) => events.push(event));
  query.data = undefined;
  query.isLoading = true;
  query.error = null;
  fallback.value = null;
  clerk.user = { id: "clerk_abc" };
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  setMetricsSink(null);
});

describe("useUserAccess: ui.first_data", () => {
  it("records nothing while the access is still loading", () => {
    expect(useUserAccess()).toEqual({ status: "loading" });
    expect(firstData()).toEqual([]);
  });

  it("records one event, from local data, the first time the status leaves loading", () => {
    query.isLoading = false;
    query.data = [row()];
    const state = useUserAccess();

    expect(state.status).toBe("active");
    expect(firstData()).toHaveLength(1);
    expect(firstData()[0]).toMatchObject({ name: "ui.first_data", outcome: "ok" });
    expect(firstData()[0].attrs).toMatchObject({ source: "local", status: "active" });
  });

  it("takes the roles from the access result, not from a store that is not filled yet", () => {
    query.isLoading = false;
    query.data = [row({ is_admin: 1, account_manager_id: "am-1" })];
    useUserAccess();
    expect(firstData()[0].roles).toEqual(["admin", "account_manager"]);
  });

  it("records a blocked user too, with its status, from local data when no fallback is needed", () => {
    query.isLoading = false;
    query.data = [row({ status_uuid: STATUSES.inactive })];
    expect(useUserAccess()).toEqual({ status: "blocked", reason: "account-deactivated" });

    expect(firstData()).toHaveLength(1);
    expect(firstData()[0].attrs).toMatchObject({ source: "local", status: "blocked" });
    expect(firstData()[0].roles).toBeNull();
  });

  it("records nothing while the Supabase fallback is in flight", () => {
    query.isLoading = false;
    query.data = [];
    expect(useUserAccess()).toEqual({ status: "loading" });
    expect(firstData()).toEqual([]);
  });

  it("marks an answer that came from the fallback as `fallback`", () => {
    query.isLoading = false;
    query.data = [];
    fallback.value = {
      clerkUserId: "clerk_abc",
      result: {
        status: "active",
        roles: ["driver"],
        userId: "user-uuid-9",
        accountManagerId: null,
      },
    };
    const state = useUserAccess();

    expect(state.status).toBe("active");
    expect(firstData()).toHaveLength(1);
    expect(firstData()[0].attrs).toMatchObject({ source: "fallback", status: "active" });
  });

  it("ignores a fallback that was resolved for another Clerk user", () => {
    query.isLoading = false;
    query.data = [];
    fallback.value = {
      clerkUserId: "someone_else",
      result: { status: "active", roles: ["driver"], userId: "x", accountManagerId: null },
    };
    expect(useUserAccess()).toEqual({ status: "loading" });
    expect(firstData()).toEqual([]);
  });

  it("records once per page load, however many renders and hook instances follow", () => {
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();
    useUserAccess();
    useUserAccess();
    expect(firstData()).toHaveLength(1);
  });

  it("does not record again when a loading hook instance resolves later", () => {
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();

    query.isLoading = true;
    useUserAccess();
    query.isLoading = false;
    useUserAccess();
    expect(firstData()).toHaveLength(1);
  });

  it("measures from the start of the page with performance.now, never Date.now", () => {
    vi.spyOn(performance, "now").mockReturnValue(4321.5);
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();

    expect(firstData()[0].durationMs).toBe(4321.5);
    expect(firstData()[0].at).toBe(1_700_000_000_000);
  });

  it("carries no user id, email or Clerk id", () => {
    query.isLoading = false;
    query.data = [row({ account_manager_id: "am-secret-id" })];
    useUserAccess();

    const serialised = JSON.stringify(firstData());
    for (const leaked of ["user-uuid-777", "clerk_abc", "am-secret-id", "@"]) {
      expect(serialised).not.toContain(leaked);
    }
  });

  it("tags the load cold when the database had never synced when it became ready", async () => {
    await trackSqliteOpen({
      waitForReady: () => Promise.resolve(),
      currentStatus: { hasSynced: false },
    });
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();
    expect(firstData()[0].attrs).toMatchObject({ cold: true });
  });

  it("tags the load warm when it had", async () => {
    await trackSqliteOpen({
      waitForReady: () => Promise.resolve(),
      currentStatus: { hasSynced: true },
    });
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();
    expect(firstData()[0].attrs).toMatchObject({ cold: false });
  });

  it("leaves `cold` out when it is not known, rather than guessing", () => {
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();
    expect(firstData()[0].attrs).not.toHaveProperty("cold");
  });

  it("is not hidden when the page was visible", () => {
    query.isLoading = false;
    query.data = [row()];
    useUserAccess();
    expect(firstData()[0].attrs).toMatchObject({ hidden: false });
  });
});

describe("useUserAccess: attrs.hidden in a browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is true when the page was hidden at any point before the answer", async () => {
    const handlers: Array<() => void> = [];
    const doc = {
      visibilityState: "visible",
      addEventListener: (_type: string, handler: () => void) => handlers.push(handler),
      removeEventListener: () => {},
    };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", {});
    vi.resetModules();

    const metricsModule = await import("@/lib/perf/metrics");
    const eventContext = await import("@/lib/perf/eventContext");
    const { useUserAccess: freshHook } = await import("./useUserAccess");
    const seen: PerfEvent[] = [];
    eventContext.resetEventContextForTests();
    metricsModule.setMetricsSink((event) => seen.push(event));

    doc.visibilityState = "hidden";
    handlers.forEach((handler) => handler());
    doc.visibilityState = "visible";

    query.isLoading = false;
    query.data = [row()];
    freshHook();

    expect(seen.find((e) => e.name === "ui.first_data")?.attrs).toMatchObject({ hidden: true });
  });
});
