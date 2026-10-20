import { describe, expect, it } from "vitest";
import { findOrCreateVenue } from "./findOrCreateVenue";
import type { ParsedLead } from "../logic/parseWpformsLead";

// A stand-in for the Supabase client: every query method returns the builder, and awaiting it (or
// calling single/maybeSingle) answers with what the test put in `tables` for that table.
function fakeSupabase(tables: { Addresses?: unknown[]; Venues?: unknown[] }) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  let counter = 0;
  const from = (table: "Addresses" | "Venues") => {
    let inserting: Record<string, unknown> | null = null;
    const rows = () => (tables[table] ?? []) as unknown[];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "ilike", "in", "eq", "limit"]) {
      builder[method] = () => builder;
    }
    builder.insert = (row: Record<string, unknown>) => {
      inserting = row;
      inserts.push({ table, row });
      return builder;
    };
    const answer = (single: boolean) =>
      inserting
        ? { data: { id: `new-${table}-${++counter}` }, error: null }
        : { data: single ? (rows()[0] ?? null) : rows(), error: null };
    builder.single = async () => answer(true);
    builder.maybeSingle = async () => answer(true);
    builder.then = (resolve: (v: unknown) => unknown) => resolve(answer(false));
    return builder;
  };
  return { client: { from } as never, inserts };
}

const lead = (over: Partial<ParsedLead> = {}): ParsedLead => ({
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  eventName: null,
  seats: null,
  street: "41 Speedway Loop",
  city: "Valdosta",
  stateProvince: "Georgia",
  zipPostal: "31601",
  startDate: null,
  endDate: null,
  internalNotes: null,
  ...over,
});

const address = (over: Record<string, unknown> = {}) => ({
  id: "addr-1",
  street: "41 Speedway Loop",
  city: "Valdosta",
  state_province: "Georgia",
  zip_postal: "31601",
  ...over,
});

describe("findOrCreateVenue", () => {
  it("returns the venue already at the address, creating nothing", async () => {
    const { client, inserts } = fakeSupabase({
      Addresses: [address()],
      Venues: [{ id: "venue-1" }],
    });
    expect(await findOrCreateVenue(client, lead())).toBe("venue-1");
    expect(inserts).toEqual([]);
  });

  it("matches the address ignoring case and spacing", async () => {
    const { client } = fakeSupabase({
      Addresses: [address({ street: " 41 SPEEDWAY loop ", city: "valdosta" })],
      Venues: [{ id: "venue-1" }],
    });
    expect(await findOrCreateVenue(client, lead())).toBe("venue-1");
  });

  it("does not treat a different city or zip at the same street as the same venue", async () => {
    for (const other of [{ city: "Tifton" }, { zip_postal: "31602" }]) {
      const { client, inserts } = fakeSupabase({
        Addresses: [address(other)],
        Venues: [{ id: "venue-1" }],
      });
      expect(await findOrCreateVenue(client, lead())).toMatch(/^new-Venues-/);
      expect(inserts.map((i) => i.table)).toEqual(["Addresses", "Venues"]);
    }
  });

  it("creates the address and a venue named after the street when none is there", async () => {
    const { client, inserts } = fakeSupabase({ Addresses: [], Venues: [] });
    expect(await findOrCreateVenue(client, lead())).toMatch(/^new-Venues-/);
    expect(inserts[0]).toEqual({
      table: "Addresses",
      row: {
        street: "41 Speedway Loop",
        city: "Valdosta",
        state_province: "Georgia",
        zip_postal: "31601",
      },
    });
    expect(inserts[1].table).toBe("Venues");
    expect(inserts[1].row).toMatchObject({ name: "41 Speedway Loop" });
  });

  it("creates a venue when the address exists but only as a private quote address", async () => {
    const { client, inserts } = fakeSupabase({ Addresses: [address()], Venues: [] });
    expect(await findOrCreateVenue(client, lead())).toMatch(/^new-Venues-/);
    expect(inserts.map((i) => i.table)).toEqual(["Addresses", "Venues"]);
  });

  it("gives a lead without a street no venue", async () => {
    const { client, inserts } = fakeSupabase({});
    expect(await findOrCreateVenue(client, lead({ street: "" }))).toBeNull();
    expect(inserts).toEqual([]);
  });
});
