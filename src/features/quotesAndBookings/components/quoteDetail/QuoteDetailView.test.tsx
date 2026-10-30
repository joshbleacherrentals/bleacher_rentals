import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Spec: docs/specs/quote-detail-01-reactive-quote.md §7 (test 4).
//
// The page used to load its quote in an effect, which no test could see (QuoteActionBar.test.tsx
// says so). It now reads `useQuoteDetail`, so what the page draws for each state of that hook can
// be checked. Everything around the page is replaced; the tabs are bare markers.

const mocks = vi.hoisted(() => ({
  state: { quote: null, isLoading: true, error: null } as {
    quote: unknown;
    isLoading: boolean;
    error: Error | null;
  },
  submission: null as unknown,
  can: {} as Record<string, boolean>,
}));

vi.mock("../../hooks/useQuoteDetail", () => ({ useQuoteDetail: () => mocks.state }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/quotes-bookings/ev-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({ useClerkSupabaseClient: () => ({}) }));
vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => ({ data: [], isLoading: false, isFetching: false }),
}));
vi.mock("../../hooks/useEventLineItems", () => ({ useEventLineItems: () => ({ lineItems: [] }) }));
vi.mock("../../hooks/useLeadSubmission", () => ({
  useLeadSubmission: () => ({ sections: mocks.submission, isLoading: false }),
}));
vi.mock("../../hooks/useEventCurrency", () => ({ useEventCurrency: () => "USD" }));
vi.mock("../../hooks/useGoBackOrTo", () => ({ useGoBackOrTo: () => vi.fn() }));
vi.mock("../../hooks/useQuotesBookingsCapabilities", () => ({
  useQuotesBookingsCapabilities: () => mocks.can,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: () => ({ userId: "user-1" }),
}));
vi.mock("@/features/eventConfiguration/state/useCurrentEventStore", () => ({
  useCurrentEventStore: () => undefined,
}));
vi.mock("@/features/eventConfiguration/functions/loadEventForModal", () => ({
  loadEventForModal: vi.fn(),
}));
vi.mock("@/features/userAccess/logic/getAmRoleForZone", () => ({ getAmRoleForZone: vi.fn() }));
vi.mock("../../db/softDeleteEvent", () => ({ softDeleteEvent: vi.fn() }));
vi.mock("../../db/logQuoteSentLocal", () => ({ logQuoteSentLocal: vi.fn() }));
vi.mock("@/components/toasts/SuccessToast", () => ({ createSuccessToast: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));
vi.mock("../sendQuote/SendQuoteDialog", () => ({ SendQuoteDialog: () => null }));
vi.mock("./QuoteActionBar", () => ({ QuoteActionBar: () => null }));
// The banner has its own test (InvoiceAttentionBanner.test.tsx); here only whether the view draws it.
vi.mock("./invoice/InvoiceAttentionBanner", () => ({
  InvoiceAttentionBanner: ({ eventId }: { eventId: string }) => (
    <div data-banner="invoice-attention" data-event={eventId} />
  ),
}));
vi.mock("./tabs/ContractTab", () => ({ ContractTab: () => <div data-tab="contract" /> }));
vi.mock("./tabs/BillingTab", () => ({ BillingTab: () => <div data-tab="billing" /> }));
vi.mock("./tabs/FilesTab", () => ({ FilesTab: () => <div data-tab="files" /> }));
vi.mock("./tabs/LogTab", () => ({ LogTab: () => <div data-tab="log" /> }));
vi.mock("./tabs/MessagesTab", () => ({ MessagesTab: () => <div data-tab="messages" /> }));

import { QuoteDetailView } from "./QuoteDetailView";

function quote(over: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    eventName: "Spring Gala",
    deleted: false,
    taxAmountCents: 0,
    createdByUserUuid: "user-1",
    contact: { id: "c1", firstName: "Dana", lastName: "Whitfield", email: null, phone: null },
    financeContact: null,
    ...over,
  };
}

const render = () => renderToStaticMarkup(<QuoteDetailView eventId="ev-1" />);

beforeEach(() => {
  mocks.can = {};
  mocks.submission = null;
  mocks.state = { quote: null, isLoading: true, error: null };
});

