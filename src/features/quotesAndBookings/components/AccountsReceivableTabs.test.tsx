import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "@/components/ui/tabs";
import type { AccountsReceivableEvent } from "../types";
import type { InvoiceAttentionReason } from "../utils/invoiceAttention";
import type { EventSort } from "../utils/sortEvents";

// Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §4 (the AR tabs draw the marks they are
// handed), §8 and §6 S8. The table is the real one; what is under test is that the rows, balances and
// sorting are exactly what the AR tabs always drew.

const mocks = vi.hoisted(() => ({ hook: vi.fn() }));

vi.mock("../hooks/useAccountsReceivableData", () => ({
  useAccountsReceivableData: (...args: unknown[]) => mocks.hook(...args),
}));

import { AccountsReceivableTabs } from "./AccountsReceivableTabs";

const row = (id: string, over: Partial<AccountsReceivableEvent> = {}): AccountsReceivableEvent => ({
  id,
  event_name: `Event ${id}`,
  event_start: "2026-09-20",
  event_end: null,
  event_status: "booked",
  contract_revenue_cents: null,
  tax_amount_cents: null,
  tax_percent: null,
  created_at: "2026-08-01T00:00:00Z",
  booked_at: null,
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
  amount_due_cents: 100000,
  remaining_balance_cents: 200000,
  ...over,
});

type Props = React.ComponentProps<typeof AccountsReceivableTabs>;
type Receivables = {
  data: { ar: AccountsReceivableEvent[]; ar_deposits: AccountsReceivableEvent[] } | undefined;
  isLoading: boolean;
  error: Error | undefined;
};

const STARTING_SORT: EventSort = { key: "start_date", direction: "asc" };

function draw(
  tab: "ar" | "ar_deposits",
  { receivables, ...over }: Partial<Props> & { receivables?: Receivables } = {},
) {
  mocks.hook.mockReturnValue(
    receivables ?? {
      data: { ar: [row("a")], ar_deposits: [row("d", { amount_due_cents: 0 })] },
      isLoading: false,
      error: undefined,
    },
  );
  const props: Props = {
    events: [],
    eventsLoading: false,
    attention: new Map(),
    searchQuery: "",
    sort: STARTING_SORT,
    onSort: vi.fn(),
    page: 1,
    pageSize: 25,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    currencyOf: () => "USD",
    onRowClick: vi.fn(),
    ...over,
  };
  const html = renderToStaticMarkup(
    <Tabs value={tab}>
      <AccountsReceivableTabs {...props} />
    </Tabs>,
  );
  return { html, props };
}

/** The text of the row names, in the order the table lists them. */
const namesIn = (html: string) => [...html.matchAll(/title="(Event [^"]+)"/g)].map((m) => m[1]);

describe("AccountsReceivableTabs", () => {
  beforeEach(() => {
    mocks.hook.mockReset();
  });

  it("works the balances out once, from the page's list, for both tabs", () => {
    const events = [row("a")];
    const currencyOf = () => "USD" as const;

    draw("ar", { events, currencyOf });

    expect(mocks.hook).toHaveBeenCalledTimes(1);
    expect(mocks.hook).toHaveBeenCalledWith(events, currencyOf);
  });

  it("draws the AR tab's rows with the columns and balances it always had", () => {
    const { html } = draw("ar");

    for (const header of [
      "Event Name (1)",
      "Account Manager",
      "Start Date",
      "Invoice #",
      "Amount Due ($1,000)",
      "Remaining Balance ($2,000)",
    ]) {
      expect(html).toContain(header);
    }
    expect(html).toContain("Event a");
    expect(html).toContain("#1042");
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("$1,000");
    expect(html).toContain("$2,000");
    expect(html).not.toContain("Event d");
  });

  it("draws the AR Deposits tab's own rows", () => {
    const { html } = draw("ar_deposits");

    expect(html).toContain("Event d");
    expect(html).not.toContain("Event a");
  });

  it("sorts as before: by the page's sort, ascending and descending", () => {
    const receivables = {
      data: {
        ar: [
          row("a", { amount_due_cents: 100000 }),
          row("b", { amount_due_cents: 300000 }),
          row("c", { amount_due_cents: 200000 }),
        ],
        ar_deposits: [],
      },
      isLoading: false,
      error: undefined,
    };

    const asc = draw("ar", { receivables, sort: { key: "amount_due", direction: "asc" } });
    const desc = draw("ar", { receivables, sort: { key: "amount_due", direction: "desc" } });

    expect(namesIn(asc.html)).toEqual(["Event a", "Event c", "Event b"]);
    expect(namesIn(desc.html)).toEqual(["Event b", "Event c", "Event a"]);
  });

  it("searches the balances, as before", () => {
    const { html } = draw("ar", { searchQuery: "9,999" });

    expect(html).not.toContain("Event a");
    expect(html).toContain("Nothing is due on past events");
  });

  it("pages client-side, as before", () => {
    const rows = Array.from({ length: 26 }, (_, i) => row(`r${String(i).padStart(2, "0")}`));
    const receivables = { data: { ar: rows, ar_deposits: [] }, isLoading: false, error: undefined };

    expect(namesIn(draw("ar", { receivables }).html)).toHaveLength(25);
    expect(namesIn(draw("ar", { receivables, page: 2 }).html)).toHaveLength(1);
  });

  it("says what each tab says when it is empty", () => {
    const empty = {
      data: { ar: [], ar_deposits: [] },
      isLoading: false,
      error: undefined,
    };

    expect(draw("ar", { receivables: empty }).html).toContain("Nothing is due on past events");
    expect(draw("ar_deposits", { receivables: empty }).html).toContain("No deposits are due");
  });

  it("says it is loading while the page's list or the balances are", () => {
    const loading = { data: undefined, isLoading: true, error: undefined };

    expect(draw("ar", { receivables: loading }).html).toContain("Loading balances...");
    expect(draw("ar", { eventsLoading: true }).html, "the page's list is still loading").toContain(
      "Loading balances...",
    );
  });

  it("shows the error of the balances instead of the table", () => {
    const failed = { data: undefined, isLoading: false, error: new Error("boom") };

    const { html } = draw("ar", { receivables: failed });

    expect(html).toContain("Error loading balances: boom");
    expect(html).not.toContain("Event Name");
  });

  describe("the marks", () => {
    const attention = new Map<string, InvoiceAttentionReason[]>([
      ["a", ["dates", "totals"]],
      ["z", ["amount"]],
    ]);

    it("puts the red dot on the row of an event that needs attention, with its reasons", () => {
      const receivables = {
        data: { ar: [row("a"), row("b")], ar_deposits: [] },
        isLoading: false,
        error: undefined,
      };

      const { html } = draw("ar", { receivables, attention });

      expect(html.match(/data-testid="invoice-attention-mark"/g)).toHaveLength(1);
      expect(html).toContain('title="Dates do not match, Totals do not match"');
      expect(html.indexOf("invoice-attention-mark")).toBeLessThan(html.indexOf('title="Event a"'));
      expect(html.indexOf("invoice-attention-mark")).toBeLessThan(html.indexOf('title="Event b"'));
    });

    it("marks the AR Deposits rows too", () => {
      const receivables = {
        data: { ar: [], ar_deposits: [row("a")] },
        isLoading: false,
        error: undefined,
      };

      expect(draw("ar_deposits", { receivables, attention }).html).toContain(
        "invoice-attention-mark",
      );
    });

    it("draws no mark when nothing needs attention", () => {
      expect(draw("ar").html).not.toContain("invoice-attention-mark");
    });
  });
});
