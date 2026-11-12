import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditAvatar } from "./AuditAvatar";

describe("AuditAvatar", () => {
  it("shows the initials of the name and is hidden from screen readers", () => {
    const html = renderToStaticMarkup(<AuditAvatar name="Matt Pilcher" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-initials="MP"');
    // Drawn by CSS, so the letters are not text of the cell the badge sits in.
    expect(html).not.toContain(">MP<");
  });

  it("is smaller in a row (md, the default) than beside the name (lg)", () => {
    expect(renderToStaticMarkup(<AuditAvatar name="Ann Lee" />)).toContain("size-8");
    expect(renderToStaticMarkup(<AuditAvatar name="Ann Lee" size="lg" />)).toContain("size-11");
  });
});
