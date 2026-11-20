import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { repairRow, repairService } from "../utils/repairRowFixture";
import type { RepairListRow } from "../utils/repairRows";
import { RepairServicesBlock, RepairWindowServices } from "./RepairServices";

// docs/specs/repairs-06-expanded-row.md §2.2 and §7, and docs/specs/repairs-07-repair-window.md §2.4
// and §7 (the table in the repair window). The block is rendered on the server: what is
// under test is which words, chips and amounts each cell gets. Clicks and keys are covered by e2e.

const report = (id: string, day: string) => ({ id, day, createdAt: `${day}T12:00:00Z` });

const tires = repairService({
  id: "s-tires",
  bleacherNumber: 26,
  categoryName: "Tires",
  severity: "minor",
  description: "Needed new tires",
  laborCents: 1500,
  partsCents: 11600,
  taxCents: 783,
  freightCents: 0,
  totalCents: 13883,
  reported: [report("a", "2026-09-17")],
});

const welding = repairService({
  id: "s-welding",
  bleacherNumber: 27,
  categoryName: "Welding",
  severity: "major",
  description: "Weld broke",
  laborCents: 41500,
  partsCents: 0,
  taxCents: 0,
  freightCents: 6500,
  totalCents: 48000,
  reported: [report("a", "2026-09-17"), report("b", "2026-09-19"), report("c", "2026-09-19")],
});

const render = (over: Partial<RepairListRow> = {}, id = "repair-services-r1") =>
  renderToStaticMarkup(
    <RepairServicesBlock
      repair={repairRow({
        id: "r1",
        currency: "USD",
        invoiceNumber: "DTR-2377",
        services: [tires, welding],
        ...over,
      })}
      id={id}
      onOpenService={() => {}}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of each service row, in order (a row opens with its test id). */
function serviceRows(markup: string): string[] {
  const open = 'data-testid="repair-service-row"';
  const parts = markup.split(open).slice(1);
  // A part ends with the start of the next row's tag (`<div `): cut it off.
  return parts.map((p) => (open + p).replace(/<div $/, ""));
}

/** One cell of a service row, found by its column key. */
function cell(row: string, key: string): string {
  const open = `<div data-col="${key}"`;
  const start = row.indexOf(open);
  expect(start, `no "${key}" cell`).toBeGreaterThan(-1);
  const next = row.indexOf('<div data-col="', start + 1);
  return row.slice(start, next === -1 ? undefined : next);
}
const cellText = (row: string, key: string) => text(cell(row, key));

const HEADERS = [
  "Bleacher",
  "Category",
  "Severity",
  "Reported",
  "Description",
  "Labor",
  "Parts",
  "Tax",
  "Freight",
  "Total",
];

describe("RepairServicesBlock frame", () => {
  it("is a table named after the repair, with the id the arrow points to", () => {
    const markup = render();
    expect(markup).toContain('data-testid="repair-services"');
    expect(markup).toContain('id="repair-services-r1"');
    expect(markup).toContain('role="table"');
    expect(markup).toContain('aria-label="Services of repair DTR-2377"');
  });

  it("names the table after the bleachers when the repair has no invoice number", () => {
    const markup = render({ invoiceNumber: null, bleachers: [{ uuid: "b1", number: 26 }] });
    expect(markup).toContain('aria-label="Services of repair of bleacher #26"');
  });

  it("draws the ten headers of the canvas and a last empty one, in order", () => {
    const markup = render();
    const headers = [...markup.matchAll(/<div role="columnheader"[^>]*>(.*?)<\/div>/g)].map((m) =>
      text(m[1]),
    );
    expect(headers).toEqual([...HEADERS, ""]);
  });

  it("right-aligns the five money headers and does not make any header a button", () => {
    const markup = render();
    for (const label of ["Labor", "Parts", "Tax", "Freight", "Total"]) {
      const header = [...markup.matchAll(/<div role="columnheader"[^>]*>.*?<\/div>/g)]
        .map((m) => m[0])
        .find((h) => text(h) === label);
      expect(header, label).toContain("text-right");
    }
    const headerBand = markup.slice(0, markup.indexOf('data-testid="repair-service-row"'));
    expect(headerBand).not.toContain("<button");
  });

  it("draws no Add service button, no total row and no edit control (D84)", () => {
    const markup = render();
    expect(text(markup)).not.toContain("Add service");
    expect(text(markup)).not.toContain("Edit");
    expect(markup).not.toContain("<button");
    expect(serviceRows(markup)).toHaveLength(2);
  });
});

describe("RepairServicesBlock rows", () => {
  const rows = serviceRows(render());

  it("draws one row per service, in the order given, each with its label", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('aria-label="Open service: bleacher 26, Tires"');
    expect(rows[1]).toContain('aria-label="Open service: bleacher 27, Welding"');
  });

  it("makes each row a focusable row that can be opened", () => {
    for (const row of rows) {
      expect(row).toContain('role="row"');
      expect(row).toContain('tabindex="0"');
      expect(row).toContain("cursor-pointer");
    }
  });

  it("draws the bleacher chip, the category chip and the severity pill", () => {
    expect(cellText(rows[0], "service-bleacher")).toBe("#26");
    expect(cellText(rows[0], "service-category")).toBe("Tires");
    expect(cellText(rows[0], "service-severity")).toBe("Minor");
    expect(cell(rows[0], "service-severity")).toContain("bg-[#fbf0da]");
    expect(cellText(rows[1], "service-severity")).toBe("Major");
    expect(cell(rows[1], "service-severity")).toContain("bg-[#fbe7e5]");
  });

  it("writes Reported as the first day and +N, as plain text", () => {
    expect(cellText(rows[0], "service-reported")).toBe("2026-09-17");
    expect(cellText(rows[1], "service-reported")).toBe("2026-09-17 +2");
    expect(cell(rows[1], "service-reported")).not.toContain("<button");
    expect(cell(rows[1], "service-reported")).not.toContain("<a ");
  });

  it("writes the amounts in the currency of the repair and the total of each service", () => {
    expect(cellText(rows[0], "service-labor")).toBe("$15.00");
    expect(cellText(rows[0], "service-parts")).toBe("$116.00");
    expect(cellText(rows[0], "service-tax")).toBe("$7.83");
    expect(cellText(rows[0], "service-freight")).toBe("$0.00");
    expect(cellText(rows[0], "service-total")).toBe("$138.83");
    expect(cell(rows[0], "service-total")).toContain("font-semibold");
    expect(cellText(rows[1], "service-labor")).toBe("$415.00");
    expect(cellText(rows[1], "service-total")).toBe("$480.00");
  });

  it("writes a zero amount as $0.00 and never as a dash", () => {
    expect(cellText(rows[1], "service-parts")).toBe("$0.00");
    expect(cellText(rows[1], "service-tax")).toBe("$0.00");
  });

  it("uses C$ for a CAD repair", () => {
    const [row] = serviceRows(render({ currency: "CAD" }));
    expect(cellText(row, "service-labor")).toBe("C$15.00");
    expect(cellText(row, "service-total")).toBe("C$138.83");
  });

  it("right-aligns the money cells", () => {
    for (const key of [
      "service-labor",
      "service-parts",
      "service-tax",
      "service-freight",
      "service-total",
    ]) {
      expect(cell(rows[0], key), key).toContain("text-right");
    }
  });
});

