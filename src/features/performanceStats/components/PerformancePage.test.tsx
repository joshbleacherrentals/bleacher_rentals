import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { access, search, replace, stats } = vi.hoisted(() => ({
  access: { value: { status: "loading" } as unknown },
  search: { value: "" },
  replace: vi.fn(),
  stats: vi.fn(),
}));

vi.mock("@/features/userAccess/client", () => ({ useUserAccess: () => access.value }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/dev-tools/performance",
  useSearchParams: () => new URLSearchParams(search.value),
}));

vi.mock("@/components/PageHeaderWithBreadCrumbs", () => ({
  PageHeaderWithBreadCrumbs: ({ crumbs }: { crumbs: Array<{ label: string }> }) => (
    <h1>{crumbs.at(-1)?.label}</h1>
  ),
}));

vi.mock("../hooks/usePerformanceStats", () => ({ usePerformanceStats: stats }));

import PerformancePage from "./PerformancePage";

const query = (data: unknown, over: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  error: null,
  ...over,
});

const populated = () => ({
  metrics: query([
    {
      name: "powersync.connect",
      n: 150,
      errors: 1,
      p50: 350,
      p75: 450,
      p90: 520,
      p95: 575,
      p99: 599,
      maxMs: 1000,
    },
  ]),
  sqlite: query([
    {
      name: "sqlite.query",
      calls: 103,
      slowCalls: 2,
      percentiles: [{ p: 0.5, kind: "bucket", value: 5 }],
    },
  ]),
  errors: query([
    {
      name: "sync.upload",
      kind: "pg:23505",
      count: 2,
      medianMs: 60,
      maxMs: 70,
      firstSeen: "2026-10-09T10:00:00Z",
      lastSeen: "2026-10-09T11:00:00Z",
    },
  ]),
  health: query([
    {
      events: 19,
      dropped: 10,
      loads: 2,
      rows: 21,
      oldest: "2026-09-09T00:00:00Z",
      newest: "2026-10-09T11:00:00Z",
      sizeBytes: 8192,
    },
  ]),
  versions: query([
    { version: "1.17.0", events: 10 },
    { version: "1.16.0", events: 5 },
  ]),
  breakdown: query(undefined, { isLoading: false }),
  updatedAt: new Date("2026-10-09T12:34:56Z").getTime(),
});

const developer = { status: "active", roles: ["developer"], userId: "u1", accountManagerId: null };

function render() {
  return renderToStaticMarkup(<PerformancePage />);
}

beforeEach(() => {
  access.value = { status: "loading" };
  search.value = "";
  replace.mockReset();
  stats.mockReset();
  stats.mockReturnValue(populated());
});

describe("PerformancePage: who sees it", () => {
  it("renders nothing, and reads nothing, while the access is loading", () => {
    expect(render()).toBe("");
    expect(stats).not.toHaveBeenCalled();
  });

  it.each(["admin", "account_manager", "viewer", "accountant", "maintainer", "driver"])(
    "renders nothing, and reads nothing, for %s",
    (role) => {
      access.value = { ...developer, roles: [role] };
      expect(render()).toBe("");
      expect(stats).not.toHaveBeenCalled();
    },
  );

  it("renders nothing for a blocked user", () => {
    access.value = { status: "blocked", reason: "no-roles-assigned" };
    expect(render()).toBe("");
    expect(stats).not.toHaveBeenCalled();
  });

  it("shows a developer the page", () => {
    access.value = developer;
    const html = render();
    expect(html).toContain("Performance");
    expect(stats).toHaveBeenCalled();
  });
});

describe("PerformancePage: the view", () => {
  beforeEach(() => {
    access.value = developer;
  });

  it("starts at 7 days, production, all versions, with no metric chosen", () => {
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>7 days</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>production</);
    expect(html).toContain("All versions");
    expect(html).toContain("Choose a metric above");
    expect(stats).toHaveBeenCalledWith(
      { period: "7d", env: "production", version: null },
      null,
      expect.any(Date),
    );
  });

  it("reads every filter and the metric from the address", () => {
    search.value = "period=24h&env=development&version=1.16.0&metric=powersync.connect";
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>24 hours</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>development</);
    expect(html).toMatch(/Breakdown:.*powersync\.connect/);
    expect(stats).toHaveBeenCalledWith(
      { period: "24h", env: "development", version: "1.16.0" },
      "powersync.connect",
      expect.any(Date),
    );
  });

  it("falls back for a malformed address instead of failing", () => {
    search.value = "period=1y&env=staging&metric=DROP TABLE";
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>7 days</);
    expect(html).toContain("Choose a metric above");
  });

  it("offers the versions the period has", () => {
    const html = render();
    expect(html).toContain("1.17.0");
    expect(html).toContain("1.16.0");
  });

  it("shows when the numbers were read", () => {
    expect(render()).toMatch(/Updated \d{2}:\d{2}:\d{2}/);
  });

  it("has a Refresh button", () => {
    expect(render()).toContain("Refresh");
  });
});

describe("PerformancePage: the blocks", () => {
  beforeEach(() => {
    access.value = developer;
  });

  it("shows the four blocks with their data", () => {
    const html = render();
    for (const title of ["Metrics", "SQLite calls", "Errors", "Telemetry health"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain("powersync.connect");
    expect(html).toContain("sqlite.query");
    expect(html).toContain("pg:23505");
    expect(html).toContain("8.0 KB");
  });

  it("shows the chosen metric's row as selected", () => {
    search.value = "metric=powersync.connect";
    expect(render()).toMatch(/data-metric="powersync.connect"[^>]*aria-selected="true"/);
  });

  it("says there are no events for an empty period, in each block", () => {
    stats.mockReturnValue({
      ...populated(),
      metrics: query([]),
      sqlite: query([]),
      errors: query([]),
    });
    const html = render();
    expect(html.match(/No events for this period and environment/g)?.length).toBe(3);
  });

  it("shows a failed block by its kind while the others still show", () => {
    stats.mockReturnValue({
      ...populated(),
      metrics: query(undefined, { error: { code: "57014", message: "x" } }),
    });
    const html = render();
    expect(html).toMatch(/shorter period/i);
    expect(html).toContain("sqlite.query");
  });

  it("loads each block on its own", () => {
    stats.mockReturnValue({
      ...populated(),
      metrics: query(undefined, { isLoading: true }),
    });
    const html = render();
    expect(html).toContain("Loading");
    expect(html).toContain("sqlite.query");
  });

  it("asks the breakdown of the chosen metric", () => {
    search.value = "metric=sqlite.query";
    stats.mockReturnValue({
      ...populated(),
      breakdown: query([
        {
          dimension: "op",
          value: "select",
          n: 103,
          errors: 1,
          p50: null,
          p95: null,
          p99: null,
          calls: 103,
          slowCalls: 2,
          maxMs: 200,
        },
      ]),
    });
    const html = render();
    expect(html).toContain("By op");
    expect(html).toContain("Slowest");
  });
});
