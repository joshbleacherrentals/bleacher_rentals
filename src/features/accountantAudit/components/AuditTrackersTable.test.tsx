import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditTrackerRow } from "../utils/auditRows";
import { AuditTrackersTable } from "./AuditTrackersTable";

// docs/specs/accountant-audit-04-table.md §3 and §5 (D2, D9, D10, R1 to R11).

const row = (over: Partial<AuditTrackerRow> = {}): AuditTrackerRow => ({
  id: "t1",
  status: "completed",
  date: "2026-10-30",
  bleacherNumber: 1204,
  typeCode: "trip",
  typeName: "Trip",
  pickup: { street: "12 Oak Ave", city: "Springfield", stateProvince: "IL", zipPostal: "62701" },
  dropoff: { street: "9 Pine Rd", city: "Toronto", stateProvince: "ON", zipPostal: "M5V 2T6" },
  driveMinutes: 144,
  distanceMeters: 34_400,
  payment: "paid",
  ...over,
});

const render = (rows: AuditTrackerRow[], opts: { isLoading?: boolean; error?: Error } = {}) =>
  renderToStaticMarkup(
    <AuditTrackersTable rows={rows} isLoading={opts.isLoading ?? false} error={opts.error} />,
  );

/** The text of every <th>. */
const headers = (html: string) =>
  [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));

/** The cells of the first body row, as raw html. */
const firstRowCells = (html: string) => {
  const tbody = html.split("<tbody")[1] ?? "";
  const tr = tbody.match(/<tr[^>]*>(.*?)<\/tr>/)?.[1] ?? "";
  return [...tr.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
};

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("AuditTrackersTable headers and a full row", () => {
  it("has the nine headers in order", () => {
    expect(headers(render([row()]))).toEqual([
      "Status",
      "Date",
      "Bleacher",
      "Type",
      "Pickup location",
      "Dropoff location",
      "Drive time",
      "Distance",
      "Payment status",
    ]);
  });

  it("wraps the table in data-testid=audit-table", () => {
    const html = render([row()]);
    expect(html).toContain('data-testid="audit-table"');
    expect(html.indexOf('data-testid="audit-table"')).toBeLessThan(html.indexOf("<table"));
  });

  it("renders a full row as nine cells", () => {
    const cells = firstRowCells(render([row()]));
    expect(cells).toHaveLength(9);
    expect(cells[0]).toContain('data-testid="audit-row-status"');
    expect(text(cells[0])).toBe("Completed");
    expect(text(cells[1])).toBe("2026-10-30");
    expect(cells[1]).toContain("tabular-nums");
    expect(text(cells[2])).toBe("1204");
    expect(cells[3]).toContain(">Trip<");
    expect(text(cells[4])).toBe("12 Oak AveSpringfield, IL 62701");
    expect(text(cells[5])).toBe("9 Pine RdToronto, ON M5V 2T6");
    expect(text(cells[6])).toBe("2.4 hrs");
    expect(text(cells[7])).toBe("21.4 mi (34.4 km)");
    expect(cells[8]).toContain('data-payment="paid"');
  });

  it("draws the street and the place on two lines, the place small and grey", () => {
    const cell = firstRowCells(render([row()]))[4];
    expect(cell).toMatch(
      />12 Oak Ave<\/div><div class="[^"]*text-xs[^"]*text-gray-500[^"]*">Springfield, IL 62701</,
    );
  });

  it("lets the location and distance cells wrap (R6)", () => {
    const cells = firstRowCells(render([row()]));
    expect(cells[4]).toContain("whitespace-normal");
    expect(cells[5]).toContain("whitespace-normal");
    expect(cells[7]).toContain("whitespace-normal");
  });

  it("draws one row per tracker, in the order given", () => {
    const html = render([
      row({ id: "a", date: "2026-10-30" }),
      row({ id: "b", date: "2026-10-29" }),
      row({ id: "c", date: "2026-10-28" }),
    ]);
    expect(html.match(/data-testid="audit-row-status"/g)).toHaveLength(3);
    expect(html.indexOf("2026-10-30")).toBeLessThan(html.indexOf("2026-10-29"));
    expect(html.indexOf("2026-10-29")).toBeLessThan(html.indexOf("2026-10-28"));
  });
});

