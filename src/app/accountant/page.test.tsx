import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AccountsReceivableEvent,
  QuotesBookingsEvent,
} from "@/features/quotesAndBookings/types";
import type { InvoiceAttentionReason } from "@/features/quotesAndBookings/utils/invoiceAttention";

// The page is wired to Next routing, PowerSync and the office currencies.
// Those are stubbed; what is under test is what the Accountant page draws on each tab.
const {
  mockSearchParams,
  mockArData,
  mockFilterPanel,
  mockListData,
  mockAttention,
  mockAlerts,
  mockPermissions,
  mockListEvents,
} = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockArData: vi.fn(),
  mockFilterPanel: vi.fn(),
  mockListData: vi.fn(),
  mockAttention: vi.fn(),
  mockAlerts: vi.fn(),
  // zustand reads its initial state under a static server render, so the store is replaced rather
  // than set; the page's capabilities hook reads it through selectors.
  mockPermissions: {
    current: {
      roles: [] as string[],
      userId: "user-7",
      leadZoneIds: [] as string[],
      accountManagerZoneIds: [] as string[],
    },
  },
  // What the page's list holds (the Filter Panel and Show Deleted have already narrowed it).
  mockListEvents: { current: undefined as unknown[] | undefined },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/accountant",
  useSearchParams: () => mockSearchParams.current,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (state: typeof mockPermissions.current) => unknown) =>
    selector(mockPermissions.current),
}));
vi.mock("@/features/quotesAndBookings/hooks/useInvoiceAlerts", () => ({
  useInvoiceAlerts: () => mockAlerts(),
}));
vi.mock("@/features/quotesAndBookings/hooks/useQuotesAndBookingsData", () => ({
  useQuotesAndBookingsData: (...args: unknown[]) => {
    mockListData(...args);
    return { data: mockListEvents.current ?? [listEvent], isLoading: false, error: undefined };
  },
}));
vi.mock("@/features/quotesAndBookings/hooks/useOfficeCurrencies", () => ({
  useOfficeCurrencies: () => ({ currencyByOfficeId: new Map(), isLoading: false }),
}));
vi.mock("@/features/quotesAndBookings/hooks/useAccountsReceivableData", () => ({
  useAccountsReceivableData: (...args: unknown[]) => mockArData(...args),
}));
vi.mock("@/features/quotesAndBookings/hooks/useNeedAttentionData", () => ({
  useNeedAttentionData: () => mockAttention(),
}));
vi.mock("@/features/quotesAndBookings/components/FilterPanel", () => ({
  FilterPanel: (props: unknown) => {
    mockFilterPanel(props);
    return null;
  },
}));
// The Collections tab has its own tests; here only whether the page draws it.
vi.mock("@/features/accountantCollections/components/CollectionsTab", () => ({
  CollectionsTab: () => <div data-testid="collections-tab" />,
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
  quote_sent_at: null,
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

// The list event's invoice, flagged by the last check (docs/specs/qbo-invoice-10-need-attention-tab.md).
const attentionRow = {
  id: "evt-1",
  qbo_invoice_id: "inv-1",
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: '["dates","totals"]',
};

/** What `useInvoiceAlerts` answers: the events that need attention and their reasons. */
const alertsOf = (entries: [string, InvoiceAttentionReason[]][]) => ({
  reasonsByEvent: new Map(entries),
  count: entries.length,
});

/**
 * Signs in with these roles. The real `useInvoiceAlerts` answers for the role (its own test says how);
 * here it answers what it would: the alerts for an accountant, nothing for anyone else.
 */
const signInAs = (...roles: string[]) => {
  mockPermissions.current = { ...mockPermissions.current, roles };
  mockAlerts.mockReturnValue(
    alertsOf(roles.includes("accountant") ? [["evt-1", ["dates", "totals"]]] : []),
  );
};

beforeEach(() => {
  mockArData.mockReset();
  mockFilterPanel.mockReset();
  mockListData.mockReset();
  mockAttention.mockReset();
  mockListEvents.current = undefined;
  signInAs("admin");
  mockAttention.mockReturnValue({ data: [attentionRow], isLoading: false, error: undefined });
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

  it("has the Show Deleted switch on the AR tabs", () => {
    expect(renderAt("tab=ar")).toContain("Show Deleted");
  });

  it("carries no scorecard banner, even from a scorecard link", () => {
    expect(renderAt("template=revenue&timeRange=weekly")).not.toContain("Scorecard:");
  });
});

describe("/accountant tabs", () => {
  it("offers Collections, AR, AR Deposits and Need attention, in that order, and nothing else", () => {
    const html = renderAt("");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain(">Collections<");
    expect(html).toContain(">AR<");
    expect(html).toContain(">AR Deposits<");
    expect(html).toContain(">Need attention<");
    expect(html.indexOf(">Collections<")).toBeLessThan(html.indexOf(">AR<"));
    expect(html.indexOf(">AR<")).toBeLessThan(html.indexOf(">AR Deposits<"));
    expect(html.indexOf(">AR Deposits<")).toBeLessThan(html.indexOf(">Need attention<"));
    expect(html).not.toContain(">All Events<");
  });

  it("puts an info icon on every tab", () => {
    const html = renderAt("");
    expect(html).toContain('aria-label="About the AR tab"');
    expect(html).toContain('aria-label="About the AR Deposits tab"');
    expect(html).toContain('aria-label="About the Need attention tab"');
  });

  it("keeps the info icon inside the Need attention tab, where the AR tabs have theirs", () => {
    const html = renderAt("");
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*>Need attention<[^]*?aria-label="About the Need attention tab"[^]*?<\/button>/,
    );
  });

  it("opens AR from ?tab=ar", () => {
    expect(renderAt("tab=ar")).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>AR</);
  });

  it("opens Collections from ?tab=collections, and from a missing, unknown or old ?tab", () => {
    // docs/specs/accountant-collections-07-collections-list.md §6.
    for (const query of ["tab=collections", "", "tab=bogus", "tab=all"]) {
      expect(renderAt(query)).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Collections</);
    }
  });

  it("opens AR Deposits from ?tab=ar_deposits", () => {
    expect(renderAt("tab=ar_deposits")).toMatch(
      /role="tab"[^>]*aria-selected="true"[^>]*>AR Deposits</,
    );
  });

  it("opens Need attention from ?tab=need_attention, and only then", () => {
    expect(renderAt("tab=need_attention")).toMatch(
      /role="tab"[^>]*aria-selected="true"[^>]*>Need attention</,
    );
    expect(renderAt("")).not.toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Need attention</);
  });
});

