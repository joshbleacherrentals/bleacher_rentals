import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the two functions use the signed-in user's
// token, so the policies of ProvinceQboTaxCodes (admin only) decide who may call them.

const { ops, result, userClient, serviceClient } = vi.hoisted(() => {
  const ops: Array<{ table: string; op: string; args: unknown[] }> = [];
  const result = { current: { data: null as unknown, error: null as { message: string } | null } };
  const makeClient = () => ({
    from: (table: string) => {
      const builder: any = {
        then: (resolve: (value: unknown) => unknown) => resolve(result.current),
      };
      for (const op of ["select", "eq", "order", "upsert", "delete", "update"]) {
        builder[op] = (...args: unknown[]) => {
          ops.push({ table, op, args });
          return builder;
        };
      }
      return builder;
    },
  });
  return { ops, result, userClient: makeClient(), serviceClient: makeClient() };
});

vi.mock("@/utils/supabase/getClerkSupabaseServerClient", () => ({
  createServerSupabaseClient: vi.fn(() => userClient),
}));
vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: vi.fn(async () => serviceClient),
}));

import {
  getAllQboConnections,
  getProvinceTaxCodes,
  setProvinceTaxCode,
  updateQboConnectionNoTaxCode,
} from "./db";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { createServiceRoleClient } from "@/utils/supabase/server";

beforeEach(() => {
  ops.length = 0;
  result.current = { data: null, error: null };
  vi.mocked(createServerSupabaseClient).mockClear();
  vi.mocked(createServiceRoleClient).mockClear();
});

// docs/specs/qbo-invoice-03c-no-tax-code.md §4: the connection's "no tax" code is a column of
// QboConnections, read in the connections list and written with the signed-in user's token.
describe("getAllQboConnections", () => {
  it("also returns each connection's no-tax code", async () => {
    result.current = {
      data: [
        {
          id: "c1",
          display_name: "Canada",
          realm_id: "r1",
          qbo_tax_code_id: null,
          qbo_no_tax_code_id: "2",
          currency: "CAD",
        },
      ],
      error: null,
    };

    const rows = await getAllQboConnections();

    expect(rows[0].qbo_no_tax_code_id).toBe("2");
    const select = ops.find((o) => o.table === "QboConnections" && o.op === "select");
    expect(String(select?.args[0])).toContain("qbo_no_tax_code_id");
  });
});

describe("updateQboConnectionNoTaxCode", () => {
  it("sets the column of the connection, with the signed-in user's token", async () => {
    await updateQboConnectionNoTaxCode("conn-1", "2");

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(ops).toEqual([
      { table: "QboConnections", op: "update", args: [{ qbo_no_tax_code_id: "2" }] },
      { table: "QboConnections", op: "eq", args: ["id", "conn-1"] },
    ]);
  });

  it("clears the column on null", async () => {
    await updateQboConnectionNoTaxCode("conn-1", null);

    expect(ops[0]).toEqual({
      table: "QboConnections",
      op: "update",
      args: [{ qbo_no_tax_code_id: null }],
    });
  });

  it("throws when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    result.current = { data: null, error: { message: "denied" } };

    await expect(updateQboConnectionNoTaxCode("conn-1", "2")).rejects.toThrow(
      "Failed to update no-tax code: denied",
    );
  });
});

describe("getProvinceTaxCodes", () => {
  it("returns the connection's rows, read with the signed-in user's token", async () => {
    result.current = {
      data: [
        { province: "ON", qbo_tax_code_id: "5" },
        { province: "QC", qbo_tax_code_id: "7" },
      ],
      error: null,
    };

    const rows = await getProvinceTaxCodes("conn-1");

    expect(rows).toEqual([
      { province: "ON", qbo_tax_code_id: "5" },
      { province: "QC", qbo_tax_code_id: "7" },
    ]);
    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(ops).toContainEqual({
      table: "ProvinceQboTaxCodes",
      op: "eq",
      args: ["qbo_connection_uuid", "conn-1"],
    });
  });

  it("returns an empty list when the connection has no rows", async () => {
    result.current = { data: null, error: null };

    expect(await getProvinceTaxCodes("conn-1")).toEqual([]);
  });

  it("throws when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    result.current = { data: null, error: { message: "boom" } };

    await expect(getProvinceTaxCodes("conn-1")).rejects.toThrow(
      "Failed to fetch province tax codes: boom",
    );
  });
});

describe("setProvinceTaxCode", () => {
  it("upserts on the connection and province when there is a tax code id", async () => {
    await setProvinceTaxCode("conn-1", "ON", "5");

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(ops).toEqual([
      {
        table: "ProvinceQboTaxCodes",
        op: "upsert",
        args: [
          { qbo_connection_uuid: "conn-1", province: "ON", qbo_tax_code_id: "5" },
          { onConflict: "qbo_connection_uuid,province" },
        ],
      },
    ]);
  });

  it("deletes the row when the id is null", async () => {
    await setProvinceTaxCode("conn-1", "ON", null);

    expect(ops.map((o) => o.op)).toEqual(["delete", "eq", "eq"]);
    expect(ops.filter((o) => o.op === "eq").map((o) => o.args)).toEqual([
      ["qbo_connection_uuid", "conn-1"],
      ["province", "ON"],
    ]);
  });

  it("throws when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    result.current = { data: null, error: { message: "denied" } };

    await expect(setProvinceTaxCode("conn-1", "ON", "5")).rejects.toThrow(
      "Failed to set province tax code: denied",
    );
  });

  it("throws when the delete fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    result.current = { data: null, error: { message: "denied" } };

    await expect(setProvinceTaxCode("conn-1", "ON", null)).rejects.toThrow(
      "Failed to set province tax code: denied",
    );
  });
});
