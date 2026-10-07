import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// The week's driver list reads every group in one query and hands each row its own group, so the
// Mark Paid button needs no watcher of its own. This feeds that hook fake local rows and checks
// what the rows come out with.
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

const localRows = {
  groups: [] as any[],
};

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string }) => {
    if (compiled.sql.includes('from "Drivers"')) {
      return {
        isLoading: false,
        data: ["d1", "d2", "d3"].map((id) => ({
          driver_uuid: id,
          pay_currency: "USD",
          pay_per_unit: "KM",
          taxDec: 0,
          driver_street: null,
          driver_country: null,
          qbo_connection_uuid: null,
          user_id: `u-${id}`,
          first_name: id,
          last_name: "Driver",
        })),
      };
    }
    if (compiled.sql.includes('from "WorkTrackerGroups"')) {
      // The query must ask for the column, or a real local database has nothing to give back.
      expect(compiled.sql).toContain('"g"."is_paid" as "is_paid"');
      return { isLoading: false, data: localRows.groups };
    }
    return { isLoading: false, data: [] };
  },
}));

const { useDriversForWeek } = await import("./useDriversForWeek");

const admin = {
  isAdmin: true,
  isAccountManager: false,
  isAccountant: false,
  accountManagerUuid: null,
};

function driversFor(groups: any[]) {
  localRows.groups = groups;
  let drivers: ReturnType<typeof useDriversForWeek>["drivers"] = [];
  function Probe() {
    drivers = useDriversForWeek("2026-09-21", true, admin, true).drivers;
    return null;
  }
  renderToString(<Probe />);
  return drivers;
}

const group = (driver: string, isPaid: number | null) => ({
  id: `g-${driver}`,
  driver_uuid: driver,
  status: "draft",
  qbo_bill_id: null,
  week_start: "2026-09-21",
  week_end: "2026-09-27",
  is_paid: isPaid,
});

describe("useDriversForWeek — is_paid on each driver's group", () => {
  it("carries a paid group as paid and an unpaid one as unpaid", () => {
    const drivers = driversFor([group("d1", 1), group("d2", 0)]);
    const paid = (id: string) => drivers.find((d) => d.driver_uuid === id)?.workTrackerGroup;

    expect(paid("d1")).toMatchObject({ id: "g-d1", is_paid: true });
    expect(paid("d2")).toMatchObject({ id: "g-d2", is_paid: false });
  });

  it("reads a group synced before the column existed (null) as unpaid", () => {
    const drivers = driversFor([group("d1", null)]);

    expect(drivers.find((d) => d.driver_uuid === "d1")?.workTrackerGroup?.is_paid).toBe(false);
  });

  it("gives a driver with no group for the week none — so no button is offered", () => {
    const drivers = driversFor([group("d1", 1)]);

    expect(drivers.find((d) => d.driver_uuid === "d3")?.workTrackerGroup).toBeNull();
  });
});
