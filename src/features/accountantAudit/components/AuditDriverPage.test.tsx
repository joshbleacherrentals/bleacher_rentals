import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (D8-D10, R12, R13) and
// accountant-audit-04-table.md §3, §5 (the table, the pager, D6).

const router = { replace: vi.fn() };
let search = "";
let trackers: {
  rows: AuditTrackerRow[];
  total: number;
  page: number;
  isLoading: boolean;
  error: Error | undefined;
} = { rows: [], total: 0, page: 1, isLoading: false, error: undefined };
const trackerCalls: unknown[][] = [];
let paginationProps: any = null;
let controlsProps: any = null;
const scrollTo = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("../hooks/useAuditTrackers", () => ({
  useAuditTrackers: (...args: unknown[]) => {
    trackerCalls.push(args);
    return trackers;
  },
}));
vi.mock("./AuditRangeControls", () => ({
  AuditRangeControls: (p: any) => {
    controlsProps = p;
    return <div data-testid="range-controls" />;
  },
}));
// The real pager is covered by its own tests; here only what the page hands it matters.
vi.mock("@/components/Pagination", () => ({
  Pagination: (p: any) => {
    paginationProps = p;
    return (
      <div
        data-testid="pager"
        data-page={p.page}
        data-size={p.pageSize}
        data-total={p.totalItems}
      />
    );
  },
}));
vi.mock("@/contexts/LayoutContexts", () => ({
  useLayoutContext: () => ({ scrollRef: { current: { scrollTo } } }),
}));

import type { AuditDriverInfo } from "../db/auditDriverInfo";
import type { AuditTrackerRow } from "../utils/auditRows";
import { AuditDriverPage } from "./AuditDriverPage";

const trackerRow = (id: string): AuditTrackerRow => ({
  id,
  status: "completed",
  date: "2026-11-10",
  bleacherNumber: 1204,
  typeCode: "trip",
  typeName: "Trip",
  pickup: null,
  dropoff: null,
  driveMinutes: null,
  distanceMeters: null,
  payment: "paid",
});

const INFO: AuditDriverInfo = {
  address: "1 Main St",
  phone: "555",
  email: "a@x.com",
  firstName: "Ann",
  lastName: "Lee",
  isInactive: false,
};
const RANGE = { from: "2026-11-01", to: "2026-11-30" };

type Over = { info?: AuditDriverInfo | null; isInverted?: boolean };
const render = (over: Over = {}) =>
  renderToStaticMarkup(
    <AuditDriverPage
      driver="d1"
      info={over.info === undefined ? INFO : over.info}
      range={RANGE}
      onRangeChange={() => {}}
      isInverted={over.isInverted ?? false}
    />,
  );
