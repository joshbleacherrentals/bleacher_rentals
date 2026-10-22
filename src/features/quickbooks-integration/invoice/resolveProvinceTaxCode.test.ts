import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the invoice route reads the mapping with the
// service role, as it does every table it needs.

const { createClient, state } = vi.hoisted(() => {
  const state = {
    rows: [] as Array<{ qbo_connection_uuid: string; province: string; qbo_tax_code_id: string }>,
    error: null as { message: string } | null,
    filters: [] as Array<[string, unknown]>,
    table: "",
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
      state.table = table;
      const filters: Array<[string, unknown]> = [];
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          state.filters.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({
          data: state.error
            ? null
            : (state.rows.find((r) => filters.every(([c, v]) => (r as any)[c] === v)) ?? null),
          error: state.error,
        }),
      };
      return chain;
    },
  }));
  return { createClient, state };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { resolveProvinceTaxCode } from "./resolveProvinceTaxCode";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  createClient.mockClear();
  state.rows = [
    { qbo_connection_uuid: "conn-1", province: "ON", qbo_tax_code_id: "5" },
    { qbo_connection_uuid: "conn-1", province: "QC", qbo_tax_code_id: "7" },
    { qbo_connection_uuid: "conn-2", province: "ON", qbo_tax_code_id: "88" },
  ];
  state.error = null;
  state.filters = [];
  state.table = "";
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
