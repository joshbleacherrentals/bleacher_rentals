import { describe, expect, it } from "vitest";
import {
  INVOICE_REASONS,
  INVOICE_REASON_SHORT_TEXT,
} from "@/features/quickbooks-integration/invoice/invoiceTypes";
import { INVOICE_REASON_TEXT, invoiceAttentionReasons } from "./invoiceAttention";

// Spec: docs/specs/qbo-invoice-09-banner.md §3 (the rule) and §8. The rule is pure: it is given what
// the local database gives (an id, a flag as 0/1/true/false/null, the stored reasons text) and says
// which reasons an accountant is shown.

const base = { qboInvoiceId: "inv-1", mismatch: 1, reasons: null as string | null };

describe("invoiceAttentionReasons", () => {
  describe("no invoice, or no flag: no reasons", () => {
    it("a quote with no invoice id has none, even with a set flag and stored reasons", () => {
      expect(
        invoiceAttentionReasons({ qboInvoiceId: null, mismatch: 1, reasons: '["dates"]' }),
      ).toEqual([]);
      expect(
        invoiceAttentionReasons({ qboInvoiceId: "", mismatch: 1, reasons: '["dates"]' }),
      ).toEqual([]);
    });

    it("a quote with no invoice id and a set flag but no reasons has none either", () => {
      expect(
        invoiceAttentionReasons({ qboInvoiceId: null, mismatch: true, reasons: null }),
      ).toEqual([]);
    });

    it.each([0, false, null])(
      "a flag that is %s has none, even with stored reasons",
      (mismatch) => {
        expect(
          invoiceAttentionReasons({ ...base, mismatch, reasons: '["dates","totals"]' }),
        ).toEqual([]);
      },
    );
  });

  describe("the flag, as the local database gives it", () => {
    it.each([1, true])("a flag that is %s counts as set", (mismatch) => {
      expect(invoiceAttentionReasons({ ...base, mismatch, reasons: '["dates"]' })).toEqual([
        "dates",
      ]);
    });
  });

  describe("a set flag: the reasons that are stored", () => {
    it("returns a single stored reason", () => {
      expect(invoiceAttentionReasons({ ...base, reasons: '["dates"]' })).toEqual(["dates"]);
    });

    it("returns the stored reasons in spec 06's order, not the stored order", () => {
      expect(invoiceAttentionReasons({ ...base, reasons: '["totals","dates"]' })).toEqual([
        "dates",
        "totals",
      ]);
      expect(
        invoiceAttentionReasons({
          ...base,
          reasons: JSON.stringify([...INVOICE_REASONS].reverse()),
        }),
      ).toEqual([...INVOICE_REASONS]);
    });

    it("returns each reason once", () => {
      expect(invoiceAttentionReasons({ ...base, reasons: '["dates","totals","dates"]' })).toEqual([
        "dates",
        "totals",
      ]);
    });

    it("drops a code this version does not know and keeps the known ones", () => {
      expect(
        invoiceAttentionReasons({ ...base, reasons: '["dates","shipping","totals"]' }),
      ).toEqual(["dates", "totals"]);
    });

    it("drops entries that are not text", () => {
      expect(invoiceAttentionReasons({ ...base, reasons: '["dates",3,null,{"a":1}]' })).toEqual([
        "dates",
      ]);
    });
  });

  describe("a set flag with nothing usable: unspecified", () => {
    it.each([
      ["null", null],
      ["an empty text", ""],
      ["text that is not JSON", "not json"],
      ["a JSON object", "{}"],
      ["a JSON string", '"dates"'],
      ["an empty array", "[]"],
      ["an array of codes this version does not know", '["shipping","weather"]'],
      ["an array of things that are not text", "[1,2]"],
    ])("%s gives unspecified", (_name, reasons) => {
      expect(invoiceAttentionReasons({ ...base, reasons })).toEqual(["unspecified"]);
    });

    it("the same holds for a flag that is true", () => {
      expect(invoiceAttentionReasons({ ...base, mismatch: true, reasons: "not json" })).toEqual([
        "unspecified",
      ]);
    });

    it("unspecified is never mixed with real reasons", () => {
      expect(invoiceAttentionReasons({ ...base, reasons: '["unspecified","dates"]' })).toEqual([
        "dates",
      ]);
    });
  });
});

describe("INVOICE_REASON_TEXT", () => {
  const ALL = [...INVOICE_REASONS, "unspecified"] as const;

  it("has a short and a long text for every reason, unspecified included", () => {
    for (const reason of ALL) {
      expect(INVOICE_REASON_TEXT[reason].short, reason).toBeTruthy();
      expect(INVOICE_REASON_TEXT[reason].long, reason).toBeTruthy();
    }
    expect(Object.keys(INVOICE_REASON_TEXT).sort()).toEqual([...ALL].sort());
  });

  it("the short texts are spec 06's: one place, so no surface words a reason differently", () => {
    for (const reason of INVOICE_REASONS) {
      expect(INVOICE_REASON_TEXT[reason].short, reason).toBe(INVOICE_REASON_SHORT_TEXT[reason]);
    }
  });

  it("the short text of unspecified", () => {
    expect(INVOICE_REASON_TEXT.unspecified.short).toBe("Invoice does not match the quote");
  });

  // The banner's own words, §4.
  it.each([
    ["number", "The invoice number in QuickBooks is not this quote's invoice number."],
    ["dates", "The invoice date or the due date in QuickBooks does not match this quote."],
    [
      "customer",
      "The customer or the Bill to name in QuickBooks does not match this quote's client.",
    ],
    ["address", "The Location of Sale in QuickBooks does not match this quote's venue address."],
    ["memo", "The memo on the QuickBooks invoice does not match this quote's title."],
    ["lines", "The QuickBooks invoice does not have exactly one line."],
    [
      "service",
      "The service (event type) or its description on the QuickBooks invoice does not match this quote.",
    ],
    ["amount", "The amount on the QuickBooks invoice does not match this quote."],
    ["tax_code", "The tax code on the QuickBooks invoice is not the one set for this quote."],
    ["class", "The Class on the QuickBooks invoice does not match this quote's zone."],
    ["totals", "QuickBooks' total or tax does not match this quote's."],
    ["unspecified", "The QuickBooks invoice does not match this quote."],
  ] as const)("the long text of %s", (reason, long) => {
    expect(INVOICE_REASON_TEXT[reason].long).toBe(long);
  });
});
