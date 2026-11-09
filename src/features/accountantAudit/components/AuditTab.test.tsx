import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-01-tab.md §3 and §5 (the shell: empty state until a driver is
// chosen) and accountant-audit-02-driver-select.md §3 and §5 (the select, the driver in the URL,
// the details block, R6) and accountant-audit-04-table.md §3 and §5 (the table, the pager, D6).

const router = { replace: vi.fn() };
let search = "";
let options: any[] = [];
let optionsLoading = false;
let info: any = null;
let infoLoading = false;
let trackers: {
  rows: AuditTrackerRow[];
  total: number;
  page: number;
  isLoading: boolean;
  error: Error | undefined;
} = { rows: [], total: 0, page: 1, isLoading: false, error: undefined };
const trackerCalls: unknown[][] = [];
let selectProps: any = null;
let paginationProps: any = null;
const scrollTo = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
// The effect of R6 must run in a static render.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => f(),
}));
vi.mock("../hooks/useAuditDriverOptions", () => ({
  useAuditDriverOptions: () => ({ options, isLoading: optionsLoading }),
}));
vi.mock("../hooks/useAuditDriverInfo", () => ({
  useAuditDriverInfo: () => ({ info, isLoading: infoLoading }),
}));
vi.mock("../hooks/useAuditTrackers", () => ({
  useAuditTrackers: (...args: unknown[]) => {
    trackerCalls.push(args);
    return trackers;
  },
}));
vi.mock("./AuditDriverSelect", () => ({
  AuditDriverSelect: (p: any) => {
    selectProps = p;
    return <div data-testid="select" data-value={p.value ?? ""} />;
  },
}));
// The real pager is covered by its own tests; here only what the tab hands it matters.
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

import type { AuditTrackerRow } from "../utils/auditRows";
import { AuditTab } from "./AuditTab";

const trackerRow = (id: string): AuditTrackerRow => ({
  id,
  status: "completed",
  date: "2026-10-30",
  bleacherNumber: 1204,
  typeCode: "trip",
  typeName: "Trip",
  pickup: null,
  dropoff: null,
  driveMinutes: null,
  distanceMeters: null,
  payment: "paid",
});

