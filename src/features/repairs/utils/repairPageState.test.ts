import { describe, expect, it } from "vitest";
import {
  buildRepairsView,
  filterByBleacher,
  narrowRepairsUrlState,
  readRepairsUrlState,
  writeRepairsUrlState,
  type RepairsUrlState,
} from "./repairPageState";
import { repairRow } from "./repairRowFixture";

// docs/specs/repairs-04-table.md §2.6, §2.8, §3 and §7.

const DEFAULT_STATE: RepairsUrlState = {
  tab: "open",
  page: 1,
  pageSize: 25,
  bleacherUuid: null,
};

const read = (query: string) => readRepairsUrlState(new URLSearchParams(query));

describe("readRepairsUrlState", () => {
  it("reads defaults from an empty URL", () => {
    expect(read("")).toEqual(DEFAULT_STATE);
  });

  it("reads every parameter it owns", () => {
    expect(read("tab=completed&page=3&pageSize=50&bleacher_uuid=b-1")).toEqual({
      tab: "completed",
      page: 3,
      pageSize: 50,
      bleacherUuid: "b-1",
    });
  });

  it("reads anything but completed as the Open tab", () => {
    expect(read("tab=foo").tab).toBe("open");
    expect(read("tab=open").tab).toBe("open");
    expect(read("tab=").tab).toBe("open");
  });

  it("reads a wrong or non-positive page as page 1", () => {
    expect(read("page=abc").page).toBe(1);
    expect(read("page=0").page).toBe(1);
    expect(read("page=-2").page).toBe(1);
    expect(read("page=2.5").page).toBe(1);
  });

  it("reads a page size that is not offered as 25", () => {
    expect(read("pageSize=30").pageSize).toBe(25);
    expect(read("pageSize=100").pageSize).toBe(100);
  });

  it("reads an empty bleacher_uuid as no bleacher", () => {
    expect(read("bleacher_uuid=").bleacherUuid).toBeNull();
  });
});

describe("writeRepairsUrlState", () => {
  it("writes nothing for the default state and removes stale values", () => {
    const existing = new URLSearchParams("tab=completed&page=3&pageSize=50&bleacher_uuid=b-1");
    expect(writeRepairsUrlState(DEFAULT_STATE, existing).toString()).toBe("");
  });

  it("writes each value that is not the default", () => {
    const out = writeRepairsUrlState(
      { tab: "completed", page: 4, pageSize: 100, bleacherUuid: "b-9" },
      new URLSearchParams(),
    );
    expect(out.get("tab")).toBe("completed");
    expect(out.get("page")).toBe("4");
    expect(out.get("pageSize")).toBe("100");
    expect(out.get("bleacher_uuid")).toBe("b-9");
  });

  it("does not write the Open tab, page 1 or the size 25", () => {
    const out = writeRepairsUrlState(
      { ...DEFAULT_STATE, bleacherUuid: "b-9" },
      new URLSearchParams(),
    );
    expect(out.toString()).toBe("bleacher_uuid=b-9");
  });

  it("keeps parameters it does not own", () => {
    const out = writeRepairsUrlState(
      { ...DEFAULT_STATE, tab: "completed" },
      new URLSearchParams("foo=bar&page=7"),
    );
    expect(out.get("foo")).toBe("bar");
    expect(out.get("tab")).toBe("completed");
    expect(out.has("page")).toBe(false);
  });
});

describe("narrowRepairsUrlState", () => {
  const state: RepairsUrlState = { tab: "open", page: 4, pageSize: 50, bleacherUuid: "b-1" };

  it("goes to page 1 when the tab changes", () => {
    expect(narrowRepairsUrlState(state, { tab: "completed" })).toEqual({
      tab: "completed",
      page: 1,
      pageSize: 50,
      bleacherUuid: "b-1",
    });
  });

  it("goes to page 1 when the bleacher changes or is cleared", () => {
    expect(narrowRepairsUrlState(state, { bleacherUuid: "b-2" }).page).toBe(1);
    expect(narrowRepairsUrlState(state, { bleacherUuid: null })).toMatchObject({
      page: 1,
      bleacherUuid: null,
    });
  });

  it("goes to page 1 when the page size changes", () => {
    expect(narrowRepairsUrlState(state, { pageSize: 100 })).toMatchObject({
      page: 1,
      pageSize: 100,
    });
  });

  it("goes to page 1 for an empty patch (Show Deleted toggled) and changes nothing else", () => {
    expect(narrowRepairsUrlState(state, {})).toEqual({ ...state, page: 1 });
  });
});

