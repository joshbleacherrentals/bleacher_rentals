import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LineItemDescription } from "./LineItemDescription";

describe("LineItemDescription", () => {
  it("renders nothing when there is no description", () => {
    expect(renderToStaticMarkup(<LineItemDescription description={null} />)).toBe("");
    expect(renderToStaticMarkup(<LineItemDescription description={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<LineItemDescription description={"  \n "} />)).toBe("");
  });

  it("keeps paragraphs and bullet lines on their own lines", () => {
    const html = renderToStaticMarkup(
      <LineItemDescription description={"Seats 300.\n\nIncludes:\n- guard rails"} />,
    );
    expect(html).toContain("whitespace-pre-line");
    expect(html).toContain("Seats 300.\n\nIncludes:\n- guard rails");
  });

  it("shows markup as plain text", () => {
    const html = renderToStaticMarkup(<LineItemDescription description={"<b>bold</b>"} />);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});
