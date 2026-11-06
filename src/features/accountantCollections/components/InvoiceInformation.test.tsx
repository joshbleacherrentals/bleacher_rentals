import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { invoiceDataFixture } from "./invoiceFixtures";

// The Files section reads the local database and Supabase Storage; its own test covers it.
vi.mock("./InvoiceFiles", () => ({ InvoiceFiles: () => null }));

import { InvoiceFiles } from "./InvoiceFiles";
import { InvoiceInformation } from "./InvoiceInformation";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §3 and §7. Static markup
// cannot show a key, so the element tree of the component is read instead.

function findAll(node: ReactNode, type: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, found);
  } else if (isValidElement(node)) {
    if (node.type === type) found.push(node);
    findAll((node.props as { children?: ReactNode }).children, type, found);
  }
  return found;
}

const tree = (eventId: string) =>
  InvoiceInformation({
    eventId,
    data: invoiceDataFixture(),
    timezone: "America/Toronto",
    canRecordPayment: true,
    recordedByUserUuid: "user-7",
    onRecordPayment: vi.fn(),
  });

describe("InvoiceInformation: Files", () => {
  it("gives Files the event and the office's time zone", () => {
    const [files] = findAll(tree("evt-1"), InvoiceFiles);
    expect(files.props).toEqual({ eventId: "evt-1", timezone: "America/Toronto" });
  });

  // Previous Task and Next Task change `?id=` without leaving the page: a section that kept its
  // state would upload the files staged for one event to the next one.
  it("starts the Files section over for each event", () => {
    const [first] = findAll(tree("evt-1"), InvoiceFiles);
    const [second] = findAll(tree("evt-2"), InvoiceFiles);
    expect(first.key).toBe("evt-1");
    expect(second.key).toBe("evt-2");
  });
});
