import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepairStatus } from "../utils/repairRows";
import { repairRow } from "../utils/repairRowFixture";
import { RepairsTable, type RepairsTableProps } from "./RepairsTable";

// docs/specs/repairs-04-table.md §2.2 to §2.5, §2.10 and §7, and docs/specs/repairs-05-toolbar.md
// §2.5 (the sort headers). The table is rendered on the server:
// what is under test is which words and colours each cell gets. Clicks are covered by e2e.

const report = (id: string, day: string) => ({ id, day, createdAt: `${day}T12:00:00Z` });

const render = (props: Partial<RepairsTableProps> = {}) =>
  renderToStaticMarkup(
    <RepairsTable
      rows={[]}
      isLoading={false}
      showRestore={false}
      onRestore={() => {}}
      sort={null}
      onSort={() => {}}
      {...props}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The HTML of a cell (its opening tag included), found by its column key. Every cell opens with
 *  `<div data-col="key"`, so the next cell starts where the next such tag starts. */
function cell(markup: string, key: string): string {
  const open = `<div data-col="${key}"`;
  const start = markup.indexOf(open);
  expect(start, `no "${key}" cell`).toBeGreaterThan(-1);
  const next = markup.indexOf('<div data-col="', start + 1);
  return markup.slice(start, next === -1 ? undefined : next);
}
const cellText = (markup: string, key: string) => text(cell(markup, key));

function headers(markup: string): string[] {
  return [...markup.matchAll(/<div role="columnheader"[^>]*>(.*?)<\/div>/g)].map((m) => text(m[1]));
}

const HEADERS = [
  "Bleachers",
  "Reported",
  "Repair from",
  "Repair to",
  "Zone",
  "Severity",
  "Categories",
  "Notes",
  "Status",
  "Vendor",
  "Invoice #",
  "Labor",
  "Parts",
  "Tax",
  "Freight",
  "Total",
  "Completed",
];

const full = repairRow({
  id: "r1",
  status: "completed",
  currency: "CAD",
  eventStart: "2026-09-18",
  eventEnd: "2026-09-29",
  notes: "Welded new spindle in place",
  vendorName: "Dallas Trailer Repair",
  invoiceNumber: "DTR-2377",
  completedOn: "2026-09-29",
  zones: [
    { uuid: "z1", name: "Zone 1" },
    { uuid: "z2", name: "Zone 2" },
  ],
  bleachers: [
    { uuid: "b1", number: 26 },
    { uuid: "b2", number: null },
  ],
  severities: ["major", "minor"],
  categories: [
    { uuid: "c1", name: "Welding" },
    { uuid: "c2", name: "Jacks" },
  ],
  laborCents: 126000,
  partsCents: 34860,
  taxCents: 3455,
  freightCents: 0,
  totalCents: 164315,
  reported: [report("r-a", "2026-09-17"), report("r-b", "2026-09-17")],
});

// An old repair: no services, no vendor, no invoice, no report; only a cost.
const old = repairRow({
  id: "old",
  status: "completed",
  eventStart: "2026-08-26",
  eventEnd: "2026-08-26",
  completedOn: "2026-08-26",
  bleachers: [{ uuid: "b7", number: 7 }],
  totalCents: 4500,
});

describe("RepairsTable headers", () => {
  it("draws the 17 headers of the canvas, in order", () => {
    expect(headers(render({ rows: [full] }))).toEqual(HEADERS);
  });

  it("has no New repair, no row arrow and no clickable row (D40, D43)", () => {
    const markup = render({ rows: [full, old] });
    expect(text(markup)).not.toContain("New repair");
    const rowsOnly = markup.slice(markup.indexOf('data-testid="repair-row"'));
    expect(rowsOnly).not.toContain("<button");
    expect(rowsOnly).not.toContain("cursor-pointer");
  });

  it("has no Restore column unless the view asks for it", () => {
    expect(headers(render({ rows: [full] }))).not.toContain("Actions");
  });
});

/** The whole header cell of a column, found by its label. */
function headerCell(markup: string, label: string): string {
  const found = [...markup.matchAll(/<div role="columnheader"[^>]*>.*?<\/div>/g)]
    .map((m) => m[0])
    .find((h) => text(h) === label);
  expect(found, `no "${label}" header`).toBeDefined();
  return found as string;
}

// docs/specs/repairs-05-toolbar.md §2.5: D15, D72.
describe("RepairsTable sort headers", () => {
  const SORTABLE = [
    "Reported",
    "Repair from",
    "Repair to",
    "Zone",
    "Notes",
    "Status",
    "Vendor",
    "Invoice #",
    "Labor",
    "Parts",
    "Tax",
    "Freight",
    "Total",
    "Completed",
  ];
  const PLAIN = ["Bleachers", "Severity", "Categories"];

  it("makes the fourteen columns with one value per row buttons", () => {
    const markup = render({ rows: [full] });
    for (const label of SORTABLE) {
      expect(headerCell(markup, label), label).toContain('<button type="button"');
    }
  });

  it("leaves Bleachers, Severity, Categories and the Restore header as plain text (D15)", () => {
    const markup = render({ rows: [full], showRestore: true });
    for (const label of [...PLAIN, "Actions"]) {
      expect(headerCell(markup, label), label).not.toContain("<button");
    }
  });

  it("sets no aria-sort anywhere while there is no sort, and draws the two-way arrow", () => {
    const markup = render({ rows: [full] });
    expect(markup).not.toContain("aria-sort");
    for (const label of SORTABLE) {
      expect(headerCell(markup, label), label).toContain("lucide-arrow-up-down");
    }
  });

  it("sets aria-sort and a solid arrow on the sorted header only", () => {
    const markup = render({ rows: [full], sort: { key: "total", direction: "desc" } });
    const total = headerCell(markup, "Total");
    expect(total).toContain('aria-sort="descending"');
    expect(total).toContain("lucide-arrow-down");
    expect(total).not.toContain("lucide-arrow-up-down");
    expect(markup.match(/aria-sort=/g)).toHaveLength(1);
    expect(headerCell(markup, "Vendor")).toContain("lucide-arrow-up-down");

    const up = render({ rows: [full], sort: { key: "zone", direction: "asc" } });
    const zone = headerCell(up, "Zone");
    expect(zone).toContain('aria-sort="ascending"');
    expect(zone).toContain("lucide-arrow-up");
    expect(zone).not.toContain("lucide-arrow-up-down");
  });

  it("keeps the money headers at the right", () => {
    const markup = render({ rows: [full] });
    for (const label of ["Labor", "Parts", "Tax", "Freight", "Total"]) {
      expect(headerCell(markup, label), label).toContain("text-right");
    }
    expect(headerCell(markup, "Vendor")).not.toContain("text-right");
  });

  it("keeps the 17 headers in order and the first column sticky", () => {
    const markup = render({ rows: [full], sort: { key: "vendor", direction: "asc" } });
    expect(headers(markup)).toEqual(HEADERS);
    expect(headerCell(markup, "Bleachers")).toContain("sticky");
  });
});

describe("RepairsTable cells of a full row", () => {
  const markup = render({ rows: [full] });

  it("draws one chip per bleacher, #? for a bleacher with no number", () => {
    expect(cellText(markup, "bleachers")).toBe("#26 #?");
  });

  it("writes Reported as the first day as text with +N, and no link (D44, D45)", () => {
    expect(cellText(markup, "reported")).toBe("2026-09-17 +1");
    expect(cell(markup, "reported")).not.toContain("<a ");
  });

  it("writes the repair days and the completed day as stored (D44)", () => {
    expect(cellText(markup, "from")).toBe("2026-09-18");
    expect(cellText(markup, "to")).toBe("2026-09-29");
    expect(cellText(markup, "completed")).toBe("2026-09-29");
  });

  it("puts each zone on its own line (D46)", () => {
    expect(cell(markup, "zone")).toMatch(/<div[^>]*>Zone 1<\/div><div[^>]*>Zone 2<\/div>/);
  });

  it("draws severity and category chips", () => {
    expect(cellText(markup, "severity")).toBe("Major Minor");
    expect(cell(markup, "severity")).toContain("bg-[#fbe7e5]");
    expect(cellText(markup, "categories")).toBe("Welding Jacks");
  });

  it("writes Notes on one line with the full text in the title", () => {
    expect(cell(markup, "notes")).toContain('title="Welded new spindle in place"');
    expect(cellText(markup, "notes")).toBe("Welded new spindle in place");
  });

  it("draws the status as a coloured pill with its word and no chevron (D43)", () => {
    const status = cell(markup, "status");
    expect(text(status)).toBe("Completed");
    expect(status).toContain("bg-[#dcede2]");
    expect(status).not.toContain("<svg");
    expect(status).not.toContain("<button");
  });

  it("writes vendor and invoice number", () => {
    expect(cellText(markup, "vendor")).toBe("Dallas Trailer Repair");
    expect(cell(markup, "vendor")).toContain('title="Dallas Trailer Repair"');
    expect(cellText(markup, "invoice")).toBe("DTR-2377");
  });

  it("writes the amounts in the currency of the repair, zero as C$0.00", () => {
    expect(cellText(markup, "labor")).toBe("C$1,260.00");
    expect(cellText(markup, "parts")).toBe("C$348.60");
    expect(cellText(markup, "tax")).toBe("C$34.55");
    expect(cellText(markup, "freight")).toBe("C$0.00");
    expect(cellText(markup, "total")).toBe("C$1,643.15");
  });
});

describe("RepairsTable cells of an old row", () => {
  const markup = render({ rows: [old] });

  it("writes a dash where the repair has no service, vendor, invoice or report (D30)", () => {
    for (const key of [
      "reported",
      "zone",
      "severity",
      "categories",
      "notes",
      "vendor",
      "invoice",
      "labor",
      "parts",
      "tax",
      "freight",
    ]) {
      expect(cellText(markup, key), key).toBe("—");
    }
  });

  it("takes Total from the cost and still draws the bleacher and the days", () => {
    expect(cellText(markup, "total")).toBe("$45.00");
    expect(cellText(markup, "bleachers")).toBe("#7");
    expect(cellText(markup, "from")).toBe("2026-08-26");
  });

  it("writes a dash for a repair with no bleachers and for a missing Total", () => {
    const bare = render({ rows: [repairRow({ id: "bare" })] });
    expect(cellText(bare, "bleachers")).toBe("—");
    expect(cellText(bare, "total")).toBe("—");
    expect(cellText(bare, "completed")).toBe("—");
  });
});

describe("RepairsTable status pill", () => {
  it("shows a status the code does not know as its own word on grey", () => {
    const markup = render({ rows: [repairRow({ id: "x", status: "on_hold" as RepairStatus })] });
    const status = cell(markup, "status");
    expect(text(status)).toBe("on_hold");
    expect(status).toContain("bg-[#f3f4f6]");
  });
});

describe("RepairsTable Restore column (D41, D43)", () => {
  it("adds the Actions header and one Restore button per row when asked", () => {
    const markup = render({ rows: [full, old], showRestore: true });
    expect(headers(markup)).toEqual([...HEADERS, "Actions"]);
    expect(markup.match(/data-testid="repair-restore"/g)).toHaveLength(2);
    expect(cellText(markup, "restore")).toBe("Restore");
  });

  it("has no Restore button otherwise", () => {
    expect(render({ rows: [full, old] })).not.toContain('data-testid="repair-restore"');
  });
});

describe("RepairsTable loading and empty states (D51, §2.10)", () => {
  it("draws Loading... and no row while the list loads, headers stay", () => {
    const markup = render({ rows: [full], isLoading: true });
    expect(markup).toContain('data-testid="repairs-loading"');
    expect(markup).not.toContain('data-testid="repair-row"');
    expect(markup).not.toContain('data-testid="repairs-empty"');
    expect(text(markup)).toContain("Loading...");
    expect(headers(markup)).toEqual(HEADERS);
  });

  it("draws the empty state when there is no row", () => {
    const markup = render({ rows: [] });
    expect(markup).toContain('data-testid="repairs-empty"');
    expect(text(markup)).toContain("No repairs found.");
    expect(markup).not.toContain('data-testid="repairs-loading"');
  });

  it("draws one row per repair inside a table", () => {
    const markup = render({ rows: [full, old] });
    expect(markup).toContain('data-testid="repairs-table"');
    expect(markup.match(/data-testid="repair-row"/g)).toHaveLength(2);
    expect(markup).not.toContain('data-testid="repairs-empty"');
  });
});
