import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CloseReportsDialogContent } from "./CloseReportsDialog";
import { initialSwitches, type CloseCandidate } from "../utils/closeReports";

// docs/specs/repairs-08a-choose-reports-to-close.md §2.2, §3 and §7 (D241 to D243, D248, D250). The
// dialog is drawn in a portal, which the server renderer cannot show, so the inside of the dialog is
// exported and tested here; the portal and the buttons' effects are the hook's and the browser's.

const candidate = (over: Partial<CloseCandidate> & { id: string }): CloseCandidate => ({
  group: "linked",
  bleacherNumber: 52,
  day: "2026-11-10",
  createdBy: "Pat Driver",
  seat: "minor",
  haul: "none",
  note: "Bent rail on row 3",
  ...over,
});

const render = (
  candidates: CloseCandidate[],
  switches: Record<string, boolean> = initialSwitches(candidates),
) =>
  renderToStaticMarkup(
    <CloseReportsDialogContent
      candidates={candidates}
      switches={switches}
      onToggle={() => {}}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("CloseReportsDialogContent", () => {
  it("has the title and the description of the spec", () => {
    const t = text(render([candidate({ id: "a" })]));
    expect(t).toContain("Close damage reports?");
    expect(t).toContain("Choose which of the open damage reports to close.");
  });

  it("draws one row per report with its test id, id and group", () => {
    const markup = render([candidate({ id: "a" }), candidate({ id: "b", group: "free" })]);
    expect(markup.match(/data-testid="close-report-row"/g)).toHaveLength(2);
    expect(markup).toContain('data-report-id="a"');
    expect(markup).toContain('data-report-id="b"');
  });

  it("a row shows the bleacher, the Reported day, who created it, the levels and the note (D241)", () => {
    const t = text(render([candidate({ id: "a" })]));
    expect(t).toContain("#52");
    expect(t).toContain("Reported 2026-11-10 by Pat Driver");
    expect(t).toContain("Seat: minor, Haul: none");
    expect(t).toContain("Bent rail on row 3");
  });

  it("leaves out 'by' when nobody is known, the note when there is none, and shows #? for a bleacher that has not synced", () => {
    const t = text(
      render([candidate({ id: "a", createdBy: null, note: null, bleacherNumber: null })]),
    );
    expect(t).toContain("#?");
    expect(t).toContain("Reported 2026-11-10");
    expect(t).not.toContain(" by ");
    expect(t).not.toContain("Bent rail");
  });

  it("clamps a long note to three lines", () => {
    expect(render([candidate({ id: "a" })])).toContain("line-clamp-3");
  });

  it("draws a switch for each report with role switch, aria-checked and a name that says which report", () => {
    const markup = render(
      [candidate({ id: "a" }), candidate({ id: "b", bleacherNumber: 60, day: "2026-11-12" })],
      { a: true, b: false },
    );
    const switches = markup.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
    expect(switches).toHaveLength(2);
    expect(switches[0]).toContain('aria-checked="true"');
    expect(switches[1]).toContain('aria-checked="false"');
    expect(switches[0]).toContain('data-testid="close-report-switch"');
    expect(switches[0]).toContain('aria-label="Close report of bleacher #52 reported 2026-11-10"');
    expect(switches[1]).toContain('aria-label="Close report of bleacher #60 reported 2026-11-12"');
  });

  it("labels a switch Close when on and Keep open when off (D241)", () => {
    const on = text(render([candidate({ id: "a" })], { a: true }));
    expect(on).toContain("Close");
    expect(on).not.toContain("Keep open");
    const off = text(render([candidate({ id: "a" })], { a: false }));
    expect(off).toContain("Keep open");
  });

  it("draws the headings only when there are two sections (D248)", () => {
    const two = text(render([candidate({ id: "a" }), candidate({ id: "b", group: "free" })]));
    expect(two).toContain("Linked to this repair");
    expect(two).toContain("Open reports of the added bleachers");
    const one = text(render([candidate({ id: "a" })]));
    expect(one).not.toContain("Linked to this repair");
    expect(one).not.toContain("Open reports of the added bleachers");
    const free = text(render([candidate({ id: "b", group: "free" })]));
    expect(free).not.toContain("Open reports of the added bleachers");
  });

  it("puts the linked section before the free one", () => {
    const markup = render([candidate({ id: "f", group: "free" }), candidate({ id: "l" })]);
    expect(markup.indexOf('data-report-id="l"')).toBeLessThan(markup.indexOf('data-report-id="f"'));
  });

  it("has Cancel and Confirm, with their test ids and no Skip (D243)", () => {
    const markup = render([candidate({ id: "a" })]);
    expect(markup).toContain('data-testid="close-reports-cancel"');
    expect(markup).toContain('data-testid="close-reports-confirm"');
    const t = text(markup);
    expect(t).toContain("Cancel");
    expect(t).toContain("Confirm");
    expect(t).not.toMatch(/skip/i);
  });

  it("has the test id of the dialog and a list that scrolls while the buttons stay in view", () => {
    const markup = render([candidate({ id: "a" })]);
    expect(markup).toContain('data-testid="close-reports-dialog"');
    expect(markup).toContain("overflow-y-auto");
  });
});
