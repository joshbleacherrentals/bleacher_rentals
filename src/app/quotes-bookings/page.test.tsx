import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AccountsReceivableEvent,
  QuotesBookingsEvent,
} from "@/features/quotesAndBookings/types";

// The page is wired to Next routing, PowerSync and the office currencies.
// Those are stubbed; what is under test is that the page is All Events only — no tab bar, and
// the AR balances are never asked for (they live on /accountant).
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

describe("/quotes-bookings is All Events only", () => {
  it("draws no tab bar", () => {
    const html = renderAt("");
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain(">AR<");
    expect(html).not.toContain(">AR Deposits<");
    expect(html).not.toContain("About the AR");
  });

  it("shows the list with its own columns and the search placeholder of All Events", () => {
    const html = renderAt("");
    expect(html).toContain("Fall Classic");
    expect(html).toContain("Subtotal");
    expect(html).not.toContain("Amount Due");
    expect(html).toContain(
      "Search by name, invoice #, manager, date, amount, address, contact, company...",
    );
  });

  it("never asks for AR balances", () => {
    renderAt("");
    renderAt("tab=ar");
    renderAt("tab=ar_deposits");
    expect(mockArData).not.toHaveBeenCalled();
  });

  it("opens All Events for an old ?tab=ar or ?tab=ar_deposits bookmark", () => {
    for (const query of ["tab=ar", "tab=ar_deposits", "tab=ar&q=Fall"]) {
      const html = renderAt(query);
      expect(html).toContain("Fall Classic");
      expect(html).toContain("Subtotal");
      expect(html).not.toContain("Amount Due");
    }
  });

  it("keeps Create Quote and the scorecard banner", () => {
    expect(renderAt("")).toContain("Create Quote");
    expect(renderAt("template=revenue&timeRange=weekly")).toContain("Scorecard: Revenue");
  });
});

describe("/quotes-bookings status filter", () => {
  it("always offers Status", () => {
    renderAt("");
    expect(lastFilterPanelProps().showStatus).toBe(true);
    renderAt("tab=ar");
    expect(lastFilterPanelProps().showStatus).toBe(true);
  });

  it("carries a status filter from the URL, whatever ?tab says", () => {
    renderAt("statuses=quoted");
    expect(lastListFilters().statuses).toEqual(["quoted"]);
    renderAt("tab=ar&statuses=quoted");
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
