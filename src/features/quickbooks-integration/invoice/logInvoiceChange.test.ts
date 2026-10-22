import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-04-create.md §6: creating the invoice is written to the quote's Log with
// the service role; an `is_qbo` that flips gets the row setEventIsQbo writes.

const { createClient, state } = vi.hoisted(() => {
  const state = {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    error: null as { message: string } | null,
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return { error: state.error };
      },
    }),
  }));
  return { createClient, state };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { logInvoiceChange, logIsQboSet } from "./logInvoiceChange";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  createClient.mockClear();
  state.inserts = [];
  state.error = null;
});

describe("logInvoiceChange", () => {
  it("writes one qbo_invoice row naming the invoice, by the user who pressed the button", async () => {
    await logInvoiceChange({
      eventId: "evt-1",
      userUuid: "user-1",
      kind: "created",
      docNumber: "100200300",
    });

    expect(state.inserts).toHaveLength(1);
    const [{ table, row }] = state.inserts;
    expect(table).toBe("EventChangeLog");
    expect(row).toMatchObject({
      event_uuid: "evt-1",
      changed_by_user_uuid: "user-1",
      field_name: "qbo_invoice",
      prev_value: "None",
      next_value: "Created (invoice 100200300)",
      action_type: "update",
    });
  });

  it("stamps the time", async () => {
    const before = Date.now();
    await logInvoiceChange({
      eventId: "evt-1",
      userUuid: "user-1",
      kind: "created",
      docNumber: "1",
    });

    const changedAt = Date.parse(String(state.inserts[0].row.changed_at));
    expect(changedAt).toBeGreaterThanOrEqual(before);
    expect(changedAt).toBeLessThanOrEqual(Date.now());
  });

  it("uses the service role", async () => {
    await logInvoiceChange({
      eventId: "evt-1",
      userUuid: "user-1",
      kind: "created",
      docNumber: "1",
    });

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("throws when the insert fails", async () => {
    state.error = { message: "boom" };

    await expect(
      logInvoiceChange({ eventId: "evt-1", userUuid: "user-1", kind: "created", docNumber: "1" }),
    ).rejects.toThrow(/boom/);
  });
});

describe("logIsQboSet", () => {
  it("writes the is_qbo row exactly as setEventIsQbo does: No to Yes", async () => {
    await logIsQboSet({ eventId: "evt-1", userUuid: "user-1" });

    expect(state.inserts).toHaveLength(1);
    const [{ table, row }] = state.inserts;
    expect(table).toBe("EventChangeLog");
    expect(row).toMatchObject({
      event_uuid: "evt-1",
      changed_by_user_uuid: "user-1",
      field_name: "is_qbo",
      prev_value: "No",
      next_value: "Yes",
      action_type: "update",
    });
    expect(typeof row.changed_at).toBe("string");
  });

  it("throws when the insert fails", async () => {
    state.error = { message: "boom" };

    await expect(logIsQboSet({ eventId: "evt-1", userUuid: "user-1" })).rejects.toThrow(/boom/);
  });
});