describe("filterByBleacher", () => {
  const rows = [
    repairRow({
      id: "a",
      bleachers: [
        { uuid: "b-1", number: 1 },
        { uuid: "b-2", number: 2 },
      ],
    }),
    repairRow({ id: "b", bleachers: [{ uuid: "b-3", number: 3 }] }),
    repairRow({ id: "c", bleachers: [] }),
  ];

  it("keeps every row for no bleacher", () => {
    expect(filterByBleacher(rows, null)).toEqual(rows);
  });

  it("keeps the repairs whose bleachers contain the chosen one, with all their chips", () => {
    const out = filterByBleacher(rows, "b-2");
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(out[0].bleachers).toHaveLength(2);
  });

  it("keeps nothing for a bleacher no repair has", () => {
    expect(filterByBleacher(rows, "nope")).toEqual([]);
  });
});

describe("buildRepairsView", () => {
  const completed = (id: string, cents: number | null, currency: "USD" | "CAD" = "USD") =>
    repairRow({ id, status: "completed", totalCents: cents, currency });

  it("splits by tab after the bleacher filter and keeps the order of the rows", () => {
    const rows = [
      repairRow({ id: "o1", status: "in_repair", bleachers: [{ uuid: "b-1", number: 1 }] }),
      completed("c1", 100),
      repairRow({ id: "o2", status: "inbound", bleachers: [{ uuid: "b-1", number: 1 }] }),
      repairRow({ id: "o3", status: "triaged", bleachers: [{ uuid: "b-2", number: 2 }] }),
    ];
    const open = buildRepairsView(rows, { ...DEFAULT_STATE, bleacherUuid: "b-1" });
    expect(open.tabRows.map((r) => r.id)).toEqual(["o1", "o2"]);
    const done = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed" });
    expect(done.tabRows.map((r) => r.id)).toEqual(["c1"]);
  });

  it("adds the totals of the whole tab, per currency, and not of the page shown", () => {
    const rows = Array.from({ length: 30 }, (_, i) => completed(`c${i}`, 100));
    rows.push(completed("cad", 5000, "CAD"), completed("none", null));
    const view = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed" });
    expect(view.totals).toEqual({ USD: 3000, CAD: 5000 });
    expect(view.totalItems).toBe(32);
    expect(view.pageRows).toHaveLength(25);
  });

  it("slices the page asked for", () => {
    const rows = Array.from({ length: 30 }, (_, i) => completed(`c${i}`, 100));
    const view = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed", page: 2 });
    expect(view.currentPage).toBe(2);
    expect(view.pageRows.map((r) => r.id)).toEqual(["c25", "c26", "c27", "c28", "c29"]);
  });

  it("shows the last page for a page past the end (D50)", () => {
    const rows = Array.from({ length: 30 }, (_, i) => completed(`c${i}`, 100));
    const view = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed", page: 99 });
    expect(view.currentPage).toBe(2);
    expect(view.pageRows).toHaveLength(5);
  });

  it("uses the page size", () => {
    const rows = Array.from({ length: 60 }, (_, i) => completed(`c${i}`, 100));
    const view = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed", pageSize: 50 });
    expect(view.pageRows).toHaveLength(50);
  });

  it("gives page 1 and totals of 0 for an empty list", () => {
    const view = buildRepairsView([], { ...DEFAULT_STATE, page: 5 });
    expect(view).toEqual({
      tabRows: [],
      pageRows: [],
      totals: { USD: 0, CAD: 0 },
      totalItems: 0,
      currentPage: 1,
    });
  });
});
