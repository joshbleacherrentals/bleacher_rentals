import { describe, it, expect } from "vitest";
import {
  createUser,
  driverDocumentFields,
  driverPayFields,
  fetchUserById,
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
