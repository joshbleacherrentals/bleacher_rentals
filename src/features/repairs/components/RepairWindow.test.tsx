import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { repairRow, repairService } from "../utils/repairRowFixture";
import type { RepairListRow } from "../utils/repairRows";
import { RepairWindowContent } from "./RepairWindow";

// docs/specs/repairs-07-repair-window.md §2.2, §2.3 and §7 (D95 to D108). The window's content is
// rendered on the server (a Radix dialog needs a portal, which Vitest's node environment does not
// have); what is under test is which words, pills and values each part gets.

const report = (id: string, day: string) => ({ id, day, createdAt: `${day}T16:00:00Z` });

const full = repairRow({
  id: "r1",
  status: "completed",
  currency: "USD",
  createdAt: "2026-09-17T16:00:00Z",
  eventStart: "2026-09-18",
  eventEnd: "2026-09-29",
  completedOn: "2026-09-29",
  notes: "Welded new spindle in place\nand replaced the jack",
  vendorName: "Dallas Trailer Repair",
  invoiceNumber: "DTR-2377",
  zones: [{ uuid: "z3", name: "Zone 3" }],
  bleachers: [
    { uuid: "b26", number: 26 },
    { uuid: "b27", number: 27 },
  ],
  services: [repairService({ id: "s1" })],
  laborCents: 126000,
  partsCents: 41904,
  taxCents: 3455,
  freightCents: 0,
  totalCents: 171359,
  reported: [report("a", "2026-09-17"), report("b", "2026-09-19")],
});

// A repair as the 208 local ones are: no vendor, no invoice, no services, only a cost.
const old = repairRow({
  id: "old",
  status: "completed",
  createdAt: "2026-08-26T12:00:00Z",
  bleachers: [{ uuid: "b7", number: 7 }],
  totalCents: 4500,
});