// docs/specs/accountant-collections-09-design.md §1, §3 and §5 (S1).
describe("/accountant Collections tab", () => {
  it("draws the Collections body and none of the AR bodies", () => {
    const html = renderAt("tab=collections");
    expect(html).toContain('data-testid="collections-tab"');
    expect(html).not.toContain("Event Name (1)");
    expect(html).not.toContain("No invoice needs attention");
  });

  it("opens on Collections for a bare /accountant", () => {
    expect(renderAt("")).toContain('data-testid="collections-tab"');
  });

  it("hides the filter sidebar, the Filter button, the search box, Show Deleted and the chips", () => {
    const html = renderAt("tab=collections&q=acme&am=am-1&showDeleted=1");
    expect(mockFilterPanel).not.toHaveBeenCalled();
    expect(html).not.toContain("Search by name, invoice #");
    expect(html).not.toContain("Show Deleted");
    expect(html).not.toContain("Clear all filters");
    expect(html).not.toContain("Filter");
  });

  it("keeps the filter controls on the AR tabs", () => {
    for (const query of ["tab=ar", "tab=ar_deposits", "tab=need_attention"]) {
      mockFilterPanel.mockClear();
      const html = renderAt(query);
      expect(mockFilterPanel, query).toHaveBeenCalled();
      expect(html, query).toContain("Search by name, invoice #");
      expect(html, query).toContain("Show Deleted");
    }
  });

  it("does not draw the Collections body on the other tabs", () => {
    for (const query of ["tab=ar", "tab=ar_deposits", "tab=need_attention"]) {
      expect(renderAt(query), query).not.toContain('data-testid="collections-tab"');
    }
  });

  it("leaves the number on Need attention, whichever tab is open", () => {
    signInAs("accountant");
    expect(renderAt("tab=collections")).toContain("accountant-tab-count-need-attention");
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
    expect(renderAt("tab=ar&q=1%2C000")).toContain("Fall Classic");
    expect(renderAt("tab=ar&q=2000.00")).toContain("Fall Classic");
    expect(renderAt("tab=ar&q=9%2C999")).not.toContain("Fall Classic");
  });

  it("uses the search placeholder the AR tabs have always had", () => {
    expect(renderAt("tab=ar")).toContain(
      "Search by name, invoice #, manager, date, amount due, remaining balance, contact, company...",
    );
  });
});

