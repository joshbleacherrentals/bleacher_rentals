import { describe, it, expect } from "vitest";
import { createBleacherType, updateBleacherType } from "./bleacherTypeCrud";

/** Records what reaches Supabase for BleacherTypes. */
function fakeSupabase() {
  const calls: { table: string; op: string; payload: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return {
          select: () => ({ single: async () => ({ data: { id: "bt-new" }, error: null }) }),
        };
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { client: client as any, calls };
}

describe("bleacherTypeCrud", () => {
  it("creates a bleacher type with its description", async () => {
    const { client, calls } = fakeSupabase();
    const id = await createBleacherType(
      { name: "15 Row", row_count: 15, roof_type: "none", description: "Seats 300.\n- steps" },
      client,
    );
    expect(id).toBe("bt-new");
    expect(calls).toEqual([
      {
        table: "BleacherTypes",
        op: "insert",
        payload: {
          name: "15 Row",
          row_count: 15,
          roof_type: "none",
          description: "Seats 300.\n- steps",
        },
      },
    ]);
  });

  it("clears a bleacher type's description", async () => {
    const { client, calls } = fakeSupabase();
    await updateBleacherType("bt-15", { description: null }, client);
    expect(calls).toEqual([
      { table: "BleacherTypes", op: "update", payload: { description: null } },
    ]);
  });
});
