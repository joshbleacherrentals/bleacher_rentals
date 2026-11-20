import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { repairRow, repairService } from "../utils/repairRowFixture";
import type { RepairListRow, RepairService } from "../utils/repairRows";
import type { RawServiceBleacherRow } from "../db/serviceWindowQueries";
import { ServiceWindowContent } from "./ServiceWindow";

// docs/specs/repairs-06-expanded-row.md §2.3 and §7 (D4, D84, D86, D88, D89), and
// docs/specs/repairs-07-repair-window.md §2.6 (Open repair). The window's content
// is rendered on the server (a Radix dialog needs a portal, which Vitest's node environment does
// not have); what is under test is which words, pills and amounts each part gets.

const repair = repairRow({
  id: "r1",
  status: "completed",
  currency: "USD",
  vendorName: "Dallas Trailer Repair",
  invoiceNumber: "DTR-2377",
});

const service = repairService({
  id: "s1",
  bleacherNumber: 26,
  categoryName: "Welding",
  severity: "minor",
  description: "Needed spindles rewelded\nand a new jack",
  laborCents: 126000,
  partsCents: 34860,
  taxCents: 3455,
  freightCents: 0,
  totalCents: 164315,
  reported: [{ id: "a", day: "2026-09-17", createdAt: "2026-09-17T16:00:00Z" }],
});

const bleacher: RawServiceBleacherRow = {
  id: "b1",
  bleacherNumber: 26,
  modelNumber: "TSP15-450",
  typeName: "7-Row, 100/150 Seat - Includes Delivery & Setup / Teardown",
  zoneName: "Zone 3",
};