describe("AuditTrackersTable status cell (R3, R11)", () => {
  it.each([
    ["draft", "Draft"],
    ["released", "Released"],
    ["accepted", "Accepted"],
    ["dest_pickup", "In Progress"],
    ["pickup_inspection", "In Progress"],
    ["dest_dropoff", "In Progress"],
    ["dropoff_inspection", "In Progress"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["declined", "Declined"],
    ["abandoned", "Abandoned"],
  ] as const)("%s has the title and the hidden label %s, and an icon", (status, label) => {
    const cell = firstRowCells(render([row({ status })]))[0];
    expect(cell).toContain(`title="${label}"`);
    expect(cell).toMatch(new RegExp(`<span class="sr-only">${label}</span>`));
    expect(cell).toContain("<svg");
    // The badge is drawn without its own text, so the label is only the hidden one.
    expect(cell.match(new RegExp(label, "g"))).toHaveLength(2); // title + sr-only
  });

  it("keeps the icon badge icon-sized instead of stretching it to the column", () => {
    const cell = firstRowCells(render([row()]))[0];
    expect(cell).toMatch(
      /<span[^>]*class="inline-flex"[^>]*data-testid="audit-row-status"|<span[^>]*data-testid="audit-row-status"[^>]*class="inline-flex"/,
    );
  });

  it("draws no Inspections link and no attention mark", () => {
    const cell = firstRowCells(render([row({ status: "completed" })]))[0];
    expect(cell).not.toContain("<a ");
    expect(cell).not.toContain("Inspections");
  });

  it("falls back to the raw value for an unknown status, with an empty icon and no crash", () => {
    const cell = firstRowCells(render([row({ status: "on_hold" as never })]))[0];
    expect(cell).toContain('title="on_hold"');
    expect(cell).toMatch(/<span class="sr-only">on_hold<\/span>/);
    expect(cell).not.toContain("<svg");
  });
});

describe("AuditTrackersTable dashes", () => {
  it("shows a dash for a null date and a null bleacher", () => {
    const cells = firstRowCells(render([row({ date: null, bleacherNumber: null })]));
    expect(text(cells[1])).toBe("–");
    expect(text(cells[2])).toBe("–");
  });

  it("shows a dash for a null type", () => {
    const cells = firstRowCells(render([row({ typeCode: null, typeName: null })]));
    expect(text(cells[3])).toBe("–");
  });

  it("shows a dash for a null pickup and a null dropoff", () => {
    const cells = firstRowCells(render([row({ pickup: null, dropoff: null })]));
    expect(text(cells[4])).toBe("–");
    expect(text(cells[5])).toBe("–");
  });

  it("shows a dash for an address row whose parts are all empty", () => {
    const empty = { street: null, city: null, stateProvince: null, zipPostal: null };
    const cells = firstRowCells(render([row({ pickup: empty, dropoff: empty })]));
    expect(text(cells[4])).toBe("–");
    expect(text(cells[5])).toBe("–");
  });

  it("shows only the place when the street is missing, and only the street when the place is", () => {
    const cells = firstRowCells(
      render([
        row({
          pickup: { street: null, city: "Springfield", stateProvince: null, zipPostal: null },
          dropoff: { street: "9 Pine Rd", city: null, stateProvince: null, zipPostal: null },
        }),
      ]),
    );
    expect(text(cells[4])).toBe("Springfield");
    expect(text(cells[5])).toBe("9 Pine Rd");
  });

  it("shows a dash for a null drive time and a null distance", () => {
    const cells = firstRowCells(render([row({ driveMinutes: null, distanceMeters: null })]));
    expect(text(cells[6])).toBe("–");
    expect(text(cells[7])).toBe("–");
  });

  it("shows 0.0 hrs and 0.0 mi for zeros, which are a value, not a gap", () => {
    const cells = firstRowCells(render([row({ driveMinutes: 0, distanceMeters: 0 })]));
    expect(text(cells[6])).toBe("0.0 hrs");
    expect(text(cells[7])).toBe("0.0 mi (0.0 km)");
  });

  it("shows a dash in the payment cell for none, and the pill for the others", () => {
    const none = firstRowCells(render([row({ payment: "none" })]))[8];
    expect(none).toContain('data-payment="none"');
    expect(text(none)).toBe("–");
    expect(firstRowCells(render([row({ payment: "not_paid" })]))[8]).toContain(
      'data-payment="not_paid"',
    );
  });

  it("formats the distance as miles and kilometres", () => {
    const cells = firstRowCells(render([row({ distanceMeters: 160_934 })]));
    expect(text(cells[7])).toBe("100.0 mi (160.9 km)");
  });
});

describe("AuditTrackersTable is read-only (D9)", () => {
  it("has no link and no pointer cursor on a row", () => {
    const html = render([row(), row({ id: "t2" })]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("cursor-pointer");
  });

  it("has no sort buttons in the header", () => {
    const html = render([row()]);
    expect(html.split("<tbody")[0]).not.toContain("<button");
    expect(html).not.toContain("aria-sort");
  });
});

describe("AuditTrackersTable states (R10)", () => {
  it("shows the loading message instead of the table", () => {
    const html = render([], { isLoading: true });
    expect(html).toContain("Loading work trackers...");
    expect(html).not.toContain("<table");
  });

  it("shows the empty message inside the table when there are no rows", () => {
    const html = render([]);
    expect(html).toContain("<table");
    expect(html).toContain("This driver has no work trackers");
    expect(html).not.toContain('data-testid="audit-row-status"');
  });

  it("shows the error as an alert and no table", () => {
    const html = render([row()], { error: new Error("disk full") });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Error loading work trackers: disk full");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Loading work trackers...");
  });

  it("shows the error rather than the loading message when both are set", () => {
    const html = render([], { isLoading: true, error: new Error("boom") });
    expect(html).toContain("Error loading work trackers: boom");
  });
});

describe("the distance cell's look (R6)", () => {
  it("puts the miles and the bracketed kilometres on two lines, with the cell text unchanged", () => {
    const cells = firstRowCells(render([row()]));
    expect(cells[7]).toContain('<span class="block">21.4 mi</span>');
    expect(cells[7]).toMatch(/<span class="block[^"]*">\(34\.4 km\)<\/span>/);
    expect(text(cells[7])).toBe("21.4 mi (34.4 km)");
  });
});

describe("the card", () => {
  it("keeps the headers on one line", () => {
    expect(render([row()])).toContain("[&amp;_th]:whitespace-nowrap");
  });
});
