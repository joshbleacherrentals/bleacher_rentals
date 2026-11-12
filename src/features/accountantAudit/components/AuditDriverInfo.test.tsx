import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditDriverInfo } from "./AuditDriverInfo";

// docs/specs/accountant-audit-02-driver-select.md §3 and §5 (R9).
describe("AuditDriverInfo", () => {
  it("shows the three items with their values", () => {
    const html = renderToStaticMarkup(
      <AuditDriverInfo
        info={{ address: "1 Main St, Springfield", phone: "555", email: "a@x.com" }}
      />,
    );
    expect(html).toContain('data-testid="audit-driver-info"');
    expect(html).toContain(">Address<");
    expect(html).toContain(">Phone<");
    expect(html).toContain(">Email<");
    expect(html).toContain("1 Main St, Springfield");
    expect(html).toContain(">555<");
    expect(html).toContain(">a@x.com<");
    expect(html).not.toContain("–");
  });

  it("shows a dash for each missing value and keeps three items", () => {
    const html = renderToStaticMarkup(
      <AuditDriverInfo info={{ address: null, phone: null, email: null }} />,
    );
    expect(html.match(/>–</g)).toHaveLength(3);
    expect(html).toContain(">Address<");
  });
});
