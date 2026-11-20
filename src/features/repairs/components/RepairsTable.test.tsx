import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepairStatus } from "../utils/repairRows";
import { repairRow, repairService } from "../utils/repairRowFixture";
import { RepairsTable, type RepairsTableProps } from "./RepairsTable";

// docs/specs/repairs-04-table.md §2.2 to §2.5, §2.10 and §7, and docs/specs/repairs-05-toolbar.md
// §2.5 (the sort headers), and docs/specs/repairs-06-expanded-row.md §2.1, §2.2 and §7 (the arrow,
// the open block and the Reported link), and docs/specs/repairs-07-repair-window.md §2.1 and §7 (the
// button at the end of a row and the always-there last column). The table is rendered on the server:
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
      expandedIds={new Set<string>()}
      onToggleRepair={() => {}}
      onOpenService={() => {}}
      onOpenReports={() => {}}
      onOpenRepair={() => {}}
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

/** The 17 columns of the canvas; the last column (Actions) comes after them (spec 07 D94). */
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
const ALL_HEADERS = [...HEADERS, "Actions"];

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
  it("draws the 17 headers of the canvas, in order, and the Actions header after them (D94)", () => {
    expect(headers(render({ rows: [full] }))).toEqual(ALL_HEADERS);
  });

  it("has no New repair and no chevron on the status pill (D43 still holds)", () => {
    const markup = render({ rows: [full, old] });
    expect(text(markup)).not.toContain("New repair");
    expect(cell(markup, "status")).not.toContain("<button");
    expect(cell(markup, "status")).not.toContain("<svg");
    expect(cell(markup, "completed")).not.toContain("<button");
  });

  it("draws the Actions header with or without the Show Deleted view, as hidden text", () => {
    for (const showRestore of [false, true]) {
      const markup = render({ rows: [full], showRestore });
      expect(headers(markup)).toEqual(ALL_HEADERS);
      expect(headerCell(markup, "Actions")).toContain("sr-only");
    }
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
    expect(headers(markup)).toEqual(ALL_HEADERS);
    expect(headerCell(markup, "Bleachers")).toContain("sticky");
  });
});

