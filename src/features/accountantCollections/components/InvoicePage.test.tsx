import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceStatus } from "../utils/invoiceStatus";
import { invoiceDataFixture } from "./invoiceFixtures";

const { mockSearchParams, mockInvoice, mockCan } = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockInvoice: vi.fn(),
  mockCan: { current: { recordPayment: true } },
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
vi.mock("@/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities", () => ({
  useQuotesBookingsCapabilities: () => mockCan.current,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (s: { userId: string }) => unknown) =>
    selector({ userId: "user-7" }),
}));
vi.mock("@/lib/useTimezoneStore", () => ({
  useTimezoneStore: (selector: (s: { timezone: string }) => unknown) =>
    selector({ timezone: "America/Toronto" }),
}));

import { InvoicePage } from "./InvoicePage";

function renderAt(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(<InvoicePage />);
}

const unescape = (html: string) => html.replace(/&amp;/g, "&");

beforeEach(() => {
  mockInvoice.mockReset();
  mockInvoice.mockReturnValue(invoiceDataFixture());
  mockCan.current = { recordPayment: true };
});

describe("InvoicePage: Information", () => {
  it("reads the event from the URL and opens on Information", () => {
    const html = renderAt("id=evt-1&tab=info");
    expect(mockInvoice).toHaveBeenCalledWith("evt-1");
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Information</);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Tasks</);
  });

  it("opens Information for a stale or missing tab", () => {
    for (const query of ["id=evt-1&tab=bogus", "id=evt-1"]) {
      expect(renderAt(query)).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Information</);
    }
  });

  it("has every section of the design", () => {
    const html = renderAt("id=evt-1&tab=info");
    for (const section of [
      "Contact and finance contact",
      "Venue",
      "Event",
      "Money",
      "Payment Schedule",
      "Payment History",
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

  it("does not draw the Tasks panel", () => {
    expect(renderAt("id=evt-1&tab=info")).not.toContain("Current task due now");
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
    mockCan.current = { recordPayment: false };
    const html = renderAt("id=evt-1");
    expect(html).not.toContain("Record Payment");
    expect(html).not.toContain("Record payment");
  });

  it("has no Send Email button, on either tab", () => {
    expect(renderAt("id=evt-1&tab=info")).not.toContain("Send Email");
    expect(renderAt("id=evt-1&tab=tasks")).not.toContain("Send Email");
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

  it("draws Previous Task and Next Task, inactive until spec 10 connects them", () => {
    const html = renderAt("id=evt-1");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Previous Task/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Next Task/);
  });
});

describe("InvoicePage: Tasks", () => {
  it("shows the task list and the current task", () => {
    const html = renderAt("id=evt-1&tab=tasks");
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Tasks</);
    expect(html).toContain("Task list");
    expect(html).toContain("Current task due now");
    expect(html).toContain("Done / Next Task");
    expect(html).not.toContain('aria-label="Money"');
  });

  it("says No open task for an event with none", () => {
    mockInvoice.mockReturnValue(
      invoiceDataFixture({
        tasks: { open: null, completed: invoiceDataFixture().tasks.completed },
      }),
    );
    const html = renderAt("id=evt-1&tab=tasks");
    expect(html).toContain("No open task");
    expect(html).not.toContain("Done / Next Task");
  });

  it("still opens an event with no open task on Information", () => {
    mockInvoice.mockReturnValue(invoiceDataFixture({ tasks: { open: null, completed: [] } }));
    expect(renderAt("id=evt-1&tab=info")).toContain("Riverside Charity Run");
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
