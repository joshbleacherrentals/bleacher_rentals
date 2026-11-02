import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceStatus } from "../utils/invoiceStatus";
import { invoiceDataFixture } from "./invoiceFixtures";

const {
  mockSearchParams,
  mockInvoice,
  mockNeighbours,
  mockCan,
  mockMessagesTab,
  mockFiles,
  mockOpenPdf,
} = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockInvoice: vi.fn(),
  mockNeighbours: vi.fn(),
  mockCan: { current: { recordPayment: true, useInternalChat: true } },
  mockMessagesTab: vi.fn(),
  mockFiles: vi.fn(),
  mockOpenPdf: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/accountant/invoice",
  useSearchParams: () => mockSearchParams.current,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));
vi.mock("../hooks/useInvoiceData", () => ({ useInvoiceData: (id: string) => mockInvoice(id) }));
vi.mock("../hooks/useTaskNeighbours", () => ({
  useTaskNeighbours: (args: unknown) => mockNeighbours(args),
}));
vi.mock("@/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities", () => ({
  useQuotesBookingsCapabilities: () => mockCan.current,
}));
vi.mock("@/features/quotesAndBookings/components/quoteDetail/tabs/MessagesTab", () => ({
  MessagesTab: (props: unknown) => {
    mockMessagesTab(props);
    return <div data-testid="messages-tab" />;
  },
}));
// The Files section reads the local database and Supabase Storage; its own test covers it.
vi.mock("./InvoiceFiles", () => ({
  InvoiceFiles: (props: unknown) => {
    mockFiles(props);
    return <section aria-label="Files" />;
  },
}));
// Open PDF reads the local signatures and asks Supabase Storage; its own test covers it.
vi.mock("./OpenPdfButton", () => ({
  OpenPdfButton: (props: unknown) => {
    mockOpenPdf(props);
    return <button type="button">Open PDF</button>;
  },
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (s: { userId: string }) => unknown) =>
    selector({ userId: "user-7" }),
}));
vi.mock("@/lib/useTimezoneStore", () => ({
  useTimezoneStore: (selector: (s: { timezone: string }) => unknown) =>
    selector({ timezone: "America/Toronto" }),
}));

import { InvoicePage, windowOpenForEvent } from "./InvoicePage";

function renderAt(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(<InvoicePage />);
}

const unescape = (html: string) => html.replace(/&amp;/g, "&");

beforeEach(() => {
  mockInvoice.mockReset();
  mockInvoice.mockReturnValue(invoiceDataFixture());
  mockNeighbours.mockReset();
  mockNeighbours.mockReturnValue({ isReady: true, previousId: null, nextId: null });
  mockCan.current = { recordPayment: true, useInternalChat: true };
  mockMessagesTab.mockReset();
  mockFiles.mockReset();
  mockOpenPdf.mockReset();
});

describe("InvoicePage: Information", () => {
  it("reads the event from the URL and opens on Information", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(mockInvoice).toHaveBeenCalledWith("evt-1");
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Information</);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Messages</);
  });

  it("opens Information for a stale or missing tab, and for an old tab=tasks link", () => {
    for (const query of ["id=evt-1&tab=bogus", "id=evt-1", "id=evt-1&tab=tasks"]) {
      expect(renderAt(query)).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Information</);
    }
  });

  it("has every section of the design", () => {
    const html = renderAt("id=evt-1&tab=info");
    for (const section of [
      "Task History",
      "Contact and finance contact",
      "Venue",
      "Event",
      "Money",
      "Payment Schedule",
      "Payment History",
      "Files",
    ]) {
      expect(html).toContain(`aria-label="${section}"`);
    }
    expect(html).toContain("123456");
    expect(html).toContain("Max Gavryshkiv");
    expect(html).toContain("Riverside Park, Field 3");
    expect(html).toContain("120 Riverside Drive, Toronto, ON");
    expect(html).toContain("Oct 24, 2026");
    expect(html).toContain("Oct 25, 2026");
    expect(html).toContain("Sports");
  });

  it("shows a dash for what the event does not have", () => {
    mockInvoice.mockReturnValue(
      invoiceDataFixture({
        event: { ...invoiceDataFixture().event, invoiceNumber: null, accountManager: null },
        venue: { name: null, address: null },
        eventInfo: { start: null, end: null, type: null },
      }),
    );
    expect(renderAt("id=evt-1").match(/>—</g)!.length).toBeGreaterThanOrEqual(6);
  });

  it("starts Payment History with Show deleted off", () => {
    const html = renderAt("id=evt-1");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).not.toContain("Walter Deleted");
  });

  it("does not draw the old Tasks panel", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(html).not.toContain("Current task due now");
    expect(html).not.toContain("Task list");
  });
});

