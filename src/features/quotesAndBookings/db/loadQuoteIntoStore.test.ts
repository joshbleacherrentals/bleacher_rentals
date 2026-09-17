import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteDetail } from "./fetchQuoteDetail";

const fetchQuoteDetailMock = vi.fn<(eventId: string) => Promise<QuoteDetail | null>>();

vi.mock("./fetchQuoteDetail", () => ({
  fetchQuoteDetail: (eventId: string) => fetchQuoteDetailMock(eventId),
}));
vi.mock("./fetchLineItems", () => ({ fetchLineItemsForEvent: vi.fn().mockResolvedValue([]) }));
vi.mock("./paymentInstallments", () => ({
  fetchPaymentInstallments: vi.fn().mockResolvedValue([]),
}));

import { loadQuoteIntoStore } from "./loadQuoteIntoStore";
import { useCreateQuoteStore } from "../state/useCreateQuoteStore";

function makeQuoteDetail(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "event-1",
    invoiceNumber: 1001,
    eventName: "Homecoming",
    eventStatus: "quoted",
    lostReason: null,
    lostReasonNote: null,
    eventStart: "2026-01-01",
    eventEnd: "2026-01-02",
    setupStart: null,
    teardownEnd: null,
    notes: null,
    internalNotes: null,
    externalNotes: null,
    pickupInstructions: null,
    dropoffInstructions: null,
    contractRevenueCents: null,
    eventTypeUuid: null,
    quoteValidTill: null,
    salesOfficeUuid: null,
    termsAndConditionsUuid: null,
    taxPercent: null,
    taxAmountCents: null,
    bookedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    // Left null so the AccountManager lookup (a real PowerSync query) is
    // never reached — this test only exercises the plain field mapping.
    createdByUserUuid: null,
    address: { street: "123 Main St", city: "Springfield", stateProvince: "IL", zipPostal: null },
    venue: null,
    contact: null,
    financeContact: null,
    accountManager: null,
    deleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchQuoteDetailMock.mockReset();
  useCreateQuoteStore.getState().resetForm();
});

describe("loadQuoteIntoStore", () => {
  it("loads a linked venue's id and name into the store", async () => {
    fetchQuoteDetailMock.mockResolvedValue(
      makeQuoteDetail({ venue: { id: "venue-1", name: "Lincoln High School Stadium" } }),
    );

    await loadQuoteIntoStore("event-1");

    const state = useCreateQuoteStore.getState();
    expect(state.venueId).toBe("venue-1");
    expect(state.venueName).toBe("Lincoln High School Stadium");
  });

  it("leaves venueId null for a quote with no venue (manual/empty address)", async () => {
    fetchQuoteDetailMock.mockResolvedValue(makeQuoteDetail({ venue: null }));

    await loadQuoteIntoStore("event-1");

    expect(useCreateQuoteStore.getState().venueId).toBeNull();
  });
});
