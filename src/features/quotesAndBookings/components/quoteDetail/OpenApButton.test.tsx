import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The look is the invoice page's header button; its module pulls in the signed-PDF hooks, so only
// the constant is stood in for here.
vi.mock("@/features/accountantCollections/components/OpenPdfButton", () => ({
  HEADER_BUTTON: "stand-in-header-button",
}));

import { OpenApButton } from "./OpenApButton";

const render = (eventId = "ev-1") => renderToStaticMarkup(<OpenApButton eventId={eventId} />);

describe("OpenApButton", () => {
  it("is a link to the invoice page of the event, on its Information tab", () => {
    expect(render()).toContain('href="/accountant/invoice?id=ev-1&amp;tab=info"');
  });

  it("opens in a new tab, cut off from this page", () => {
    const html = render();
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("says Open AP, with the look of the header buttons of the invoice page", () => {
    const html = render();
    expect(html).toContain("Open AP");
    expect(html).toMatch(/class="stand-in-header-button[ "]/);
  });

  it("links to the event it was given", () => {
    expect(render("ev-2")).toContain('href="/accountant/invoice?id=ev-2&amp;tab=info"');
  });
});