describe("InvoicePage: header", () => {
  it("names the event and shows N days overdue for Collections", () => {
    const html = renderAt("id=evt-1");
    expect(html).toContain("Riverside Charity Run");
    expect(html).toContain("3 days overdue");
    expect(html).toContain(">Collections<");
  });

  it("says 1 day overdue in the singular", () => {
    mockInvoice.mockReturnValue(
      invoiceDataFixture({ event: { ...invoiceDataFixture().event, daysOverdue: 1 } }),
    );
    expect(renderAt("id=evt-1")).toContain("1 day overdue");
  });

  it.each<[InvoiceStatus, string]>([
    ["paid", "Paid"],
    ["schedule", "Schedule"],
    ["cancelled", "Cancelled"],
    ["not_active", "Not active yet"],
  ])("shows no overdue days for %s", (status, label) => {
    mockInvoice.mockReturnValue(
      invoiceDataFixture({ event: { ...invoiceDataFixture().event, status, daysOverdue: 5 } }),
    );
    const html = renderAt("id=evt-1");
    expect(html).not.toContain("overdue</span>");
    expect(html).toContain(`>${label}<`);
  });

  it("offers Record Payment to someone who may record payments", () => {
    expect(renderAt("id=evt-1")).toMatch(/<button[^>]*>Record Payment<\/button>/);
  });

  it("does not offer Record Payment to anyone else, in the header or in Payment History", () => {
    mockCan.current = { recordPayment: false, useInternalChat: true };
    const html = renderAt("id=evt-1");
    expect(html).not.toContain("Record Payment");
    expect(html).not.toContain("Record payment");
  });

  it("has no Send Email button, on either tab", () => {
    expect(renderAt("id=evt-1&tab=info")).not.toContain("Send Email");
    expect(renderAt("id=evt-1&tab=messages")).not.toContain("Send Email");
  });
});

// docs/specs/accountant-collections-15-open-pdf.md §3 and §5.
describe("InvoicePage: Open PDF", () => {
  it("gives the header's Open PDF the event of the URL", () => {
    renderAt("id=evt-1&tab=info");
    expect(mockOpenPdf).toHaveBeenCalledWith({ eventId: "evt-1" });
  });

  it("is in the header on every tab, before Record Payment", () => {
    for (const tab of ["info", "messages"]) {
      const html = renderAt(`id=evt-1&tab=${tab}`);
      expect(html, tab).toContain(">Open PDF<");
      expect(html.indexOf(">Open PDF<"), tab).toBeLessThan(html.indexOf("Record Payment"));
    }
  });

  it("is there for someone who may not record payments", () => {
    mockCan.current = { recordPayment: false, useInternalChat: true };
    expect(renderAt("id=evt-1")).toContain(">Open PDF<");
  });

  it("follows the event when Previous Task and Next Task change the URL", () => {
    renderAt("id=evt-1");
    renderAt("id=evt-2");
    expect(mockOpenPdf).toHaveBeenNthCalledWith(1, { eventId: "evt-1" });
    expect(mockOpenPdf).toHaveBeenNthCalledWith(2, { eventId: "evt-2" });
  });

  it("is not drawn while the invoice is loading or when it is not found", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ isLoading: true }));
    expect(renderAt("id=evt-1")).not.toContain("Open PDF");
    mockInvoice.mockReturnValue(invoiceDataFixture({ notFound: true }));
    expect(renderAt("id=evt-1")).not.toContain("Open PDF");
    expect(mockOpenPdf).not.toHaveBeenCalled();
  });
});

describe("InvoicePage: navigation", () => {
  it("links Back to tasks to Collections", () => {
    const html = unescape(renderAt("id=evt-1"));
    expect(html).toMatch(/<a[^>]*href="\/accountant\?tab=collections"[^>]*>[^]*Back to tasks/);
  });

  it("brings the list's order back with it", () => {
    const html = unescape(renderAt("id=evt-1&csort=amount&cdir=desc&cnotdue=1"));
    expect(html).toContain('href="/accountant?tab=collections&csort=amount&cdir=desc&cnotdue=1"');
  });
});