describe("QuoteDetailView", () => {
  it("shows the loading message while the quote is loading", () => {
    mocks.state = { quote: null, isLoading: true, error: null };
    expect(render()).toContain("Loading quote...");
  });

  it("says the quote was not found, with a way back, when there is none", () => {
    mocks.state = { quote: null, isLoading: false, error: null };
    const html = render();
    expect(html).toContain("Quote not found");
    expect(html).toContain("Back to Quotes &amp; Bookings");
  });

  it("says not found when a query failed", () => {
    mocks.state = { quote: null, isLoading: false, error: new Error("boom") };
    expect(render()).toContain("Quote not found");
  });

  it("draws the event name and quote number as the heading, and the Contract tab", () => {
    mocks.state = { quote: quote({ invoiceNumber: 1042 }), isLoading: false, error: null };
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Spring Gala \(#1042\)<\/h1>/);
    expect(html).toContain('data-tab="contract"');
    expect(html).not.toContain("Loading quote...");
  });

  it("has a Submission tab only for a quote made from the website form", () => {
    mocks.state = { quote: quote(), isLoading: false, error: null };
    expect(render()).not.toContain("Submission");

    mocks.submission = [{ title: "Contact", rows: [] }];
    expect(render()).toContain("Submission");
  });

  it("draws the event name alone when the quote has no number yet", () => {
    mocks.state = { quote: quote({ invoiceNumber: null }), isLoading: false, error: null };
    expect(render()).toMatch(/<h1[^>]*>Spring Gala<\/h1>/);
  });

  it("draws whatever title the hook holds: a renamed quote shows its new name", () => {
    mocks.state = { quote: quote({ eventName: "Spring Gala" }), isLoading: false, error: null };
    expect(render()).toContain("Spring Gala");

    mocks.state = { quote: quote({ eventName: "Autumn Gala" }), isLoading: false, error: null };
    const html = render();
    expect(html).toContain("Autumn Gala");
    expect(html).not.toContain("Spring Gala");
  });

  it("shows the deleted banner for a deleted quote", () => {
    mocks.state = { quote: quote({ deleted: true }), isLoading: false, error: null };
    expect(render()).toContain("This quote was deleted");
  });

  // docs/specs/qbo-invoice-09-banner.md §4: the banner is drawn above the tab bar, only when the user
  // may see the invoice alerts and the quote is not deleted.
  describe("the QuickBooks invoice banner", () => {
    const BANNER = 'data-banner="invoice-attention"';

    it("is drawn for a user who may see the invoice alerts, for the quote on the card", () => {
      mocks.can = { seeInvoiceAlerts: true };
      mocks.state = { quote: quote(), isLoading: false, error: null };
      const html = render();

      expect(html).toContain(BANNER);
      expect(html).toContain('data-event="ev-1"');
    });

    it("is drawn above the header and the tab bar", () => {
      mocks.can = { seeInvoiceAlerts: true };
      mocks.state = { quote: quote(), isLoading: false, error: null };
      const html = render();

      expect(html.indexOf(BANNER)).toBeGreaterThanOrEqual(0);
      expect(html.indexOf(BANNER)).toBeLessThan(html.indexOf("<h1"));
      expect(html.indexOf(BANNER)).toBeLessThan(html.indexOf('role="tablist"'));
    });

    it("S5: is not drawn for a user who may not see the invoice alerts (an admin alone)", () => {
      mocks.can = { seeInvoiceAlerts: false, manageQuickBooksInvoice: true };
      mocks.state = { quote: quote(), isLoading: false, error: null };

      expect(render()).not.toContain(BANNER);
    });

    it("is not drawn when the capability is absent", () => {
      mocks.can = {};
      mocks.state = { quote: quote(), isLoading: false, error: null };

      expect(render()).not.toContain(BANNER);
    });

    it("S7: is not drawn on a deleted quote, which keeps its own notice", () => {
      mocks.can = { seeInvoiceAlerts: true };
      mocks.state = { quote: quote({ deleted: true }), isLoading: false, error: null };
      const html = render();

      expect(html).not.toContain(BANNER);
      expect(html).toContain("This quote was deleted");
    });

    it("is not drawn while the quote is loading or when there is none", () => {
      mocks.can = { seeInvoiceAlerts: true };
      mocks.state = { quote: null, isLoading: true, error: null };
      expect(render()).not.toContain(BANNER);

      mocks.state = { quote: null, isLoading: false, error: null };
      expect(render()).not.toContain(BANNER);
    });
  });

  it("does not read the quote once itself: that is the hook's job now", () => {
    // A server render never runs effects, so a render cannot show a one-time read. The source can.
    const source = readFileSync(join(__dirname, "QuoteDetailView.tsx"), "utf8");
    expect(source).not.toMatch(/fetchQuoteDetail/);
    expect(source).toMatch(/useQuoteDetail\(eventId\)/);
  });
});
