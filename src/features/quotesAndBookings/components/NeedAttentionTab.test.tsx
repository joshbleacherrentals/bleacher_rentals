import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "@/components/ui/tabs";
import type { QuotesBookingsEvent } from "../types";
import type { NeedAttentionRow } from "../utils/needAttentionRows";
import type { EventSort } from "../utils/sortEvents";

// Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §4 (the tab), §6 (S2, S3, S5, S6, S8) and §8.
// The component is rendered on the server with the local query replaced: what is under test is which
// events the tab lists, what it writes in each column, and how it hands the table its sort and its
// clicks. The table is the real DataTable, wrapped only to see the props it was given.

const mocks = vi.hoisted(() => ({
  attention: {
    data: [] as NeedAttentionRow[] | undefined,
    isLoading: false,
    error: undefined as Error | undefined,
  },
  table: undefined as
    | {
        data: unknown[] | null;
        onRowClick?: (row: unknown) => void;
        onSort?: (key: string) => void;
      }
    | undefined,
}));

vi.mock("../hooks/useNeedAttentionData", () => ({
  useNeedAttentionData: () => mocks.attention,
}));
vi.mock("@/components/DataTable", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/DataTable")>("@/components/DataTable");
  return {
    ...actual,
    DataTable: (props: Parameters<typeof actual.DataTable>[0]) => {
      mocks.table = props as typeof mocks.table;
      return actual.DataTable(props);
    },
  };
});

import { NeedAttentionTab } from "./NeedAttentionTab";

const event = (id: string, over: Partial<QuotesBookingsEvent> = {}): QuotesBookingsEvent => ({
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
  ...over,
});

const flagged = (id: string, reasons: string | null = '["dates"]'): NeedAttentionRow => ({
  id,
  qbo_invoice_id: `inv-${id}`,
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: reasons,
});

const STARTING_SORT: EventSort = { key: "start_date", direction: "desc" };

type Props = Partial<React.ComponentProps<typeof NeedAttentionTab>>;

function draw(over: Props = {}) {
  const props: React.ComponentProps<typeof NeedAttentionTab> = {
    events: [event("a")],
    eventsLoading: false,
    searchQuery: "",
    sort: STARTING_SORT,
    onSort: vi.fn(),
    page: 1,
    pageSize: 25,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onRowClick: vi.fn(),
    ...over,
  };
  const html = renderToStaticMarkup(
    <Tabs value="need_attention">
      <NeedAttentionTab {...props} />
    </Tabs>,
  );
  return { html, props };
}

/** The text of the row names, in the order the table lists them. */
const namesIn = (html: string) => [...html.matchAll(/title="(Event [^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  mocks.attention = { data: [flagged("a")], isLoading: false, error: undefined };
  mocks.table = undefined;
});