describe("InvoicePage: Previous Task and Next Task", () => {
  const link = (html: string, label: string) =>
    new RegExp(`<a[^>]*href="([^"]*)"[^>]*>(?:(?!</a>)[^])*${label}`).exec(html)?.[1];

  const inactive = (html: string, label: string) =>
    new RegExp(`<span[^>]*aria-disabled="true"[^>]*>(?:(?!</span>)[^])*${label}`).test(html) &&
    !new RegExp(`<a[^>]*>(?:(?!</a>)[^])*${label}`).test(html);

  it("asks the neighbours of the event in the URL for the list's state", () => {
    renderAt("id=evt-1&tab=messages&csort=amount&cdir=desc&cnotdue=1");
    expect(mockNeighbours).toHaveBeenCalledWith({
      eventId: "evt-1",
      listState: { sort: "amount", dir: "desc", showNotDue: true },
    });
  });

  it("links to the neighbours, keeping the tab and the three list parameters", () => {
    mockNeighbours.mockReturnValue({ isReady: true, previousId: "evt-0", nextId: "evt-2" });
    const html = unescape(renderAt("id=evt-1&tab=messages&csort=amount&cdir=desc&cnotdue=1"));
    expect(link(html, "Previous Task")).toBe(
      "/accountant/invoice?id=evt-0&tab=messages&csort=amount&cdir=desc&cnotdue=1",
    );
    expect(link(html, "Next Task")).toBe(
      "/accountant/invoice?id=evt-2&tab=messages&csort=amount&cdir=desc&cnotdue=1",
    );
  });

  it("opens the neighbour on Information when the page is on Information", () => {
    mockNeighbours.mockReturnValue({ isReady: true, previousId: "evt-0", nextId: "evt-2" });
    const html = unescape(renderAt("id=evt-1"));
    expect(link(html, "Next Task")).toBe("/accountant/invoice?id=evt-2&tab=info");
  });

  it("carries only the three list parameters", () => {
    mockNeighbours.mockReturnValue({ isReady: true, previousId: "evt-0", nextId: "evt-2" });
    const html = unescape(renderAt("id=evt-1&tab=info&csort=overdue&page=3&q=zed"));
    expect(link(html, "Next Task")).toBe("/accountant/invoice?id=evt-2&tab=info&csort=overdue");
  });

  it("disables Previous Task at the first row and Next Task at the last", () => {
    mockNeighbours.mockReturnValue({ isReady: true, previousId: null, nextId: "evt-2" });
    let html = renderAt("id=evt-1");
    expect(inactive(html, "Previous Task")).toBe(true);
    expect(link(unescape(html), "Next Task")).toBeDefined();

    mockNeighbours.mockReturnValue({ isReady: true, previousId: "evt-0", nextId: null });
    html = renderAt("id=evt-1");
    expect(inactive(html, "Next Task")).toBe(true);
    expect(link(unescape(html), "Previous Task")).toBeDefined();
  });

  it("disables both for an event outside the list", () => {
    const html = renderAt("id=evt-1");
    expect(inactive(html, "Previous Task")).toBe(true);
    expect(inactive(html, "Next Task")).toBe(true);
  });

  it("disables both until the neighbours are ready, even if ids are present", () => {
    mockNeighbours.mockReturnValue({ isReady: false, previousId: "evt-0", nextId: "evt-2" });
    const html = renderAt("id=evt-1");
    expect(inactive(html, "Previous Task")).toBe(true);
    expect(inactive(html, "Next Task")).toBe(true);
  });

  it("does not make a disabled one focusable", () => {
    const html = renderAt("id=evt-1");
    expect(html).not.toMatch(
      /<span[^>]*tabindex[^>]*aria-disabled|<span[^>]*aria-disabled[^>]*tabindex/,
    );
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[^])*(?:Previous|Next) Task/);
  });
});