// docs/specs/qbo-invoice-10-need-attention-tab.md §4 and §6.
describe("/accountant Need attention", () => {
  it("lists the quote whose invoice needs attention, with its columns and its reasons", () => {
    const html = renderAt("tab=need_attention");
    for (const header of [
      "Event Name (1)",
      "Account Manager",
      "Start Date",
      "Invoice #",
      "Reason",
    ]) {
      expect(html).toContain(header);
    }
    expect(html).toContain("Fall Classic");
    expect(html).toContain("#1042");
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Dates do not match, Totals do not match");
    expect(html).not.toContain("Amount Due");
    expect(html).not.toContain("Remaining Balance");
  });

  it("says No invoice needs attention when nothing does", () => {
    mockAttention.mockReturnValue({ data: [], isLoading: false, error: undefined });
    expect(renderAt("tab=need_attention")).toContain("No invoice needs attention");
  });

  it("does not list a quote whose flag is clear", () => {
    mockAttention.mockReturnValue({
      data: [{ ...attentionRow, qbo_invoice_mismatch: 0 }],
      isLoading: false,
      error: undefined,
    });
    expect(renderAt("tab=need_attention")).toContain("No invoice needs attention");
  });

  it("searches the list by name and by invoice number", () => {
    expect(renderAt("tab=need_attention&q=fall")).toContain("Fall Classic");
    expect(renderAt("tab=need_attention&q=%231042")).toContain("Fall Classic");
    expect(renderAt("tab=need_attention&q=zzz")).toContain("No invoice needs attention");
  });

  it("is built from the page's list, so Show Deleted adds the deleted quotes to it", () => {
    renderAt("tab=need_attention&showDeleted=1");
    expect(mockListData.mock.calls.at(-1)![1]).toBe(true);
  });

  it("leaves the AR tabs as they were: no Reason column there", () => {
    for (const query of ["tab=ar", "tab=ar_deposits"]) {
      const html = renderAt(query);
      expect(html).not.toContain("Reason");
      expect(html).not.toContain("Dates do not match");
    }
    expect(renderAt("tab=ar")).toContain("Amount Due ($1,000)");
  });

  it("still works out the receivables from one set of queries on this tab", () => {
    renderAt("tab=need_attention");
    expect(mockArData).toHaveBeenCalledTimes(1);
  });
});

