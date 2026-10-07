import { describe, it, expect } from "vitest";
import {
  createUser,
  currentUserCanEditDriverRow,
  driverDocumentFields,
  driverPayFields,
  fetchUserById,
  updateDriverPayment,
  updateUser,
} from "./userOperations";
import type { CurrentUserState } from "../state/useCurrentUserStore";

const baseState: CurrentUserState = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  isAdmin: false,
  statusUuid: null,
  isDriver: false,
  isAccountManager: false,
  isDeveloper: false,
  isMaintainer: false,
  isAccountant: false,
  isViewer: false,
  autoSubscribeToNewTickets: true,
  roleTabs: [],
  taxDec: undefined,
  payRateCents: null,
  deadheadRateCents: null,
  setupCents: null,
  teardownCents: null,
  payCurrency: "CAD",
  payPerUnit: "KM",
  payRanges: [],
  accountManagerUuid: null,
  assignedDriverZoneUuids: [],
  vendorUuid: null,
  phoneNumber: null,
  addressUuid: null,
  homeAddress: null,
  homeCity: null,
  homeState: null,
  homePostalCode: null,
  homeLat: null,
  homeLng: null,
  homePlaceId: null,
  homeCountry: null,
  vehicleUuid: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
  vehicleVin: null,
  licensePhotoPath: null,
  insurancePhotoPath: null,
  medicalCardPhotoPath: null,
  licenseExpiresOn: null,
  insuranceExpiresOn: null,
  medicalCardExpiresOn: null,
  driverId: null,
  assignedDriverUuids: [],
  assignedZoneEntries: [],
  zoneDriverMap: {},
  defaultSalesOfficeId: null,
  existingUserUuid: null,
  isOpen: false,
  isSubmitting: false,
};

/** Minimal fake of the Supabase query-builder chain `createUser` uses for the Users insert. */
function fakeSupabaseWithUsersInsertError(error: { code?: string; message?: string }) {
  return {
    from: (table: string) => {
      if (table !== "Users") {
        throw new Error(`Unexpected table in test: ${table}`);
      }
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error }),
          }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("createUser", () => {
  it("returns a clear message when the email already exists (Postgres 23505)", async () => {
    const supabase = fakeSupabaseWithUsersInsertError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "Users_email_key"',
    });

    const result = await createUser(supabase, baseState);

    expect(result.success).toBe(false);
    expect(result.error).toBe('A user with the email "jane@example.com" already exists.');
  });

  it("passes through other Postgres errors unchanged", async () => {
    const supabase = fakeSupabaseWithUsersInsertError({
      code: "23514",
      message: "check constraint violated",
    });

    const result = await createUser(supabase, baseState);

    expect(result.success).toBe(false);
    expect(result.error).toBe("check constraint violated");
  });
});

describe("driverPayFields", () => {
  it("maps setup and teardown amounts to their database cent fields", () => {
    expect(
      driverPayFields({
        ...baseState,
        taxDec: 13,
        payRateCents: 250,
        deadheadRateCents: 75,
        setupCents: 12_345,
        teardownCents: 6_789,
        payCurrency: "USD",
        payPerUnit: "MI",
      }),
    ).toEqual({
      tax_dec: 13,
      pay_rate_cents: 250,
      deadhead_cents: 75,
      setup_cents: 12_345,
      teardown_cents: 6_789,
      pay_currency: "USD",
      pay_per_unit: "MI",
    });
  });
});

describe("driverPayFields — fractional rates", () => {
  it("writes the decimal rate to tax_dec, and never to the deprecated tax column", () => {
    const fields = driverPayFields({ ...baseState, taxDec: 14.975 });

    expect(fields.tax_dec).toBe(14.975);
    // `tax` is maintained by the sync_driver_tax() trigger; writing it here
    // would race the trigger and re-truncate the rate we just saved.
    expect(fields).not.toHaveProperty("tax");
  });
});

