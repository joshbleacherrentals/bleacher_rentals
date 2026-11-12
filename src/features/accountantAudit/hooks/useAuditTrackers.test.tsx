import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PageSize } from "@/features/quotesAndBookings/utils/pagination";

// docs/specs/accountant-audit-03-tracker-data.md §3 and §5. useTypedQuery is mocked: the SQL is
// covered by db/auditTrackers.test.ts, this file covers what the hook does with the two results.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

type QueryResult = {
  data: unknown[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
};

const state = vi.hoisted(() => ({
  calls: [] as { sql: string; parameters: readonly unknown[] }[],
  count: undefined as unknown,
  page: undefined as unknown,
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string; parameters: readonly unknown[] }) => {
    state.calls.push(compiled);
    return compiled.sql.includes("count(") ? state.count : state.page;
  },
}));

import { useAuditTrackers } from "./useAuditTrackers";

const result = (over: Partial<QueryResult> = {}): QueryResult => ({
  data: [],
  isLoading: false,
  error: undefined,
  ...over,
});

const rawRow = {
  id: "t1",
  status: "completed",
  date: "2026-09-22",
  bleacher_number: 12,
  type_code: "trip",
  type_name: "Trip",
  pickup_id: "a1",
  pickup_street: "1 Main St",
  pickup_city: "Calgary",
  pickup_state_province: "AB",
  pickup_zip_postal: "T2P 1A1",
  dropoff_id: null,
  dropoff_street: null,
  dropoff_city: null,
  dropoff_state_province: null,
  dropoff_zip_postal: null,
  drive_minutes: 144,
  distance_meters: 34400,
  group_id: "g1",
  group_is_paid: 1,
};

let out: ReturnType<typeof useAuditTrackers>;

type Range = { from: string | null; to: string | null };
const ALL_TIME: Range = { from: null, to: null };

function Probe({
  driver,
  range,
  page,
  pageSize,
}: {
  driver: string | null;
  range: Range;
  page: number;
  pageSize: PageSize;
}) {
  out = useAuditTrackers(driver, range, page, pageSize);
  return null;
}

function render(
  driver: string | null,
  page: number,
  pageSize: PageSize = 25,
  range: Range = ALL_TIME,
) {
  renderToString(<Probe driver={driver} range={range} page={page} pageSize={pageSize} />);
}

const pageCall = () => state.calls.find((c) => !c.sql.includes("count("))!;
const countCall = () => state.calls.find((c) => c.sql.includes("count("))!;

beforeEach(() => {
  state.calls = [];
  state.count = result({ data: [{ total: 0 }] });
  state.page = result();
});

describe("useAuditTrackers: no driver chosen", () => {
  it("is inert: sentinel queries, no rows, total 0, not loading", () => {
    // Stale or still-loading results of the inert queries must not leak out.
    state.count = result({ data: [{ total: 7 }], isLoading: true });
    state.page = result({ data: [rawRow], isLoading: true });

    render(null, 3);

    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.isLoading).toBe(false);
    expect(state.calls).toHaveLength(2);
    expect(countCall().parameters).toEqual(["__none__"]);
    expect(pageCall().parameters[0]).toBe("__none__");
  });
});

describe("useAuditTrackers: a driver and a page", () => {
  it("returns the rows of the page and the total", () => {
    state.count = result({ data: [{ total: 1 }] });
    state.page = result({ data: [rawRow] });

    render("d1", 1);

    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.rows).toEqual([
      {
        id: "t1",
        status: "completed",
        date: "2026-09-22",
        bleacherNumber: 12,
        typeCode: "trip",
        typeName: "Trip",
        pickup: { street: "1 Main St", city: "Calgary", stateProvince: "AB", zipPostal: "T2P 1A1" },
        dropoff: null,
        driveMinutes: 144,
        distanceMeters: 34400,
        payment: "paid",
      },
    ]);
    expect(countCall().parameters).toEqual(["d1"]);
    expect(pageCall().parameters).toEqual(["d1", 25, 0]);
  });

  it("asks for the offset of the page it is given", () => {
    state.count = result({ data: [{ total: 120 }] });

    render("d1", 3, 50);

    expect(out.page).toBe(3);
    expect(pageCall().parameters).toEqual(["d1", 50, 100]);
  });

  it("a driver with no trackers gives no rows, total 0 and page 1", () => {
    state.count = result({ data: [{ total: 0 }] });
    state.page = result({ data: [] });

    render("d1", 4);

    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.page).toBe(1);
  });
});

describe("useAuditTrackers: the date range (spec 05, D8)", () => {
  it("passes the range to both queries, after the driver", () => {
    state.count = result({ data: [{ total: 120 }] });
    render("d1", 2, 50, { from: "2026-11-01", to: "2026-11-30" });

    expect(countCall().parameters).toEqual(["d1", "2026-11-01", "2026-11-30"]);
    expect(pageCall().parameters).toEqual(["d1", "2026-11-01", "2026-11-30", 50, 50]);
  });

  it("leaves a missing end out of the SQL parameters (no limit)", () => {
    render("d1", 1, 25, { from: "2026-11-01", to: null });

    expect(countCall().parameters).toEqual(["d1", "2026-11-01"]);
    expect(pageCall().parameters).toEqual(["d1", "2026-11-01", 25, 0]);
  });

  it("is still inert with no driver, whatever the range", () => {
    render(null, 1, 25, { from: "2026-11-01", to: "2026-11-30" });

    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.isLoading).toBe(false);
  });
});

describe("useAuditTrackers: the page is clamped (R4)", () => {
  it("asks for the last page's offset when the page is past the end", () => {
    state.count = result({ data: [{ total: 55 }] });

    render("d1", 9, 25);

    expect(out.page).toBe(3);
    expect(pageCall().parameters).toEqual(["d1", 25, 50]);
  });

  it("raises a page below 1 to page 1", () => {
    state.count = result({ data: [{ total: 55 }] });

    render("d1", 0, 25);

    expect(out.page).toBe(1);
    expect(pageCall().parameters).toEqual(["d1", 25, 0]);
  });

  it("while the total is loading only raises the page to 1", () => {
    state.count = result({ data: undefined, isLoading: true });

    render("d1", 4, 25);

    expect(out.page).toBe(4);
    expect(out.total).toBe(0);
    expect(pageCall().parameters).toEqual(["d1", 25, 75]);
  });
});

describe("useAuditTrackers: loading and errors", () => {
  it("is loading while the count query is", () => {
    state.count = result({ data: undefined, isLoading: true });
    render("d1", 1);
    expect(out.isLoading).toBe(true);
  });

  it("is loading while the page query is", () => {
    state.page = result({ data: undefined, isLoading: true });
    render("d1", 1);
    expect(out.isLoading).toBe(true);
  });

  it("is not loading when both have answered", () => {
    render("d1", 1);
    expect(out.isLoading).toBe(false);
  });

  it("returns the error of the count query", () => {
    const boom = new Error("count failed");
    state.count = result({ data: undefined, error: boom });
    render("d1", 1);
    expect(out.error).toBe(boom);
  });

  it("returns the error of the page query", () => {
    const boom = new Error("page failed");
    state.page = result({ data: undefined, error: boom });
    render("d1", 1);
    expect(out.error).toBe(boom);
  });

  it("has no error when neither failed", () => {
    render("d1", 1);
    expect(out.error).toBeUndefined();
  });
});
