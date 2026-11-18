import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";

// docs/specs/repairs-04-table.md §2.7 and §7.

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function testIdText(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const open = markup.indexOf(">", start);
  const close = markup.indexOf("</", open);
  return text(markup.slice(open + 1, close));
}

describe("RepairsTotalsStrip", () => {
  it("puts CAD first and USD second (D49)", () => {
    const markup = renderToStaticMarkup(
      <RepairsTotalsStrip tab="open" totals={{ USD: 100, CAD: 200 }} />,
    );
    const cad = markup.indexOf("Total cost · CAD");
    const usd = markup.indexOf("Total cost · USD");
    expect(cad).toBeGreaterThan(-1);
    expect(usd).toBeGreaterThan(cad);
  });

  it("writes the amounts with cents, CAD with C$ and USD with $ (D48)", () => {
    const markup = renderToStaticMarkup(
      <RepairsTotalsStrip tab="completed" totals={{ USD: 1234567, CAD: 123450 }} />,
    );
    expect(testIdText(markup, "repairs-strip-cad")).toBe("C$1,234.50");
    expect(testIdText(markup, "repairs-strip-usd")).toBe("$12,345.67");
  });

  it("keeps both amounts for an empty tab, as $0.00 and C$0.00", () => {
    const markup = renderToStaticMarkup(
      <RepairsTotalsStrip tab="open" totals={{ USD: 0, CAD: 0 }} />,
    );
    expect(testIdText(markup, "repairs-strip-cad")).toBe("C$0.00");
    expect(testIdText(markup, "repairs-strip-usd")).toBe("$0.00");
  });

  it("writes a dash for each amount while the list loads (D51)", () => {
    const markup = renderToStaticMarkup(<RepairsTotalsStrip tab="open" totals={null} />);
    expect(testIdText(markup, "repairs-strip-cad")).toBe("—");
    expect(testIdText(markup, "repairs-strip-usd")).toBe("—");
  });

  it("writes the caption of each tab", () => {
    expect(text(renderToStaticMarkup(<RepairsTotalsStrip tab="open" totals={null} />))).toContain(
      "Open repairs that match the filters",
    );
    expect(
      text(renderToStaticMarkup(<RepairsTotalsStrip tab="completed" totals={null} />)),
    ).toContain("Completed repairs that match the filters");
  });
});
