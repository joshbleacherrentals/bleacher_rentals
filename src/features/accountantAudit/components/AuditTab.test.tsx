import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditTab } from "./AuditTab";

// docs/specs/accountant-audit-01-tab.md §3 and §5: the shell of the Audit tab, which shows the empty
// state until a driver is chosen (specs 02 and 04 fill the rest).
describe("AuditTab", () => {
  const html = renderToStaticMarkup(<AuditTab />);

  it("is the Audit tab's body", () => {
    expect(html).toContain('data-testid="audit-tab"');
  });

  it("shows the empty state with the design's title and text", () => {
    expect(html).toContain('data-testid="audit-empty-state"');
    expect(html).toContain(">Choose a driver<");
    expect(html).toContain(
      ">Pick a driver above to see all of their work trackers and whether each one has been paid.<",
    );
  });

  it("draws the truck icon, hidden from assistive technology", () => {
    const icon = html.match(/<svg[^>]*lucide-truck[^>]*>/)?.[0] ?? "";
    expect(icon).toContain('aria-hidden="true"');
  });

  it("draws nothing else yet: no select, no table", () => {
    expect(html).not.toContain("<table");
    expect(html).not.toContain('role="combobox"');
  });
});
