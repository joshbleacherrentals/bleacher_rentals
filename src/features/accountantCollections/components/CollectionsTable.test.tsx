import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionsListState } from "../utils/collectionsListState";
import type { CollectionsRow } from "../utils/collectionsRows";
import { CollectionsTable } from "./CollectionsTable";

// The row is a link; the app router is not needed to render one.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const TODAY = "2026-11-10";
const DEFAULT: CollectionsListState = { sort: "followUp", dir: "asc", showNotDue: false };

function row(over: Partial<CollectionsRow> = {}): CollectionsRow {
  return {
    eventId: "evt-1",
    eventName: "Riverside Charity Run",
    taskId: "task-1",
    dueDate: TODAY,
    note: "Called again to follow up.",
    amountDueCents: 173575,
    currency: "CAD",
    daysOverdue: 3,
    ...over,
  };
}

function render(
  props: Partial<React.ComponentProps<typeof CollectionsTable>> & { rows?: CollectionsRow[] },
) {
  return renderToStaticMarkup(
    <CollectionsTable
      rows={[row()]}
      state={DEFAULT}
      today={TODAY}
      isLoading={false}
      error={undefined}
      onSort={() => {}}
      {...props}
    />,
  );
}

const unescape = (html: string) => html.replace(/&amp;/g, "&");

describe("CollectionsTable", () => {
  it("has the five columns of the list and a chevron column", () => {
    const html = render({});
    for (const header of [
      "Name",
      "Next Follow Up",
      "Payment Overdue",
      "Task Notes",
      "Amount Overdue",
    ]) {
      expect(html).toContain(header);
    }
  });

  it("draws a row: name, follow-up wording, overdue wording, note, amount", () => {
    const html = render({});
    expect(html).toContain("Riverside Charity Run");
    expect(html).toContain("Due Today");
    expect(html).toContain(">3 days<");
    expect(html).toContain("Called again to follow up.");
    expect(html).toContain('title="Called again to follow up."');
    expect(html).toContain("C$1,735.75");
  });

  it("colours Next Follow Up: past red, today amber and bold, future grey", () => {
    const past = render({ rows: [row({ dueDate: "2026-11-07" })] });
    expect(past).toContain("3 days ago");
    expect(past).toMatch(/class="[^"]*text-red-700[^"]*"[^>]*>3 days ago</);

    const today = render({ rows: [row({ dueDate: TODAY })] });
    expect(today).toMatch(/class="[^"]*text-amber-700[^"]*font-semibold[^"]*"[^>]*>Due Today</);

    const future = render({ rows: [row({ dueDate: "2026-11-13" })] });
    expect(future).toContain("3 days after");
    expect(future).toMatch(/class="[^"]*text-gray-600[^"]*"[^>]*>3 days after</);
  });

  it("shows a dash where nothing is overdue", () => {
    expect(render({ rows: [row({ daysOverdue: null })] })).toContain(">—<");
  });

  it("links a row to its invoice on Information", () => {
    const html = unescape(render({}));
    expect(html).toContain('href="/accountant/invoice?id=evt-1&tab=info"');
  });

  it("carries the list's parameters into the row link", () => {
    const html = unescape(render({ state: { sort: "amount", dir: "desc", showNotDue: true } }));
    expect(html).toContain(
      'href="/accountant/invoice?id=evt-1&tab=info&csort=amount&cdir=desc&cnotdue=1"',
    );
  });

  describe("sorting", () => {
    const sortOf = (html: string, header: string) =>
      html.match(new RegExp(`<th[^>]*aria-sort="(\\w+)"[^>]*>(?:(?!</th>).)*${header}`))?.[1];

    it("marks the sorted column and no other, ascending by default on Next Follow Up", () => {
      const html = render({});
      expect(sortOf(html, "Next Follow Up")).toBe("ascending");
      expect(sortOf(html, "Payment Overdue")).toBe("none");
      expect(sortOf(html, "Amount Overdue")).toBe("none");
    });

    it("follows the direction", () => {
      const html = render({ state: { ...DEFAULT, sort: "amount", dir: "desc" } });
      expect(sortOf(html, "Amount Overdue")).toBe("descending");
      expect(sortOf(html, "Next Follow Up")).toBe("none");
    });

    it("draws a neutral, an ascending and a descending arrow", () => {
      expect(render({})).toContain("lucide-arrow-up-down");
      expect(render({})).toContain("lucide-arrow-up ");
      const desc = render({ state: { ...DEFAULT, dir: "desc" } });
      expect(desc).toContain("lucide-arrow-down ");
    });

    it("makes the three sortable headers buttons, and Name and Task Notes plain text", () => {
      const html = render({});
      expect(html).toMatch(/<button[^>]*>[^]*?Next Follow Up/);
      expect(html).toMatch(/<button[^>]*>[^]*?Payment Overdue/);
      expect(html).toMatch(/<button[^>]*>[^]*?Amount Overdue/);
      expect(html).not.toMatch(/<button[^>]*>[^<]*(<[^b/][^>]*>)*Name</);
      expect(html).not.toMatch(/<button[^>]*>[^<]*Task Notes/);
    });
  });

  describe("states", () => {
    it("says it is loading", () => {
      const html = render({ rows: [], isLoading: true });
      expect(html).toContain("Loading");
      expect(html).not.toContain("No tasks to follow up");
    });

    it("shows the error", () => {
      expect(render({ rows: [], error: new Error("disk full") })).toContain("disk full");
    });

    it("says there is nothing to follow up on an empty list", () => {
      expect(render({ rows: [] })).toContain("No tasks to follow up");
    });
  });

  it("lets the table scroll sideways in a narrow window", () => {
    const html = render({});
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-w-[940px]");
  });
});
