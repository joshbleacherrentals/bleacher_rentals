import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/accountant-audit-05-drivers-table.md R14, §10 (the fix of the redirect from the driver
// page). useTypedQuery is mocked: the SQL is covered by db/auditDriverInfo.test.ts, this file covers
// when the hook says "loading" and when it says "this driver has no row".
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
  isFetching: boolean;
  error?: Error;
};
const state = vi.hoisted(() => ({ result: undefined as unknown }));
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => state.result,
}));

import { useAuditDriverInfo } from "./useAuditDriverInfo";

const result = (over: Partial<QueryResult> = {}): QueryResult => ({
  data: [],
  isLoading: false,
  isFetching: false,
  ...over,
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  first_name: "Ann",
  last_name: "Lee",
  is_active: 1,
  status_uuid: null,
  phone_number: "999",
  phone: null,
  email: "a@x.com",
  street: "1 Main St",
  city: "Springfield",
  state_province: "IL",
  zip_postal: "62701",
  ...over,
});

let out: ReturnType<typeof useAuditDriverInfo>;
function Probe({ driver }: { driver: string | null }) {
  out = useAuditDriverInfo(driver);
  return null;
}
const render = (driver: string | null) => renderToString(<Probe driver={driver} />);

beforeEach(() => {
  state.result = result();
});

describe("useAuditDriverInfo: a driver with a row", () => {
  it("returns their details and is not loading", () => {
    state.result = result({ data: [row("d1")] });
    render("d1");
    expect(out.isLoading).toBe(false);
    expect(out.info).toMatchObject({ firstName: "Ann", lastName: "Lee", email: "a@x.com" });
  });

  it("stays settled while a re-run after a commit is fetching, and keeps the details", () => {
    state.result = result({ data: [row("d1")], isFetching: true });
    render("d1");
    expect(out.isLoading).toBe(false);
    expect(out.info?.firstName).toBe("Ann");
  });
});

describe("useAuditDriverInfo: the driver in the URL has just changed", () => {
  it("is loading, not 'no row', while the query for the new driver is still being fetched", () => {
    // The regression: a click on a row puts driver=<id> in the URL, the query changes, and for a
    // moment the hook still returns the old result (empty, from the query for "no driver") with
    // isLoading false and isFetching true. That must not read as "this driver does not exist".
    state.result = result({ data: [], isLoading: false, isFetching: true });
    render("d1");
    expect(out.isLoading).toBe(true);
    expect(out.info).toBeNull();
  });

  it("does not show the details of the previous driver for the new one", () => {
    state.result = result({ data: [row("d-old", { first_name: "Old" })], isFetching: true });
    render("d-new");
    expect(out.isLoading).toBe(true);
    expect(out.info).toBeNull();
  });

  it("does not take a stale row of another driver for a settled answer", () => {
    state.result = result({ data: [row("d-old")], isFetching: false });
    render("d-new");
    expect(out.info).toBeNull();
    expect(out.isLoading).toBe(false); // the query settled: d-new has no row
  });
});

describe("useAuditDriverInfo: first load and a driver that does not exist", () => {
  it("is loading on the first load", () => {
    state.result = result({ data: undefined, isLoading: true });
    render("d1");
    expect(out.isLoading).toBe(true);
    expect(out.info).toBeNull();
  });

  it("is settled with no info when the query has answered with no row (an unknown driver)", () => {
    state.result = result({ data: [] });
    render("ghost");
    expect(out.isLoading).toBe(false);
    expect(out.info).toBeNull();
  });
});

describe("useAuditDriverInfo: no driver", () => {
  it("has no info and is not loading, whatever the inert query says", () => {
    state.result = result({ data: [], isLoading: true, isFetching: true });
    render(null);
    expect(out.info).toBeNull();
    expect(out.isLoading).toBe(false);
  });
});