describe("driverDocumentFields", () => {
  it("maps every document path and expiry to its Drivers column", () => {
    expect(
      driverDocumentFields({
        ...baseState,
        licensePhotoPath: "d1/license_1.jpg",
        insurancePhotoPath: "d1/insurance_2.pdf",
        medicalCardPhotoPath: "d1/medical_card_3.png",
        licenseExpiresOn: "2027-01-31",
        insuranceExpiresOn: "2026-11-01",
        medicalCardExpiresOn: "2026-09-15",
      }),
    ).toEqual({
      license_photo_path: "d1/license_1.jpg",
      insurance_photo_path: "d1/insurance_2.pdf",
      medical_card_photo_path: "d1/medical_card_3.png",
      license_expires_on: "2027-01-31",
      insurance_expires_on: "2026-11-01",
      medical_card_expires_on: "2026-09-15",
    });
  });

  it("writes null rather than an empty string when a date is cleared", () => {
    // <input type="date"> hands back "" when emptied; a date column rejects it.
    expect(
      driverDocumentFields({
        ...baseState,
        licenseExpiresOn: "",
        insuranceExpiresOn: "   ",
      }),
    ).toMatchObject({
      license_expires_on: null,
      insurance_expires_on: null,
    });
  });

  it("leaves an unset document entirely null", () => {
    expect(driverDocumentFields(baseState)).toEqual({
      license_photo_path: null,
      insurance_photo_path: null,
      medical_card_photo_path: null,
      license_expires_on: null,
      insurance_expires_on: null,
      medical_card_expires_on: null,
    });
  });
});

// ── The Accountant role ──────────────────────────────────────────────────────
//
// A recording fake of the Supabase builder. Every chain ends either in `.single()`
// or in being awaited, and both resolve from `tables` / `failOn`.

type Call = { table: string; op: "select" | "insert" | "update"; payload?: unknown };

function recordingSupabase(
  opts: {
    /** What `.single()` returns for a select on this table (default: no row). */
    rows?: Record<string, unknown>;
    /** Tables whose insert/update comes back with an error. */
    failOn?: Record<string, { code?: string; message: string }>;
  } = {},
) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      const chain = (op: Call["op"]) => {
        const error = op === "select" ? null : (opts.failOn?.[table] ?? null);
        const b: any = {
          select: () => b,
          eq: () => b,
          // insert(...).select("id").single() yields the new row; select(...).single() the fixture.
          single: async () => ({
            data: op === "insert" ? { id: `new-${table}-id` } : (opts.rows?.[table] ?? null),
            error,
          }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error }),
        };
        return b;
      };
      return {
        select: () => {
          calls.push({ table, op: "select" });
          return chain("select");
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          return chain("insert");
        },
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return chain("update");
        },
      };
    },
    rpc: async () => ({ data: ["admin"], error: null }),
  } as any;
  const on = (table: string, op: Call["op"]) =>
    calls.filter((c) => c.table === table && c.op === op);
  return { client, calls, on };
}