const render = (
  over: {
    repair?: RepairListRow;
    service?: RepairService;
    bleacher?: RawServiceBleacherRow | null;
    onOpenRepair?: () => void;
  } = {},
) =>
  renderToStaticMarkup(
    <ServiceWindowContent
      repair={over.repair ?? repair}
      service={over.service ?? service}
      bleacher={over.bleacher === undefined ? bleacher : over.bleacher}
      onOpenReports={() => {}}
      onOpenRepair={over.onOpenRepair}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of the element `<tag attr="value">...</tag>`; the parts hold no element of the same tag. */
function element(markup: string, tag: string, attr: string, value: string): string {
  const found = markup.match(new RegExp(`<${tag} ${attr}="${value}"[^>]*>.*?</${tag}>`, "s"));
  expect(found, `no <${tag} ${attr}="${value}">`).not.toBeNull();
  return (found as RegExpMatchArray)[0];
}
const field = (markup: string, name: string) => element(markup, "dd", "data-field", name);
const amount = (markup: string, name: string) => text(element(markup, "div", "data-amount", name));
const card = (markup: string, name: string) => text(element(markup, "div", "data-card", name));
const strip = (markup: string) => element(markup, "div", "data-testid", "service-window-repair");

describe("ServiceWindowContent header", () => {
  it("draws the eyebrow Service and the title: the category and the bleacher", () => {
    const markup = render();
    expect(text(markup)).toContain("Service");
    expect(markup).toMatch(/<h2[^>]*>Welding · Bleacher #26<\/h2>/);
  });

  it("leaves the category out of the title when there is none, and writes #? for no number", () => {
    const bare = repairService({
      id: "s",
      categoryName: null,
      damageCategoryUuid: null,
      bleacherNumber: null,
    });
    expect(render({ service: bare })).toMatch(/<h2[^>]*>Bleacher #\?<\/h2>/);
  });

  it("marks a service deleted on its own, and no other (D89)", () => {
    expect(text(render({ service: { ...service, deleted: true } }))).toContain("Deleted");
    expect(text(render())).not.toContain("Deleted");
  });

  it("draws the title with the element it is given, so a dialog can use its own title", () => {
    const markup = renderToStaticMarkup(
      <ServiceWindowContent
        repair={repair}
        service={service}
        bleacher={bleacher}
        onOpenReports={() => {}}
        Title="h3"
      />,
    );
    expect(markup).toMatch(/<h3[^>]*>Welding · Bleacher #26<\/h3>/);
  });
});

describe("ServiceWindowContent repair strip", () => {
  it("shows the vendor, the invoice number, the status pill and the currency", () => {
    const band = strip(render());
    expect(text(band)).toBe("Repair Dallas Trailer Repair · DTR-2377 Completed USD");
    expect(band).toContain("bg-[#dcede2]");
  });

  it("shows dashes for a vendor and an invoice number that are not there, and CAD", () => {
    const band = strip(
      render({ repair: repairRow({ id: "r2", status: "in_repair", currency: "CAD" }) }),
    );
    expect(text(band)).toBe("Repair — · — In repair CAD");
  });

  // docs/specs/repairs-07-repair-window.md §2.6 (D84, D98): the button of spec 07.
  it("has no Open repair button when it is not given the handler (D98)", () => {
    const markup = render();
    expect(text(markup)).not.toContain("Open repair");
    expect(markup).not.toContain("service-window-open-repair");
  });

  it("draws Open repair at the right end of the strip when it is given the handler", () => {
    const markup = render({ onOpenRepair: () => {} });
    const band = strip(markup);
    expect(text(band)).toBe("Repair Dallas Trailer Repair · DTR-2377 Completed USD Open repair");
    const button = band.slice(band.indexOf("<button"), band.indexOf("</button>") + 9);
    expect(button).toContain('data-testid="service-window-open-repair"');
    expect(button).toContain('type="button"');
    expect(button).toContain("ml-auto");
    expect(text(button)).toBe("Open repair");
  });

  it("still has no Edit, Delete or Add service button with Open repair drawn", () => {
    const words = text(render({ onOpenRepair: () => {} }));
    expect(words).not.toContain("Edit");
    expect(words).not.toContain("Delete ");
    expect(words).not.toContain("Add service");
  });
});

describe("ServiceWindowContent fields and amounts", () => {
  const markup = render();

  it("draws the bleacher, the category and the severity", () => {
    expect(text(field(markup, "bleacher"))).toBe("#26");
    expect(text(field(markup, "category"))).toBe("Welding");
    expect(text(field(markup, "severity"))).toBe("Minor");
    expect(field(markup, "severity")).toContain("bg-[#fbf0da]");
  });

  it("draws the whole description and keeps its line breaks", () => {
    expect(text(field(markup, "description"))).toBe("Needed spindles rewelded and a new jack");
    expect(field(markup, "description")).toContain("whitespace-pre-wrap");
  });

  it("draws dashes for a missing category and a missing description", () => {
    const bare = render({
      service: repairService({
        id: "b",
        categoryName: null,
        damageCategoryUuid: null,
        description: null,
      }),
    });
    expect(text(field(bare, "category"))).toBe("—");
    expect(text(field(bare, "description"))).toBe("—");
  });

  it("writes the four amounts and the total in the currency of the repair", () => {
    expect(amount(markup, "labor")).toBe("Labor $1,260.00");
    expect(amount(markup, "parts")).toBe("Parts $348.60");
    expect(amount(markup, "tax")).toBe("Tax $34.55");
    expect(amount(markup, "freight")).toBe("Freight $0.00");
    expect(amount(markup, "total")).toBe("Total $1,643.15");
    expect(element(markup, "div", "data-amount", "total")).toContain("font-semibold");
    const cad = render({ repair: repairRow({ id: "c", currency: "CAD" }) });
    expect(amount(cad, "labor")).toBe("Labor C$1,260.00");
  });
});

describe("ServiceWindowContent Reported", () => {
  it("shows a dash and no button when the service has no report (D9)", () => {
    const markup = render({ service: { ...service, reported: [] } });
    expect(text(field(markup, "reported"))).toBe("—");
    expect(markup).not.toContain('data-testid="service-window-reports"');
  });

  it("shows the day and View Damage Report for one report", () => {
    const reported = field(render(), "reported");
    expect(text(reported)).toBe("2026-09-17 View Damage Report");
    expect(reported).toContain('data-testid="service-window-reports"');
  });

  it("shows +N and View Damage Reports (N) for several reports (D92)", () => {
    const many = repairService({
      id: "m",
      reported: [
        { id: "a", day: "2026-09-17", createdAt: "2026-09-17T16:00:00Z" },
        { id: "b", day: "2026-09-19", createdAt: "2026-09-19T16:00:00Z" },
        { id: "c", day: "2026-09-19", createdAt: "2026-09-19T17:00:00Z" },
      ],
    });
    const reported = field(render({ service: many }), "reported");
    expect(text(reported)).toBe("2026-09-17 +2 View Damage Reports (3)");
  });
});

describe("ServiceWindowContent bleacher card (D86, D88)", () => {
  it("shows the number, the model number, the type name as stored and the zone", () => {
    const markup = render();
    expect(element(markup, "div", "data-testid", "service-window-bleacher")).toContain("Bleacher");
    expect(card(markup, "number")).toBe("Number #26");
    expect(card(markup, "model")).toBe("Model number TSP15-450");
    expect(card(markup, "type")).toBe(
      "Type 7-Row, 100/150 Seat - Includes Delivery & Setup / Teardown",
    );
    expect(card(markup, "zone")).toBe("Zone Zone 3");
  });

  it("shows a dash for each value the bleacher does not have, and keeps the number", () => {
    const markup = render({
      bleacher: { id: "b1", bleacherNumber: 26, modelNumber: null, typeName: null, zoneName: null },
    });
    expect(card(markup, "number")).toBe("Number #26");
    expect(card(markup, "model")).toBe("Model number —");
    expect(card(markup, "type")).toBe("Type —");
    expect(card(markup, "zone")).toBe("Zone —");
  });

  it("shows dashes while the query is loading or the bleacher is not on the device", () => {
    const markup = render({ bleacher: null });
    expect(card(markup, "number")).toBe("Number #26");
    expect(card(markup, "model")).toBe("Model number —");
    expect(card(markup, "type")).toBe("Type —");
    expect(card(markup, "zone")).toBe("Zone —");
  });

  it("writes #? as the number of a service whose bleacher number is unknown", () => {
    const markup = render({ service: { ...service, bleacherNumber: null }, bleacher: null });
    expect(card(markup, "number")).toBe("Number #?");
  });
});

describe("ServiceWindowContent is read-only (D84)", () => {
  it("has no Edit, Delete or Add service button and no footer", () => {
    const markup = render();
    const words = text(markup);
    expect(words).not.toContain("Edit");
    expect(words).not.toContain("Delete ");
    expect(words).not.toContain("Add service");
    expect(markup).not.toContain("<footer");
  });
});
