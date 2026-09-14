import { describe, it, expect } from "vitest";
import {
  formatLostReason,
  LOST_REASON_OPTIONS,
  lostReasonLabel,
  normalizeLostFields,
  validateLostReason,
  type LostReason,
} from "./lostReason";

describe("LOST_REASON_OPTIONS", () => {
  it("offers exactly the five reasons the business asked for, in order", () => {
    expect(LOST_REASON_OPTIONS.map((o) => o.value)).toEqual([
      "out_of_service_area",
      "sold_out",
      "size_does_not_work",
      "price_too_high",
      "other",
    ]);
  });

  it("labels every option for humans", () => {
    expect(LOST_REASON_OPTIONS.map((o) => o.label)).toEqual([
      "Out of service area",
      "Sold out",
      "Size doesn't work (indoor)",
      "Price too high",
      "Other",
    ]);
  });
});

describe("lostReasonLabel", () => {
  it("maps every stored enum value to its label", () => {
    for (const option of LOST_REASON_OPTIONS) {
      expect(lostReasonLabel(option.value)).toBe(option.label);
    }
  });

  it("returns null for a missing or unknown value", () => {
    expect(lostReasonLabel(null)).toBeNull();
    expect(lostReasonLabel(undefined)).toBeNull();
    expect(lostReasonLabel("")).toBeNull();
    expect(lostReasonLabel("went_with_a_competitor")).toBeNull();
  });
});

describe("validateLostReason", () => {
  it("allows saving a non-lost quote with no reason", () => {
    for (const status of ["draft", "quoted", "booked"]) {
      expect(validateLostReason({ status, lostReason: null, lostReasonNote: "" })).toEqual([]);
    }
  });

  it("allows saving a non-lost quote that still holds a stale reason", () => {
    expect(
      validateLostReason({
        status: "quoted",
        lostReason: "price_too_high",
        lostReasonNote: "too pricey",
      }),
    ).toEqual([]);
  });

  it("blocks a lost quote with no reason, naming the field", () => {
    const errors = validateLostReason({ status: "lost", lostReason: null, lostReasonNote: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Lost Reason");
  });

  it("allows a lost quote with a concrete reason", () => {
    expect(
      validateLostReason({ status: "lost", lostReason: "price_too_high", lostReasonNote: "" }),
    ).toEqual([]);
  });

  it("blocks 'Other' without a note", () => {
    const errors = validateLostReason({ status: "lost", lostReason: "other", lostReasonNote: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("note");
  });

  it("blocks 'Other' with a whitespace-only note", () => {
    expect(
      validateLostReason({ status: "lost", lostReason: "other", lostReasonNote: "   " }),
    ).toHaveLength(1);
  });

  it("allows 'Other' with a real note", () => {
    expect(
      validateLostReason({
        status: "lost",
        lostReason: "other",
        lostReasonNote: "went with a competitor",
      }),
    ).toEqual([]);
  });
});

describe("normalizeLostFields", () => {
  it("writes nothing for a quote that is not lost", () => {
    expect(normalizeLostFields({ status: "booked", lostReason: null, lostReasonNote: "" })).toEqual(
      { lost_reason: null, lost_reason_note: null },
    );
  });

  it("drops a stale reason left over from a status flip", () => {
    expect(
      normalizeLostFields({
        status: "quoted",
        lostReason: "sold_out",
        lostReasonNote: "sold out in May",
      }),
    ).toEqual({ lost_reason: null, lost_reason_note: null });
  });

  it("keeps the reason and drops the note for a concrete reason", () => {
    expect(
      normalizeLostFields({
        status: "lost",
        lostReason: "out_of_service_area",
        lostReasonNote: "typed then changed my mind",
      }),
    ).toEqual({ lost_reason: "out_of_service_area", lost_reason_note: null });
  });

  it("keeps a trimmed note for 'Other'", () => {
    expect(
      normalizeLostFields({
        status: "lost",
        lostReason: "other",
        lostReasonNote: "  went with a competitor  ",
      }),
    ).toEqual({ lost_reason: "other", lost_reason_note: "went with a competitor" });
  });

  it("never writes an empty-string note", () => {
    expect(
      normalizeLostFields({ status: "lost", lostReason: "other", lostReasonNote: "   " }),
    ).toEqual({ lost_reason: "other", lost_reason_note: null });
  });

  it("accepts a lost quote with no reason yet (legacy rows) without inventing one", () => {
    const reason: LostReason | null = null;
    expect(normalizeLostFields({ status: "lost", lostReason: reason, lostReasonNote: "" })).toEqual(
      { lost_reason: null, lost_reason_note: null },
    );
  });
});

describe("formatLostReason", () => {
  it("reads as the label for a concrete reason", () => {
    expect(formatLostReason("price_too_high", null)).toBe("Price too high");
    expect(formatLostReason("sold_out", "ignored leftover note")).toBe("Sold out");
  });

  it("spells out the note behind 'Other'", () => {
    expect(formatLostReason("other", "went with a competitor")).toBe(
      "Other: went with a competitor",
    );
  });

  it("says 'Other' alone when the note is missing", () => {
    expect(formatLostReason("other", null)).toBe("Other");
    expect(formatLostReason("other", "   ")).toBe("Other");
  });

  it("says a reason was never recorded rather than showing nothing", () => {
    expect(formatLostReason(null, null)).toBe("Not recorded");
    expect(formatLostReason("went_with_a_competitor", null)).toBe("Not recorded");
  });
});
