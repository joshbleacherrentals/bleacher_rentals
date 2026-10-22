import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Spec: docs/specs/quote-detail-02-contract-signature.md §7 (test 2).
//
// The Signed banner used to come from an HTTP call made once in an effect, which no test could
// see. It now follows `useContractSignature`, so what the tab draws for each answer of that hook
// can be checked. Everything around the tab is replaced.

const mocks = vi.hoisted(() => ({
  signature: null as { signerName: string; signedAt: string } | null,
  calls: [] as Array<[string, boolean]>,
}));

vi.mock("../../../hooks/useContractSignature", () => ({
  useContractSignature: (eventId: string, hasTerms: boolean) => {
    mocks.calls.push([eventId, hasTerms]);
    return { signature: mocks.signature, isLoading: false };
  },
}));
vi.mock("../../../hooks/useEventLineItems", () => ({
  useEventLineItems: () => ({ lineItems: [], isLoading: false }),
}));
vi.mock("../../../hooks/useEventCurrency", () => ({ useEventCurrency: () => "USD" }));
vi.mock("../../../hooks/useEventTypeName", () => ({
  useEventTypeName: () => ({ name: "Wedding", isLoading: false }),
}));
vi.mock("./ContactHistorySheet", () => ({ ContactHistorySheet: () => null }));
vi.mock("./VenueHistorySheet", () => ({ VenueHistorySheet: () => null }));
vi.mock("@/components/VenueCard", () => ({ VenueCard: () => null }));
vi.mock("../../LineItemDescription", () => ({ LineItemDescription: () => null }));

import { ContractTab } from "./ContractTab";

type Quote = Parameters<typeof ContractTab>[0]["quote"];

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "ev-1",
    invoiceNumber: 1042,
    eventName: "Spring Gala",
    eventStatus: "booked",
    lostReason: null,
    lostReasonNote: null,
    eventStart: "2026-05-01",
    eventEnd: "2026-05-03",
    setupStart: null,
    teardownEnd: null,
    notes: null,
    internalNotes: null,
    externalNotes: null,
    pickupInstructions: null,
    dropoffInstructions: null,
    contractRevenueCents: 0,
    eventTypeUuid: "type-1",
    quoteValidTill: null,
    salesOfficeUuid: "office-1",
    termsAndConditionsUuid: "terms-1",
    taxPercent: 0,
    taxAmountCents: 0,
    isTaxOverridden: false,
    bookedAt: null,
    createdAt: "2026-03-01T10:00:00Z",
    createdByUserUuid: "user-1",
    address: null,
    venue: null,
    contact: null,
    financeContact: null,
    accountManager: null,
    deleted: false,
    ...over,
  };
}

const render = (q: Quote) => renderToStaticMarkup(<ContractTab quote={q} />);

beforeEach(() => {
  mocks.signature = null;
  mocks.calls = [];
});

describe("ContractTab: the Signed banner", () => {
  it("shows who signed, from the signature the hook gives", () => {
    mocks.signature = { signerName: "Dana Whitfield", signedAt: "2026-05-01T14:30:00Z" };
    const html = render(quote());
    expect(html).toContain("Signed:");
    expect(html).toContain("by Dana Whitfield");
  });

  it("shows no banner when there is no signature", () => {
    mocks.signature = null;
    expect(render(quote())).not.toContain("Signed:");
  });

  it("calls a booked event an invoice, whatever the signature, and any other a quote", () => {
    mocks.signature = null;
    expect(render(quote({ eventStatus: "booked" }))).toContain("Invoice #:");

    mocks.signature = { signerName: "Dana Whitfield", signedAt: "2026-05-01T14:30:00Z" };
    expect(render(quote({ eventStatus: "quoted" }))).toContain("Quote #:");
    expect(render(quote({ eventStatus: "unsigned_changes" }))).toContain("Quote #:");
    expect(render(quote({ eventStatus: "draft" }))).toContain("Quote #:");
  });

  it("asks for the signature of its own quote", () => {
    render(quote({ id: "ev-9" }));
    expect(mocks.calls[0][0]).toBe("ev-9");
  });

  it("tells the hook whether the quote has terms", () => {
    render(quote({ termsAndConditionsUuid: "terms-1" }));
    render(quote({ termsAndConditionsUuid: null }));
    expect(mocks.calls.map(([, hasTerms]) => hasTerms)).toEqual([true, false]);
  });

  it("does not call the contracts route itself any more", () => {
    // A server render never runs effects, so a render cannot show a one-time fetch. The source can.
    const source = readFileSync(join(__dirname, "ContractTab.tsx"), "utf8");
    expect(source).not.toMatch(/api\/contracts/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).toMatch(/useContractSignature\(/);
  });
});
