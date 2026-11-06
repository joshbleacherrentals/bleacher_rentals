import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceStatus } from "../utils/invoiceStatus";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

const CASES: [InvoiceStatus, string, string][] = [
  ["paid", "Paid", "bg-green-100 text-green-800"],
  ["schedule", "Schedule", "bg-purple-100 text-purple-800"],
  ["collections", "Collections", "bg-red-100 text-red-700"],
  ["cancelled", "Cancelled", "bg-gray-100 text-gray-700"],
  ["not_active", "Not active yet", "bg-gray-100 text-gray-700"],
];

describe("InvoiceStatusBadge", () => {
  it.each(CASES)("draws %s as %s", (status, label, classes) => {
    const html = renderToStaticMarkup(<InvoiceStatusBadge status={status} />);
    expect(html).toContain(`>${label}<`);
    for (const cls of classes.split(" ")) expect(html).toContain(cls);
  });

  it("says where the status comes from", () => {
    expect(renderToStaticMarkup(<InvoiceStatusBadge status="paid" />)).toContain(
      'title="Status is calculated from payments"',
    );
  });
});