describe("RepairServicesBlock empty values", () => {
  it("writes a grey dash for a service with no category and for no Reported day", () => {
    const bare = repairService({
      id: "bare",
      categoryName: null,
      damageCategoryUuid: null,
      description: null,
    });
    const [row] = serviceRows(render({ services: [bare] }));
    expect(cellText(row, "service-category")).toBe("—");
    expect(cell(row, "service-category")).toContain("text-[#9ca3af]");
    expect(cellText(row, "service-reported")).toBe("—");
    expect(cellText(row, "service-description")).toBe("—");
  });

  it("writes a bleacher whose number is unknown as #?", () => {
    const unknown = repairService({ id: "u", bleacherNumber: null });
    const [row] = serviceRows(render({ services: [unknown] }));
    expect(cellText(row, "service-bleacher")).toBe("#?");
    expect(row).toContain('aria-label="Open service: bleacher ?, Welding"');
  });

  it("cuts a long description to one line and keeps the whole text in the title", () => {
    const long =
      "Tractor ran into the bench seat and bent the holder and the seat board on both sides";
    const [row] = serviceRows(
      render({ services: [repairService({ id: "l", description: long })] }),
    );
    const description = cell(row, "service-description");
    expect(description).toContain(`title="${long}"`);
    expect(description).toContain("truncate");
    expect(cellText(row, "service-description")).toBe(long);
  });
});

describe("RepairServicesBlock deleted services (D89)", () => {
  it("marks a service whose own flag is set, before its description, and no other", () => {
    const removed = repairService({ id: "gone", deleted: true, description: "Removed on its own" });
    const markup = render({ services: [tires, removed] });
    const [live, gone] = serviceRows(markup);
    expect(cellText(live, "service-description")).toBe("Needed new tires");
    expect(cell(live, "service-description")).not.toContain("Deleted");
    expect(cellText(gone, "service-description")).toBe("Deleted Removed on its own");
  });
});

