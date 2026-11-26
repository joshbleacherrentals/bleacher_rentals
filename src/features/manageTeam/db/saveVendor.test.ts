import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];
let failOn: string | null = null;

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    if (failOn && compiled.sql.includes(failOn)) return Promise.reject(new Error("write failed"));
    executed.push(compiled);
    return Promise.resolve();
  },
}));

import { saveVendor, setVendorActive, submitVendor } from "./saveVendor";
import { emptyVendorForm, type VendorAddress, type VendorFormValues } from "../utils/vendorForm";

// docs/specs/vendors-page.md §4.2 (D10, D13, D15) and §6.1: the window's save order, the address
// rules (in place, new row, cleared, untouched), and Delete and Restore.

beforeEach(() => {
  executed.length = 0;
  failOn = null;
});

const address: VendorAddress = {
  street: "1 Shop Rd",
  city: "Dallas",
  stateProvince: "TX",
  zipPostal: "75201",
  country: "US",
  latitude: 32.78,
  longitude: -96.8,
  placeId: "place-1",
};

const values = (over: Partial<VendorFormValues> = {}): VendorFormValues => ({
  ...emptyVendorForm("repairs"),
  displayName: "Dallas Trailer Repair",
  ...over,
});

const inserts = (table: string) =>
  executed.filter((q) => q.sql.startsWith(`insert into "${table}"`));
