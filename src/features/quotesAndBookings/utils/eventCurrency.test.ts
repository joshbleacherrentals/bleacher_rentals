import { describe, it, expect } from "vitest";
import {
  pickEventCurrency,
  sumByCurrency,
  formatTotalsLabel,
  formatTotalsAmounts,
} from "./eventCurrency";
import type { Currency } from "../types/quoteTypes";

const OFFICES = new Map<string, Currency>([
  ["office-us", "USD"],
  ["office-ca", "CAD"],
]);

describe("pickEventCurrency", () => {
  it("takes the currency of the office the event belongs to", () => {
    expect(pickEventCurrency("office-ca", OFFICES)).toBe("CAD");
    expect(pickEventCurrency("office-us", OFFICES)).toBe("USD");
  });

  it("falls back to USD for an event with no office", () => {
    expect(pickEventCurrency(null, OFFICES)).toBe("USD");
    expect(pickEventCurrency(undefined, OFFICES)).toBe("USD");
  });

  it("falls back to USD while the office currencies are still loading", () => {
    expect(pickEventCurrency("office-ca", new Map())).toBe("USD");
  });
});

type Row = { officeId: string | null; cents: number };
const cents = (r: Row) => r.cents;
const currency = (r: Row) => pickEventCurrency(r.officeId, OFFICES);

describe("sumByCurrency", () => {
  it("keeps each currency's money apart instead of adding them up", () => {
    const rows: Row[] = [
      { officeId: "office-us", cents: 100000 },
      { officeId: "office-ca", cents: 50000 },
      { officeId: "office-us", cents: 20000 },
    ];
    expect(sumByCurrency(rows, cents, currency)).toEqual([
      { currency: "USD", cents: 120000 },
      { currency: "CAD", cents: 50000 },
    ]);
  });

  it("lists only the currencies actually present, USD first", () => {
    const rows: Row[] = [{ officeId: "office-ca", cents: 50000 }];
    expect(sumByCurrency(rows, cents, currency)).toEqual([{ currency: "CAD", cents: 50000 }]);
  });

  it("reports a single zero total for an empty list", () => {
    expect(sumByCurrency([], cents, currency)).toEqual([{ currency: "USD", cents: 0 }]);
  });
});

describe("formatTotalsLabel", () => {
  it("marks a Canadian column total", () => {
    expect(formatTotalsLabel("Subtotal", [{ currency: "CAD", cents: 4550000 }])).toBe(
      "Subtotal (C$45,500)",
    );
  });

  it("shows mixed currencies side by side rather than a meaningless sum", () => {
    expect(
      formatTotalsLabel("Subtotal", [
        { currency: "USD", cents: 12000000 },
        { currency: "CAD", cents: 4500000 },
      ]),
    ).toBe("Subtotal ($120,000 + C$45,000)");
  });
});

describe("formatTotalsAmounts", () => {
  it("is the amounts of a header total without the label or the brackets", () => {
    expect(
      formatTotalsAmounts([
        { currency: "USD", cents: 12000000 },
        { currency: "CAD", cents: 4500000 },
      ]),
    ).toBe("$120,000 + C$45,000");
  });

  it("rounds to whole dollars, as the header always showed", () => {
    expect(formatTotalsAmounts([{ currency: "USD", cents: 123456 }])).toBe("$1,235");
  });
});
