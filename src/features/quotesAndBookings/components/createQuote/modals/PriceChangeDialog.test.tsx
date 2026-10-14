import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceChangeList } from "./PriceChangeDialog";

// The dialog itself renders into a portal, which server rendering skips; the list is what carries
// the numbers a person is asked to approve.
describe("PriceChangeList", () => {
  const html = renderToStaticMarkup(
    <PriceChangeList
      currency="CAD"
      changes={[
        {
          id: "a",
          label: "10-Row, 300 Seat",
          qty: 2,
          beforeCents: 540000,
          afterCents: 476000,
          isDiscount: false,
        },
        {
          id: "b",
          label: "Loyalty discount",
          qty: 1,
          beforeCents: -2500,
          afterCents: -5000,
          isDiscount: true,
        },
      ]}
      totalBeforeCents={1100000}
      totalAfterCents={972000}
    />,
  );

  it("names each line with its quantity and the old and new price", () => {
    expect(html).toContain("10-Row, 300 Seat");
    expect(html).toContain("× 2");
    expect(html).toContain("C$5,400.00");
    expect(html).toContain("C$4,760.00");
  });

  it("shows a discount as an amount, not a per-unit price", () => {
    expect(html).toContain("Loyalty discount");
    expect(html).toContain("-C$25.00");
    expect(html).toContain("-C$50.00");
  });

  it("shows the line-items total before and after", () => {
    expect(html).toContain("C$11,000.00");
    expect(html).toContain("C$9,720.00");
  });
});