/** The URL of the n-th router.replace call, parsed. */
const replacedUrl = (n = 0) => {
  const url = new URL(router.replace.mock.calls[n][0] as string, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

const opt = {
  id: "d1",
  driverUuid: "d1",
  clerkUserId: "c",
  firstName: "A",
  lastName: "B",
  email: "e",
  isInactive: false,
};

beforeEach(() => {
  router.replace.mockReset();
  search = "tab=audit";
  options = [opt];
  optionsLoading = false;
  info = { address: "1 Main St", phone: "555", email: "a@x.com" };
  infoLoading = false;
  trackers = { rows: [trackerRow("t1")], total: 1, page: 1, isLoading: false, error: undefined };
  trackerCalls.length = 0;
  selectProps = null;
  paginationProps = null;
  scrollTo.mockReset();
});

describe("AuditTab with no driver", () => {
  it("shows the select first, then the empty state, and no details block", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="audit-tab"');
    expect(html.indexOf('data-testid="select"')).toBeLessThan(
      html.indexOf('data-testid="audit-empty-state"'),
    );
    expect(html).toContain(">Choose a driver<");
    expect(html).toContain(
      ">Pick a driver above to see all of their work trackers and whether each one has been paid.<",
    );
    expect(html).not.toContain('data-testid="audit-driver-info"');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("draws the truck icon, hidden from assistive technology, and no table", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    const icon = html.match(/<svg[^>]*lucide-truck[^>]*>/)?.[0] ?? "";
    expect(icon).toContain('aria-hidden="true"');
    expect(html).not.toContain("<table");
  });
});

describe("AuditTab with a driver", () => {
  it("shows the select's value and the details block, and not the empty state", () => {
    search = "tab=audit&driver=d1";
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-value="d1"');
    expect(html).toContain('data-testid="audit-driver-info"');
    expect(html).not.toContain('data-testid="audit-empty-state"');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("draws no block while the details load", () => {
    search = "tab=audit&driver=d1";
    infoLoading = true;
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).not.toContain('data-testid="audit-driver-info"');
  });

  it("removes an unknown driver from the URL once the list has loaded", () => {
    search = "tab=audit&driver=ghost";
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).toHaveBeenCalledWith("/accountant?tab=audit", { scroll: false });
  });

  it("keeps the driver while the list is loading", () => {
    search = "tab=audit&driver=d1";
    options = [];
    optionsLoading = true;
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("AuditTab and the tracker query", () => {
  it("gives the hook null while no driver is chosen, and shows no table and no pager", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(trackerCalls.at(-1)).toEqual([null, 1, 25]);
    expect(html).not.toContain('data-testid="audit-table"');
    expect(html).not.toContain('data-testid="pager"');
  });

  it("gives the hook the chosen driver, and the page and size read from the URL", () => {
    search = "tab=audit&driver=d1&apage=3&apagesize=50";
    renderToStaticMarkup(<AuditTab />);
    expect(trackerCalls.at(-1)).toEqual(["d1", 3, 50]);
  });

  it("defaults to page 1 and size 25", () => {
    search = "tab=audit&driver=d1";
    renderToStaticMarkup(<AuditTab />);
    expect(trackerCalls.at(-1)).toEqual(["d1", 1, 25]);
  });

  it("ignores the page-level page and pageSize parameters", () => {
    search = "tab=audit&driver=d1&page=7&pageSize=100";
    renderToStaticMarkup(<AuditTab />);
    expect(trackerCalls.at(-1)).toEqual(["d1", 1, 25]);
  });
});

describe("AuditTab table and pager", () => {
  beforeEach(() => {
    search = "tab=audit&driver=d1";
  });

  it("shows the details block, then the table, then the pager", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    const info = html.indexOf('data-testid="audit-driver-info"');
    const table = html.indexOf('data-testid="audit-table"');
    const pager = html.indexOf('data-testid="pager"');
    expect(info).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(info);
    expect(pager).toBeGreaterThan(table);
    expect(html).toContain('data-testid="audit-row-status"');
  });

  it("gives the pager the effective page, the page size and the total", () => {
    search = "tab=audit&driver=d1&apage=2&apagesize=50";
    trackers = { ...trackers, rows: [trackerRow("t1")], total: 120, page: 2 };
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-page="2"');
    expect(html).toContain('data-size="50"');
    expect(html).toContain('data-total="120"');
  });

  it("shows the table without a pager when the total is 0", () => {
    trackers = { ...trackers, rows: [], total: 0 };
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="audit-table"');
    expect(html).toContain("This driver has no work trackers");
    expect(html).not.toContain('data-testid="pager"');
  });

  it("hides the pager and shows the loading message while the data loads", () => {
    trackers = { ...trackers, rows: [], total: 0, isLoading: true };
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain("Loading work trackers...");
    expect(html).not.toContain('data-testid="pager"');
  });

  it("hides the pager and shows the alert when the query fails", () => {
    trackers = { ...trackers, total: 5, error: new Error("nope") };
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain("Error loading work trackers: nope");
    expect(html).not.toContain('data-testid="pager"');
    expect(html).not.toContain("<table");
  });

  it("shows the last page for a page past the end, and does not rewrite the URL", () => {
    search = "tab=audit&driver=d1&apage=9";
    trackers = { ...trackers, total: 60, page: 3 };
    const html = renderToStaticMarkup(<AuditTab />);
    expect(trackerCalls.at(-1)).toEqual(["d1", 9, 25]);
    expect(html).toContain('data-page="3"');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("is read-only: the table has no link and no pointer cursor (D9)", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("cursor-pointer");
  });
});

describe("AuditTab paging writes the URL", () => {
  beforeEach(() => {
    search = "tab=audit&driver=d1";
    trackers = { ...trackers, total: 120, page: 1 };
  });

  it("a click on page 2 writes apage=2 in one replace, keeps the driver, and scrolls to the top", () => {
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageChange(2);

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { pathname, params } = replacedUrl();
    expect(pathname).toBe("/accountant");
    expect(params.get("apage")).toBe("2");
    expect(params.get("driver")).toBe("d1");
    expect(params.get("tab")).toBe("audit");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("going back to page 1 removes apage", () => {
    search = "tab=audit&driver=d1&apage=2";
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageChange(1);
    expect(replacedUrl().params.has("apage")).toBe(false);
  });

  it("keeps the page size when the page changes", () => {
    search = "tab=audit&driver=d1&apagesize=50";
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageChange(2);
    expect(replacedUrl().params.get("apagesize")).toBe("50");
  });

  it("a new size writes apagesize and drops apage, in one replace", () => {
    search = "tab=audit&driver=d1&apage=3";
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageSizeChange(50);

    expect(router.replace).toHaveBeenCalledTimes(1);
    const { params } = replacedUrl();
    expect(params.get("apagesize")).toBe("50");
    expect(params.has("apage")).toBe(false);
    expect(params.get("driver")).toBe("d1");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("going back to size 25 removes apagesize", () => {
    search = "tab=audit&driver=d1&apagesize=50";
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageSizeChange(25);
    expect(replacedUrl().params.has("apagesize")).toBe(false);
  });

  it("keeps the other parameters of the page", () => {
    search = "tab=audit&driver=d1&csort=x";
    renderToStaticMarkup(<AuditTab />);
    paginationProps.onPageChange(2);
    expect(replacedUrl().params.get("csort")).toBe("x");
  });

  it("a driver change drops apage in the same write and keeps the size", () => {
    search = "tab=audit&driver=d1&apage=3&apagesize=50";
    options = [opt, { ...opt, id: "d2", driverUuid: "d2" }];
    renderToStaticMarkup(<AuditTab />);
    selectProps.onChange("d2");

    expect(router.replace).toHaveBeenCalledTimes(1);
    const { params } = replacedUrl();
    expect(params.get("driver")).toBe("d2");
    expect(params.has("apage")).toBe(false);
    expect(params.get("apagesize")).toBe("50");
  });

  it("clearing the driver drops the driver and apage", () => {
    search = "tab=audit&driver=d1&apage=3";
    renderToStaticMarkup(<AuditTab />);
    selectProps.onChange(null);
    const { params } = replacedUrl();
    expect(params.has("driver")).toBe(false);
    expect(params.has("apage")).toBe(false);
  });
});