const updates = (table: string) => executed.filter((q) => q.sql.startsWith(`update "${table}"`));
/** The value bound to `column` in an insert's column list or an update's SET list. */
function param(q: CompiledQuery, column: string): unknown {
  const list = q.sql.startsWith("insert")
    ? q.sql.slice(q.sql.indexOf("(") + 1, q.sql.indexOf(")"))
    : q.sql.slice(q.sql.indexOf(" set ") + 5, q.sql.indexOf(" where "));
  const names = list.split(",").map((s) => s.trim().split(" ")[0].replace(/"/g, ""));
  return q.parameters[names.indexOf(column)];
}

describe("saveVendor: create", () => {
  it("inserts the address first, then the vendor, with the type", async () => {
    const id = await saveVendor({
      values: values({ address }),
      existing: null,
      addressTouched: true,
      logoUrl: null,
    });

    expect(executed.map((q) => q.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      'insert into "Addresses"',
      'insert into "Vendors"',
    ]);
    const [addr] = inserts("Addresses");
    const [vendor] = inserts("Vendors");
    expect(param(addr, "street")).toBe("1 Shop Rd");
    expect(param(addr, "city")).toBe("Dallas");
    expect(param(addr, "state_province")).toBe("TX");
    expect(param(addr, "zip_postal")).toBe("75201");
    expect(param(addr, "country")).toBe("US");
    expect(param(addr, "latitude")).toBe(32.78);
    expect(param(addr, "place_id")).toBe("place-1");
    expect(param(vendor, "id")).toBe(id);
    expect(param(vendor, "type")).toBe("repairs");
    expect(param(vendor, "address_uuid")).toBe(param(addr, "id"));
    expect(param(vendor, "is_active")).toBe(1);
    expect(param(vendor, "created_at")).toEqual(expect.any(String));
  });

  it("inserts one row when there is no address", async () => {
    const id = await saveVendor({
      values: values(),
      existing: null,
      addressTouched: false,
      logoUrl: null,
    });

    expect(inserts("Addresses")).toHaveLength(0);
    expect(inserts("Vendors")).toHaveLength(1);
    expect(param(inserts("Vendors")[0], "id")).toBe(id);
    expect(param(inserts("Vendors")[0], "address_uuid")).toBeNull();
  });

  it("stores a driver vendor with the type driver", async () => {
    await saveVendor({
      values: values({ type: "driver" }),
      existing: null,
      addressTouched: false,
      logoUrl: null,
    });
    expect(param(inserts("Vendors")[0], "type")).toBe("driver");
  });

  it("writes the maintenance columns and the logo", async () => {
    await saveVendor({
      values: values({
        status: "verified",
        phone: "214-555-0182",
        contactName: "Sam",
        contactEmail: "sam@shop.com",
        notes: "Good welds",
        doesAluminumWelding: true,
      }),
      existing: null,
      addressTouched: false,
      logoUrl: "https://x/logo.png",
    });
    const [vendor] = inserts("Vendors");
    expect(param(vendor, "status")).toBe("verified");
    expect(param(vendor, "phone")).toBe("214-555-0182");
    expect(param(vendor, "contact_name")).toBe("Sam");
    expect(param(vendor, "contact_email")).toBe("sam@shop.com");
    expect(param(vendor, "notes")).toBe("Good welds");
    expect(param(vendor, "does_aluminum_welding")).toBe(1);
    expect(param(vendor, "does_trailer_repair")).toBe(0);
    expect(param(vendor, "logo_url")).toBe("https://x/logo.png");
  });
});

describe("saveVendor: edit", () => {
  const existing = { id: "v1", addressUuid: "a1" };

  it("updates the vendor's own address row in place, then the vendor", async () => {
    const id = await saveVendor({
      values: values({ address: { ...address, street: "9 New St" } }),
      existing,
      addressTouched: true,
      logoUrl: null,
    });

    expect(id).toBe("v1");
    expect(inserts("Addresses")).toHaveLength(0);
    const [addr] = updates("Addresses");
    expect(param(addr, "street")).toBe("9 New St");
    expect(addr.parameters[addr.parameters.length - 1]).toBe("a1");
    const [vendor] = updates("Vendors");
    expect(param(vendor, "address_uuid")).toBe("a1");
    expect(vendor.parameters[vendor.parameters.length - 1]).toBe("v1");
    expect(executed.indexOf(addr)).toBeLessThan(executed.indexOf(vendor));
  });

  it("adds an address to a vendor that had none: a new row, then address_uuid", async () => {
    await saveVendor({
      values: values({ address }),
      existing: { id: "v1", addressUuid: null },
      addressTouched: true,
      logoUrl: null,
    });

    const [addr] = inserts("Addresses");
    const [vendor] = updates("Vendors");
    expect(updates("Addresses")).toHaveLength(0);
    expect(param(vendor, "address_uuid")).toBe(param(addr, "id"));
  });

  it("clearing the address sets address_uuid to null and deletes nothing (D13)", async () => {
    await saveVendor({
      values: values({ address: null }),
      existing,
      addressTouched: true,
      logoUrl: null,
    });

    expect(executed.filter((q) => q.sql.startsWith("delete"))).toHaveLength(0);
    expect(inserts("Addresses")).toHaveLength(0);
    expect(updates("Addresses")).toHaveLength(0);
    expect(param(updates("Vendors")[0], "address_uuid")).toBeNull();
  });

  it("leaves the address alone when the window never touched it, even if its row has not synced", async () => {
    await saveVendor({
      values: values({ address: null }),
      existing,
      addressTouched: false,
      logoUrl: null,
    });

    expect(inserts("Addresses")).toHaveLength(0);
    expect(updates("Addresses")).toHaveLength(0);
    expect(param(updates("Vendors")[0], "address_uuid")).toBe("a1");
  });

  it("does not write the address again when it was not touched", async () => {
    await saveVendor({
      values: values({ address }),
      existing,
      addressTouched: false,
      logoUrl: null,
    });
    expect(updates("Addresses")).toHaveLength(0);
    expect(updates("Vendors")).toHaveLength(1);
  });

  it("changes the type of the vendor (D11)", async () => {
    await saveVendor({
      values: values({ type: "driver" }),
      existing,
      addressTouched: false,
      logoUrl: null,
    });
    expect(param(updates("Vendors")[0], "type")).toBe("driver");
  });

  it("raises when a write fails", async () => {
    failOn = 'update "Vendors"';
    await expect(
      saveVendor({ values: values(), existing, addressTouched: false, logoUrl: null }),
    ).rejects.toThrow("write failed");
  });
});

describe("submitVendor", () => {
  it("refuses an invalid form and writes nothing, uploading no logo", async () => {
    const uploadLogo = vi.fn(async () => "https://x/logo.png");
    const out = await submitVendor({
      values: values({ type: "" }),
      existing: null,
      addressTouched: false,
      logoUrl: null,
      uploadLogo,
    });

    expect(out).toEqual({
      status: "invalid",
      error: expect.objectContaining({ title: "Type required" }),
    });
    expect(uploadLogo).not.toHaveBeenCalled();
    expect(executed).toHaveLength(0);
  });

  it("uploads the chosen logo after the checks and saves its URL", async () => {
    const uploadLogo = vi.fn(async () => "https://x/logo.png");
    const out = await submitVendor({
      values: values(),
      existing: null,
      addressTouched: false,
      logoUrl: null,
      uploadLogo,
    });

    expect(uploadLogo).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("saved");
    expect(param(inserts("Vendors")[0], "logo_url")).toBe("https://x/logo.png");
  });

  it("returns the new id and says it was created, for a repairs vendor too (Save & Assign, D10)", async () => {
    const out = await submitVendor({
      values: values({ type: "repairs" }),
      existing: null,
      addressTouched: false,
      logoUrl: null,
    });
    expect(out).toEqual({ status: "saved", id: param(inserts("Vendors")[0], "id"), created: true });
  });

  it("returns the id of an edited vendor and says it was not created", async () => {
    const out = await submitVendor({
      values: values(),
      existing: { id: "v1", addressUuid: null },
      addressTouched: false,
      logoUrl: null,
    });
    expect(out).toEqual({ status: "saved", id: "v1", created: false });
  });
});

describe("setVendorActive (D15)", () => {
  it("Delete sets is_active to 0 and Restore sets it to 1", async () => {
    await setVendorActive("v1", false);
    await setVendorActive("v1", true);

    const [del, restore] = updates("Vendors");
    expect(param(del, "is_active")).toBe(0);
    expect(del.parameters[del.parameters.length - 1]).toBe("v1");
    expect(param(restore, "is_active")).toBe(1);
    expect(restore.parameters[restore.parameters.length - 1]).toBe("v1");
  });
});
