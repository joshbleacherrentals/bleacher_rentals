import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-15-open-pdf.md §3 and §5. The header's own markup: where
// Open PDF stands and which event it is given. What the button does is in `OpenPdfButton.test.tsx`.
// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5: the View customer
// page switch.
// Spec: docs/specs/accountant-collections-17-open-qi-button.md §3 and §5: the Open Q/I link. The
// look is the one constant the two header buttons share (`HEADER_BUTTON`); it is a stand-in here,
// so the test sees that the link uses it, and `OpenPdfButton.test.tsx` pins what it is.

const opened = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock("./OpenPdfButton", () => ({
  HEADER_BUTTON: "stand-in-header-button",
  OpenPdfButton: (props: unknown) => {
    opened.props.push(props);
    return <button type="button">Open PDF</button>;
  },
}));

import { InvoiceHeader } from "./InvoiceHeader";

function render(over: Partial<Parameters<typeof InvoiceHeader>[0]> = {}) {
  opened.props = [];
  return renderToStaticMarkup(
    <InvoiceHeader
      eventId="evt-1"
      name="Riverside Charity Run"
      status="collections"
      daysOverdue={3}
      canRecordPayment={true}
      onRecordPayment={() => {}}
      customerView={false}
      onToggleCustomerView={() => {}}
      {...over}
    />,
  );
}

describe("InvoiceHeader: Open PDF", () => {
  it("has the Open PDF button", () => {
    expect(render()).toContain(">Open PDF<");
  });

  it("gives it the event of the page", () => {
    render({ eventId: "evt-42" });
    expect(opened.props).toEqual([{ eventId: "evt-42" }]);
  });

  it("puts it before Record Payment, and before the status", () => {
    const html = render();
    expect(html.indexOf("Open PDF")).toBeGreaterThan(-1);
    expect(html.indexOf("Open PDF")).toBeLessThan(html.indexOf("Record Payment"));
    expect(html.indexOf("Open PDF")).toBeLessThan(html.indexOf(">Collections<"));
  });

  it("is still there to someone who may not record payments", () => {
    const html = render({ canRecordPayment: false });
    expect(html).toContain(">Open PDF<");
    expect(html).not.toContain("Record Payment");
  });

  it.each(["paid", "schedule", "cancelled", "not_active"] as const)(
    "is in the header of a %s event too",
    (status) => {
      expect(render({ status, daysOverdue: null })).toContain(">Open PDF<");
    },
  );
});

describe("InvoiceHeader: Open Q/I link", () => {
  /** The whole `<a>…</a>` that says Open Q/I; empty when there is none. */
  const link = (html: string) =>
    /<a\s(?:(?!<\/a>)[^])*Open Q\/I(?:(?!<\/a>)[^])*<\/a>/.exec(html)?.[0] ?? "";
  const attr = (tag: string, name: string) =>
    new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

  it("is a real link to the quote card of the event, not a button", () => {
    const html = link(render({ eventId: "evt-42" }));
    expect(html).not.toBe("");
    expect(attr(html, "href")).toBe("/quotes-bookings/evt-42");
    expect(html).not.toContain("<button");
  });

  it("opens in a new tab, cut off from this page, so the browser's own open-in-new-tab works too", () => {
    const html = link(render());
    expect(attr(html, "target")).toBe("_blank");
    expect(attr(html, "rel")?.split(" ")).toContain("noopener");
    expect(html).not.toContain("onClick");
  });

  it("adds no tab to the address", () => {
    expect(attr(link(render()), "href")).not.toContain("?");
  });

  it("encodes an id that needs it", () => {
    expect(attr(link(render({ eventId: "a b" })), "href")).toBe("/quotes-bookings/a%20b");
  });

  it("says Open Q/I, with an icon before the text and the design's tooltip", () => {
    const html = link(render());
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Open Q/I"));
    expect(html).toContain(">Open Q/I<");
    expect(attr(html, "title")).toBe("Opens the quote and invoice page of this event in a new tab");
  });

  it("has the look of the other header buttons, the one constant they share", () => {
    expect(attr(link(render()), "class")?.split(" ")).toContain("stand-in-header-button");
  });

  it("is the first button of the group: before Open PDF, Customer view, Record Payment and the status", () => {
    const html = render();
    const at = html.indexOf("Open Q/I");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf("Open PDF"));
    expect(at).toBeLessThan(html.indexOf("Customer view"));
    expect(at).toBeLessThan(html.indexOf("Record Payment"));
    expect(at).toBeLessThan(html.indexOf(">Collections<"));
    // Right after the name's box, in the same group as the other buttons.
    const group = /<div class="[^"]*">(<a\s(?:(?!<\/a>)[^])*Open Q\/I)/.exec(html);
    expect(group).not.toBeNull();
  });

  it("is there in the Customer view too, and with it off", () => {
    expect(render({ customerView: false })).toContain(">Open Q/I<");
    expect(render({ customerView: true })).toContain(">Open Q/I<");
    expect(attr(link(render({ customerView: true })), "href")).toBe("/quotes-bookings/evt-1");
  });

  it("is there for someone who may not record payments", () => {
    const html = render({ canRecordPayment: false });
    expect(html).toContain(">Open Q/I<");
    expect(html).not.toContain("Record Payment");
    expect(html.indexOf("Open Q/I")).toBeLessThan(html.indexOf("Open PDF"));
  });

  it.each(["collections", "paid", "schedule", "cancelled", "not_active"] as const)(
    "is in the header of a %s event too",
    (status) => {
      expect(render({ status, daysOverdue: null })).toContain(">Open Q/I<");
    },
  );

  it("leaves Open PDF with the event of the page, and the rest of the header as it was", () => {
    render({ eventId: "evt-42" });
    expect(opened.props).toEqual([{ eventId: "evt-42" }]);
  });
});

