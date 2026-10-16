import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteVersionToggle } from "./QuoteVersionToggle";

describe("QuoteVersionToggle", () => {
  it("offers versions 1 and 2 and marks the current one as pressed", () => {
    const html = renderToStaticMarkup(<QuoteVersionToggle value={2} onChange={vi.fn()} />);
    expect(html).toMatch(/aria-pressed="false"[^>]*>1</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>2</);
  });
});
