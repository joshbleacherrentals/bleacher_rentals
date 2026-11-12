import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (D2, D7, D9, D18-D21, R5, R6, R9, R17,
// R21). The table, the search bar and the range controls have their own tests; here only what the
// list hands them and what it writes into the URL matters.

const router = { replace: vi.fn(), push: vi.fn() };
let search = "";
let totals: { rows: AuditDriverRow[]; isLoading: boolean; error: Error | undefined } = {
  rows: [],
  isLoading: false,
  error: undefined,
};
const totalsCalls: unknown[][] = [];
let tableProps: any = null;
let barProps: any = null;
let controlsProps: any = null;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
// The effects must run in a static render (the search sync effect).
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => f(),
}));
vi.mock("../hooks/useAuditDriverTotals", () => ({
  useAuditDriverTotals: (...args: unknown[]) => {
    totalsCalls.push(args);
    return totals;
  },
}));
vi.mock("./AuditDriversTable", () => ({
  AuditDriversTable: (p: any) => {
    tableProps = p;
    return <div data-testid="table" data-rows={p.rows.map((r: any) => r.driverUuid).join(",")} />;
  },
}));
vi.mock("./AuditSearchBar", async (orig) => ({
  ...(await orig<typeof import("./AuditSearchBar")>()),
  AuditSearchBar: (p: any) => {
    barProps = p;
    return <div data-testid="search-bar" data-value={p.value} />;
  },
}));
vi.mock("./AuditRangeControls", () => ({
  AuditRangeControls: (p: any) => {
    controlsProps = p;
    return <div data-testid="range-controls" />;
  },
}));

import type { AuditDriverRow } from "../utils/auditDriverRows";
import { AuditDriversList } from "./AuditDriversList";

const row = (id: string, first: string, last: string, over: Partial<AuditDriverRow> = {}) =>
  ({
    driverUuid: id,
    firstName: first,
    lastName: last,
    distanceMeters: 0,
    driveMinutes: 0,
    payCents: 0,
    payCurrency: "USD",
    tripCount: 0,
    ...over,
  }) as AuditDriverRow;

const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const render = (over: { range?: typeof RANGE; isInverted?: boolean } = {}) =>
  renderToStaticMarkup(
    <AuditDriversList
      range={over.range ?? RANGE}
      onRangeChange={() => {}}
      isInverted={over.isInverted ?? false}
    />,
  );
const rowIds = () => tableProps.rows.map((r: AuditDriverRow) => r.driverUuid);
const replacedParams = (n = 0) =>
  new URL(router.replace.mock.calls[n][0] as string, "http://localhost").searchParams;

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
  search = "tab=audit&from=2026-11-01&to=2026-11-30";
  totals = {
    rows: [
      row("a", "Ann", "Lee", { payCents: 100 }),
      row("b", "Bob", "Stone", { payCents: 900 }),
      row("c", "Cy", "Park", { payCents: 500 }),
    ],
    isLoading: false,
    error: undefined,
  };
  totalsCalls.length = 0;
  tableProps = null;
  barProps = null;
  controlsProps = null;
});

describe("the layout (R1, D18)", () => {
  it("puts the search bar, then the range controls, then the table", () => {
    const html = render();
    const bar = html.indexOf('data-testid="search-bar"');
    const controls = html.indexOf('data-testid="range-controls"');
    const table = html.indexOf('data-testid="table"');
    expect(bar).toBeGreaterThan(-1);
    expect(controls).toBeGreaterThan(bar);
    expect(table).toBeGreaterThan(controls);
  });

  it("has no KPI cards, no driver select and no pager", () => {
    const html = render();
    for (const text of [
      "Total Distance",
      "Total Pay",
      "Maintenance Cost",
      "Choose a driver",
      "Choose driver",
      'data-testid="pager"',
    ]) {
      expect(html).not.toContain(text);
    }
  });

  it("hands the range to the hook and to the controls, and its change back up", () => {
    const changes: unknown[] = [];
    renderToStaticMarkup(
      <AuditDriversList range={RANGE} onRangeChange={(r) => changes.push(r)} isInverted={false} />,
    );
    expect(totalsCalls.at(-1)).toEqual([RANGE]);
    expect(controlsProps.range).toEqual(RANGE);
    controlsProps.onChange({ from: null, to: null });
    expect(changes).toEqual([{ from: null, to: null }]);
  });
});

describe("the order of the rows (D19, R4)", () => {
  it("opens on Pay, largest first", () => {
    render();
    expect(rowIds()).toEqual(["b", "c", "a"]);
    expect(tableProps.sort).toEqual({ key: "pay", direction: "desc" });
  });

  it("follows asort and adir from the URL", () => {
    search += "&asort=driver&adir=asc";
    render();
    expect(rowIds()).toEqual(["a", "b", "c"]);
    expect(tableProps.sort).toEqual({ key: "driver", direction: "asc" });
    search = "tab=audit&asort=driver&adir=desc";
    render();
    expect(rowIds()).toEqual(["c", "b", "a"]);
  });

  it("reads a bad asort as the opening sort", () => {
    search += "&asort=bogus";
    render();
    expect(tableProps.sort).toEqual({ key: "pay", direction: "desc" });
  });
});