// docs/specs/accountant-collections-13-task-history-and-files.md §3 and §5.
describe("InvoicePage: Task History and Files", () => {
  it("puts Task History first in Information and Files last", () => {
    const html = renderAt("id=evt-1&tab=info");
    const at = (needle: string) => html.indexOf(needle);
    const sections = [
      'aria-label="Task History"',
      "Account Manager",
      'aria-label="Contact and finance contact"',
      'aria-label="Money"',
      'aria-label="Payment Schedule"',
      'aria-label="Payment History"',
      'aria-label="Files"',
    ].map(at);
    expect(sections[0]).toBeGreaterThan(-1);
    expect(sections).toEqual([...sections].sort((a, b) => a - b));
    expect(new Set(sections).size).toBe(sections.length);
  });

  it("shows the task history of the event, the open task last with its tag", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(html).toContain("Send a follow up message to the customer");
    expect(html).toContain("Call to the customer and ask about payment");
    expect(html.indexOf("Send a follow up")).toBeLessThan(html.indexOf("Call to the customer"));
    expect(html.indexOf("Call to the customer")).toBeLessThan(
      html.indexOf("Called again to follow up"),
    );
    expect(html).toContain(">Open<");
  });

  it("says No tasks yet. for an event with none, and still opens it", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ tasks: { open: null, completed: [] } }));
    const html = renderAt("id=evt-1&tab=info");
    expect(html).toContain("No tasks yet.");
    expect(html).toContain("Riverside Charity Run");
  });

  it("gives the Files section the event and the office's time zone", () => {
    renderAt("id=evt-1&tab=info");
    expect(mockFiles).toHaveBeenCalledWith({ eventId: "evt-1", timezone: "America/Toronto" });
  });

  it("has no Tasks tab and no Task list, Current task or Done / Next Task button", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(html).not.toMatch(/role="tab"[^>]*>Tasks</);
    expect(html).not.toContain('aria-label="Tasks"');
    expect(html).not.toContain("Done / Next Task");
    expect(html).not.toContain("No open task");
  });

  it("shows neither of them on the Messages tab", () => {
    const html = renderAt("id=evt-1&tab=messages");
    expect(html).not.toContain('aria-label="Task History"');
    expect(html).not.toContain('aria-label="Files"');
    expect(mockFiles).not.toHaveBeenCalled();
  });
});

// docs/specs/accountant-collections-12-tabs-and-messages.md §5.
describe("InvoicePage: tab bar", () => {
  const tabLabels = (html: string) =>
    [...html.matchAll(/role="tab"[^>]*>([^<]*)</g)].map((match) => match[1]);
  const tablist = (html: string) =>
    /role="tablist"[^>]*>((?:(?!<\/div>)[^])*)<\/div>/.exec(html)?.[1] ?? "";

  it("reads Information, Messages, with New Task after them", () => {
    const html = renderAt("id=evt-1");
    expect(tabLabels(html)).toEqual(["Information", "Messages"]);
    expect(html.indexOf("New Task")).toBeGreaterThan(html.indexOf(">Messages<"));
  });

  it("keeps New Task out of the tab list, which holds the tabs only", () => {
    const html = renderAt("id=evt-1");
    expect(tablist(html)).toContain(">Messages<");
    expect(tablist(html)).not.toContain("New Task");
    expect(html).not.toMatch(/role="tab"[^>]*>(?:(?!<\/button>)[^])*New Task/);
  });

  it("gives the tabs two thirds of the bar and New Task one third", () => {
    const html = renderAt("id=evt-1");
    const list = /<div[^>]*role="tablist"[^>]*>/.exec(html)?.[0] ?? "";
    const newTask = /<button(?:(?!>)[^])*>(?=(?:(?!<\/button>)[^])*New Task)/.exec(html)?.[0] ?? "";
    expect(list).toMatch(/class="[^"]*\bflex-\[2\]/);
    expect(newTask).toMatch(/class="[^"]*\bflex-1\b/);
  });

  it.each([
    ["info", "Information"],
    ["tasks", "Information"],
    ["messages", "Messages"],
  ])("selects %s when the URL says so", (tab, label) => {
    const html = renderAt(`id=evt-1&tab=${tab}`);
    expect(html).toMatch(new RegExp(`role="tab"[^>]*aria-selected="true"[^>]*>${label}<`));
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });
});

