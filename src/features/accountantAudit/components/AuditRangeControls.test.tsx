import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { AuditRangeControls } from "./AuditRangeControls";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (D3, D5, R9, R10). Today is Monday
// 2026-11-09 in these tests.
const TODAY = DateTime.fromISO("2026-11-09T12:00:00");

type Range = { from: string | null; to: string | null };
const render = (range: Range, onChange: (r: Range) => void = () => {}) =>
  renderToStaticMarkup(<AuditRangeControls range={range} onChange={onChange} today={TODAY} />);

/** Finds the element of the tree by its aria-label and returns its props (no DOM in this env). */
function findByAriaLabel(node: any, label: string): any {
  if (!node || typeof node !== "object") return null;
  if (node.props?.["aria-label"] === label) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByAriaLabel(child, label);
    if (found) return found;
  }
  return null;
}
const tree = (range: Range, onChange: (r: Range) => void) =>
  AuditRangeControls({ range, onChange, today: TODAY });

describe("the preset select", () => {
  it("lists the nine presets in order", () => {
    const html = render({ from: "2026-11-01", to: "2026-11-30" });
    const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "This week",
      "Last week",
      "This month",
      "Last month",
      "This quarter",
      "Last quarter",
      "This year",
      "Last year",
      "All time",
    ]);
    expect(html).toContain('aria-label="Period"');
  });

  it("shows the preset whose range equals the dates", () => {
    expect(render({ from: "2026-11-01", to: "2026-11-30" })).toMatch(
      /<option value="this_month" selected/,
    );
    expect(render({ from: null, to: null })).toMatch(/<option value="all_time" selected/);
  });

  it("shows a disabled Custom entry, selected, when no preset matches", () => {
    const html = render({ from: "2026-11-02", to: "2026-11-30" });
    expect(html).toMatch(/<option value="custom" disabled="" selected="">Custom<\/option>/);
  });

  it("has no Custom entry when a preset matches", () => {
    expect(render({ from: "2026-11-01", to: "2026-11-30" })).not.toContain("Custom");
  });

  it("choosing a preset calls onChange with both dates", () => {
    const calls: Range[] = [];
    const select = findByAriaLabel(
      tree({ from: null, to: null }, (r) => calls.push(r)),
      "Period",
    );
    select.props.onChange({ target: { value: "last_month" } });
    select.props.onChange({ target: { value: "all_time" } });
    expect(calls).toEqual([
      { from: "2026-10-01", to: "2026-10-31" },
      { from: null, to: null },
    ]);
  });

  it("ignores the Custom entry and an unknown value", () => {
    const calls: Range[] = [];
    const select = findByAriaLabel(
      tree({ from: null, to: null }, (r) => calls.push(r)),
      "Period",
    );
    select.props.onChange({ target: { value: "custom" } });
    select.props.onChange({ target: { value: "bogus" } });
    expect(calls).toEqual([]);
  });
});

describe("the date fields (D5)", () => {
  it("are two native date inputs, From and To, with the range's values", () => {
    const html = render({ from: "2026-11-01", to: "2026-11-30" });
    expect(html).toMatch(/<input[^>]*type="date"[^>]*aria-label="From"[^>]*value="2026-11-01"/);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*aria-label="To"[^>]*value="2026-11-30"/);
  });

  it("show empty fields for no limit", () => {
    const html = render({ from: null, to: null });
    expect(html.match(/value=""/g)?.length).toBe(2);
    expect(html).not.toContain(" max=");
    expect(html).not.toContain(" min=");
  });

  it("carry max on From (the To date) and min on To (the From date) (R9)", () => {
    const html = render({ from: "2026-11-01", to: "2026-11-30" });
    expect(html).toMatch(/aria-label="From"[^>]*max="2026-11-30"/);
    expect(html).toMatch(/aria-label="To"[^>]*min="2026-11-01"/);
  });

  it("editing From writes it and keeps To; editing To keeps From", () => {
    const calls: Range[] = [];
    const t = tree({ from: "2026-11-01", to: "2026-11-30" }, (r) => calls.push(r));
    findByAriaLabel(t, "From").props.onChange({ target: { value: "2026-11-10" } });
    findByAriaLabel(t, "To").props.onChange({ target: { value: "2026-11-20" } });
    expect(calls).toEqual([
      { from: "2026-11-10", to: "2026-11-30" },
      { from: "2026-11-01", to: "2026-11-20" },
    ]);
  });

  it("clearing a field writes that end as no limit and keeps the other", () => {
    const calls: Range[] = [];
    const t = tree({ from: "2026-11-01", to: "2026-11-30" }, (r) => calls.push(r));
    findByAriaLabel(t, "From").props.onChange({ target: { value: "" } });
    findByAriaLabel(t, "To").props.onChange({ target: { value: "" } });
    expect(calls).toEqual([
      { from: null, to: "2026-11-30" },
      { from: "2026-11-01", to: null },
    ]);
  });
});
