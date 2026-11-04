import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedLead } from "../logic/parseWpformsLead";

// Spec: docs/specs/invoice-number-01-assign-in-database.md §4, §7. The invoice number is given by
// the database when the Events row is inserted (trigger), so the lead flow no longer asks for one.

vi.mock("./findOrCreateVenue", () => ({ findOrCreateVenue: vi.fn().mockResolvedValue(null) }));

import { createLeadQuote } from "./createLeadQuote";

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
const rpcCalls: string[] = [];

/** Just enough of the Supabase client: the Events insert answers with an id; everything is recorded. */
const supabase = {
  rpc: (name: string) => {
    rpcCalls.push(name);
    return Promise.resolve({ data: 123456789, error: null });
  },
  from: (table: string) => {
    const builder = {
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return builder;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      single: () => Promise.resolve({ data: { id: "evt-1" }, error: null }),
    };
    return builder;
  },
} as never;

const blankLead = {
  eventName: "Homecoming",
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  street: null,
  city: null,
  stateProvince: null,
  zipPostal: null,
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  seats: 500,
  internalNotes: null,
} as unknown as ParsedLead;

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
});

describe("createLeadQuote — the invoice number", () => {
  it("creates the quote and returns its id", async () => {
    await expect(createLeadQuote(supabase, blankLead, null)).resolves.toBe("evt-1");
    expect(calls.filter((c) => c.table === "Events" && c.op === "insert")).toHaveLength(1);
  });

  it("does not ask the database for a number: the Events insert gets it from the trigger", async () => {
    await createLeadQuote(supabase, blankLead, null);

    expect(rpcCalls).toEqual([]);
  });

  it("writes no invoice_number, neither in the insert nor in a later update", async () => {
    await createLeadQuote(supabase, blankLead, null);

    expect(calls.some((c) => c.op === "update")).toBe(false);
    for (const call of calls) {
      expect(JSON.stringify(call.payload ?? {})).not.toContain("invoice_number");
    }
  });
});
