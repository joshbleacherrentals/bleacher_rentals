import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientNotes, NoteText } from "./ClientNotes";

describe("ClientNotes", () => {
  it("renders nothing when there are no notes", () => {
    expect(renderToStaticMarkup(<ClientNotes notes={[]} />)).toBe("");
  });

  it("shows every note under its own label", () => {
    const html = renderToStaticMarkup(
      <ClientNotes
        notes={[
          { label: "Contact notes", text: "Prefers text." },
          { label: "Company notes · Lincoln High", text: "Call the AD first." },
        ]}
      />,
    );
    expect(html).toContain("Contact notes");
    expect(html).toContain("Prefers text.");
    expect(html).toContain("Company notes · Lincoln High");
    expect(html).toContain("Call the AD first.");
  });

  it("escapes note text instead of treating it as markup", () => {
    const html = renderToStaticMarkup(
      <ClientNotes notes={[{ label: "Contact notes", text: "<img src=x onerror=alert(1)>" }]} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("starts every note collapsed, with no toggle until it is known to overflow", () => {
    const html = renderToStaticMarkup(
      <ClientNotes notes={[{ label: "Contact notes", text: "Short." }]} />,
    );
    expect(html).toContain("line-clamp-3");
    expect(html).not.toContain("Show more");
  });
});

describe("NoteText", () => {
  it("clamps to three lines and offers Show more when the text overflows", () => {
    const html = renderToStaticMarkup(
      <NoteText text="Long note" expanded={false} canExpand onToggle={() => {}} />,
    );
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
  });

  it("shows the whole text and offers Show less once expanded", () => {
    const html = renderToStaticMarkup(
      <NoteText text="Long note" expanded canExpand onToggle={() => {}} />,
    );
    expect(html).not.toContain("line-clamp-3");
    expect(html).toContain("Show less");
    expect(html).toContain('aria-expanded="true"');
  });

  it("offers no toggle when the text already fits", () => {
    const html = renderToStaticMarkup(
      <NoteText text="Short" expanded={false} canExpand={false} onToggle={() => {}} />,
    );
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("Show less");
  });

  it("preserves line breaks in the text", () => {
    const html = renderToStaticMarkup(
      <NoteText text={"a\nb"} expanded={false} canExpand={false} onToggle={() => {}} />,
    );
    expect(html).toContain("whitespace-pre-wrap");
  });
});
