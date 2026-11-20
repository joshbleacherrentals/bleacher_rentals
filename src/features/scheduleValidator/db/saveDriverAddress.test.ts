import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { driverAddressWrites, type PickedAddress } from "./saveDriverAddress";

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

describe("driverAddressWrites", () => {
  it("overwrites the driver's existing address row, every column", () => {
    const writes = driverAddressWrites("d1", "a1", PICKED, "new");
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
    const writes = driverAddressWrites("d1", null, PICKED, "new");
    expect(writes.map((w) => w.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      'insert into "Addresses"',
      'update "Drivers" set',
    ]);
    expect(writes[0].parameters[0]).toBe("new");
    expect(writes[1].parameters).toEqual(["new", "d1"]);
  });

  it("stores a part Google did not give as null, not an empty string", () => {
    const [write] = driverAddressWrites("d1", "a1", { ...PICKED, postalCode: "" }, "new");
    expect(write.parameters[3]).toBeNull();
  });
});