describe("RepairServicesBlock with no services (D83)", () => {
  const markup = render({ services: [] });

  it("says No services on this repair. and draws no row", () => {
    expect(markup).toContain('data-testid="repair-services-empty"');
    expect(text(markup)).toContain("No services on this repair.");
    expect(serviceRows(markup)).toHaveLength(0);
  });

  it("draws no Add service button either", () => {
    expect(text(markup)).not.toContain("Add service");
    expect(markup).not.toContain("<button");
  });

  it("does not say it when the repair has services", () => {
    expect(render()).not.toContain("repair-services-empty");
  });
});

// docs/specs/repairs-07-repair-window.md §2.4 (D84, D89, D101): the table of services in the repair
// window, on the canvas's window grid, with a Total row.
describe("RepairWindowServices", () => {
  const renderWindow = (over: Partial<RepairListRow> = {}) =>
    renderToStaticMarkup(
      <RepairWindowServices
        repair={repairRow({
          id: "r1",
          currency: "USD",
          invoiceNumber: "DTR-2377",
          services: [tires, welding],
          laborCents: 43000,
          partsCents: 11600,
          taxCents: 783,
          freightCents: 6500,
          totalCents: 61883,
          ...over,
        })}
        onOpenService={() => {}}
      />,
    );

  /** The Total row: from the start of its opening tag to the end of the markup. */
  const totalRow = (markup: string) => {
    const at = markup.indexOf('data-testid="repair-window-total"');
    expect(at, "no Total row").toBeGreaterThan(-1);
    return markup.slice(markup.lastIndexOf("<div", at));
  };

  it("is a table named after the repair, with its own test id", () => {
    const markup = renderWindow();
    expect(markup).toContain('data-testid="repair-window-services"');
    expect(markup).toContain('role="table"');
    expect(markup).toContain('aria-label="Services of repair DTR-2377"');
  });

  it("draws the ten headers of the canvas and a last empty one, in order", () => {
    const headers = [...renderWindow().matchAll(/<div role="columnheader"[^>]*>(.*?)<\/div>/g)].map(
      (m) => text(m[1]),
    );
    expect(headers).toEqual([...HEADERS, ""]);
  });

  it("uses the canvas's window grid, narrower than the block's", () => {
    const markup = renderWindow();
    expect(markup).toContain(
      "grid-template-columns:76px 120px 84px 108px minmax(120px, 1fr) 88px 88px 72px 72px 100px 16px",
    );
    expect(markup).toContain("column-gap:8px");
  });

  it("draws a row per service with the label, cells and amounts of the block's rows", () => {
    const markup = renderWindow();
    const rows = serviceRows(markup);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('aria-label="Open service: bleacher 26, Tires"');
    expect(rows[1]).toContain('aria-label="Open service: bleacher 27, Welding"');
    expect(cellText(rows[0], "service-total")).toBe("$138.83");
    expect(cellText(rows[1], "service-reported")).toBe("2026-09-17 +2");
    expect(rows[0]).toContain('tabindex="0"');
  });

  it("marks a service deleted on its own, and no other (D89)", () => {
    const removed = repairService({ id: "gone", deleted: true, description: "Removed on its own" });
    const rows = serviceRows(renderWindow({ services: [tires, removed] }));
    expect(cellText(rows[0], "service-description")).toBe("Needed new tires");
    expect(cellText(rows[1], "service-description")).toBe("Deleted Removed on its own");
  });

  it("ends with a Total row: the sums of the services and the repair's total (D101)", () => {
    const row = totalRow(renderWindow());
    expect(cellText(row, "total-label")).toBe("Total");
    expect(cellText(row, "total-labor")).toBe("$430.00");
    expect(cellText(row, "total-parts")).toBe("$116.00");
    expect(cellText(row, "total-tax")).toBe("$7.83");
    expect(cellText(row, "total-freight")).toBe("$65.00");
    expect(cellText(row, "total-total")).toBe("$618.83");
  });

  it("shows the repair's total from totalCents, not the sum of the services' totals", () => {
    // The two differ for a moment after a service is saved (spec 03 D32).
    const row = totalRow(renderWindow({ totalCents: 99999 }));
    expect(cellText(row, "total-total")).toBe("$999.99");
    expect(cellText(row, "total-labor")).toBe("$430.00");
  });

  it("writes the Total row in the currency of the repair, semibold, navy under Total", () => {
    const row = totalRow(renderWindow({ currency: "CAD" }));
    expect(cellText(row, "total-labor")).toBe("C$430.00");
    expect(cellText(row, "total-total")).toBe("C$618.83");
    expect(cell(row, "total-total")).toContain("text-[#10365a]");
    expect(row.slice(0, row.indexOf('<div data-col="'))).toContain("font-semibold");
  });

  it("writes a dash for a sum the repair does not have, and for a missing total", () => {
    const row = totalRow(
      renderWindow({
        services: [],
        laborCents: null,
        partsCents: null,
        taxCents: null,
        freightCents: null,
        totalCents: null,
      }),
    );
    for (const key of ["total-labor", "total-parts", "total-tax", "total-freight", "total-total"]) {
      expect(cellText(row, key), key).toBe("—");
    }
  });

  it("with no services keeps the header band, says so, and still draws the repair's Total", () => {
    const markup = renderWindow({
      services: [],
      laborCents: null,
      partsCents: null,
      taxCents: null,
      freightCents: null,
      totalCents: 4500,
    });
    expect(serviceRows(markup)).toHaveLength(0);
    expect(markup).toContain('data-testid="repair-services-empty"');
    expect(text(markup)).toContain("No services on this repair.");
    const headers = [...markup.matchAll(/<div role="columnheader"[^>]*>(.*?)<\/div>/g)].map((m) =>
      text(m[1]),
    );
    expect(headers).toEqual([...HEADERS, ""]);
    const row = totalRow(markup);
    expect(cellText(row, "total-total")).toBe("$45.00");
    expect(cellText(row, "total-labor")).toBe("—");
  });

  it("draws no Add service button, no edit control and no button at all (D84)", () => {
    const markup = renderWindow();
    expect(text(markup)).not.toContain("Add service");
    expect(text(markup)).not.toContain("Edit");
    expect(markup).not.toContain("<button");
  });

  it("leaves the block of spec 06 as it was: no Total row, its own grid", () => {
    const markup = render();
    expect(markup).not.toContain("repair-window-total");
    expect(markup).toContain("grid-template-columns:84px 148px 96px 124px");
  });
});