describe("InvoiceHeader: Customer view button", () => {
  const viewButton = (html: string) =>
    /<button(?:(?!<\/button>)[^])*aria-pressed(?:(?!<\/button>)[^])*<\/button>/.exec(html)?.[0] ??
    "";

  it("is a plain button labelled Customer view, with an eye icon", () => {
    const html = viewButton(render());
    expect(html).toMatch(/^<button[^>]*type="button"/);
    expect(html).toContain("Customer view");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Customer view"));
  });

  it("is a toggle button, not a switch, and the old labels are gone", () => {
    const html = render();
    expect(html).not.toMatch(/role="switch"/);
    expect(html).not.toContain("View customer page");
    expect(html).not.toContain(">Customer page<");
  });

  it("is not pressed when customerView is false, pressed when it is true", () => {
    expect(viewButton(render({ customerView: false }))).toContain('aria-pressed="false"');
    expect(viewButton(render({ customerView: true }))).toContain('aria-pressed="true"');
  });

  it("is outlined when off and filled blue with a lighter edge when pressed", () => {
    const off = viewButton(render({ customerView: false }));
    expect(off).toContain("border-white/55");
    expect(off).toContain("bg-transparent");
    expect(off).not.toContain("bg-lightBlue");
    const on = viewButton(render({ customerView: true }));
    expect(on).toContain("bg-lightBlue");
    expect(on).toContain("border-lighterBlue");
    expect(on).not.toContain("bg-transparent");
  });

  it("is as tall and as round as its neighbours, and never wraps its label", () => {
    const html = viewButton(render());
    for (const cls of [
      "h-9",
      "rounded-md",
      "px-3.5",
      "text-sm",
      "font-medium",
      "whitespace-nowrap",
    ]) {
      expect(html, cls).toContain(cls);
    }
  });

  it("stands between Open PDF and Record Payment, before the status", () => {
    const html = render();
    expect(html.indexOf("Open PDF")).toBeLessThan(html.indexOf("Customer view"));
    expect(html.indexOf("Customer view")).toBeLessThan(html.indexOf("Record Payment"));
    expect(html.indexOf("Record Payment")).toBeLessThan(html.indexOf(">Collections<"));
  });

  it("is there for someone who may not record payments, and on every status", () => {
    expect(render({ canRecordPayment: false })).toContain("Customer view");
    for (const status of ["paid", "schedule", "cancelled", "not_active"] as const) {
      expect(render({ status, daysOverdue: null }), status).toContain("Customer view");
    }
  });
});

// docs/design/accountant-collections/Invoice.dc.html, redrawn 2026-11-03: one row, the name on the
// left (cut with an ellipsis when it is too long) and the buttons on the right; the row wraps only
// on a narrow window (820 px and below).
describe("InvoiceHeader: layout", () => {
  const classOf = (html: string, pattern: RegExp) => pattern.exec(html)?.[1] ?? "";

  it("is one row, name first and buttons after it, spread to the two ends", () => {
    const html = render();
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("Open PDF"));
    const row = classOf(html, /^<div class="([^"]*)"/);
    for (const cls of ["flex", "items-center", "justify-between"]) {
      expect(row.split(" "), cls).toContain(cls);
    }
  });

  it("does not wrap, except on a window of 820 px or less", () => {
    const row = classOf(render(), /^<div class="([^"]*)"/).split(" ");
    expect(row).not.toContain("flex-wrap");
    expect(row).toContain("max-[820px]:flex-wrap");
  });

  it("gives the name's box the room the buttons leave, and lets it shrink", () => {
    const box = classOf(render(), /<div class="([^"]*)"><h1/).split(" ");
    expect(box).toContain("flex-auto");
    expect(box).toContain("min-w-0");
    expect(box).not.toContain("flex-wrap");
  });

  it("cuts a long name with an ellipsis on one line, and keeps the days overdue whole", () => {
    const html = render({ name: "A very long event name ".repeat(8) });
    const h1 = classOf(html, /<h1 class="([^"]*)"/).split(" ");
    expect(h1).toContain("truncate");
    expect(h1).toContain("min-w-0");
    const overdue = classOf(html, /<span class="([^"]*)">3 days overdue/).split(" ");
    expect(overdue).toContain("shrink-0");
    expect(overdue).toContain("whitespace-nowrap");
  });

  it("keeps the buttons whole, 8 px apart; the group wraps only on a narrow window", () => {
    const group = classOf(render(), /<div class="([^"]*)">(?:(?!<div)[^])*?Open PDF/).split(" ");
    expect(group).toContain("shrink-0");
    expect(group).toContain("gap-2");
    expect(group).not.toContain("flex-wrap");
    expect(group).toContain("max-[820px]:flex-wrap");
  });
});
