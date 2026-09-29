import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AccountsReceivableEvent,
  QuotesBookingsEvent,
} from "@/features/quotesAndBookings/types";

// The page is wired to Next routing, PowerSync and the office currencies.
// Those are stubbed; what is under test is which tab draws what, and that the
// AR balances are never asked for while "All Events" is open.
const { mockSearchParams, mockArData, mockFilterPanel, mockListData } = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockArData: vi.fn(),
  mockFilterPanel: vi.fn(),
  mockListData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/quotes-bookings",
  useSearchParams: () => mockSearchParams.current,
}));
vi.mock("@/features/quotesAndBookings/hooks/useQuotesAndBookingsData", () => ({
  useQuotesAndBookingsData: (...args: unknown[]) => {
    mockListData(...args);
    return { data: [listEvent], isLoading: false, error: undefined };
  },
}));
vi.mock("@/features/quotesAndBookings/hooks/useOfficeCurrencies", () => ({
  useOfficeCurrencies: () => ({ currencyByOfficeId: new Map(), isLoading: false }),
}));
vi.mock("@/features/quotesAndBookings/hooks/useAccountsReceivableData", () => ({
  useAccountsReceivableData: (...args: unknown[]) => mockArData(...args),
}));
vi.mock("@/features/quotesAndBookings/components/FilterPanel", () => ({
  FilterPanel: (props: unknown) => {
    mockFilterPanel(props);
    return null;
  },
}));
vi.mock("@/features/quotesAndBookings/hooks/useUserNames", () => ({
  useUserNames: () => new Map([["am-1", "Dana Whitfield"]]),
}));
vi.mock("@/features/quotesAndBookings/hooks/useSalesOfficeNames", () => ({
  useSalesOfficeNames: () => new Map([["office-1", "Bleacher Rentals Florida LLC"]]),
}));

import QuotesBookingsPage from "./page";

const listEvent: QuotesBookingsEvent = {
  id: "evt-1",
  event_name: "Fall Classic",
  event_start: "2026-09-20",
  event_end: null,
  event_status: "booked",
  contract_revenue_cents: 452000,
  tax_amount_cents: 52000,
  tax_percent: 13,
  created_at: "2026-08-01T00:00:00Z",
  booked_at: "2026-08-02T00:00:00Z",
  created_by_user_uuid: null,
  goodshuffle_url: null,
  is_qbo: null,
  sales_office_uuid: null,
  deleted: 0,
  invoice_number: 1042,
  account_manager_first_name: "Dana",
  account_manager_last_name: "Whitfield",
  account_manager_email: null,
  address_street: null,
  address_city: null,
  address_state: null,
  contact_first_name: null,
  contact_last_name: null,
  contact_email: null,
  company_name: null,
};

const arRow: AccountsReceivableEvent = {
  ...listEvent,
  amount_due_cents: 100000,
  remaining_balance_cents: 200000,
};

function renderAt(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(<QuotesBookingsPage />);
}

beforeEach(() => {
  mockArData.mockReset();
  mockFilterPanel.mockReset();
  mockListData.mockReset();
  mockArData.mockReturnValue({
    data: { ar: [arRow], ar_deposits: [] },
    isLoading: false,
    error: undefined,
  });
});

const lastFilterPanelProps = () => mockFilterPanel.mock.calls.at(-1)![0] as { showStatus: boolean };
const lastListFilters = () => mockListData.mock.calls.at(-1)![0] as { statuses: string[] };

describe("/quotes-bookings tabs", () => {
  it("offers All Events, AR and AR Deposits", () => {
    const html = renderAt("");
    expect(html).toContain(">All Events<");
    expect(html).toContain(">AR<");
    expect(html).toContain(">AR Deposits<");
  });

  it("does not compute AR balances while All Events is open", () => {
    const html = renderAt("");
    expect(mockArData).not.toHaveBeenCalled();
    expect(html).toContain("Subtotal");
    expect(html).not.toContain("Amount Due");
  });

  it("shows the AR columns in place of Subtotal and Tax on the AR tab", () => {
    const html = renderAt("tab=ar");
    expect(mockArData).toHaveBeenCalledWith([listEvent], expect.any(Function));
    for (const header of ["Event Name (1)", "Account Manager", "Start Date", "Invoice #"]) {
      expect(html).toContain(header);
    }
    expect(html).toContain("Amount Due ($1,000)");
    expect(html).toContain("Remaining Balance ($2,000)");
    expect(html).not.toContain("Subtotal");
    expect(html).toContain("#1042");
    expect(html).toContain("Dana Whitfield");
  });

  it("works out both AR tabs from one set of queries", () => {
    renderAt("tab=ar_deposits");
    expect(mockArData).toHaveBeenCalledTimes(1);
  });

  it("searches AR balances on the AR tabs", () => {
    expect(renderAt("tab=ar&q=1%2C000")).toContain("Fall Classic");
    expect(renderAt("tab=ar&q=2000.00")).toContain("Fall Classic");
    expect(renderAt("tab=ar&q=9%2C999")).not.toContain("Fall Classic");
  });
});

describe("/quotes-bookings status filter", () => {
  it("offers Status on All Events", () => {
    renderAt("");
    expect(lastFilterPanelProps().showStatus).toBe(true);
  });

  it("hides Status on the AR tabs", () => {
    renderAt("tab=ar");
    expect(lastFilterPanelProps().showStatus).toBe(false);
    renderAt("tab=ar_deposits");
    expect(lastFilterPanelProps().showStatus).toBe(false);
  });

  it("does not carry a status filter from the URL into an AR tab", () => {
    renderAt("tab=ar&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
    renderAt("statuses=quoted");
    expect(lastListFilters().statuses).toEqual(["quoted"]);
  });
});

describe("/quotes-bookings applied filters", () => {
  it("shows nothing when no filter is applied", () => {
    const html = renderAt("");
    expect(html).not.toContain("Clear all filters");
  });

  it("lists each applied filter with its own remove button, plus Clear all", () => {
    const html = renderAt("q=acme&am=am-1&office=office-1&showDeleted=1");
    for (const label of [
      "Search: “acme”",
      "Account Manager: Dana Whitfield",
      "Sales Office: Bleacher Rentals Florida LLC",
      "Deleted only",
    ]) {
      expect(html).toContain(label);
      expect(html).toContain(`aria-label="Remove filter: ${label}"`);
    }
    expect(html).toContain("Clear all filters");
  });
});