// docs/specs/repairs-09b1-services.md §2.1, §3 and §7 (D158): the Add service button under the table of
// an open row and under the table of the repair window, drawn only when the page gives the handler.
describe("Add service button (09b1 D158)", () => {
  const block = (services = [tires], onAddService?: () => void) =>
    renderToStaticMarkup(
      <RepairServicesBlock
        repair={repairRow({ id: "r1", invoiceNumber: "DTR-2377", services })}
        id="repair-services-r1"
        onOpenService={() => {}}
        onAddService={onAddService}
      />,
    );
  const windowTable = (services = [tires], onAddService?: () => void) =>
    renderToStaticMarkup(
      <RepairWindowServices
        repair={repairRow({ id: "r1", invoiceNumber: "DTR-2377", services })}
        onOpenService={() => {}}
        onAddService={onAddService}
      />,
    );
  const button = (markup: string) => {
    const at = markup.indexOf('data-testid="add-service"');
    expect(at, "no Add service button").toBeGreaterThan(-1);
    return markup.slice(markup.lastIndexOf("<button", at), markup.indexOf("</button>", at) + 9);
  };

  it("is drawn under the open block when it is given the handler", () => {
    const markup = block([tires], () => {});
    expect(text(button(markup))).toBe("Add service");
    expect(button(markup)).toContain('type="button"');
    // Under the table: after the last service row.
    expect(markup.lastIndexOf('data-testid="repair-service-row"')).toBeLessThan(
      markup.indexOf('data-testid="add-service"'),
    );
  });

  it("is drawn under the table of the repair window, below the Total row", () => {
    const markup = windowTable([tires], () => {});
    expect(text(button(markup))).toBe("Add service");
    expect(markup.indexOf('data-testid="repair-window-total"')).toBeLessThan(
      markup.indexOf('data-testid="add-service"'),
    );
  });

  it("is drawn for a repair with no services too, under its text", () => {
    const emptyBlock = block([], () => {});
    expect(text(emptyBlock)).toContain("No services on this repair.");
    expect(text(button(emptyBlock))).toBe("Add service");
    const emptyWindow = windowTable([], () => {});
    expect(text(emptyWindow)).toContain("No services on this repair.");
    expect(text(button(emptyWindow))).toBe("Add service");
  });

  it("is not drawn without the handler", () => {
    for (const markup of [block(), windowTable(), block([]), windowTable([])]) {
      expect(markup).not.toContain('data-testid="add-service"');
      expect(text(markup)).not.toContain("Add service");
    }
  });
});
