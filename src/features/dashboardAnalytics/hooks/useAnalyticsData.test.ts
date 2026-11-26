import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.1 and §5. This project has no DOM test
// environment, so the hook is rendered to a string with `useTypedQuery` replaced by a stub that
// answers by the table of the query. The compiled queries are the real ones.

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});
const boundDb = new Proxy({} as Kysely<any>, {
  get(_target, prop) {
    const value = (testDb as any)[prop];
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return boundDb;
  },
}));

type Answer = { data: any[] | undefined; isLoading: boolean };
const answers: Record<string, Answer> = {};
const asked: string[] = [];

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string }) => {
    const table = /from "(\w+)"/.exec(compiled.sql)![1];
    asked.push(table);
    return answers[table] ?? { data: undefined, isLoading: true };
  },
}));

const { useAnalyticsData } = await import("./useAnalyticsData");

const TABLES = [
  "MaintenanceEvents",
  "MaintenanceLineItems",
  "BleacherMaintEvents",
  "Bleachers",
  "Zones",
  "Vendors",
  "DamageCategories",
  "MaintenanceBudgets",
] as const;

function answered(table: (typeof TABLES)[number], data: any[]) {
  answers[table] = { data, isLoading: false };
}

function Probe() {
  const result = useAnalyticsData();
  return createElement("pre", null, JSON.stringify(result));
}

function read() {
  const html = renderToString(createElement(Probe));
  const text = html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"');
  return JSON.parse(text) as { inputs: any; isLoading: boolean };
}

beforeEach(() => {
  for (const key of Object.keys(answers)) delete answers[key];
  asked.length = 0;
});

describe("useAnalyticsData", () => {
  it("reads the eight tables", () => {
    read();
    expect([...new Set(asked)].sort()).toEqual([...TABLES].sort());
    expect(asked).toHaveLength(8);
  });

  it("is loading until all eight queries have answered", () => {
    expect(read().isLoading).toBe(true);
    for (const table of TABLES.slice(0, 7)) {
      answered(table, []);
      expect(read().isLoading).toBe(true);
    }
    answered(TABLES[7], []);
    expect(read().isLoading).toBe(false);
  });

  it("gives empty lists for tables that have not answered yet", () => {
    const { inputs } = read();
    expect(inputs).toEqual({
      repairs: [],
      services: [],
      repairBleachers: [],
      bleachers: [],
      zones: [],
      vendors: [],
      categories: [],
      budgets: [],
    });
  });

  it("turns every row into the shape of the inputs", () => {
    answered("MaintenanceEvents", [
      {
        id: "r1",
        eventStart: "2026-03-10",
        status: "in_repair",
        currency: "CAD",
        zoneUuid: "z1",
        vendorUuid: "v1",
        costCents: 1234,
      },
    ]);
    answered("MaintenanceLineItems", [
      {
        id: "s1",
        repairId: "r1",
        bleacherUuid: "b1",
        categoryUuid: "c1",
        laborCents: 100,
        partsCents: 200,
        taxCents: 30,
        freightCents: 40,
      },
    ]);
    answered("BleacherMaintEvents", [{ bleacherUuid: "b1", repairId: "r1" }]);
    answered("Bleachers", [{ id: "b1", zoneUuid: "z1", modelNumber: "TSP15-450" }]);
    answered("Zones", [{ id: "z1", name: "Zone 2" }]);
    answered("Vendors", [{ id: "v1", name: "Kaypark" }]);
    answered("DamageCategories", [{ id: "c1", name: "Welding", isActive: 1 }]);
    answered("MaintenanceBudgets", [{ year: 2026, currency: "USD", amountCents: 1000000 }]);

    const { inputs, isLoading } = read();
    expect(isLoading).toBe(false);
    expect(inputs).toEqual({
      repairs: [
        {
          id: "r1",
          eventStart: "2026-03-10",
          status: "in_repair",
          currency: "CAD",
          zoneId: "z1",
          vendorId: "v1",
          costCents: 1234,
        },
      ],
      services: [
        {
          id: "s1",
          repairId: "r1",
          bleacherId: "b1",
          categoryId: "c1",
          laborCents: 100,
          partsCents: 200,
          taxCents: 30,
          freightCents: 40,
        },
      ],
      repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
      bleachers: [{ id: "b1", zoneId: "z1", modelNumber: "TSP15-450" }],
      zones: [{ id: "z1", name: "Zone 2" }],
      vendors: [{ id: "v1", name: "Kaypark" }],
      categories: [{ id: "c1", name: "Welding", isActive: true }],
      budgets: [{ year: 2026, currency: "USD", amountCents: 1000000 }],
    });
  });

  it("turns nulls into the safe values: an amount is 0, a flag is false", () => {
    answered("MaintenanceEvents", [
      {
        id: "r1",
        eventStart: null,
        status: null,
        currency: null,
        zoneUuid: null,
        vendorUuid: null,
        costCents: null,
      },
    ]);
    answered("MaintenanceLineItems", [
      {
        id: "s1",
        repairId: "r1",
        bleacherUuid: null,
        categoryUuid: null,
        laborCents: null,
        partsCents: null,
        taxCents: null,
        freightCents: null,
      },
    ]);
    answered("BleacherMaintEvents", []);
    answered("Bleachers", [{ id: "b1", zoneUuid: null, modelNumber: null }]);
    answered("Zones", [{ id: "z1", name: null }]);
    answered("Vendors", [{ id: "v1", name: null }]);
    answered("DamageCategories", [{ id: "c1", name: null, isActive: null }]);
    answered("MaintenanceBudgets", [{ year: null, currency: null, amountCents: null }]);

    const { inputs } = read();
    expect(inputs.repairs[0]).toEqual({
      id: "r1",
      eventStart: "",
      status: "inbound",
      currency: "USD",
      zoneId: null,
      vendorId: null,
      costCents: 0,
    });
    expect(inputs.services[0]).toMatchObject({
      laborCents: 0,
      partsCents: 0,
      taxCents: 0,
      freightCents: 0,
      categoryId: null,
      bleacherId: "",
    });
    expect(inputs.categories[0]).toEqual({ id: "c1", name: "", isActive: false });
    expect(inputs.zones[0].name).toBe("");
    expect(inputs.vendors[0].name).toBe("");
  });

  it("drops a service with no repair, a junction row with a missing end and a budget with no year", () => {
    answered("MaintenanceEvents", []);
    answered("MaintenanceLineItems", [
      {
        id: "s1",
        repairId: null,
        bleacherUuid: "b1",
        categoryUuid: null,
        laborCents: 1,
        partsCents: 0,
        taxCents: 0,
        freightCents: 0,
      },
    ]);
    answered("BleacherMaintEvents", [
      { bleacherUuid: null, repairId: "r1" },
      { bleacherUuid: "b1", repairId: null },
    ]);
    answered("Bleachers", []);
    answered("Zones", []);
    answered("Vendors", []);
    answered("DamageCategories", []);
    answered("MaintenanceBudgets", [{ year: null, currency: "USD", amountCents: 5 }]);
    const { inputs } = read();
    expect(inputs.services).toEqual([]);
    expect(inputs.repairBleachers).toEqual([]);
    expect(inputs.budgets).toEqual([]);
  });
});