describe("the sort click writes the URL (D20, D21, R21)", () => {
  it("a first click on Driver writes asort=driver and adir=asc, keeping the rest", () => {
    render();
    tableProps.onSort("driver");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const params = replacedParams();
    expect(params.get("asort")).toBe("driver");
    expect(params.get("adir")).toBe("asc");
    expect(params.get("from")).toBe("2026-11-01");
    expect(params.get("tab")).toBe("audit");
  });

  it("a click on the sorted column flips it: Pay descending becomes adir=asc", () => {
    render();
    tableProps.onSort("pay");
    const params = replacedParams();
    expect(params.has("asort")).toBe(false);
    expect(params.get("adir")).toBe("asc");
  });

  it("a click on Pay ascending brings back the opening order and removes both parameters", () => {
    search += "&adir=asc";
    render();
    tableProps.onSort("pay");
    const params = replacedParams();
    expect(params.has("asort")).toBe(false);
    expect(params.has("adir")).toBe(false);
  });

  it("a first click on a number column starts with the largest", () => {
    render();
    tableProps.onSort("trips");
    const params = replacedParams();
    expect(params.get("asort")).toBe("trips");
    expect(params.has("adir")).toBe(false); // desc is the opening direction
  });
});

describe("the search (D7, R6)", () => {
  it("filters the rows by the text in the URL, then sorts them", () => {
    search += "&asearch=o";
    render();
    expect(barProps.value).toBe("o");
    expect(rowIds()).toEqual(["b"]); // Bob Stone; Ann Lee, Cy Park have no o... "Park" none
  });

  it("starts the box with the URL's text", () => {
    search += "&asearch=ann";
    render();
    expect(barProps.value).toBe("ann");
    expect(rowIds()).toEqual(["a"]);
  });

  describe("writes the text into the URL after a pause", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("writes asearch 300 ms after the last key, by replace, keeping the rest", () => {
      render();
      barProps.onChange("ann");
      expect(router.replace).not.toHaveBeenCalled();
      vi.advanceTimersByTime(299);
      expect(router.replace).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(router.replace).toHaveBeenCalledTimes(1);
      const params = replacedParams();
      expect(params.get("asearch")).toBe("ann");
      expect(params.get("from")).toBe("2026-11-01");
      expect(params.get("tab")).toBe("audit");
    });

    it("writes only the last text when the user keeps typing", () => {
      render();
      barProps.onChange("a");
      vi.advanceTimersByTime(100);
      barProps.onChange("an");
      vi.advanceTimersByTime(300);
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(replacedParams().get("asearch")).toBe("an");
    });

    it("clearing the text removes asearch", () => {
      search += "&asearch=ann";
      render();
      barProps.onChange("");
      vi.advanceTimersByTime(300);
      expect(replacedParams().has("asearch")).toBe(false);
    });
  });
});

describe("a row leads to the driver page (D9, R5)", () => {
  it("keeps from, to, asearch, asort and adir, adds driver, drops apage", () => {
    search += "&asearch=bo&asort=driver&adir=asc&apage=3&apagesize=50";
    render();
    const href: string = tableProps.getRowHref(row("b", "Bob", "Stone"));
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/accountant");
    expect(url.searchParams.get("driver")).toBe("b");
    expect(url.searchParams.get("from")).toBe("2026-11-01");
    expect(url.searchParams.get("to")).toBe("2026-11-30");
    expect(url.searchParams.get("asearch")).toBe("bo");
    expect(url.searchParams.get("asort")).toBe("driver");
    expect(url.searchParams.get("adir")).toBe("asc");
    expect(url.searchParams.get("tab")).toBe("audit");
    expect(url.searchParams.has("apage")).toBe(false);
  });
});

describe("the messages (R9, R17)", () => {
  it("shows the inverted-range message and no table", () => {
    const html = render({ isInverted: true });
    expect(html).toContain("The start date is after the end date.");
    expect(html).not.toContain('data-testid="table"');
  });

  it("shows the loading text and no table while loading", () => {
    totals = { ...totals, rows: [], isLoading: true };
    const html = render();
    expect(html).toContain("Loading drivers...");
    expect(html).not.toContain('data-testid="table"');
    expect(html).not.toContain("No driver data");
  });

  it("shows the error and no table when the query fails", () => {
    totals = { ...totals, error: new Error("nope") };
    const html = render();
    expect(html).toContain("Could not load the drivers.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('data-testid="table"');
  });

  it("gives the table the range's empty message when the range has no drivers", () => {
    totals = { ...totals, rows: [] };
    render();
    expect(tableProps.emptyMessage).toBe("No driver data for this range.");
    expect(tableProps.rows).toEqual([]);
  });

  it("gives the table 'No driver found.' when the search matches nobody", () => {
    search += "&asearch=zzz";
    render();
    expect(tableProps.emptyMessage).toBe("No driver found.");
    expect(tableProps.rows).toEqual([]);
  });
});