describe("NeedAttentionTab columns", () => {
  it("has the first four columns of the AR tabs and Reason, and no money column", () => {
    const { html } = draw();

    for (const header of [
      "Event Name (1)",
      "Account Manager",
      "Start Date",
      "Invoice #",
      "Reason",
    ]) {
      expect(html).toContain(header);
    }
    for (const money of ["Amount Due", "Remaining Balance", "Subtotal", "Tax"]) {
      expect(html).not.toContain(money);
    }
    expect(html).toContain("Event a");
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Sep 20, 2026");
    expect(html).toContain("#1042");
  });

  it("puts the row count in the header of the first column, as the AR tabs do", () => {
    mocks.attention.data = [flagged("a"), flagged("b"), flagged("c")];
    const { html } = draw({ events: [event("a"), event("b"), event("c"), event("quiet")] });

    expect(html).toContain("Event Name (3)");
  });

  it("lets the first four columns sort and leaves Reason without a sort", () => {
    const { html } = draw();

    for (const header of ["Event Name (1)", "Account Manager", "Start Date", "Invoice #"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*>${header.replace(/[()]/g, "\\$&")}`));
    }
    expect(html).not.toMatch(/<button[^>]*>Reason/);
  });

  it("marks the active sort on its column", () => {
    const { html } = draw();

    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>(?:(?!<\/th>).)*Start Date/);
  });
});

describe("NeedAttentionTab reasons", () => {
  it("S2: writes the short text of one reason", () => {
    expect(draw().html).toContain("Dates do not match");
  });

  it("S2: writes every reason of the row, comma-separated, in spec 06's order", () => {
    mocks.attention.data = [flagged("a", '["totals","dates"]')];

    expect(draw().html).toContain("Dates do not match, Totals do not match");
  });

  it("S2: a set flag with no reasons reads Invoice does not match the quote", () => {
    mocks.attention.data = [flagged("a", null)];

    expect(draw().html).toContain("Invoice does not match the quote");
  });
});

describe("NeedAttentionTab rows", () => {
  it("S3: lists only the events that need attention", () => {
    mocks.attention.data = [flagged("a")];
    const { html } = draw({ events: [event("a"), event("quiet")] });

    expect(html).toContain("Event a");
    expect(html).not.toContain("Event quiet");
  });

  it("S3: lists nothing for a flag that is clear or an event with no invoice", () => {
    mocks.attention.data = [
      { ...flagged("a"), qbo_invoice_mismatch: 0 },
      { ...flagged("b"), qbo_invoice_id: null },
    ];
    const { html } = draw({ events: [event("a"), event("b")] });

    expect(html).toContain("No invoice needs attention");
  });

  it("S4: lists a quote whatever its status", () => {
    mocks.attention.data = [flagged("a"), flagged("b")];
    const { html } = draw({
      events: [event("a", { event_status: "lost" }), event("b", { event_status: "quoted" })],
    });

    expect(html).toContain("Event a");
    expect(html).toContain("Event b");
  });

  it("does not list an event the page does not hold (filtered out, or deleted without Show Deleted)", () => {
    mocks.attention.data = [flagged("a"), flagged("gone")];
    const { html } = draw({ events: [event("a")] });

    expect(html).toContain("Event a");
    expect(html).not.toContain("Event gone");
  });

  it("S5: lists the newest event first on the tab's starting sort", () => {
    mocks.attention.data = [flagged("old"), flagged("new"), flagged("mid")];
    const { html } = draw({
      events: [
        event("old", { event_start: "2026-01-10" }),
        event("new", { event_start: "2026-12-10" }),
        event("mid", { event_start: "2026-06-10" }),
      ],
    });

    expect(namesIn(html)).toEqual(["Event new", "Event mid", "Event old"]);
  });

  it("S5: follows the sort it is given", () => {
    mocks.attention.data = [flagged("b"), flagged("a"), flagged("c")];
    const events = [
      event("b", { invoice_number: 20 }),
      event("a", { invoice_number: 30 }),
      event("c", { invoice_number: 10 }),
    ];

    expect(namesIn(draw({ events, sort: { key: "event_name", direction: "asc" } }).html)).toEqual([
      "Event a",
      "Event b",
      "Event c",
    ]);
    expect(
      namesIn(draw({ events, sort: { key: "invoice_number", direction: "asc" } }).html),
    ).toEqual(["Event c", "Event b", "Event a"]);
    expect(
      namesIn(draw({ events, sort: { key: "invoice_number", direction: "desc" } }).html),
    ).toEqual(["Event a", "Event b", "Event c"]);
  });

  it("S5: a header click hands the sort key to the page", () => {
    const { props } = draw();

    mocks.table?.onSort?.("account_manager");

    expect(props.onSort).toHaveBeenCalledWith("account_manager");
  });

  it("S7: a click on a row hands that event to the page", () => {
    const { props } = draw({ events: [event("a", { event_name: "Fall Classic" })] });

    const [firstRow] = mocks.table?.data ?? [];
    mocks.table?.onRowClick?.(firstRow);

    expect(props.onRowClick).toHaveBeenCalledTimes(1);
    expect(props.onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", event_name: "Fall Classic" }),
    );
  });
});

describe("NeedAttentionTab search", () => {
  const events = [
    event("a", { event_name: "Fall Classic", invoice_number: 1042 }),
    event("b", { event_name: "Spring Rally", invoice_number: 2077 }),
  ];

  beforeEach(() => {
    mocks.attention.data = [flagged("a"), flagged("b")];
  });

  it("S6: narrows by event name", () => {
    const { html } = draw({ events, searchQuery: "spring" });

    expect(html).toContain("Spring Rally");
    expect(html).not.toContain("Fall Classic");
    expect(html).toContain("Event Name (1)");
  });

  it("S6: narrows by invoice number", () => {
    const { html } = draw({ events, searchQuery: "#2077" });

    expect(html).toContain("Spring Rally");
    expect(html).not.toContain("Fall Classic");
  });

  it("S6: a search that matches nothing reads as an empty list", () => {
    expect(draw({ events, searchQuery: "zzz" }).html).toContain("No invoice needs attention");
  });
});

describe("NeedAttentionTab paging", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    event(`e${String(i).padStart(2, "0")}`, {
      event_start: `2026-09-${String(i + 1).padStart(2, "0")}`,
    }),
  );

  beforeEach(() => {
    mocks.attention.data = many.map((e) => flagged(e.id));
  });

  it("draws one page of rows and counts them all in the header", () => {
    const { html } = draw({ events: many, pageSize: 25 });

    expect(html).toContain("Event Name (30)");
    expect(namesIn(html)).toHaveLength(25);
  });

  it("draws the second page when asked", () => {
    const { html } = draw({ events: many, pageSize: 25, page: 2 });

    expect(namesIn(html)).toHaveLength(5);
  });

  it("clamps a page that no longer exists to the last one", () => {
    const { html } = draw({ events: many, pageSize: 25, page: 9 });

    expect(namesIn(html)).toHaveLength(5);
  });

  it("draws the pager only when there are rows", () => {
    expect(draw({ events: many }).html).toContain("Rows per page");

    mocks.attention.data = [];
    expect(draw({ events: many }).html).not.toContain("Rows per page");
  });
});

describe("NeedAttentionTab states", () => {
  it("S8: says No invoice needs attention when nothing does", () => {
    mocks.attention.data = [];

    expect(draw().html).toContain("No invoice needs attention");
  });

  it("says Loading while the page's events are loading", () => {
    const { html } = draw({ events: undefined, eventsLoading: true });

    expect(html).toContain("Loading");
    expect(html).not.toContain("No invoice needs attention");
  });

  it("says Loading while the attention data is loading", () => {
    mocks.attention = { data: undefined, isLoading: true, error: undefined };

    const { html } = draw();

    expect(html).toContain("Loading");
    expect(html).not.toContain("No invoice needs attention");
  });

  it("shows the error of the local query instead of an empty list", () => {
    mocks.attention = { data: undefined, isLoading: false, error: new Error("disk full") };

    const { html } = draw();

    expect(html).toContain("disk full");
    expect(html).not.toContain("No invoice needs attention");
  });
});
