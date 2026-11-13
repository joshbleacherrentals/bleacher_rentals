import { describe, expect, it } from "vitest";
import {
  auditStatusLabel,
  driverInitials,
  formatAddressLines,
  formatDriverDistance,
  formatDriverDriveTime,
  formatPayAmount,
  splitMileage,
} from "./auditFormat";

// docs/specs/accountant-audit-04-table.md §3 and §5 (R3, R5, R11).

const addr = (over: Partial<Record<string, string | null>> = {}) => ({
  street: "195226 Allen Street",
  city: "Springfield",
  stateProvince: "IL",
  zipPostal: "62701",
  ...over,
});

describe("formatAddressLines", () => {
  it("returns the street and `city, state zip` for a full address", () => {
    expect(formatAddressLines(addr())).toEqual({
      street: "195226 Allen Street",
      place: "Springfield, IL 62701",
    });
  });

  it("leaves the street empty when there is none", () => {
    expect(formatAddressLines(addr({ street: null }))).toEqual({
      street: "",
      place: "Springfield, IL 62701",
    });
  });

  it("drops a missing city without a stray comma", () => {
    expect(formatAddressLines(addr({ city: null }))).toEqual({
      street: "195226 Allen Street",
      place: "IL 62701",
    });
  });

  it("keeps a zip that has no state", () => {
    expect(formatAddressLines(addr({ stateProvince: null }))).toEqual({
      street: "195226 Allen Street",
      place: "Springfield, 62701",
    });
  });

  it("handles an address that is only a zip", () => {
    expect(
      formatAddressLines({ street: null, city: null, stateProvince: null, zipPostal: "62701" }),
    ).toEqual({ street: "", place: "62701" });
  });

  it("has an empty place when only the street is known", () => {
    expect(
      formatAddressLines({ street: "1 Main St", city: null, stateProvince: null, zipPostal: null }),
    ).toEqual({ street: "1 Main St", place: "" });
  });

  it("is null for a null address", () => {
    expect(formatAddressLines(null)).toBeNull();
  });

  it("is null when every part is null, empty or only spaces", () => {
    expect(
      formatAddressLines({ street: null, city: null, stateProvince: null, zipPostal: null }),
    ).toBeNull();
    expect(
      formatAddressLines({ street: "", city: "", stateProvince: "", zipPostal: "" }),
    ).toBeNull();
    expect(
      formatAddressLines({ street: "  ", city: " ", stateProvince: "  ", zipPostal: " " }),
    ).toBeNull();
  });

  it("trims the parts", () => {
    expect(
      formatAddressLines({
        street: " 1 Main St ",
        city: " Toronto ",
        stateProvince: " ON ",
        zipPostal: " M5V 2T6 ",
      }),
    ).toEqual({ street: "1 Main St", place: "Toronto, ON M5V 2T6" });
  });
});

describe("auditStatusLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["released", "Released"],
    ["accepted", "Accepted"],
    ["dest_pickup", "In Progress"],
    ["pickup_inspection", "In Progress"],
    ["dest_dropoff", "In Progress"],
    ["dropoff_inspection", "In Progress"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["declined", "Declined"],
    ["abandoned", "Abandoned"],
  ])("%s is %s", (status, label) => {
    expect(auditStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for a status it does not know (R11)", () => {
    expect(auditStatusLabel("on_hold")).toBe("on_hold");
  });
});

// docs/specs/accountant-audit-05-drivers-table.md R24, R25.

describe("formatDriverDriveTime", () => {
  it("is a dash for no time", () => {
    expect(formatDriverDriveTime(0)).toBe("—");
  });
  it("is minutes under an hour", () => {
    expect(formatDriverDriveTime(45)).toBe("45m");
  });
  it("is whole hours when the minutes are 0", () => {
    expect(formatDriverDriveTime(120)).toBe("2h");
    expect(formatDriverDriveTime(60)).toBe("1h");
  });
  it("is hours and minutes", () => {
    expect(formatDriverDriveTime(125)).toBe("2h 5m");
  });
});

describe("formatPayAmount (D17)", () => {
  it("writes the dollars, two decimals, thousands separators and the currency code", () => {
    expect(formatPayAmount(123400, "USD")).toBe("$1,234.00 USD");
    expect(formatPayAmount(56700, "CAD")).toBe("$567.00 CAD");
  });
  it("writes zero and cents", () => {
    expect(formatPayAmount(0, "USD")).toBe("$0.00 USD");
    expect(formatPayAmount(5, "CAD")).toBe("$0.05 CAD");
  });
  it("writes large amounts", () => {
    expect(formatPayAmount(123456789, "USD")).toBe("$1,234,567.89 USD");
  });
});

describe("formatDriverDistance (D16)", () => {
  it("writes kilometres first, then miles, with one decimal each", () => {
    expect(formatDriverDistance(27726000)).toBe("27726.0 km/17228.2 mi");
    expect(formatDriverDistance(34400)).toBe("34.4 km/21.4 mi");
  });
  it("writes zero", () => {
    expect(formatDriverDistance(0)).toBe("0.0 km/0.0 mi");
  });
  it("rounds to one decimal", () => {
    expect(formatDriverDistance(1234)).toBe("1.2 km/0.8 mi");
  });
});

describe("driverInitials", () => {
  it("takes the first letter of the first and the last word, in capitals", () => {
    expect(driverInitials("Matt Pilcher")).toBe("MP");
    expect(driverInitials("anna maria de la cruz")).toBe("AC");
  });
  it("gives one letter for a one-word name", () => {
    expect(driverInitials("Ann")).toBe("A");
  });
  it("ignores extra spaces", () => {
    expect(driverInitials("  Ann   Lee ")).toBe("AL");
  });
  it("gives a question mark when there is no name", () => {
    expect(driverInitials("")).toBe("?");
    expect(driverInitials("   ")).toBe("?");
  });
});

describe("splitMileage", () => {
  it("splits '21.4 mi (34.4 km)' into the miles and the bracketed kilometres", () => {
    expect(splitMileage("21.4 mi (34.4 km)")).toEqual({ miles: "21.4 mi", km: "(34.4 km)" });
  });
  it("returns null for text that does not have that shape, so the caller prints it whole", () => {
    expect(splitMileage("21.4 mi")).toBeNull();
    expect(splitMileage("")).toBeNull();
  });
});
