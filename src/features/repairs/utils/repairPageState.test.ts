import { describe, expect, it } from "vitest";
import {
  CLEAR_FILTERS_PATCH,
  buildRepairsView,
  hasActiveFilters,
  narrowRepairsUrlState,
  readRepairsUrlState,
  writeRepairsUrlState,
  type RepairsUrlState,
} from "./repairPageState";
import { repairRow } from "./repairRowFixture";

// docs/specs/repairs-04-table.md §2.6, §2.8 and §3, changed by docs/specs/repairs-05-toolbar.md
// §2.7, §3 and §7.

const DEFAULT_STATE: RepairsUrlState = {
  tab: "open",
  page: 1,
  pageSize: 25,
  search: "",
  bleacherUuids: [],
  zoneUuids: [],
  vendorUuids: [],
  categoryUuids: [],
  sort: null,
  showDeleted: false,
};

const read = (query: string) => readRepairsUrlState(new URLSearchParams(query));
const write = (state: RepairsUrlState, existing = "") =>
  writeRepairsUrlState(state, new URLSearchParams(existing));

describe("readRepairsUrlState", () => {
  it("reads defaults from an empty URL", () => {
    expect(read("")).toEqual(DEFAULT_STATE);
  });

  it("reads the parameters of spec 04", () => {
    expect(read("tab=completed&page=3&pageSize=50")).toMatchObject({
      tab: "completed",
      page: 3,
      pageSize: 50,
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

  it("reads the search text as it is, and a missing one as empty", () => {
    expect(read("q=Caprock%20Tire%20").search).toBe("Caprock Tire ");
    expect(read("").search).toBe("");
  });

  it("reads each of the four lists as uuids split on commas", () => {
    expect(read("bleachers=b1,b2&zones=z1&vendors=v1,v2,v3&categories=c1")).toMatchObject({
      bleacherUuids: ["b1", "b2"],
      zoneUuids: ["z1"],
      vendorUuids: ["v1", "v2", "v3"],
      categoryUuids: ["c1"],
    });
  });

  it("drops empty items and repeats of a list and keeps the order", () => {
    expect(read("vendors=,v2,,v1,v2,").vendorUuids).toEqual(["v2", "v1"]);
    expect(read("zones=").zoneUuids).toEqual([]);
  });

  it("reads the old bleacher_uuid as one ticked bleacher (D63)", () => {
    expect(read("bleacher_uuid=b-1").bleacherUuids).toEqual(["b-1"]);
    expect(read("bleacher_uuid=").bleacherUuids).toEqual([]);
  });

  it("lets bleachers win over the old bleacher_uuid when it has a value (D63)", () => {
    expect(read("bleachers=b2&bleacher_uuid=b1").bleacherUuids).toEqual(["b2"]);
    expect(read("bleachers=&bleacher_uuid=b1").bleacherUuids).toEqual(["b1"]);
  });

  it("reads showDeleted=1 as on and anything else as off (D65)", () => {
    expect(read("showDeleted=1").showDeleted).toBe(true);
    expect(read("showDeleted=0").showDeleted).toBe(false);
    expect(read("showDeleted=true").showDeleted).toBe(false);
    expect(read("").showDeleted).toBe(false);
  });

  it("reads sort as key:direction and a bad one as no sort", () => {
    expect(read("sort=total:desc").sort).toEqual({ key: "total", direction: "desc" });
    expect(read("sort=vendor:asc").sort).toEqual({ key: "vendor", direction: "asc" });
    expect(read("sort=nope:asc").sort).toBeNull();
    expect(read("sort=total:up").sort).toBeNull();
    expect(read("sort=").sort).toBeNull();
  });
});

describe("writeRepairsUrlState", () => {
  it("writes nothing for the default state and removes stale values", () => {
    const stale =
      "tab=completed&page=3&pageSize=50&bleacher_uuid=b-1&q=x&bleachers=b&zones=z&vendors=v&categories=c&sort=total:asc&showDeleted=1";
    expect(write(DEFAULT_STATE, stale).toString()).toBe("");
  });

  it("writes each value that is not the default", () => {
    const out = write({
      tab: "completed",
      page: 4,
      pageSize: 100,
      search: "caprock",
      bleacherUuids: ["b1", "b2"],
      zoneUuids: ["z1"],
      vendorUuids: ["v1"],
      categoryUuids: ["c1", "c2"],
      sort: { key: "total", direction: "desc" },
      showDeleted: true,
    });
    expect(out.get("tab")).toBe("completed");
    expect(out.get("page")).toBe("4");
    expect(out.get("pageSize")).toBe("100");
    expect(out.get("q")).toBe("caprock");
    expect(out.get("bleachers")).toBe("b1,b2");
    expect(out.get("zones")).toBe("z1");
    expect(out.get("vendors")).toBe("v1");
    expect(out.get("categories")).toBe("c1,c2");
    expect(out.get("sort")).toBe("total:desc");
    expect(out.get("showDeleted")).toBe("1");
  });

  it("does not write the Open tab, page 1, the size 25, an empty list, no sort or Show Deleted off", () => {
    expect(write({ ...DEFAULT_STATE, vendorUuids: ["v9"] }).toString()).toBe("vendors=v9");
  });

  it("writes the search as typed, and nothing for a text of only spaces", () => {
    expect(write({ ...DEFAULT_STATE, search: "caprock " }).get("q")).toBe("caprock ");
    expect(write({ ...DEFAULT_STATE, search: "   " }, "q=old").has("q")).toBe(false);
  });

  it("keeps parameters it does not own", () => {
    const out = write({ ...DEFAULT_STATE, tab: "completed" }, "foo=bar&page=7");
    expect(out.get("foo")).toBe("bar");
    expect(out.get("tab")).toBe("completed");
    expect(out.has("page")).toBe(false);
  });

  it("always removes the old bleacher_uuid (D63)", () => {
    const out = write({ ...DEFAULT_STATE, bleacherUuids: ["b1"] }, "bleacher_uuid=old");
    expect(out.has("bleacher_uuid")).toBe(false);
    expect(out.get("bleachers")).toBe("b1");
  });

  it("round-trips a state through the URL", () => {
    const state: RepairsUrlState = {
      tab: "completed",
      page: 2,
      pageSize: 50,
      search: "tire",
      bleacherUuids: ["b1", "b2"],
      zoneUuids: ["z1"],
      vendorUuids: ["v1"],
      categoryUuids: ["c1"],
      sort: { key: "vendor", direction: "asc" },
      showDeleted: true,
    };
    expect(read(write(state).toString())).toEqual(state);
  });
});

describe("narrowRepairsUrlState", () => {
  const state: RepairsUrlState = {
    ...DEFAULT_STATE,
    page: 4,
    pageSize: 50,
    search: "x",
    bleacherUuids: ["b-1"],
    sort: { key: "total", direction: "asc" },
  };

  it("goes to page 1 when the tab changes and keeps the rest", () => {
    expect(narrowRepairsUrlState(state, { tab: "completed" })).toEqual({
      ...state,
      tab: "completed",
      page: 1,
    });
  });

  it("goes to page 1 for a new search, each list, a sort, Show Deleted and a page size", () => {
    expect(narrowRepairsUrlState(state, { search: "y" })).toMatchObject({ page: 1, search: "y" });
    expect(narrowRepairsUrlState(state, { bleacherUuids: ["b-2"] })).toMatchObject({
      page: 1,
      bleacherUuids: ["b-2"],
    });
    expect(narrowRepairsUrlState(state, { zoneUuids: ["z"] })).toMatchObject({
      page: 1,
      zoneUuids: ["z"],
    });
    expect(narrowRepairsUrlState(state, { vendorUuids: ["v"] })).toMatchObject({
      page: 1,
      vendorUuids: ["v"],
    });
    expect(narrowRepairsUrlState(state, { categoryUuids: ["c"] })).toMatchObject({
      page: 1,
      categoryUuids: ["c"],
    });
    expect(
      narrowRepairsUrlState(state, { sort: { key: "vendor", direction: "asc" } }),
    ).toMatchObject({ page: 1, sort: { key: "vendor", direction: "asc" } });
    expect(narrowRepairsUrlState(state, { showDeleted: true })).toMatchObject({
      page: 1,
      showDeleted: true,
    });
    expect(narrowRepairsUrlState(state, { pageSize: 100 })).toMatchObject({
      page: 1,
      pageSize: 100,
    });
  });

  it("clears a list, the search and the sort when the patch says so", () => {
    expect(narrowRepairsUrlState(state, { bleacherUuids: [] }).bleacherUuids).toEqual([]);
    expect(narrowRepairsUrlState(state, { search: "" }).search).toBe("");
    expect(narrowRepairsUrlState(state, { sort: null }).sort).toBeNull();
  });

  it("keeps everything it was not told about", () => {
    const out = narrowRepairsUrlState(state, { zoneUuids: ["z"] });
    expect(out).toMatchObject({
      tab: "open",
      pageSize: 50,
      search: "x",
      bleacherUuids: ["b-1"],
      sort: { key: "total", direction: "asc" },
    });
  });

  it("goes to page 1 for an empty patch and changes nothing else", () => {
    expect(narrowRepairsUrlState(state, {})).toEqual({ ...state, page: 1 });
  });
});

describe("hasActiveFilters (D237)", () => {
  it("is false with no filter ticked", () => {
    expect(hasActiveFilters(DEFAULT_STATE)).toBe(false);
  });

  it("is true when any one of the four filters has a ticked value", () => {
    expect(hasActiveFilters({ ...DEFAULT_STATE, bleacherUuids: ["b-1"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_STATE, zoneUuids: ["z-1"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_STATE, vendorUuids: ["v-1"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_STATE, categoryUuids: ["c-1"] })).toBe(true);
  });

  it("is false for the search, the tab, the sort and Show Deleted: they are not filters", () => {
    const state: RepairsUrlState = {
      ...DEFAULT_STATE,
      search: "tire",
      tab: "completed",
      sort: { key: "total", direction: "asc" },
      showDeleted: true,
    };
    expect(hasActiveFilters(state)).toBe(false);
  });
});

describe("CLEAR_FILTERS_PATCH (D237)", () => {
  const state: RepairsUrlState = {
    tab: "completed",
    page: 3,
    pageSize: 50,
    search: "tire",
    bleacherUuids: ["b-1", "b-2"],
    zoneUuids: ["z-1"],
    vendorUuids: ["v-1"],
    categoryUuids: ["c-1"],
    sort: { key: "total", direction: "asc" },
    showDeleted: true,
  };

  it("empties the four filters, goes to page 1 and keeps everything else", () => {
    expect(narrowRepairsUrlState(state, CLEAR_FILTERS_PATCH)).toEqual({
      ...state,
      bleacherUuids: [],
      zoneUuids: [],
      vendorUuids: [],
      categoryUuids: [],
      page: 1,
    });
  });

  it("leaves hasActiveFilters false", () => {
    expect(hasActiveFilters(narrowRepairsUrlState(state, CLEAR_FILTERS_PATCH))).toBe(false);
  });

  it("takes the four parameters out of the address and keeps the search, the tab, the sort", () => {
    const cleared = narrowRepairsUrlState(state, CLEAR_FILTERS_PATCH);
    const params = write(
      cleared,
      "tab=completed&page=3&q=tire&bleachers=b-1,b-2&zones=z-1&vendors=v-1&categories=c-1&sort=total&showDeleted=1",
    );
    for (const key of ["bleachers", "zones", "vendors", "categories", "page"]) {
      expect(params.has(key), key).toBe(false);
    }
    expect(params.get("tab")).toBe("completed");
    expect(params.get("q")).toBe("tire");
    expect(params.get("showDeleted")).toBe("1");
    expect(params.has("sort")).toBe(true);
  });

  it("also drops the old one-bleacher parameter, which would read back as a ticked bleacher", () => {
    const fromOldLink = read("bleacher_uuid=b-9");
    expect(hasActiveFilters(fromOldLink)).toBe(true);
    const params = write(
      narrowRepairsUrlState(fromOldLink, CLEAR_FILTERS_PATCH),
      "bleacher_uuid=b-9",
    );
    expect(params.has("bleacher_uuid")).toBe(false);
    expect(hasActiveFilters(read(params.toString()))).toBe(false);
  });
});

describe("buildRepairsView", () => {
  const completed = (id: string, cents: number | null, currency: "USD" | "CAD" = "USD") =>
    repairRow({ id, status: "completed", totalCents: cents, currency });

  it("splits by tab after the filter and keeps the order of the rows", () => {
    const rows = [
      repairRow({ id: "o1", status: "in_repair", bleachers: [{ uuid: "b-1", number: 1 }] }),
      completed("c1", 100),
      repairRow({ id: "o2", status: "inbound", bleachers: [{ uuid: "b-1", number: 1 }] }),
      repairRow({ id: "o3", status: "triaged", bleachers: [{ uuid: "b-2", number: 2 }] }),
    ];
    const open = buildRepairsView(rows, { ...DEFAULT_STATE, bleacherUuids: ["b-1"] });
    expect(open.tabRows.map((r) => r.id)).toEqual(["o1", "o2"]);
    const done = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed" });
    expect(done.tabRows.map((r) => r.id)).toEqual(["c1"]);
  });

  it("filters by search, vendor, zone and category before the split", () => {
    const rows = [
      repairRow({ id: "a", status: "inbound", vendorUuid: "v1", vendorName: "Caprock" }),
      repairRow({ id: "b", status: "inbound", vendorUuid: "v2", vendorName: "Dallas" }),
      repairRow({
        id: "c",
        status: "completed",
        vendorUuid: "v1",
        vendorName: "Caprock",
        zones: [{ uuid: "z1", name: "Zone 1" }],
        categories: [{ uuid: "c1", name: "Tires" }],
      }),
    ];
    expect(
      buildRepairsView(rows, { ...DEFAULT_STATE, vendorUuids: ["v1"] }).tabRows.map((r) => r.id),
    ).toEqual(["a"]);
    expect(
      buildRepairsView(rows, { ...DEFAULT_STATE, search: "dallas" }).tabRows.map((r) => r.id),
    ).toEqual(["b"]);
    expect(
      buildRepairsView(rows, {
        ...DEFAULT_STATE,
        tab: "completed",
        zoneUuids: ["z1"],
        categoryUuids: ["c1"],
      }).tabRows.map((r) => r.id),
    ).toEqual(["c"]);
  });

  it("sorts the filtered rows, and keeps the order of the hook when there is no sort", () => {
    const rows = [
      repairRow({ id: "a", status: "inbound", totalCents: 100 }),
      repairRow({ id: "b", status: "inbound", totalCents: 300 }),
      repairRow({ id: "c", status: "inbound", totalCents: 200 }),
    ];
    expect(buildRepairsView(rows, DEFAULT_STATE).tabRows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(
      buildRepairsView(rows, {
        ...DEFAULT_STATE,
        sort: { key: "total", direction: "desc" },
      }).tabRows.map((r) => r.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("adds the totals of the filtered tab, per currency, and not of the page shown", () => {
    const rows = Array.from({ length: 30 }, (_, i) => completed(`c${i}`, 100));
    rows.push(completed("cad", 5000, "CAD"), completed("none", null));
    const view = buildRepairsView(rows, { ...DEFAULT_STATE, tab: "completed" });
    expect(view.totals).toEqual({ USD: 3000, CAD: 5000 });
    expect(view.totalItems).toBe(32);
    expect(view.pageRows).toHaveLength(25);
  });

  it("adds only the rows that pass the search and the filters", () => {
    const rows = [
      repairRow({ id: "a", status: "completed", totalCents: 100, vendorUuid: "v1" }),
      repairRow({ id: "b", status: "completed", totalCents: 900, vendorUuid: "v2" }),
    ];
    const view = buildRepairsView(rows, {
      ...DEFAULT_STATE,
      tab: "completed",
      vendorUuids: ["v1"],
    });
    expect(view.totals).toEqual({ USD: 100, CAD: 0 });
    expect(view.totalItems).toBe(1);
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

  it("gives page 1 and totals of 0 for a search that matches nothing", () => {
    const rows = [completed("a", 100)];
    const view = buildRepairsView(rows, {
      ...DEFAULT_STATE,
      tab: "completed",
      search: "zzz",
      page: 3,
    });
    expect(view).toEqual({
      tabRows: [],
      pageRows: [],
      totals: { USD: 0, CAD: 0 },
      totalItems: 0,
      currentPage: 1,
    });
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
