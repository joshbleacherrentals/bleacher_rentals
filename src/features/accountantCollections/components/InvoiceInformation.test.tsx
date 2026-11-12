import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

// Spec: docs/specs/accountant-collections-20-signed-booked-line.md §3 and §5. The strip under the
// task history is read from the element tree; it holds host elements only, so it renders alone.

type SignedLine = { label: "Signed" | "Booked"; text: string } | null;

function treeWith(signedLine: SignedLine) {
  const base = invoiceDataFixture();
  return InvoiceInformation({
    eventId: "evt-1",
    data: { ...base, event: { ...base.event, signedLine } },
    timezone: "America/Toronto",
    canRecordPayment: true,
    recordedByUserUuid: "user-7",
    onRecordPayment: vi.fn(),
  });
}

/** The grey strip with Invoice and Account Manager: the only div of the page with `bg-gray-50`. */
function stripOf(node: ReactNode): ReactElement<{ children: ReactNode; className?: string }> {
  const found = findAll(node, "div").filter((el) =>
    ((el.props as { className?: string }).className ?? "").includes("bg-gray-50"),
  );
  expect(found).toHaveLength(1);
  return found[0] as ReactElement<{ children: ReactNode; className?: string }>;
}

const SIGNED: SignedLine = {
  label: "Signed",
  text: "Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield",
};

describe("InvoiceInformation: the Signed / Booked line (spec 20)", () => {
  it("draws a second line under Invoice with the label and the text", () => {
    const markup = renderToStaticMarkup(stripOf(treeWith(SIGNED)));

    expect(markup).toContain("Signed");
    expect(markup).toContain("Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield");
    expect(markup.indexOf("Invoice")).toBeLessThan(markup.indexOf("Signed"));
    expect(markup.indexOf("123456")).toBeLessThan(markup.indexOf("Signed"));
    expect(markup.indexOf("Signed")).toBeLessThan(markup.indexOf("Account Manager"));
  });

  it("puts the Invoice line and the second line in the left group, one above the other", () => {
    const [left, right] = Children.toArray(stripOf(treeWith(SIGNED)).props.children);
    const lines = Children.toArray((left as ReactElement<{ children: ReactNode }>).props.children);

    expect(lines).toHaveLength(2);
    expect(renderToStaticMarkup(lines[0] as ReactElement)).toContain("Invoice");
    expect(renderToStaticMarkup(lines[1] as ReactElement)).toContain("Signed");
    expect(renderToStaticMarkup(left as ReactElement)).not.toContain("Account Manager");
    expect(renderToStaticMarkup(right as ReactElement)).toContain("Account Manager");
  });

  it("writes Booked when that is the label", () => {
    const markup = renderToStaticMarkup(
      stripOf(treeWith({ label: "Booked", text: "Nov 3, 2026 at 9:15 AM EST by Max Gavryshkiv" })),
    );

    expect(markup).toContain("Booked");
    expect(markup).toContain("Nov 3, 2026 at 9:15 AM EST by Max Gavryshkiv");
    expect(markup).not.toContain("Signed");
  });

  it("leaves the second line out when there is no line", () => {
    const [left] = Children.toArray(stripOf(treeWith(null)).props.children);
    const markup = renderToStaticMarkup(left as ReactElement);

    expect(markup).toContain("Invoice");
    expect(markup).toContain("123456");
    expect(markup).not.toContain("Signed");
    expect(markup).not.toContain("Booked");
    expect(
      Children.toArray((left as ReactElement<{ children: ReactNode }>).props.children),
    ).toHaveLength(1);
  });

  it("keeps Account Manager on the right, with or without the line", () => {
    for (const signedLine of [SIGNED, null]) {
      const [, right] = Children.toArray(stripOf(treeWith(signedLine)).props.children);
      const markup = renderToStaticMarkup(right as ReactElement);
      expect(markup).toContain("Account Manager");
      expect(markup).toContain("Max Gavryshkiv");
    }
  });

  it("draws the label grey like Invoice and the text in regular weight, the number stays semibold", () => {
    const markup = renderToStaticMarkup(stripOf(treeWith(SIGNED)));

    expect(markup).toMatch(/<span class="[^"]*text-gray-500[^"]*">Invoice<\/span>/);
    expect(markup).toMatch(/<span class="[^"]*text-gray-500[^"]*">Signed<\/span>/);
    expect(markup).toMatch(/<span class="[^"]*font-semibold[^"]*">123456<\/span>/);
    const text = /<span class="([^"]*)">Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield<\/span>/.exec(
      markup,
    );
    expect(text).not.toBeNull();
    expect(text![1]).not.toContain("font-semibold");
    expect(text![1]).not.toContain("font-bold");
  });

  it("lets a long name wrap inside the left group instead of cutting it or pushing the strip out", () => {
    const long = {
      label: "Signed" as const,
      text: `Oct 22, 2026 at 3:14 PM EDT by ${"Alexandria Montgomery-Featherstonehaugh ".repeat(4).trim()}`,
    };
    const markup = renderToStaticMarkup(stripOf(treeWith(long)));

    expect(markup).toContain(long.text);
    expect(markup).not.toContain("whitespace-nowrap");
    expect(markup).not.toContain("truncate");
    const [left] = Children.toArray(stripOf(treeWith(long)).props.children);
    expect((left as ReactElement<{ className?: string }>).props.className).toContain("min-w-0");
  });
});
