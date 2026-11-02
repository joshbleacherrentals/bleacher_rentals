import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-15-open-pdf.md §3 and §5. The header's own markup: where
// Open PDF stands and which event it is given. What the button does is in `OpenPdfButton.test.tsx`.

const opened = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock("./OpenPdfButton", () => ({
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
