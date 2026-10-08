import { describe, it, expect } from "vitest";
import { taxOverrideFlag, taxOverrideFromSaved } from "./taxOverride";

describe("taxOverrideFromSaved", () => {
  it("is null — automatic — when the saved tax was not typed by hand, whatever amount is stored", () => {
    expect(taxOverrideFromSaved(false, 12345)).toBeNull();
    expect(taxOverrideFromSaved(false, 0)).toBeNull();
    expect(taxOverrideFromSaved(false, null)).toBeNull();
  });

  it("keeps the typed amount when the saved tax was overridden", () => {
    expect(taxOverrideFromSaved(true, 12345)).toBe(12345);
  });

  it("keeps a typed zero — 'no tax' is a real override", () => {
    expect(taxOverrideFromSaved(true, 0)).toBe(0);
  });

  it("is null when flagged but nothing was stored, so the page never shows an override with no amount", () => {
    expect(taxOverrideFromSaved(true, null)).toBeNull();
  });
});

describe("taxOverrideFlag", () => {
  it("is 1 whenever an override amount is set, including zero", () => {
    expect(taxOverrideFlag(5000)).toBe(1);
    expect(taxOverrideFlag(0)).toBe(1);
  });

  it("is 0 when the tax is automatic", () => {
    expect(taxOverrideFlag(null)).toBe(0);
  });
});