describe("InvoicePage: Messages", () => {
  it("mounts the quote card's MessagesTab with the event id and the capabilities", () => {
    const html = renderAt("id=evt-1&tab=messages");
    expect(html).toMatch(/role="tabpanel"[^>]*aria-label="Messages"/);
    expect(html).toContain('data-testid="messages-tab"');
    expect(mockMessagesTab).toHaveBeenCalledTimes(1);
    expect(mockMessagesTab).toHaveBeenCalledWith({
      quoteId: "evt-1",
      can: { recordPayment: true, useInternalChat: true },
    });
  });

  it("shows no Information on the Messages tab", () => {
    const html = renderAt("id=evt-1&tab=messages");
    expect(html).not.toContain('aria-label="Money"');
    expect(html).not.toContain("Current task due now");
  });

  it("does not mount the chat on the other tabs", () => {
    renderAt("id=evt-1&tab=info");
    renderAt("id=evt-1&tab=tasks");
    expect(mockMessagesTab).not.toHaveBeenCalled();
  });

  it("keeps the tab for Previous Task and Next Task", () => {
    mockNeighbours.mockReturnValue({ isReady: true, previousId: "evt-0", nextId: "evt-2" });
    const html = unescape(renderAt("id=evt-1&tab=messages"));
    expect(html).toContain('href="/accountant/invoice?id=evt-2&tab=messages"');
    expect(html).toContain('href="/accountant/invoice?id=evt-0&tab=messages"');
  });
});

describe("InvoicePage: New Task", () => {
  const button = (html: string) =>
    /<button(?:(?!<\/button>)[^])*New Task<\/button>/.exec(html)?.[0] ?? "";
  const noOpenTask = () =>
    mockInvoice.mockReturnValue(
      invoiceDataFixture({
        tasks: { open: null, completed: invoiceDataFixture().tasks.completed },
      }),
    );

  it("is a plain button that announces a dialog, with a plus icon", () => {
    const html = button(renderAt("id=evt-1"));
    expect(html).toMatch(/^<button[^>]*type="button"/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("<svg");
  });

  it("is enabled while the event has an open task", () => {
    const html = button(renderAt("id=evt-1"));
    expect(html).not.toMatch(/\sdisabled=""/);
    expect(html).not.toContain("There is no open task");
  });

  it("is disabled, dimmed, not-allowed and explained when the event has no open task", () => {
    noOpenTask();
    const html = button(renderAt("id=evt-1"));
    expect(html).toMatch(/\sdisabled=""/);
    expect(html).toContain('title="There is no open task"');
    expect(html).toContain("cursor-not-allowed");
    expect(html).toContain("opacity-50");
  });

  it("is on every tab", () => {
    for (const tab of ["info", "messages"]) {
      expect(button(renderAt(`id=evt-1&tab=${tab}`)), tab).not.toBe("");
    }
  });

  it("is the only way to a next task: no second New Task or Done / Next Task button", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(html.match(/New Task/g)).toHaveLength(1);
    expect(html).not.toContain("Done / Next Task");
  });

  it("is a window, not a modal: nothing is open before it is pressed", () => {
    for (const tab of ["info", "messages"]) {
      const html = renderAt(`id=evt-1&tab=${tab}`);
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain("Close New Task window");
      expect(html).not.toContain("Next Task Due:");
    }
  });
});

// docs/specs/accountant-collections-14-new-task-window.md §3 and §5.
describe("windowOpenForEvent", () => {
  it("keeps the window for the event it was opened on", () => {
    expect(windowOpenForEvent("evt-1", "evt-1")).toBe("evt-1");
  });

  it("closes it for any other event, and stays closed with nothing open", () => {
    expect(windowOpenForEvent("evt-1", "evt-2")).toBeNull();
    expect(windowOpenForEvent(null, "evt-1")).toBeNull();
    expect(windowOpenForEvent(null, "")).toBeNull();
  });

  it("does not reopen on the first event once it has been left", () => {
    // The page applies it on every render: A → B resets the state, so B → A finds nothing open.
    const atB = windowOpenForEvent("evt-1", "evt-2");
    expect(windowOpenForEvent(atB, "evt-1")).toBeNull();
  });
});

describe("InvoicePage: states", () => {
  it("says it is loading", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ isLoading: true }));
    const html = renderAt("id=evt-1");
    expect(html).toContain("Loading");
    expect(html).not.toContain("Invoice not found");
    expect(html).not.toContain('aria-label="Money"');
  });

  it("says Invoice not found, with a link to Collections", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ notFound: true }));
    const html = unescape(renderAt("id=nope&csort=amount"));
    expect(html).toContain("Invoice not found");
    expect(html).toMatch(/<a[^>]*href="\/accountant\?tab=collections&csort=amount"/);
  });

  it("treats a missing id as not found", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ notFound: true }));
    expect(renderAt("")).toContain("Invoice not found");
    expect(mockInvoice).toHaveBeenCalledWith("");
  });
});