describe("/accountant status filter", () => {
  it("does not offer Status on any tab", () => {
    renderAt("tab=ar");
    expect(lastFilterPanelProps().showStatus).toBe(false);
    renderAt("tab=ar_deposits");
    expect(lastFilterPanelProps().showStatus).toBe(false);
    renderAt("tab=need_attention");
    expect(lastFilterPanelProps().showStatus).toBe(false);
  });

  it("ignores a status in the URL", () => {
    renderAt("tab=ar&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
    renderAt("tab=all&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
    renderAt("tab=need_attention&statuses=quoted");
    expect(lastListFilters().statuses).toEqual([]);
  });
});

describe("/accountant applied filters", () => {
  it("shows nothing when no filter is applied", () => {
    expect(renderAt("")).not.toContain("Clear all filters");
  });

  it("lists each applied filter, including Deleted only from Show Deleted", () => {
    const html = renderAt("tab=ar&q=acme&am=am-1&office=office-1&showDeleted=1");
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

// docs/specs/qbo-invoice-11-counts-and-marks.md §4 (the Need attention label, marks), §6 (S2, S4, S5, S7, S8) and §8.
describe("/accountant Need attention count", () => {
  /** The number on the Need attention label, or null when the label carries none. */
  const countOnNeedAttention = (html: string): number | null => {
    const match = html.match(
      /data-testid="accountant-tab-count-need-attention"[^>]*>(\d+)<\/span>/,
    );
    return match ? Number(match[1]) : null;
  };

  beforeEach(() => {
    signInAs("accountant");
  });

  it("shows the number of quotes in the tab on the Need attention label", () => {
    expect(countOnNeedAttention(renderAt(""))).toBe(1);
  });

  it("counts several rows", () => {
    mockListEvents.current = [
      listEvent,
      { ...listEvent, id: "evt-2" },
      { ...listEvent, id: "evt-3" },
    ];
    mockAttention.mockReturnValue({
      data: [attentionRow, { ...attentionRow, id: "evt-3" }],
      isLoading: false,
      error: undefined,
    });

    expect(countOnNeedAttention(renderAt(""))).toBe(2);
  });

  it("puts no number on the AR and AR Deposits labels, though their rows need attention", () => {
    mockArData.mockReturnValue({
      data: { ar: [arRow], ar_deposits: [{ ...arRow, id: "evt-2" }] },
      isLoading: false,
      error: undefined,
    });
    mockAlerts.mockReturnValue(
      alertsOf([
        ["evt-1", ["dates"]],
        ["evt-2", ["totals"]],
      ]),
    );

    const html = renderAt("");

    expect(html).not.toContain("accountant-tab-count-ar");
    expect(countOnNeedAttention(html)).toBe(1);
  });

  it("gives the number an accessible name, in the sidebar's words", () => {
    expect(renderAt("")).toContain('aria-label="1 QuickBooks invoices need your attention"');
  });

  it("draws the number in red, after the label and before the info icon", () => {
    expect(renderAt("")).toMatch(
      /role="tab"[^>]*>Need attention<span[^>]*data-testid="accountant-tab-count-need-attention"[^>]*class="[^"]*bg-red-600[^"]*"[^>]*>1<\/span>[^]*?aria-label="About the Need attention tab"/,
    );
  });

  it("leaves the tab names as they were", () => {
    const html = renderAt("tab=ar");

    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>AR</);
    expect(renderAt("tab=need_attention")).toMatch(
      /role="tab"[^>]*aria-selected="true"[^>]*>Need attention</,
    );
  });

  it("shows nothing at 0", () => {
    mockAttention.mockReturnValue({ data: [], isLoading: false, error: undefined });

    expect(renderAt("")).not.toContain("accountant-tab-count-");
  });

  it("follows the page's list: a quote the Filter Panel left out is not counted", () => {
    mockListEvents.current = [];

    // The alerts still know evt-1 (the sidebar's count does, whatever the filters), but it is not on
    // the page, so the label does not count it.
    expect(mockAlerts().count).toBe(1);
    expect(renderAt("")).not.toContain("accountant-tab-count-");
  });

  it("does not count an event the page's list does not hold, though it needs attention", () => {
    mockAttention.mockReturnValue({
      data: [attentionRow, { ...attentionRow, id: "evt-other" }],
      isLoading: false,
      error: undefined,
    });

    expect(countOnNeedAttention(renderAt(""))).toBe(1);
  });

  it("does not follow the search box: the number stays while the table narrows", () => {
    const html = renderAt("tab=ar&q=zzz");

    expect(html).toContain("Nothing is due on past events");
    expect(countOnNeedAttention(html)).toBe(1);
  });

  it("is the number of rows the Need attention tab lists, a deleted quote shown by Show Deleted included", () => {
    const deleted = { ...listEvent, deleted: 1 };
    mockListEvents.current = [deleted];

    const html = renderAt("tab=need_attention&showDeleted=1");

    expect(html).toContain("Event Name (1)");
    expect(countOnNeedAttention(html)).toBe(1);
  });

  it("asks for the AR balances once, whichever tab opens, and never for the counts", () => {
    renderAt("");
    expect(mockArData).toHaveBeenCalledTimes(1);
    mockArData.mockClear();
    renderAt("tab=need_attention");
    expect(mockArData).toHaveBeenCalledTimes(1);
  });

  it("is shown to an admin who is also an accountant", () => {
    signInAs("admin", "accountant");

    expect(countOnNeedAttention(renderAt(""))).toBe(1);
  });

  it("is not shown to an admin who is not an accountant, though quotes need attention", () => {
    signInAs("admin");

    const html = renderAt("");

    expect(html).not.toContain("accountant-tab-count-");
    expect(html).not.toContain("QuickBooks invoices need your attention");
    // The Need attention tab itself is still theirs to open.
    expect(renderAt("tab=need_attention")).toContain("Dates do not match, Totals do not match");
  });
});

describe("/accountant row marks", () => {
  beforeEach(() => {
    signInAs("accountant");
  });

  it("marks the AR row of a quote that needs attention, with the short text of each reason", () => {
    const html = renderAt("tab=ar");

    expect(html).toContain('data-testid="invoice-attention-mark"');
    expect(html).toContain('title="Dates do not match, Totals do not match"');
    expect(html.indexOf("invoice-attention-mark")).toBeLessThan(
      html.indexOf('title="Fall Classic"'),
    );
  });

  it("marks the AR Deposits row too", () => {
    mockArData.mockReturnValue({
      data: { ar: [], ar_deposits: [arRow] },
      isLoading: false,
      error: undefined,
    });

    expect(renderAt("tab=ar_deposits")).toContain(
      'title="Dates do not match, Totals do not match"',
    );
  });

  it("marks no row of a quote that does not need attention", () => {
    mockAlerts.mockReturnValue(alertsOf([["evt-other", ["dates"]]]));

    expect(renderAt("tab=ar")).not.toContain("invoice-attention-mark");
  });

  it("does not mark the Need attention tab: it has the Reason column", () => {
    const html = renderAt("tab=need_attention");

    expect(html).not.toContain("invoice-attention-mark");
    expect(html).toContain("Dates do not match, Totals do not match");
  });

  it("marks nothing for an admin who is not an accountant", () => {
    signInAs("admin");

    expect(renderAt("tab=ar")).not.toContain("invoice-attention-mark");
  });

  it("leaves the AR rows and balances as they were", () => {
    const html = renderAt("tab=ar");

    expect(html).toContain("Amount Due ($1,000)");
    expect(html).toContain("Remaining Balance ($2,000)");
    expect(html).toContain("#1042");
    expect(html).toContain("Dana Whitfield");
  });
});
