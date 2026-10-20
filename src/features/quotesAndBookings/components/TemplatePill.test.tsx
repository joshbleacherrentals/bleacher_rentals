import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePill } from "./TemplatePill";

const draw = (count?: number) =>
  renderToStaticMarkup(
    <TemplatePill label="Inbound Leads" active={false} onClick={() => {}} count={count} />,
  );

describe("TemplatePill count", () => {
  it("shows the number in a red circle when above 0", () => {
    const html = draw(3);
    expect(html).toContain("bg-red-600");
    expect(html).toContain(">3<");
  });

  it("shows nothing for 0 or no count", () => {
    expect(draw(0)).not.toContain("bg-red-600");
    expect(draw()).not.toContain("bg-red-600");
  });

  it("caps a large number", () => {
    expect(draw(250)).toContain(">99+<");
    expect(draw(99)).toContain(">99<");
  });
});
