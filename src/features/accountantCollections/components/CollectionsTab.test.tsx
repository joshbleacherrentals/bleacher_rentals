import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionsAmountType } from "../utils/collectionsListState";
import type { CollectionsRow } from "../utils/collectionsRows";

const { mockSearchParams, mockData, mockReplace, buttonProps } = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockData: vi.fn(),
  mockReplace: vi.fn(),
  buttonProps: {
    current: null as null | {
      type: CollectionsAmountType;
      onChange: (next: CollectionsAmountType) => void;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => "/accountant",
  useSearchParams: () => mockSearchParams.current,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../hooks/useCollectionsData", () => ({ useCollectionsData: () => mockData() }));
// The real button, wrapped to keep the props the tab gave it, so that a click can be played.
vi.mock("./AmountTypeButton", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./AmountTypeButton")>();
  return {
    ...actual,
    AmountTypeButton: (props: Parameters<typeof actual.AmountTypeButton>[0]) => {
      buttonProps.current = props;
      return actual.AmountTypeButton(props);
    },
  };
});

import { CollectionsTab } from "./CollectionsTab";

const TODAY = "2026-11-10";

// By default a row owes all it still has to pay (Amount Due equals Remaining): a Collections row.
function row(over: Partial<CollectionsRow> = {}): CollectionsRow {
  const amountDueCents = over.amountDueCents ?? 100000;
  return {
    eventId: "evt-1",
    eventName: "Riverside Charity Run",
    taskId: "task-1",
    dueDate: TODAY,
    note: "A note",
    amountDueCents,
    remainingCents: amountDueCents,
    currency: "CAD",
    daysOverdue: 3,
    ...over,
  };
}

const ROWS = [
  row({ eventId: "evt-new", eventName: "Newer task", dueDate: "2026-11-09", amountDueCents: 500 }),
  row({ eventId: "evt-old", eventName: "Older task", dueDate: "2026-11-01", amountDueCents: 100 }),
  row({
    eventId: "evt-future",
    eventName: "Future task",
    dueDate: "2026-11-15",
    amountDueCents: 900,
  }),
];

// Rows of the other kinds, for the type switch (spec 23): a Deposits row (it owes part of what it
// has left) and a row with nothing overdue yet.
const DEPOSITS_ROW = row({
  eventId: "evt-dep",
  eventName: "Deposit task",
  dueDate: "2026-11-05",
  amountDueCents: 300,
  remainingCents: 900,
});
const NOTHING_OVERDUE_ROW = row({
  eventId: "evt-zero",
  eventName: "Nothing overdue task",
  dueDate: "2026-11-06",
  amountDueCents: 0,
  remainingCents: 900,
  daysOverdue: null,
});
const MIXED = [...ROWS, DEPOSITS_ROW, NOTHING_OVERDUE_ROW];

function renderAt(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(<CollectionsTab />);
}

const order = (html: string, names: string[]) =>
  names.map((n) => html.indexOf(n)).every((at, i, all) => at >= 0 && (i === 0 || all[i - 1] < at));

beforeEach(() => {
  mockReplace.mockReset();
  buttonProps.current = null;
  mockData.mockReset();
  mockData.mockReturnValue({ rows: ROWS, isLoading: false, error: undefined, today: TODAY });
});

describe("CollectionsTab", () => {
  it("offers Show Not Due Yet as a switch, off to begin with", () => {
    const html = renderAt("");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).toContain("Show Not Due Yet");
  });

  it("lists only the tasks due today or earlier, oldest first", () => {
    const html = renderAt("");
    expect(html).not.toContain("Future task");
    expect(order(html, ["Older task", "Newer task"])).toBe(true);
  });

  it("adds the tasks dated in the future when cnotdue=1, and the switch reads on", () => {
    const html = renderAt("cnotdue=1");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(order(html, ["Older task", "Newer task", "Future task"])).toBe(true);
  });

  it("sorts by the column in the URL", () => {
    const html = renderAt("cnotdue=1&csort=amount&cdir=desc");
    expect(order(html, ["Future task", "Newer task", "Older task"])).toBe(true);
    expect(html).toMatch(/aria-sort="descending"/);
  });

  it("ignores a list parameter it does not know", () => {
    expect(order(renderAt("csort=bogus&cdir=sideways"), ["Older task", "Newer task"])).toBe(true);
  });

  it("links each row to its invoice with the list's parameters", () => {
    const html = renderAt("csort=amount&cdir=desc").replace(/&amp;/g, "&");
    expect(html).toContain('href="/accountant/invoice?id=evt-new&tab=info&csort=amount&cdir=desc"');
  });

  // docs/specs/accountant-collections-23-amount-type-switch.md §1 and §5.
  describe("the Collections / Deposits / All switch", () => {
    const button = (html: string) =>
      /<button[^>]*title="Click to show[^"]*"[^>]*>[^]*?<\/button>/.exec(html)?.[0];
    const showing = (html: string) => /aria-label="Showing: ([^."]*)\./.exec(html)?.[1];

    beforeEach(() => {
      mockData.mockReturnValue({ rows: MIXED, isLoading: false, error: undefined, today: TODAY });
    });

    it("stands before the Show Not Due Yet switch, in the same row", () => {
      const html = renderAt("");
      expect(html.indexOf('title="Click to show')).toBeGreaterThan(-1);
      expect(html.indexOf('title="Click to show')).toBeLessThan(html.indexOf('role="switch"'));
      // The same row: no table or closing div between the two.
      const between = html.slice(
        html.indexOf('title="Click to show'),
        html.indexOf('role="switch"'),
      );
      expect(between).not.toContain("<table");
      expect(between).not.toContain("</div>");
      expect(html.match(/<button[^>]*role="switch"/g)).toHaveLength(1);
    });

    it("opens on Collections with no type in the address, and lists the Collections rows", () => {
      const html = renderAt("");
      expect(showing(html)).toBe("Collections");
      expect(button(html)).toContain("<span>Collections</span>");
      expect(html).toContain("Newer task");
      expect(html).toContain("Older task");
      expect(html).not.toContain("Deposit task");
      expect(html).not.toContain("Nothing overdue task");
    });

    it("shows Deposits for type=deposits, and only the Deposits rows", () => {
      const html = renderAt("type=deposits");
      expect(showing(html)).toBe("Deposits");
      expect(button(html)).toContain("<span>Deposits</span>");
      expect(html).toContain("Deposit task");
      expect(html).not.toContain("Newer task");
      expect(html).not.toContain("Older task");
      expect(html).not.toContain("Nothing overdue task");
    });

    it("shows All for type=all: every row due today or earlier, the one with nothing overdue too", () => {
      const html = renderAt("type=all");
      expect(showing(html)).toBe("All");
      expect(button(html)).toContain("<span>All</span>");
      for (const name of ["Newer task", "Older task", "Deposit task", "Nothing overdue task"]) {
        expect(html).toContain(name);
      }
      expect(html).not.toContain("Future task");
    });

    it("shows Collections for type=collections and for an unknown or differently cased type", () => {
      for (const query of [
        "type=collections",
        "type=bogus",
        "type=Deposits",
        "type=ALL",
        "type=",
      ]) {
        const html = renderAt(query);
        expect(showing(html), query).toBe("Collections");
        expect(html, query).not.toContain("Deposit task");
      }
    });

    it("works with Show Not Due Yet: a not-due task appears only in the type of its figures, and in All", () => {
      const futureDeposit = row({
        eventId: "evt-future-dep",
        eventName: "Future deposit task",
        dueDate: "2026-11-20",
        amountDueCents: 200,
        remainingCents: 600,
      });
      mockData.mockReturnValue({
        rows: [...MIXED, futureDeposit],
        isLoading: false,
        error: undefined,
        today: TODAY,
      });

      const collections = renderAt("cnotdue=1");
      expect(collections).toContain("Future task");
      expect(collections).not.toContain("Future deposit task");

      const deposits = renderAt("cnotdue=1&type=deposits");
      expect(deposits).toContain("Future deposit task");
      expect(deposits).not.toContain("Future task");

      const all = renderAt("cnotdue=1&type=all");
      expect(all).toContain("Future task");
      expect(all).toContain("Future deposit task");

      // Show Not Due Yet off hides them in every type.
      expect(renderAt("type=all")).not.toContain("Future deposit task");
    });

    it("carries the type, with the sort, into each row's link to its invoice", () => {
      const html = renderAt("type=deposits&csort=amount&cdir=desc").replace(/&amp;/g, "&");
      expect(html).toContain(
        'href="/accountant/invoice?id=evt-dep&tab=info&csort=amount&cdir=desc&type=deposits"',
      );
    });

    describe("a click", () => {
      const click = (query: string) => {
        renderAt(query);
        const next: Record<CollectionsAmountType, CollectionsAmountType> = {
          collections: "deposits",
          deposits: "all",
          all: "collections",
        };
        buttonProps.current!.onChange(next[buttonProps.current!.type]);
        return mockReplace.mock.calls.at(-1);
      };

      it("gives the button the type from the address", () => {
        renderAt("");
        expect(buttonProps.current?.type).toBe("collections");
        renderAt("type=all");
        expect(buttonProps.current?.type).toBe("all");
      });

      it("goes from Collections to Deposits: writes type=deposits and keeps the page where it is", () => {
        expect(click("tab=collections")).toEqual([
          "/accountant?tab=collections&type=deposits",
          { scroll: false },
        ]);
      });

      it("goes from Deposits to All: type=all", () => {
        expect(click("tab=collections&type=deposits")).toEqual([
          "/accountant?tab=collections&type=all",
          { scroll: false },
        ]);
      });

      it("goes from All back to Collections: removes type from the address", () => {
        expect(click("tab=collections&type=all")).toEqual([
          "/accountant?tab=collections",
          { scroll: false },
        ]);
      });

      it("keeps the sort, Show Not Due Yet and every other parameter", () => {
        const [url] = click("tab=collections&csort=amount&cdir=desc&cnotdue=1&q=abc") ?? [];
        const params = new URLSearchParams(String(url).split("?")[1]);
        expect(params.get("type")).toBe("deposits");
        expect(params.get("csort")).toBe("amount");
        expect(params.get("cdir")).toBe("desc");
        expect(params.get("cnotdue")).toBe("1");
        expect(params.get("q")).toBe("abc");
        expect(params.get("tab")).toBe("collections");
      });
    });

    it("is drawn while the list loads and when it fails", () => {
      mockData.mockReturnValue({ rows: [], isLoading: true, error: undefined, today: TODAY });
      expect(button(renderAt(""))).toBeDefined();
      mockData.mockReturnValue({
        rows: [],
        isLoading: false,
        error: new Error("boom"),
        today: TODAY,
      });
      const failed = renderAt("");
      expect(failed).toContain("boom");
      expect(button(failed)).toBeDefined();
    });

    it("says the same words for an empty list in every type", () => {
      mockData.mockReturnValue({ rows: [], isLoading: false, error: undefined, today: TODAY });
      for (const query of ["", "type=deposits", "type=all"]) {
        expect(renderAt(query), query).toContain("No tasks to follow up");
      }
    });

    it("says there is nothing to follow up when the type holds no row", () => {
      mockData.mockReturnValue({ rows: ROWS, isLoading: false, error: undefined, today: TODAY });
      expect(renderAt("type=deposits")).toContain("No tasks to follow up");
    });
  });

  it("says there is nothing to follow up when there are no rows", () => {
    mockData.mockReturnValue({ rows: [], isLoading: false, error: undefined, today: TODAY });
    expect(renderAt("")).toContain("No tasks to follow up");
  });

  it("says it is loading, and shows an error", () => {
    mockData.mockReturnValue({ rows: [], isLoading: true, error: undefined, today: TODAY });
    expect(renderAt("")).toContain("Loading");
    mockData.mockReturnValue({
      rows: [],
      isLoading: false,
      error: new Error("boom"),
      today: TODAY,
    });
    expect(renderAt("")).toContain("boom");
  });
});
