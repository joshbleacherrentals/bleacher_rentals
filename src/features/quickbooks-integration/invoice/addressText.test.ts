import { describe, expect, it } from "vitest";
import { addressText, appearsIn, normalizeAddressText, regionForms } from "./addressText";

// The invoice check reads the ship-to address as text: when someone presses Save in QuickBooks it
// keeps the street in Line1 and moves the city, province and postal code into free-text lines, so
// the separate City / State / ZIP fields come back empty.

describe("normalizeAddressText", () => {
  it.each([
    ["case", "Norwich ON", "norwich on"],
    ["commas and periods", "Norwich, ON.", "norwich on"],
    ["runs of spaces", "  1   Main   St ", "1 main st"],
    ["accents", "Québec", "quebec"],
    ["a hyphen", "29631-1234", "29631 1234"],
    ["nothing", "", ""],
  ])("%s", (_label, input, expected) => {
    expect(normalizeAddressText(input)).toBe(expected);
  });
});

describe("appearsIn", () => {
  const parts = ["145 Pacific Avenue", "Winnipeg MB R3B 2Z6", "Canada"];

  it("finds a word run anywhere in the parts, without regard to case or punctuation", () => {
    expect(appearsIn("winnipeg", parts)).toBe(true);
    expect(appearsIn("145 Pacific Avenue", parts)).toBe(true);
    expect(appearsIn("Winnipeg, MB", parts)).toBe(true);
  });

  it("finds a run that is only part of one line (a unit after the street)", () => {
    expect(appearsIn("1 Main St", ["1 Main St, Suite 5"])).toBe(true);
  });

  it("matches whole words only", () => {
    expect(appearsIn("1 Main St", ["11 Main St"])).toBe(false);
    expect(appearsIn("Ann", ["Annapolis"])).toBe(false);
    expect(appearsIn("ON", ["Boston"])).toBe(false);
  });

  it("reads the parts as one text, in order", () => {
    expect(appearsIn("main st", ["1 main", "st"])).toBe(true);
    expect(appearsIn("st main", ["1 main", "st"])).toBe(false);
  });

  it("an empty value is nothing to look for, so it is always found", () => {
    expect(appearsIn("", parts)).toBe(true);
    expect(appearsIn("  ", [])).toBe(true);
  });

  it("is false when the parts are empty", () => {
    expect(appearsIn("Winnipeg", [])).toBe(false);
    expect(appearsIn("Winnipeg", ["", "  "])).toBe(false);
  });
});

describe("appearsIn — a postal code", () => {
  it("ignores the space in a Canadian code", () => {
    expect(appearsIn("N0J 1P0", ["Norwich ON N0J1P0"], { compact: true })).toBe(true);
    expect(appearsIn("N0J1P0", ["Norwich ON N0J 1P0"], { compact: true })).toBe(true);
  });

  it("finds a ZIP that QuickBooks wrote with the +4", () => {
    expect(appearsIn("29631", ["Clemson SC 29631-1234"], { compact: true })).toBe(true);
  });

  it("is false for another code", () => {
    expect(appearsIn("29631", ["Clemson SC 29632"], { compact: true })).toBe(false);
    expect(appearsIn("N0J 1P0", ["Norwich ON N0J 1P1"], { compact: true })).toBe(false);
  });
});

describe("regionForms", () => {
  it.each([
    ["Ontario", ["ON"]],
    ["ON", ["Ontario"]],
    ["on", ["Ontario"]],
    ["Manitoba", ["MB"]],
    ["South Carolina", ["SC"]],
    ["SC", ["South Carolina"]],
    ["Québec", ["QC"]],
    ["QC", ["Quebec"]],
  ])("%s also reads as %j", (value, others) => {
    expect(regionForms(value)).toEqual(expect.arrayContaining([value, ...others]));
  });

  it("a name it does not know is only itself", () => {
    expect(regionForms("Narnia")).toEqual(["Narnia"]);
  });

  it("an empty value has no form", () => {
    expect(regionForms("  ")).toEqual([]);
  });
});

describe("addressText", () => {
  it("is the distinct, non-empty parts on one line", () => {
    expect(addressText(["1 Main St", "", "Clemson SC 29631", "1 Main St", "  "])).toBe(
      "1 Main St, Clemson SC 29631",
    );
  });

  it("is empty when there is nothing", () => {
    expect(addressText(["", " "])).toBe("");
  });
});