const render = (
  over: {
    repair?: RepairListRow;
    timezone?: string;
    vendorAddress?: string | null;
    files?: ReactNode;
    Title?: "h2" | "h3";
    onChangeStatus?: () => void;
  } = {},
) =>
  renderToStaticMarkup(
    <RepairWindowContent
      repair={over.repair ?? full}
      timezone={over.timezone ?? "America/Toronto"}
      vendorAddress={over.vendorAddress === undefined ? "Dallas, TX, US" : over.vendorAddress}
      onOpenService={() => {}}
      onOpenReports={() => {}}
      files={over.files === undefined ? null : over.files}
      Title={over.Title}
      onChangeStatus={over.onChangeStatus}
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
const titleBox = (markup: string) => element(markup, "div", "data-testid", "repair-window-title");

describe("RepairWindowContent header (D97, D105)", () => {
  it("draws the eyebrow Repair and the title: the invoice number and the vendor", () => {
    const markup = render();
    expect(text(markup)).toContain("Repair");
    expect(markup).toMatch(/<h2[^>]*>DTR-2377 · Dallas Trailer Repair<\/h2>/);
  });

  it("writes the title of a repair with only an invoice number, only a vendor, or neither", () => {
    const invoiceOnly = repairRow({ id: "x", invoiceNumber: "JJ-5" });
    expect(render({ repair: invoiceOnly })).toMatch(/<h2[^>]*>JJ-5<\/h2>/);
    const vendorOnly = repairRow({ id: "x", vendorName: "Caprock Tire" });
    expect(render({ repair: vendorOnly })).toMatch(/<h2[^>]*>Caprock Tire<\/h2>/);
    expect(render({ repair: old })).toMatch(/<h2[^>]*>Bleacher #7<\/h2>/);
    const two = repairRow({
      id: "x",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: 53 },
      ],
    });
    expect(render({ repair: two })).toMatch(/<h2[^>]*>Bleachers #52, #53<\/h2>/);
    expect(render({ repair: repairRow({ id: "x" }) })).toMatch(/<h2[^>]*>Repair<\/h2>/);
  });

  it("draws the title with the element it is given, so a dialog can use its own title", () => {
    expect(render({ Title: "h3" })).toMatch(/<h3[^>]*>DTR-2377 · Dallas Trailer Repair<\/h3>/);
  });

  it("writes the Created line with the day in the given time zone", () => {
    const markup = render();
    expect(text(element(markup, "div", "data-testid", "repair-window-created"))).toBe(
      "Created 2026-09-17",
    );
    expect(text(render({ timezone: "Pacific/Auckland" }))).toContain("Created 2026-09-18");
  });

  it("draws no Created line when the repair has no creation time", () => {
    const markup = render({ repair: { ...full, createdAt: null } });
    expect(markup).not.toContain("repair-window-created");
    expect(text(markup)).not.toContain("Created");
  });

  it("marks a deleted repair beside its title, and a live one not", () => {
    expect(text(titleBox(render({ repair: { ...full, deleted: true } })))).toBe(
      "DTR-2377 · Dallas Trailer Repair Deleted",
    );
    expect(text(titleBox(render()))).toBe("DTR-2377 · Dallas Trailer Repair");
  });
});

describe("RepairWindowContent fields (D17, D31, D33, D100, D106, D107, D108)", () => {
  const markup = render();

  it("draws the vendor with its address under it", () => {
    expect(text(field(markup, "vendor"))).toBe("Dallas Trailer Repair Dallas, TX, US");
    expect(text(element(markup, "div", "data-field", "address"))).toBe("Dallas, TX, US");
  });

  it("draws no address line when the vendor has none, and a dash when there is no vendor", () => {
    const noAddress = render({ vendorAddress: null });
    expect(text(field(noAddress, "vendor"))).toBe("Dallas Trailer Repair");
    expect(noAddress).not.toContain('data-field="address"');
    const noVendor = render({ repair: old, vendorAddress: null });
    expect(text(field(noVendor, "vendor"))).toBe("—");
    expect(noVendor).not.toContain('data-field="address"');
  });

  it("draws the invoice number, or a dash", () => {
    expect(text(field(markup, "invoice"))).toBe("DTR-2377");
    expect(text(field(render({ repair: old }), "invoice"))).toBe("—");
  });

  it("draws the status as a plain pill with its word and no chevron", () => {
    const status = field(markup, "status");
    expect(text(status)).toBe("Completed");
    expect(status).toContain("bg-[#dcede2]");
    expect(status).not.toContain("<svg");
    expect(status).not.toContain("<button");
  });

  it("draws the currency", () => {
    expect(text(field(markup, "currency"))).toBe("USD");
    expect(text(field(render({ repair: { ...full, currency: "CAD" } }), "currency"))).toBe("CAD");
  });

  it("puts each zone on its own line, and writes a dash for none", () => {
    const two = render({
      repair: {
        ...full,
        zones: [
          { uuid: "z1", name: "Zone 1" },
          { uuid: "z2", name: "Zone 2" },
        ],
      },
    });
    const zone = field(two, "zone");
    expect(zone.match(/<div>/g)).toHaveLength(2);
    expect(text(zone)).toBe("Zone 1 Zone 2");
    expect(text(field(render({ repair: old }), "zone"))).toBe("—");
  });

  it("writes the repair days and the completed day as the table writes them, dashes when empty", () => {
    expect(text(field(markup, "from"))).toBe("2026-09-18");
    expect(text(field(markup, "to"))).toBe("2026-09-29");
    expect(text(field(markup, "completed"))).toBe("2026-09-29");
    const open = render({ repair: old });
    expect(text(field(open, "from"))).toBe("—");
    expect(text(field(open, "to"))).toBe("—");
    expect(text(field(render({ repair: { ...old, completedOn: null } }), "completed"))).toBe("—");
  });

  it("draws one chip per bleacher, #? for an unknown number, and a dash for none", () => {
    expect(text(field(markup, "bleachers"))).toBe("#26 #27");
    const unknown = repairRow({ id: "u", bleachers: [{ uuid: "b", number: null }] });
    expect(text(field(render({ repair: unknown }), "bleachers"))).toBe("#?");
    expect(text(field(render({ repair: repairRow({ id: "n" }) }), "bleachers"))).toBe("—");
  });

  it("draws the whole notes with their line breaks, or a dash", () => {
    const notes = field(markup, "notes");
    expect(text(notes)).toBe("Welded new spindle in place and replaced the jack");
    expect(notes).toContain("whitespace-pre-wrap");
    expect(text(field(render({ repair: old }), "notes"))).toBe("—");
  });
});

describe("RepairWindowContent Reported (D107)", () => {
  it("shows a dash and no button when no report was found", () => {
    const markup = render({ repair: old });
    expect(text(field(markup, "reported"))).toBe("—");
    expect(markup).not.toContain('data-testid="repair-window-reports"');
  });

  it("shows the day and View Damage Report for one report", () => {
    const one = render({ repair: { ...full, reported: [report("a", "2026-09-17")] } });
    const reported = field(one, "reported");
    expect(text(reported)).toBe("2026-09-17 View Damage Report");
    expect(reported).toContain('data-testid="repair-window-reports"');
  });

  it("shows +N and View Damage Reports (N) for several reports", () => {
    const reported = field(render(), "reported");
    expect(text(reported)).toBe("2026-09-17 +1 View Damage Reports (2)");
  });
});

describe("RepairWindowContent services and Total row (D101)", () => {
  it("draws the table of services and, inside it, the Total row", () => {
    const markup = render();
    expect(markup).toContain('data-testid="repair-window-services"');
    expect(text(markup)).toContain("Services");
    expect(markup).toContain('data-testid="repair-window-total"');
    expect(markup).toContain('data-testid="repair-service-row"');
  });

  it("draws the table for a repair with no services too, with its Total", () => {
    const markup = render({ repair: old });
    expect(text(markup)).toContain("No services on this repair.");
    expect(markup).toContain('data-testid="repair-window-total"');
  });
});

describe("RepairWindowContent files slot (D102)", () => {
  it("draws the Files section it is given", () => {
    const markup = render({ files: <section data-testid="files-slot">Files here</section> });
    expect(markup).toContain('data-testid="files-slot"');
  });

  it("draws no Files heading and no section when it is given none", () => {
    const markup = render({ files: null });
    expect(text(markup)).not.toContain("Files");
    expect(markup).not.toContain("repair-files");
  });
});

describe("RepairWindowContent is read-only (D84)", () => {
  it("has no Edit, Delete, Add service or Open repair button and no footer", () => {
    const markup = render();
    const words = text(markup);
    expect(words).not.toContain("Edit");
    expect(words).not.toContain("Delete ");
    expect(words).not.toContain("Add service");
    expect(words).not.toContain("Open repair");
    expect(markup).not.toContain("<footer");
  });
});

// docs/specs/repairs-08-status.md §2.1, §2.2 and §7 (D110, D111, D118): the Status field of the
// window holds the menu where the page gives `onChangeStatus` and the repair is live, and the plain
// pill everywhere else.
describe("RepairWindowContent status menu (spec 08)", () => {
  const statusField = (markup: string) => field(markup, "status");
  const onChangeStatus = () => {};
  const live = repairRow({ id: "live", status: "in_repair", invoiceNumber: "JJ-5" });
  const gone = repairRow({ id: "gone", status: "completed", deleted: true, invoiceNumber: "JJ-6" });

  it("draws the menu trigger in the Status field when the page allows the change", () => {
    const field = statusField(render({ repair: live, onChangeStatus }));
    expect(field).toContain('data-testid="repair-status-menu"');
    expect(field).toContain('aria-label="Change status of repair JJ-5, now In repair"');
    expect(text(field)).toBe("In repair");
  });

  it("draws the plain pill without a handler, as spec 07 did", () => {
    const field = statusField(render({ repair: live }));
    expect(field).not.toContain("repair-status-menu");
    expect(field).not.toContain("<button");
    expect(text(field)).toBe("In repair");
  });

  it("draws the plain pill on a deleted repair even when the page allows the change (D118)", () => {
    const field = statusField(render({ repair: gone, onChangeStatus }));
    expect(field).not.toContain("repair-status-menu");
    expect(field).not.toContain("<button");
    expect(text(field)).toBe("Completed");
  });

  it("changes nothing else in the window", () => {
    const markup = render({ repair: live, onChangeStatus });
    expect(markup.match(/data-testid="repair-status-menu"/g)).toHaveLength(1);
    expect(text(markup)).not.toContain("Edit");
    expect(text(markup)).not.toContain("Open repair");
  });
});
