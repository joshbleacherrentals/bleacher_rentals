import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteActionBar } from "./QuoteActionBar";

// The button group of the card's tab bar. What is under test is which button each capability
// draws — the wiring that QuoteDetailView cannot show a test, because it loads its data in an
// effect (docs/specs/accountant-quotes-03-capabilities.md, R3).

type Can = Parameters<typeof QuoteActionBar>[0]["can"];

const ALL: Can = { openInDashboard: true, manageQuote: true, sendToClient: true };
const NONE: Can = { openInDashboard: false, manageQuote: false, sendToClient: false };

function render(can: Can, over: { isDeleted?: boolean; deleting?: boolean } = {}) {
  return renderToStaticMarkup(
    <QuoteActionBar
      can={can}
      isDeleted={over.isDeleted ?? false}
      deleting={over.deleting ?? false}
      onOpenInDashboard={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onSendToClient={vi.fn()}
    />,
  );
}

const hasDashboard = (html: string) => html.includes("Open in Dashboard");
const hasEdit = (html: string) => html.includes(">Edit<");
const hasDelete = (html: string) => html.includes("lucide-trash");
const hasSend = (html: string) => html.includes("Send To Client");

describe("QuoteActionBar", () => {
  it("S1: draws all four buttons for someone who can do everything", () => {
    const html = render(ALL);
    expect(hasDashboard(html)).toBe(true);
    expect(hasEdit(html)).toBe(true);
    expect(hasDelete(html)).toBe(true);
    expect(hasSend(html)).toBe(true);
  });

  it("draws nothing when they can do nothing", () => {
    expect(render(NONE)).toBe("");
  });

  it("each button follows its own capability and none other", () => {
    const dashboardOnly = render({ ...NONE, openInDashboard: true });
    expect([hasDashboard, hasEdit, hasDelete, hasSend].map((has) => has(dashboardOnly))).toEqual([
      true,
      false,
      false,
      false,
    ]);

    const sendOnly = render({ ...NONE, sendToClient: true });
    expect([hasDashboard, hasEdit, hasDelete, hasSend].map((has) => has(sendOnly))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("Edit and Delete come and go together, on manageQuote", () => {
    const managing = render({ ...NONE, manageQuote: true });
    expect(hasEdit(managing)).toBe(true);
    expect(hasDelete(managing)).toBe(true);
    expect(hasDashboard(managing)).toBe(false);
    expect(hasSend(managing)).toBe(false);
  });

  it("S3: a junior account manager on someone else's quote — Send and Dashboard, no Edit or Delete", () => {
    const html = render({ openInDashboard: true, manageQuote: false, sendToClient: true });
    expect(hasDashboard(html)).toBe(true);
    expect(hasSend(html)).toBe(true);
    expect(hasEdit(html)).toBe(false);
    expect(hasDelete(html)).toBe(false);
  });

  it("S5: a viewer — Open in Dashboard only", () => {
    const html = render({ openInDashboard: true, manageQuote: false, sendToClient: false });
    expect(hasDashboard(html)).toBe(true);
    expect(hasEdit(html)).toBe(false);
    expect(hasDelete(html)).toBe(false);
    expect(hasSend(html)).toBe(false);
  });

  it("S7: a deleted quote has no action buttons, whatever the capabilities", () => {
    expect(render(ALL, { isDeleted: true })).toBe("");
  });

  it("disables Delete while the quote is being deleted", () => {
    const deleteButton = (html: string) =>
      html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*lucide-trash/)?.[0] ?? "";
    // The class list has "disabled:opacity-50", so look for the attribute itself.
    expect(deleteButton(render(ALL, { deleting: true }))).toContain('disabled=""');
    expect(deleteButton(render(ALL, { deleting: false }))).not.toContain('disabled=""');
  });
});
