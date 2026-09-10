import { describe, it, expect } from "vitest";
import { createUser, driverDocumentFields, driverPayFields } from "./userOperations";
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
