import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionsRow } from "../utils/collectionsRows";

const { mockSearchParams, mockData } = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

import { CollectionsTab } from "./CollectionsTab";

const TODAY = "2026-11-10";

function row(over: Partial<CollectionsRow> = {}): CollectionsRow {
  return {
    eventId: "evt-1",
    eventName: "Riverside Charity Run",
    taskId: "task-1",
    dueDate: TODAY,
    note: "A note",
    amountDueCents: 100000,
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

function renderAt(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(<CollectionsTab />);
}

const order = (html: string, names: string[]) =>
  names.map((n) => html.indexOf(n)).every((at, i, all) => at >= 0 && (i === 0 || all[i - 1] < at));

beforeEach(() => {
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