describe("createUser — accountant", () => {
  it("records the role in Accountants, active, pointing at the new user", async () => {
    const { client, on } = recordingSupabase();

    const result = await createUser(client, { ...baseState, isAccountant: true });

    expect(result).toEqual({ success: true, userUuid: "new-Users-id" });
    expect(on("Accountants", "insert")).toEqual([
      {
        table: "Accountants",
        op: "insert",
        payload: { user_uuid: "new-Users-id", is_active: true },
      },
    ]);
  });

  it("writes nothing to Accountants when the role was not chosen", async () => {
    const { client, on } = recordingSupabase();

    await createUser(client, { ...baseState, isViewer: true });

    expect(on("Accountants", "insert")).toHaveLength(0);
  });

  it("does not change what the other roles write", async () => {
    const { client, on } = recordingSupabase();

    await createUser(client, { ...baseState, isDeveloper: true, isMaintainer: true });

    expect(on("Developers", "insert")).toHaveLength(1);
    expect(on("Maintainers", "insert")).toHaveLength(1);
    expect(on("Accountants", "insert")).toHaveLength(0);
  });

  it("reports a refused Accountants insert instead of swallowing it", async () => {
    const { client } = recordingSupabase({
      failOn: {
        Accountants: { code: "42501", message: "new row violates row-level security policy" },
      },
    });

    const result = await createUser(client, { ...baseState, isAccountant: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe("new row violates row-level security policy");
  });
});

describe("updateUser — accountant", () => {
  const existing = { ...baseState, existingUserUuid: "user-1" };

  it("inserts the row when the role is granted to a user who never had it", async () => {
    const { client, on } = recordingSupabase();

    const result = await updateUser(client, { ...existing, isAccountant: true });

    expect(result.success).toBe(true);
    expect(on("Accountants", "insert")).toEqual([
      { table: "Accountants", op: "insert", payload: { user_uuid: "user-1", is_active: true } },
    ]);
    expect(on("Accountants", "update")).toHaveLength(0);
  });

  it("reactivates the existing row instead of inserting a second one", async () => {
    const { client, on } = recordingSupabase({ rows: { Accountants: { id: "acct-1" } } });

    await updateUser(client, { ...existing, isAccountant: true });

    expect(on("Accountants", "insert")).toHaveLength(0);
    expect(on("Accountants", "update")).toEqual([
      { table: "Accountants", op: "update", payload: { is_active: true } },
    ]);
  });

  it("deactivates the row when the role is removed — it is never deleted", async () => {
    const { client, on } = recordingSupabase({ rows: { Accountants: { id: "acct-1" } } });

    await updateUser(client, { ...existing, isAccountant: false });

    expect(on("Accountants", "update")).toEqual([
      { table: "Accountants", op: "update", payload: { is_active: false } },
    ]);
  });

  it("does nothing to Accountants for a user who never had the role", async () => {
    const { client, on } = recordingSupabase();

    await updateUser(client, { ...existing, isAccountant: false });

    expect(on("Accountants", "insert")).toHaveLength(0);
    expect(on("Accountants", "update")).toHaveLength(0);
  });

  it("does not disturb the maintainer role while handling the accountant one", async () => {
    const { client, on } = recordingSupabase({ rows: { Maintainers: { id: "m-1" } } });

    await updateUser(client, { ...existing, isMaintainer: true, isAccountant: false });

    expect(on("Maintainers", "update")).toEqual([
      { table: "Maintainers", op: "update", payload: { is_active: true } },
    ]);
    expect(on("Accountants", "update")).toHaveLength(0);
  });
});

describe("fetchUserById — accountant", () => {
  const user = {
    first_name: "Ann",
    last_name: "Ledger",
    email: "ann@example.com",
    is_admin: false,
    is_viewer: false,
    status_uuid: null,
    phone: null,
  };

  it("opens the accountant tab for an active row", async () => {
    const { client } = recordingSupabase({
      rows: { Users: user, Accountants: { id: "a-1", is_active: true } },
    });

    const result = await fetchUserById(client, "user-1");

    expect(result?.roleTabs).toEqual(["accountant"]);
    expect(result?.isAccountant).toBe(true);
  });

  it("does not open it for an inactive row — the role was removed", async () => {
    const { client } = recordingSupabase({
      rows: { Users: user, Accountants: { id: "a-1", is_active: false } },
    });

    const result = await fetchUserById(client, "user-1");

    expect(result?.roleTabs).toEqual([]);
    expect(result?.isAccountant).toBeFalsy();
  });

  it("does not open it for a user who never held it", async () => {
    const { client } = recordingSupabase({ rows: { Users: user } });

    const result = await fetchUserById(client, "user-1");

    expect(result?.roleTabs).toEqual([]);
    expect(result?.isAccountant).toBeFalsy();
  });

  it("keeps the order of tabs stable when several roles are held", async () => {
    const { client } = recordingSupabase({
      rows: {
        Users: { ...user, is_viewer: true },
        Maintainers: { id: "m-1", is_active: true },
        Accountants: { id: "a-1", is_active: true },
      },
    });

    const result = await fetchUserById(client, "user-1");

    expect(result?.roleTabs).toEqual(["viewer", "maintainer", "accountant"]);
  });
});

// ── The accountant edits a driver's payment info and vendor ─────────────────
// docs/specs/accountant-team.md §6.

type DriverCall = {
  table: string;
  op: "select" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters: unknown[];
};

/**
 * A recording fake for the chains `updateDriverPayment` and `syncDriverPayRanges` use. `updated` is
 * what `update(...).eq(...).select("id")` returns — an empty array is a write that RLS filtered out.
 */
function driverPaymentSupabase(
  opts: {
    driver?: { id: string } | null;
    updated?: { id: string }[];
    existingRanges?: { id: string }[];
    failOn?: Partial<
      Record<
        "Drivers.select" | "Drivers.update" | "DriverPayRanges.upsert",
        { code?: string; message: string }
      >
    >;
  } = {},
) {
  const calls: DriverCall[] = [];
  const driver = opts.driver === undefined ? { id: "driver-1" } : opts.driver;
  const updated = opts.updated ?? [{ id: "driver-1" }];
  const existingRanges = opts.existingRanges ?? [];

  const client = {
    from: (table: string) => {
      const record = (op: DriverCall["op"], payload?: unknown) => {
        const call: DriverCall = { table, op, payload, filters: [] };
        calls.push(call);
        const result = () => {
          if (table === "Drivers" && op === "select")
            return { data: driver, error: opts.failOn?.["Drivers.select"] ?? null };
          if (table === "Drivers" && op === "update")
            return { data: updated, error: opts.failOn?.["Drivers.update"] ?? null };
          if (table === "DriverPayRanges" && op === "select")
            return { data: existingRanges, error: null };
          if (table === "DriverPayRanges" && op === "upsert")
            return { data: null, error: opts.failOn?.["DriverPayRanges.upsert"] ?? null };
          return { data: null, error: null };
        };
        const b: any = {
          select: () => b,
          eq: (...args: unknown[]) => {
            call.filters.push(["eq", ...args]);
            return b;
          },
          in: (...args: unknown[]) => {
            call.filters.push(["in", ...args]);
            return b;
          },
          single: async () => result(),
          then: (resolve: (v: unknown) => void) => resolve(result()),
        };
        return b;
      };
      return {
        select: () => record("select"),
        update: (payload: unknown) => record("update", payload),
        delete: () => record("delete"),
        upsert: (payload: unknown) => record("upsert", payload),
      };
    },
  } as any;

  const on = (table: string, op: DriverCall["op"]) =>
    calls.filter((c) => c.table === table && c.op === op);
  return { client, calls, on };
}

describe("updateDriverPayment", () => {
  const driverState: CurrentUserState = {
    ...baseState,
    existingUserUuid: "user-1",
    isDriver: true,
    taxDec: 13,
    payRateCents: 250,
    deadheadRateCents: 75,
    setupCents: 1200,
    teardownCents: 900,
    payCurrency: "USD",
    payPerUnit: "MI",
    vendorUuid: "vendor-9",
    // Everything the accountant cannot change is filled in on purpose: none of it may be sent.
    phoneNumber: "555-0100",
    addressUuid: "addr-1",
    homeAddress: "1 Home St",
    homeCity: "Town",
    homeState: "ON",
    vehicleUuid: "veh-1",
    vehicleMake: "Ford",
    vehicleModel: "F-150",
    vehicleYear: 2020,
    licensePhotoPath: "d/license.png",
    licenseExpiresOn: "2030-01-01",
    assignedDriverZoneUuids: ["zone-1"],
    accountManagerUuid: "am-1",
    firstName: "Changed",
  };

  it("updates the pay fields and the vendor, and not one other column", async () => {
    const { client, on } = driverPaymentSupabase();

    const result = await updateDriverPayment(client, driverState);

    expect(result).toEqual({ success: true });
    expect(on("Drivers", "update")).toHaveLength(1);
    expect(on("Drivers", "update")[0].payload).toEqual({
      tax_dec: 13,
      pay_rate_cents: 250,
      deadhead_cents: 75,
      setup_cents: 1200,
      teardown_cents: 900,
      pay_currency: "USD",
      pay_per_unit: "MI",
      vendor_uuid: "vendor-9",
    });
  });

  it("targets the driver of the user being edited", async () => {
    const { client, on } = driverPaymentSupabase();

    await updateDriverPayment(client, driverState);

    expect(on("Drivers", "update")[0].filters).toContainEqual(["eq", "user_uuid", "user-1"]);
  });

  it("clears the vendor when the driver became an employee", async () => {
    const { client, on } = driverPaymentSupabase();

    await updateDriverPayment(client, { ...driverState, vendorUuid: null });

    expect(on("Drivers", "update")[0].payload).toMatchObject({ vendor_uuid: null });
  });

  it("touches no other table than Drivers and DriverPayRanges", async () => {
    const { client, calls } = driverPaymentSupabase();

    await updateDriverPayment(client, driverState);

    const tables = new Set(calls.map((c) => c.table));
    expect([...tables].sort()).toEqual(["DriverPayRanges", "Drivers"]);
    expect(calls.filter((c) => c.op !== "select").map((c) => c.table)).not.toContain("Users");
  });

  it("treats a write that updated no row as a failure — a filtered update raises nothing", async () => {
    const { client, on } = driverPaymentSupabase({ updated: [] });

    const result = await updateDriverPayment(client, driverState);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not saved/i);
    // ...and it does not go on to rewrite the pay tiers of a driver it could not update.
    expect(on("DriverPayRanges", "upsert")).toHaveLength(0);
    expect(on("DriverPayRanges", "delete")).toHaveLength(0);
  });

  it("reports the column guard's refusal (42501) instead of swallowing it", async () => {
    const { client } = driverPaymentSupabase({
      failOn: {
        "Drivers.update": {
          code: "42501",
          message: "An accountant can only change a driver's payment info, vendor and driver type",
        },
      },
    });

    const result = await updateDriverPayment(client, driverState);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/payment info, vendor and driver type/);
  });

  it("syncs the pay tiers: upserts what the form holds and deletes what was removed", async () => {
    const { client, on } = driverPaymentSupabase({
      existingRanges: [{ id: "range-old" }, { id: "range-kept" }],
    });

    const result = await updateDriverPayment(client, {
      ...driverState,
      payRanges: [
        { id: "range-kept", minValue: 0, maxValue: 100, rateCents: 150 },
        { id: "range-new", minValue: 100, maxValue: null, rateCents: 200 },
      ],
    });

    expect(result.success).toBe(true);
    const upserted = on("DriverPayRanges", "upsert")[0].payload as { id: string }[];
    expect(upserted.map((r) => r.id).sort()).toEqual(["range-kept", "range-new"]);
    expect(on("DriverPayRanges", "delete")[0].filters).toContainEqual(["in", "id", ["range-old"]]);
  });

  it("reports a refused pay tier write", async () => {
    const { client } = driverPaymentSupabase({
      failOn: { "DriverPayRanges.upsert": { code: "42501", message: "row-level security" } },
    });

    const result = await updateDriverPayment(client, {
      ...driverState,
      payRanges: [{ id: "range-new", minValue: 0, maxValue: null, rateCents: 200 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("row-level security");
  });

  it("refuses without a user, and for a user who is not a driver, before any request", async () => {
    const { client, calls } = driverPaymentSupabase();

    expect(
      (await updateDriverPayment(client, { ...driverState, existingUserUuid: null })).success,
    ).toBe(false);
    expect((await updateDriverPayment(client, { ...driverState, isDriver: false })).success).toBe(
      false,
    );
    expect(calls).toHaveLength(0);
  });

  it("fails when the user has no driver row", async () => {
    const { client, on } = driverPaymentSupabase({ driver: null });

    const result = await updateDriverPayment(client, driverState);

    expect(result.success).toBe(false);
    expect(on("Drivers", "update")).toHaveLength(0);
  });
});

describe("currentUserCanEditDriverRow", () => {
  /** Roles as `get_user_roles()` reports them; the zone queries come back empty, so no zone is shared. */
  function clientWithRoles(roles: string[], amId: string | null = null) {
    const b: any = {
      select: () => b,
      eq: () => b,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return {
      rpc: async (name: string) =>
        name === "get_user_roles"
          ? { data: roles, error: null }
          : name === "get_current_account_manager_id"
            ? { data: amId, error: null }
            : { data: null, error: null },
      from: () => b,
    } as any;
  }

  it("an admin may", async () => {
    expect(await currentUserCanEditDriverRow(clientWithRoles(["admin"]), "d-1")).toBe(true);
  });

  it("an accountant may, on any driver — the database fences the columns", async () => {
    expect(await currentUserCanEditDriverRow(clientWithRoles(["accountant"]), "d-1")).toBe(true);
  });

  it("an account manager who is also an accountant may, outside their zones (spec D9)", async () => {
    expect(
      await currentUserCanEditDriverRow(
        clientWithRoles(["account_manager", "accountant"], "am-2"),
        "d-1",
      ),
    ).toBe(true);
  });

  it("an account manager alone may not outside their zones — unchanged", async () => {
    expect(
      await currentUserCanEditDriverRow(clientWithRoles(["account_manager"], "am-2"), "d-1"),
    ).toBe(false);
  });

  it("a viewer may not", async () => {
    expect(await currentUserCanEditDriverRow(clientWithRoles(["viewer"]), "d-1")).toBe(false);
  });
});
