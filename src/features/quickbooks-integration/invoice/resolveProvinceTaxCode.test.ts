import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the invoice route reads the mapping with the
// service role, as it does every table it needs.

const { createClient, state } = vi.hoisted(() => {
  const state = {
    rows: [] as Array<{ qbo_connection_uuid: string; province: string; qbo_tax_code_id: string }>,
    connections: [] as Array<{ id: string; qbo_no_tax_code_id: string | null }>,
    error: null as { message: string } | null,
    filters: [] as Array<[string, unknown]>,
    table: "",
    selects: [] as string[],
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
      state.table = table;
      const filters: Array<[string, unknown]> = [];
      const source: any[] = table === "QboConnections" ? state.connections : state.rows;
      const chain: any = {
        select: (columns: string) => {
          state.selects.push(columns);
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          state.filters.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({
          data: state.error
            ? null
            : (source.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null),
          error: state.error,
        }),
      };
      return chain;
    },
  }));
  return { createClient, state };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { resolveNoTaxCode, resolveProvinceTaxCode } from "./resolveProvinceTaxCode";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  createClient.mockClear();
  state.rows = [
    { qbo_connection_uuid: "conn-1", province: "ON", qbo_tax_code_id: "5" },
    { qbo_connection_uuid: "conn-1", province: "QC", qbo_tax_code_id: "7" },
    { qbo_connection_uuid: "conn-2", province: "ON", qbo_tax_code_id: "88" },
  ];
  state.connections = [
    { id: "conn-1", qbo_no_tax_code_id: "2" },
    { id: "conn-2", qbo_no_tax_code_id: null },
  ];
  state.error = null;
  state.filters = [];
  state.table = "";
  state.selects = [];
});

describe("resolveProvinceTaxCode", () => {
  it("returns the tax code id of a mapped province", async () => {
    expect(await resolveProvinceTaxCode("conn-1", "ON")).toBe("5");
    expect(await resolveProvinceTaxCode("conn-1", "QC")).toBe("7");
  });

  it("looks in the given connection only", async () => {
    expect(await resolveProvinceTaxCode("conn-2", "ON")).toBe("88");
    expect(await resolveProvinceTaxCode("conn-2", "QC")).toBeNull();
  });

  it("returns null for a province with no code", async () => {
    expect(await resolveProvinceTaxCode("conn-1", "AB")).toBeNull();
  });

  it("reads ProvinceQboTaxCodes filtered by connection and province", async () => {
    await resolveProvinceTaxCode("conn-1", "ON");

    expect(state.table).toBe("ProvinceQboTaxCodes");
    expect(state.filters).toEqual([
      ["qbo_connection_uuid", "conn-1"],
      ["province", "ON"],
    ]);
  });

  it("uses the service role", async () => {
    await resolveProvinceTaxCode("conn-1", "ON");

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("throws, rather than answering null, when the read fails", async () => {
    state.error = { message: "boom" };

    await expect(resolveProvinceTaxCode("conn-1", "ON")).rejects.toThrow(
      "Failed to read the province tax code: boom",
    );
  });
});

// docs/specs/qbo-invoice-03c-no-tax-code.md §4: the code a Canadian line carries when it has no tax.
describe("resolveNoTaxCode", () => {
  it("returns the connection's no-tax code id", async () => {
    expect(await resolveNoTaxCode("conn-1")).toBe("2");
  });

  it("returns null when the connection has none set", async () => {
    expect(await resolveNoTaxCode("conn-2")).toBeNull();
  });

  it("returns null for a connection that does not exist", async () => {
    expect(await resolveNoTaxCode("conn-3")).toBeNull();
  });

  it("reads QboConnections filtered by the connection", async () => {
    await resolveNoTaxCode("conn-1");

    expect(state.table).toBe("QboConnections");
    expect(state.selects).toEqual(["qbo_no_tax_code_id"]);
    expect(state.filters).toEqual([["id", "conn-1"]]);
  });

  it("uses the service role", async () => {
    await resolveNoTaxCode("conn-1");

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("throws, rather than answering null, when the read fails", async () => {
    state.error = { message: "boom" };

    await expect(resolveNoTaxCode("conn-1")).rejects.toThrow(
      "Failed to read the no-tax code: boom",
    );
  });
});
