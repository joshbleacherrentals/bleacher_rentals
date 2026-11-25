import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { ownedAddressWrites, type PickedAddress } from "./saveOwnedAddress";

const DRIVER = { table: "Drivers" as const, id: "d1" };

const PICKED: PickedAddress = {
  address: "1663 Windham Road 12",
  city: "Simcoe",
  state: "ON",
  postalCode: "N3Y 4K3",
  country: "Canada",
  lat: 42.9,
  lng: -80.3,
  placeId: "ChIJ123",
};

describe("ownedAddressWrites", () => {
  it("overwrites the driver's existing address row, every column", () => {
    const writes = ownedAddressWrites(DRIVER, "a1", PICKED, "new");
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toMatch(/^update "Addresses" set/);
    expect(writes[0].sql).toContain('where "id" = ?');
    expect(writes[0].parameters).toEqual([
      "1663 Windham Road 12",
      "Simcoe",
      "ON",
      "N3Y 4K3",
      "Canada",
      42.9,
      -80.3,
      "ChIJ123",
      "a1",
    ]);
  });

  it("creates a row and links it to a driver with no address", () => {
    const writes = ownedAddressWrites(DRIVER, null, PICKED, "new");
    expect(writes.map((w) => w.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      'insert into "Addresses"',
      'update "Drivers" set',
    ]);
    expect(writes[0].parameters[0]).toBe("new");
    expect(writes[1].parameters).toEqual(["new", "d1"]);
  });

  it("stores a part Google did not give as null, not an empty string", () => {
    const [write] = ownedAddressWrites(DRIVER, "a1", { ...PICKED, postalCode: "" }, "new");
    expect(write.parameters[3]).toBeNull();
  });

  it("links a new row from the event when the owner is an event", () => {
    const writes = ownedAddressWrites({ table: "Events", id: "e1" }, null, PICKED, "new");
    expect(writes[1].sql).toMatch(/^update "Events" set "address_uuid" = \? where "id" = \?$/);
    expect(writes[1].parameters).toEqual(["new", "e1"]);
  });
});