const replacedUrl = (n = 0) => {
  const url = new URL(router.replace.mock.calls[n][0] as string, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

beforeEach(() => {
  router.replace.mockReset();
  search = "tab=audit&driver=d1&from=2026-11-01&to=2026-11-30";
  trackers = { rows: [trackerRow("t1")], total: 1, page: 1, isLoading: false, error: undefined };
  trackerCalls.length = 0;
  paginationProps = null;
  controlsProps = null;
  scrollTo.mockReset();
});

describe("the top of the page (D9, D10, R12, R13)", () => {
  it("has a Back link, then the driver's name, then the details, the range controls, the table and the pager", () => {
    const html = render();
    const order = [
      'data-testid="audit-back"',
      'data-testid="audit-driver-name"',
      'data-testid="audit-driver-info"',
      'data-testid="range-controls"',
      'data-testid="audit-table"',
      'data-testid="pager"',
    ].map((s) => html.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows the name, 'First Last'", () => {
    expect(render()).toMatch(/data-testid="audit-driver-name"[^>]*>Ann Lee</);
  });

  it("shows 'Unknown Driver' when the driver has no name", () => {
    const html = render({ info: { ...INFO, firstName: "", lastName: "" } });
    expect(html).toMatch(/data-testid="audit-driver-name"[^>]*>Unknown Driver</);
  });

  it("marks a deactivated driver Inactive, and an active one not", () => {
    expect(render({ info: { ...INFO, isInactive: true } })).toContain(
      'data-testid="audit-driver-inactive"',
    );
    expect(render()).not.toContain('data-testid="audit-driver-inactive"');
  });

  it("draws no name and no details block while the details load, but the Back link and the table", () => {
    const html = render({ info: null });
    expect(html).not.toContain('data-testid="audit-driver-name"');
    expect(html).not.toContain('data-testid="audit-driver-info"');
    expect(html).toContain('data-testid="audit-back"');
    expect(html).toContain('data-testid="audit-table"');
  });

  it("has no driver select and no 'Choose a driver'", () => {
    const html = render();
    expect(html).not.toContain("Choose driver");
    expect(html).not.toContain("Choose a driver");
    expect(html).not.toContain("Search drivers");
  });
});

describe("the Back link (D9, R12)", () => {
  it("is a link to the table: the same URL without driver and apage, the rest kept", () => {
    search =
      "tab=audit&driver=d1&from=2026-11-01&to=2026-11-30&asearch=ann&asort=driver&adir=asc&apage=3&apagesize=50";
    const html = render();
    const tag = html.match(/<a [^>]*data-testid="audit-back"[^>]*>/)?.[0] ?? "";
    const href = tag.match(/href="([^"]*)"/)?.[1] ?? "";
    const url = new URL(href.replace(/&amp;/g, "&"), "http://localhost");
    expect(url.pathname).toBe("/accountant");
    expect(url.searchParams.has("driver")).toBe(false);
    expect(url.searchParams.has("apage")).toBe(false);
    expect(url.searchParams.get("from")).toBe("2026-11-01");
    expect(url.searchParams.get("to")).toBe("2026-11-30");
    expect(url.searchParams.get("asearch")).toBe("ann");
    expect(url.searchParams.get("asort")).toBe("driver");
    expect(url.searchParams.get("adir")).toBe("asc");
    expect(url.searchParams.get("tab")).toBe("audit");
  });

  it("says Back", () => {
    expect(render()).toMatch(/data-testid="audit-back"[^>]*>.*Back<\/a>/);
  });
});

describe("the range (D8)", () => {
  it("gives the controls the range and hands its change up", () => {
    const changes: unknown[] = [];
    renderToStaticMarkup(
      <AuditDriverPage
        driver="d1"
        info={INFO}
        range={RANGE}
        onRangeChange={(r) => changes.push(r)}
        isInverted={false}
      />,
    );
    expect(controlsProps.range).toEqual(RANGE);
    controlsProps.onChange({ from: null, to: null });
    expect(changes).toEqual([{ from: null, to: null }]);
  });

  it("gives the tracker hook the driver, the range, and the page and size from the URL", () => {
    search += "&apage=3&apagesize=50";
    render();
    expect(trackerCalls.at(-1)).toEqual(["d1", RANGE, 3, 50]);
  });

  it("defaults to page 1 and size 25, and ignores the page-level page and pageSize", () => {
    search += "&page=7&pageSize=100";
    render();
    expect(trackerCalls.at(-1)).toEqual(["d1", RANGE, 1, 25]);
  });

  it("shows the inverted-range message instead of the table and the pager", () => {
    const html = render({ isInverted: true });
    expect(html).toContain("The start date is after the end date.");
    expect(html).not.toContain('data-testid="audit-table"');
    expect(html).not.toContain('data-testid="pager"');
    expect(html).toContain('data-testid="range-controls"');
  });
});

describe("the table and the pager (spec 04)", () => {
  it("gives the pager the effective page, the page size and the total", () => {
    search += "&apage=2&apagesize=50";
    trackers = { ...trackers, total: 120, page: 2 };
    const html = render();
    expect(html).toContain('data-page="2"');
    expect(html).toContain('data-size="50"');
    expect(html).toContain('data-total="120"');
  });

  it("shows the table without a pager when the total is 0, with the range's empty message (R18)", () => {
    trackers = { ...trackers, rows: [], total: 0 };
    const html = render();
    expect(html).toContain('data-testid="audit-table"');
    expect(html).toContain("This driver has no work trackers in this range");
    expect(html).not.toContain('data-testid="pager"');
  });

  it("hides the pager and shows the loading message while the data loads", () => {
    trackers = { ...trackers, rows: [], total: 0, isLoading: true };
    const html = render();
    expect(html).toContain("Loading work trackers...");
    expect(html).not.toContain('data-testid="pager"');
  });

  it("hides the pager and shows the alert when the query fails", () => {
    trackers = { ...trackers, total: 5, error: new Error("nope") };
    const html = render();
    expect(html).toContain("Error loading work trackers: nope");
    expect(html).not.toContain('data-testid="pager"');
  });

  it("is read-only: a tracker row has no link and no pointer cursor (spec 04 D9)", () => {
    const html = render();
    const table = html.slice(html.indexOf('data-testid="audit-table"'));
    expect(table.slice(0, table.indexOf('data-testid="pager"'))).not.toContain("<a ");
    expect(table).not.toContain("cursor-pointer");
  });
});

describe("paging writes the URL (spec 04)", () => {
  beforeEach(() => {
    trackers = { ...trackers, total: 120, page: 1 };
  });

  it("a click on page 2 writes apage=2 in one replace, keeps the driver and the range, and scrolls up", () => {
    render();
    paginationProps.onPageChange(2);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { pathname, params } = replacedUrl();
    expect(pathname).toBe("/accountant");
    expect(params.get("apage")).toBe("2");
    expect(params.get("driver")).toBe("d1");
    expect(params.get("from")).toBe("2026-11-01");
    expect(params.get("to")).toBe("2026-11-30");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("a new size writes apagesize and drops apage, in one replace", () => {
    search += "&apage=3";
    render();
    paginationProps.onPageSizeChange(50);
    expect(router.replace).toHaveBeenCalledTimes(1);
    const { params } = replacedUrl();
    expect(params.get("apagesize")).toBe("50");
    expect(params.has("apage")).toBe(false);
    expect(params.get("driver")).toBe("d1");
  });

  it("going back to page 1 or size 25 removes the parameter", () => {
    search += "&apage=2&apagesize=50";
    render();
    paginationProps.onPageChange(1);
    paginationProps.onPageSizeChange(25);
    expect(replacedUrl(0).params.has("apage")).toBe(false);
    expect(replacedUrl(1).params.has("apagesize")).toBe(false);
  });
});

describe("the driver card", () => {
  it("holds the initials, the name and the details together", () => {
    const html = render();
    const card =
      html.match(
        /<div class="[^"]*rounded-xl[^"]*">(.*?)<div class="mt-4"><div data-testid="range-controls"/,
      )?.[1] ?? "";
    expect(card).toContain('data-testid="audit-avatar"');
    expect(card).toContain('data-testid="audit-driver-name"');
    expect(card).toContain('data-testid="audit-driver-info"');
  });

  it("is not drawn while the details load", () => {
    expect(render({ info: null })).not.toContain('data-testid="audit-avatar"');
  });
});
