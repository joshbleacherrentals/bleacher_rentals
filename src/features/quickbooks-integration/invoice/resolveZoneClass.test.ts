import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-03b-zone-class.md §6: the Class of a quote is found from the venue's state
// through two small service-role reads, with no join and no write.

type Call = { table: string; select: string; filters: Array<[string, unknown]> };

const { createClient, state } = vi.hoisted(() => {
  const state = {
    stateRows: [] as Array<{ state_province: string; zone_uuid: string }>,
    classRows: [] as Array<{
      zone_uuid: string;
      qbo_connection_uuid: string;
      qbo_class_id: string;
    }>,
    error: null as { message: string } | null,
    errorTable: "" as string,
    calls: [] as Call[],
    writes: 0,
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
      const call: Call = { table, select: "", filters: [] };
      state.calls.push(call);
      const result = () => {
        if (state.error && (!state.errorTable || state.errorTable === table))
          return { data: null, error: state.error };
        const all: any[] = table === "ZoneStateProvinces" ? state.stateRows : state.classRows;
        return {
          data: all.filter((r) => call.filters.every(([c, v]) => r[c] === v)),
          error: null,
        };
      };
      const chain: any = {
        select: (columns: string) => {
          call.select = columns;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          call.filters.push([col, val]);
          return chain;
        },
        insert: () => state.writes++,
        update: () => state.writes++,
        upsert: () => state.writes++,
        delete: () => state.writes++,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  }));
  return { createClient, state };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { resolveZoneClass } from "./resolveZoneClass";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  createClient.mockClear();
  state.stateRows = [
    { state_province: "SC", zone_uuid: "zone-south" },
    { state_province: "Washington, D.C.", zone_uuid: "zone-east" },
    { state_province: "ON", zone_uuid: "zone-ca" },
    { state_province: "TX", zone_uuid: "zone-unmapped" },
  ];
  state.classRows = [
    { zone_uuid: "zone-south", qbo_connection_uuid: "usa", qbo_class_id: "11" },
    { zone_uuid: "zone-south", qbo_connection_uuid: "can", qbo_class_id: "99" },
    { zone_uuid: "zone-east", qbo_connection_uuid: "usa", qbo_class_id: "12" },
    { zone_uuid: "zone-ca", qbo_connection_uuid: "can", qbo_class_id: "3" },
    { zone_uuid: "zone-unmapped", qbo_connection_uuid: "other", qbo_class_id: "77" },
  ];
  state.error = null;
  state.errorTable = "";
  state.calls = [];
  state.writes = 0;
});

describe("resolveZoneClass", () => {
  it("returns the class id of the state's zone for the connection", async () => {
    expect(await resolveZoneClass("usa", "SC")).toEqual({ classId: "11" });
    expect(await resolveZoneClass("can", "SC")).toEqual({ classId: "99" });
  });

  it("gives no_class when the zone has a row only for the other connection", async () => {
    expect(await resolveZoneClass("usa", "TX")).toEqual({
      classId: null,
      warning: { code: "class_missing", state: "TX", reason: "no_class" },
    });
  });

  it("gives no_zone for a state in no zone", async () => {
    expect(await resolveZoneClass("usa", "ZZ")).toEqual({
      classId: null,
      warning: { code: "class_missing", state: "ZZ", reason: "no_zone" },
    });
  });

  it("gives no_zone for a null or blank state", async () => {
    expect(await resolveZoneClass("usa", null)).toEqual({
      classId: null,
      warning: { code: "class_missing", state: "", reason: "no_zone" },
    });
    expect(await resolveZoneClass("usa", "   ")).toEqual({
      classId: null,
      warning: { code: "class_missing", state: "", reason: "no_zone" },
    });
  });

  it("finds the same zone for spellings the app treats alike", async () => {
    for (const spelling of ["SC", "sc", "  sc  ", "\tSc\n"]) {
      expect(await resolveZoneClass("usa", spelling)).toEqual({ classId: "11" });
    }
    for (const spelling of [
      "Washington, D.C.",
      "DC",
      "dc",
      "Washington DC",
      "District of Columbia",
    ]) {
      expect(await resolveZoneClass("usa", spelling)).toEqual({ classId: "12" });
    }
  });

  it("returns the one class of the Canadian connection for a province in a zone", async () => {
    expect(await resolveZoneClass("can", "ON")).toEqual({ classId: "3" });
  });

  it("gives no_class for a province whose zone has no row for the connection", async () => {
    expect(await resolveZoneClass("usa", "ON")).toEqual({
      classId: null,
      warning: { code: "class_missing", state: "ON", reason: "no_class" },
    });
  });

  it("uses the service role", async () => {
    await resolveZoneClass("usa", "SC");

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("runs exactly two queries, neither joining a table, and writes nothing", async () => {
    await resolveZoneClass("usa", "SC");

    expect(state.calls.map((c) => c.table)).toEqual(["ZoneStateProvinces", "ZoneQboClasses"]);
    for (const call of state.calls) expect(call.select).not.toMatch(/[(:]/);
    expect(state.calls[0].filters).toEqual([]);
    expect(state.calls[1].filters).toEqual([["qbo_connection_uuid", "usa"]]);
    expect(state.writes).toBe(0);
  });

  it("throws, rather than answering no class, when a read fails", async () => {
    state.error = { message: "boom" };
    state.errorTable = "ZoneStateProvinces";
    await expect(resolveZoneClass("usa", "SC")).rejects.toThrow(
      "Failed to read the zone states: boom",
    );

    state.errorTable = "ZoneQboClasses";
    await expect(resolveZoneClass("usa", "SC")).rejects.toThrow(
      "Failed to read the zone classes: boom",
    );
  });
});
