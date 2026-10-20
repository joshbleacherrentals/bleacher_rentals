import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailChipInput } from "./EmailChipInput";

describe("EmailChipInput markup", () => {
  const html = renderToStaticMarkup(
    <EmailChipInput
      label="Cc"
      field="cc"
      fields={{ to: ["t@x.com"], cc: ["a@x.com", "b@x.com"], bcc: [] }}
      onFieldsChange={vi.fn()}
    />,
  );

  it("shows each address of its own field as a chip with a labelled remove button", () => {
    expect(html.match(/data-testid="chip-cc"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Remove a@x.com from Cc"');
    expect(html).not.toContain("t@x.com");
  });

  it("does not point aria-controls at a list that is not rendered", () => {
    expect(html).not.toContain("aria-controls");
    expect(html).toContain('aria-expanded="false"');
  });

  it("has an accessible label and a combobox input", () => {
    expect(html).toContain(">Cc</label>");
    expect(html).toContain('role="combobox"');
  });
});