describe("RepairsTable cells of a full row", () => {
  const markup = render({ rows: [full] });

  it("draws one chip per bleacher, #? for a bleacher with no number", () => {
    expect(cellText(markup, "bleachers")).toBe("#26 #?");
  });

  it("writes Reported as the first day with +N, the day being the link (D44, D87)", () => {
    expect(cellText(markup, "reported")).toBe("2026-09-17 +1");
    expect(cell(markup, "reported")).not.toContain("<a ");
    expect(cell(markup, "reported")).toContain('data-testid="repair-reported-link"');
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

// docs/specs/repairs-06-expanded-row.md §2.1, §2.2 (D80 to D83, D87).
describe("RepairsTable arrow and open block", () => {
  const withService = repairRow({
    id: "svc",
    status: "completed",
    invoiceNumber: "DTR-2377",
    bleachers: [{ uuid: "b1", number: 26 }],
    services: [repairService({ id: "s1" })],
  });

  it("draws one arrow button per row with aria-expanded false and an Expand label", () => {
    const markup = render({ rows: [withService, old] });
    expect(markup.match(/data-testid="repair-toggle"/g)).toHaveLength(2);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Expand repair DTR-2377"');
    expect(markup).toContain('aria-label="Expand repair of bleacher #7"');
  });

  it("points the arrow at the id of the block", () => {
    const markup = render({ rows: [withService] });
    expect(markup).toContain('aria-controls="repair-services-svc"');
  });

  it("keeps the chips in the first cell and the cell sticky", () => {
    const markup = render({ rows: [withService, full] });
    const first = cell(markup, "bleachers");
    expect(first).toContain("sticky");
    expect(first).toContain('data-testid="repair-toggle"');
    expect(cellText(markup, "bleachers")).toBe("#26");
  });

  it("makes each repair a group holding its row, and draws the row clickable", () => {
    const markup = render({ rows: [withService, old] });
    expect(markup.match(/role="rowgroup"/g)).toHaveLength(2);
    expect(markup.match(/data-testid="repair-row"/g)).toHaveLength(2);
    const rowsOnly = markup.slice(markup.indexOf('data-testid="repair-row"'));
    expect(rowsOnly).toContain("cursor-pointer");
  });

  it("draws no block while the repair is closed", () => {
    const markup = render({ rows: [withService, old] });
    expect(markup).not.toContain('data-testid="repair-services"');
  });

  it("draws the block of an open repair right after its row, and not the others", () => {
    const markup = render({ rows: [withService, old], expandedIds: new Set(["svc"]) });
    expect(markup.match(/data-testid="repair-services"/g)).toHaveLength(1);
    const row = markup.indexOf('data-testid="repair-row"');
    const block = markup.indexOf('data-testid="repair-services"');
    const nextRow = markup.indexOf('data-testid="repair-row"', row + 1);
    expect(block).toBeGreaterThan(row);
    expect(block).toBeLessThan(nextRow);
  });

  it("turns the arrow of an open repair to aria-expanded true with a Collapse label", () => {
    const markup = render({ rows: [withService, old], expandedIds: new Set(["svc"]) });
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Collapse repair DTR-2377"');
    expect(markup).toContain('aria-label="Expand repair of bleacher #7"');
  });

  it("tints an open row and not a closed one", () => {
    const markup = render({ rows: [withService, old], expandedIds: new Set(["svc"]) });
    const [openRow, closedRow] = markup
      .split('data-testid="repair-row"')
      .slice(1)
      .map((p) => p.slice(0, p.indexOf(">")));
    expect(openRow).toContain("bg-[#f1f6fc]");
    expect(closedRow).not.toContain("bg-[#f1f6fc]");
  });

  it("says No services on this repair. in an open old repair (D83)", () => {
    const markup = render({ rows: [old], expandedIds: new Set(["old"]) });
    expect(text(markup)).toContain("No services on this repair.");
  });

  it("gives the block the services of that repair", () => {
    const markup = render({ rows: [withService], expandedIds: new Set(["svc"]) });
    expect(markup.match(/data-testid="repair-service-row"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Open service: bleacher 26, Welding"');
  });

  it("draws the arrow and the block in the Show Deleted view too, beside Restore", () => {
    const markup = render({
      rows: [withService],
      showRestore: true,
      expandedIds: new Set(["svc"]),
    });
    expect(markup).toContain('data-testid="repair-toggle"');
    expect(markup).toContain('data-testid="repair-services"');
    expect(markup).toContain('data-testid="repair-restore"');
  });
});

describe("RepairsTable Reported link (D87, D92)", () => {
  it("makes the day a button and keeps +N as plain text next to it", () => {
    const markup = render({ rows: [full] });
    const reported = cell(markup, "reported");
    const button = reported.slice(
      reported.indexOf('<button type="button"'),
      reported.indexOf("</button>") + "</button>".length,
    );
    expect(text(button)).toBe("2026-09-17");
    expect(reported).toContain('data-testid="repair-reported-link"');
    expect(text(reported.slice(reported.indexOf("</button>")))).toBe("+1");
  });

  it("titles the link Open damage reports for several reports and Open damage report for one", () => {
    const several = cell(render({ rows: [full] }), "reported");
    expect(several).toContain('title="Open damage reports"');
    const one = repairRow({ id: "one", reported: [report("x", "2026-10-01")] });
    expect(cell(render({ rows: [one] }), "reported")).toContain('title="Open damage report"');
  });

  it("writes no +N for one report", () => {
    const one = repairRow({ id: "one", reported: [report("x", "2026-10-01")] });
    expect(cellText(render({ rows: [one] }), "reported")).toBe("2026-10-01");
  });

  it("writes a dash and no button for a repair with no report", () => {
    const markup = render({ rows: [old] });
    expect(cellText(markup, "reported")).toBe("—");
    expect(cell(markup, "reported")).not.toContain("<button");
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

describe("RepairsTable Restore beside the open button (D41, D43, D94)", () => {
  it("adds one Restore button per row after the open button, in the same cell, when asked", () => {
    const markup = render({ rows: [full, old], showRestore: true });
    expect(headers(markup)).toEqual(ALL_HEADERS);
    expect(markup.match(/data-testid="repair-restore"/g)).toHaveLength(2);
    expect(markup.match(/data-testid="repair-open"/g)).toHaveLength(2);
    const actions = cell(markup, "actions");
    expect(cellText(markup, "actions")).toBe("Restore");
    expect(actions.indexOf("repair-open")).toBeGreaterThan(-1);
    expect(actions.indexOf("repair-restore")).toBeGreaterThan(actions.indexOf("repair-open"));
  });

  it("has no Restore button otherwise, and the open button stays", () => {
    const markup = render({ rows: [full, old] });
    expect(markup).not.toContain('data-testid="repair-restore"');
    expect(markup.match(/data-testid="repair-open"/g)).toHaveLength(2);
  });

  it("makes the last column 48 px wide, and 160 px with Restore (the 112 px of spec 04 after it)", () => {
    expect(render({ rows: [full] })).toMatch(/grid-template-columns:[^";]*116px 48px;/);
    expect(render({ rows: [full], showRestore: true })).toMatch(
      /grid-template-columns:[^";]*116px 160px;/,
    );
  });
});

// docs/specs/repairs-07-repair-window.md §2.1 (D94).
describe("RepairsTable open button (D94)", () => {
  it("draws one open button per row, named after the repair", () => {
    const markup = render({ rows: [full, old] });
    expect(markup.match(/data-testid="repair-open"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Open repair DTR-2377"');
    expect(markup).toContain('aria-label="Open repair of bleacher #7"');
  });

  it("titles each button Open repair and makes it a plain button with no text", () => {
    const markup = render({ rows: [full] });
    const actions = cell(markup, "actions");
    const button = actions.slice(actions.indexOf("<button"), actions.indexOf("</button>") + 9);
    expect(button).toContain('type="button"');
    expect(button).toContain('title="Open repair"');
    expect(text(button)).toBe("");
    expect(button).toContain("<svg");
  });

  it("puts the button in the last, sticky cell and not in the first one", () => {
    const markup = render({ rows: [full] });
    const actions = cell(markup, "actions");
    expect(actions).toContain("sticky");
    expect(actions).toContain("right-0");
    expect(actions).toContain('data-testid="repair-open"');
    expect(cell(markup, "bleachers")).not.toContain('data-testid="repair-open"');
  });

  it("is 32 by 32 px with a border, as the canvas draws it", () => {
    const actions = cell(render({ rows: [full] }), "actions");
    expect(actions).toContain("size-8");
    expect(actions).toContain("border-[#d1d5db]");
  });

  it("is in the Show Deleted view's rows too", () => {
    const markup = render({ rows: [old], showRestore: true });
    expect(markup).toContain('data-testid="repair-open"');
  });

  it("draws no button for a list that is loading or empty", () => {
    expect(render({ rows: [full], isLoading: true })).not.toContain("repair-open");
    expect(render({ rows: [] })).not.toContain("repair-open");
  });
});

describe("RepairsTable loading and empty states (D51, §2.10)", () => {
  it("draws Loading... and no row while the list loads, headers stay", () => {
    const markup = render({ rows: [full], isLoading: true });
    expect(markup).toContain('data-testid="repairs-loading"');
    expect(markup).not.toContain('data-testid="repair-row"');
    expect(markup).not.toContain('data-testid="repairs-empty"');
    expect(text(markup)).toContain("Loading...");
    expect(headers(markup)).toEqual(ALL_HEADERS);
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
