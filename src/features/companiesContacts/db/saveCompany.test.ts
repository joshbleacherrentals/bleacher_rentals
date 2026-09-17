import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
}));

vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));

import { saveCompany, type SaveCompanyInput } from "./saveCompany";

beforeEach(() => {
  executed.length = 0;
});

const address = { street: "1 Main St", city: "Tampa", stateProvince: "FL", zipPostal: "33601" };
const empty = { street: "", city: "", stateProvince: "", zipPostal: "" };

const input: SaveCompanyInput = {
  companyName: "Acme",
  email: "",
  phone: "",
  notes: "",
  billingAddress: address,
  shippingAddress: address,
};

const inserts = (table: string) =>
  executed.filter((q) => q.sql.startsWith(`insert into "${table}"`));
const updates = (table: string) => executed.filter((q) => q.sql.startsWith(`update "${table}"`));
/** The value bound to `column` in an insert's column list or an update's SET list. */
function param(q: CompiledQuery, column: string): unknown {
  const list = q.sql.startsWith("insert")
    ? q.sql.slice(q.sql.indexOf("(") + 1, q.sql.indexOf(")"))
    : q.sql.slice(q.sql.indexOf(" set ") + 5, q.sql.indexOf(" where "));
  const names = list.split(",").map((s) => s.trim().split(" ")[0].replace(/"/g, ""));
  return q.parameters[names.indexOf(column)];
}

describe("saveCompany: create", () => {
  it("writes billing and shipping as two separate rows, even when equal", async () => {
    const id = await saveCompany(input, null);

    const addrs = inserts("Addresses");
    expect(addrs).toHaveLength(2);
    const [billingId, shippingId] = addrs.map((q) => param(q, "id"));
    expect(billingId).not.toBe(shippingId);
    expect(addrs.map((q) => param(q, "street"))).toEqual(["1 Main St", "1 Main St"]);

    const [company] = inserts("Companies");
    expect(param(company, "id")).toBe(id);
    expect(param(company, "billing_address_uuid")).toBe(billingId);
    expect(param(company, "shipping_address_uuid")).toBe(shippingId);
  });

  it("stores null uuids for empty addresses", async () => {
    await saveCompany({ ...input, billingAddress: empty, shippingAddress: empty }, null);

    expect(inserts("Addresses")).toHaveLength(0);
    const [company] = inserts("Companies");
    expect(param(company, "billing_address_uuid")).toBeNull();
    expect(param(company, "shipping_address_uuid")).toBeNull();
  });
});

describe("saveCompany: update", () => {
  it("updates separate billing and shipping rows in place", async () => {
    const id = await saveCompany(
      { ...input, shippingAddress: { ...address, city: "Orlando" } },
      { id: "c1", addressIds: { billing: "b1", shipping: "s1" } },
    );

    expect(id).toBe("c1");
    expect(inserts("Addresses")).toHaveLength(0);
    const addrUpdates = updates("Addresses");
    expect(addrUpdates).toHaveLength(2);
    expect(addrUpdates.map((q) => q.parameters.at(-1))).toEqual(["b1", "s1"]);
    expect(param(addrUpdates[1], "city")).toBe("Orlando");

    const [company] = updates("Companies");
    expect(param(company, "company_name")).toBe("Acme");
    expect(param(company, "billing_address_uuid")).toBe("b1");
    expect(param(company, "shipping_address_uuid")).toBe("s1");
    expect(company.parameters.at(-1)).toBe("c1");
  });

  it("splits a legacy shared row: billing in place, shipping as a new row", async () => {
    await saveCompany(input, { id: "c1", addressIds: { billing: "shared", shipping: "shared" } });

    const addrUpdates = updates("Addresses");
    expect(addrUpdates).toHaveLength(1);
    expect(addrUpdates[0].parameters.at(-1)).toBe("shared");

    const [newShipping] = inserts("Addresses");
    const newId = param(newShipping, "id");
    expect(newId).not.toBe("shared");

    const [company] = updates("Companies");
    expect(param(company, "billing_address_uuid")).toBe("shared");
    expect(param(company, "shipping_address_uuid")).toBe(newId);
  });

  it("inserts rows for a company that had no addresses yet", async () => {
    await saveCompany(input, { id: "c1", addressIds: { billing: null, shipping: null } });

    expect(inserts("Addresses")).toHaveLength(2);
    expect(updates("Addresses")).toHaveLength(0);
  });

  it("leaves an existing address untouched when the form sends it empty", async () => {
    await saveCompany(
      { ...input, billingAddress: empty, shippingAddress: empty },
      { id: "c1", addressIds: { billing: "b1", shipping: "s1" } },
    );

    expect(inserts("Addresses")).toHaveLength(0);
    expect(updates("Addresses")).toHaveLength(0);
    const [company] = updates("Companies");
    expect(param(company, "billing_address_uuid")).toBeNull();
    expect(param(company, "shipping_address_uuid")).toBeNull();
  });
});
