import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AccountsReceivableEvent,
  QuotesBookingsEvent,
} from "@/features/quotesAndBookings/types";

// The page is wired to Next routing, PowerSync and the office currencies.
// Those are stubbed; what is under test is what the Accountant page draws on each tab.
const { mockSearchParams, mockArData, mockFilterPanel, mockListData } = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockArData: vi.fn(),
  mockFilterPanel: vi.fn(),
  mockListData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/accountant",
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

import AccountantPage from "./page";

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
  return renderToStaticMarkup(<AccountantPage />);
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

describe("/accountant", () => {
  it("is titled Accountant, with no subtitle and no Create Quote", () => {
    const html = renderAt("");
    expect(html).toContain(">Accountant<");
    expect(html).not.toContain("click a column header to sort");
    expect(html).not.toContain("Create Quote");
  });

  it("has the Show Deleted switch", () => {
    expect(renderAt("")).toContain("Show Deleted");
  });

  it("carries no scorecard banner, even from a scorecard link", () => {
    expect(renderAt("template=revenue&timeRange=weekly")).not.toContain("Scorecard:");
  });
});

describe("/accountant tabs", () => {
  it("offers AR and AR Deposits and nothing else", () => {
    const html = renderAt("");
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain(">AR<");
    expect(html).toContain(">AR Deposits<");
    expect(html).not.toContain(">All Events<");
  });

  it("puts an info icon on both tabs", () => {
    const html = renderAt("");
    expect(html).toContain('aria-label="About the AR tab"');
    expect(html).toContain('aria-label="About the AR Deposits tab"');
  });

  it("opens AR when ?tab is missing, unknown, or the old All Events", () => {
    for (const query of ["", "tab=bogus", "tab=all"]) {
      expect(renderAt(query)).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>AR</);
    }
  });

  it("opens AR Deposits from ?tab=ar_deposits", () => {
    expect(renderAt("tab=ar_deposits")).toMatch(
      /role="tab"[^>]*aria-selected="true"[^>]*>AR Deposits</,
    );
  });
});

describe("/accountant receivables", () => {
  it("shows the AR columns and no Subtotal or Tax", () => {
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

  it("puts an info icon on Amount Due and Remaining Balance, and both still sort", () => {
    const html = renderAt("tab=ar");
    expect(html).toContain('aria-label="About Amount Due"');
    expect(html).toContain('aria-label="About Remaining Balance"');
    expect(html).toMatch(/<button[^>]*>[^<]*Amount Due \(\$1,000\)/);
    expect(html).toMatch(/<button[^>]*>[^<]*Remaining Balance \(\$2,000\)/);
  });

  it("works out both tabs from one set of queries, on whichever tab opens", () => {
    renderAt("tab=ar_deposits");
    expect(mockArData).toHaveBeenCalledTimes(1);
    mockArData.mockClear();
    renderAt("");
    expect(mockArData).toHaveBeenCalledTimes(1);
  });

  it("searches AR balances", () => {
    expect(renderAt("q=1%2C000")).toContain("Fall Classic");
    expect(renderAt("q=2000.00")).toContain("Fall Classic");
    expect(renderAt("q=9%2C999")).not.toContain("Fall Classic");
  });

  it("uses the search placeholder the AR tabs have always had", () => {
    expect(renderAt("")).toContain(
      "Search by name, invoice #, manager, date, amount due, remaining balance, contact, company...",
    );
  });
});

describe("/accountant status filter", () => {
  it("does not offer Status on either tab", () => {
    renderAt("tab=ar");
    expect(lastFilterPanelProps().showStatus).toBe(false);
    renderAt("tab=ar_deposits");
    expect(lastFilterPanelProps().showStatus).toBe(false);
  });

  it("ignores a status in the URL", () => {
    renderAt("tab=ar&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
    renderAt("tab=all&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
  });
});

describe("/accountant applied filters", () => {
  it("shows nothing when no filter is applied", () => {
    expect(renderAt("")).not.toContain("Clear all filters");
  });

  it("lists each applied filter, including Deleted only from Show Deleted", () => {
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

  it("builds the AR tabs from deleted events when Show Deleted is on", () => {
    renderAt("showDeleted=1");
    expect(mockListData.mock.calls.at(-1)![1]).toBe(true);
  });
});
